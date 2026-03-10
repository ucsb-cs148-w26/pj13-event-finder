import hashlib
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from firebase_admin import firestore as firestore_module
from api.firestore import db
import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from api.firestore import get_db

CACHE_COLLECTION = "event_cache"
CACHE_TTL_HOURS = 24
MAX_DOC_SIZE_BYTES = 900_000  # safety margin under Firestore's 1MB limit

# US state name -> abbreviation (for location normalization)
_US_STATES = {
    "alabama": "al", "alaska": "ak", "arizona": "az", "arkansas": "ar",
    "california": "ca", "colorado": "co", "connecticut": "ct", "delaware": "de",
    "florida": "fl", "georgia": "ga", "hawaii": "hi", "idaho": "id",
    "illinois": "il", "indiana": "in", "iowa": "ia", "kansas": "ks",
    "kentucky": "ky", "louisiana": "la", "maine": "me", "maryland": "md",
    "massachusetts": "ma", "michigan": "mi", "minnesota": "mn",
    "mississippi": "ms", "missouri": "mo", "montana": "mt", "nebraska": "ne",
    "nevada": "nv", "new hampshire": "nh", "new jersey": "nj",
    "new mexico": "nm", "new york": "ny", "north carolina": "nc",
    "north dakota": "nd", "ohio": "oh", "oklahoma": "ok", "oregon": "or",
    "pennsylvania": "pa", "rhode island": "ri", "south carolina": "sc",
    "south dakota": "sd", "tennessee": "tn", "texas": "tx", "utah": "ut",
    "vermont": "vt", "virginia": "va", "washington": "wa",
    "west virginia": "wv", "wisconsin": "wi", "wyoming": "wy",
    "district of columbia": "dc",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_location(location: str) -> str:
    """Lowercase, trim, and convert full state names to abbreviations."""
    if not location:
        return ""
    loc = location.strip().lower()
    parts = [p.strip() for p in loc.split(",")]
    if len(parts) >= 2:
        state_part = parts[-1].strip()
        parts[-1] = _US_STATES.get(state_part, state_part)
    return ", ".join(parts)


def generate_cache_key(location: str, start_date: Optional[str], end_date: Optional[str]) -> str:
    """Return a 20-char hex hash that uniquely identifies (location, date range)."""
    loc_norm = normalize_location(location)
    sd = (start_date or "")[:10]
    ed = (end_date or "")[:10]
    key_string = f"{loc_norm}|{sd}|{ed}"
    return hashlib.sha256(key_string.encode("utf-8")).hexdigest()[:20]


# ---------------------------------------------------------------------------
# Cache read / write
# ---------------------------------------------------------------------------

def check_cache(location: str, start_date: Optional[str], end_date: Optional[str]) -> Optional[List[Dict]]:
    """Return cached events list if a fresh cache entry exists, otherwise None."""
    try:
        key = generate_cache_key(location, start_date, end_date)
        doc = db.collection(CACHE_COLLECTION).document(key).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        cached_at = data.get("cached_at")
        if cached_at is None:
            return None
        now = datetime.now(timezone.utc)
        if now - cached_at > timedelta(hours=CACHE_TTL_HOURS):
            return None
        return data.get("events", [])
    except Exception as e:
        print(f"[cache] check_cache error: {e}")
        return None


def store_cache(
    location: str,
    start_date: Optional[str],
    end_date: Optional[str],
    events: List[Dict],
) -> bool:
    """Store events in Firestore. Returns True on success."""
    try:
        # Size guard
        size = len(json.dumps(events, default=str).encode("utf-8"))
        if size > MAX_DOC_SIZE_BYTES:
            print(f"[cache] Skipping store: payload {size} bytes exceeds limit")
            return False

        key = generate_cache_key(location, start_date, end_date)
        doc_data = {
            "location_raw": location,
            "location_normalized": normalize_location(location),
            "start_date": (start_date or "")[:10] or None,
            "end_date": (end_date or "")[:10] or None,
            "cached_at": firestore_module.SERVER_TIMESTAMP,
            "event_count": len(events),
            "events": events,
        }
        db.collection(CACHE_COLLECTION).document(key).set(doc_data)
        print(f"[cache] Stored {len(events)} events for '{location}' (key={key})")
        return True
    except Exception as e:
        print(f"[cache] store_cache error: {e}")
        return False


# ---------------------------------------------------------------------------
# Local filtering (applied to cached events)
# ---------------------------------------------------------------------------

def _extract_price(event: Dict) -> Optional[float]:
    """Extract a numeric price from either Ticketmaster or scraper event format."""
    # Ticketmaster style: {"priceRange": {"min": 29.5, "max": 99.5}}
    pr = event.get("priceRange")
    if isinstance(pr, dict) and pr:
        try:
            return float(pr.get("min", 0))
        except (ValueError, TypeError):
            pass

    # Scraper style: {"price": "25.00"} or {"price": 0.0}
    price_val = event.get("price")
    if price_val is None:
        return None
    price_str = str(price_val).replace("$", "").replace(",", "").strip()
    try:
        return float(price_str)
    except (ValueError, TypeError):
        return None  # "Free", "Unknown", etc.


def apply_local_filters(
    events: List[Dict],
    event_type: Optional[str] = None,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
) -> List[Dict]:
    """Filter an event list by type, category, and price range."""
    if not event_type and not category and min_price is None and max_price is None:
        return events

    filtered = []
    for ev in events:
        # Event type filter
        if event_type:
            ev_type = (ev.get("type") or "").lower()
            ev_name = (ev.get("name") or "").lower()
            if event_type.lower() not in ev_type and event_type.lower() not in ev_name:
                continue

        # Category filter
        if category:
            ev_name = (ev.get("name") or "").lower()
            ev_type = (ev.get("type") or "").lower()
            if category.lower() not in ev_name and category.lower() not in ev_type:
                continue

        # Price filter
        if min_price is not None or max_price is not None:
            price = _extract_price(ev)
            if price is not None:
                if min_price is not None and price < min_price:
                    continue
                if max_price is not None and price > max_price:
                    continue
            # Events with unparseable prices ("Free", "Unknown") are kept

        filtered.append(ev)
    return filtered

def get_cache_collection():
    """Get the Firestore collection for caching search results."""
    try:
        db = get_db()
        return db.collection('event_cache')
    except ValueError as e:
        print(f"Firebase not configured: {e}")
        return None

def get_pending_events_collection():
    """Get the Firestore collection for events pending approval."""
    try:
        db = get_db()
        return db.collection('pending_events')
    except ValueError as e:
        print(f"Firebase not configured: {e}")
        return None

def check_cache(location, start_date, end_date):
    """
    Check if we have cached events for the given location and date range.
    Returns cached events if found and not expired, None otherwise.
    """
    try:
        cache_col = get_cache_collection()
        if cache_col is None:
            return None
        
        # Create a cache key
        cache_key = f"{location}_{start_date}_{end_date}".replace(" ", "_").replace("/", "_")
        
        # Query for the cache entry
        docs = cache_col.where('cache_key', '==', cache_key).limit(1).get()
        
        for doc in docs:
            data = doc.to_dict()
            cached_at = data.get('cached_at')
            
            # Check if cache is still valid (24 hours)
            if cached_at:
                cached_time = datetime.fromisoformat(cached_at.replace('Z', '+00:00'))
                if datetime.now(cached_time.tzinfo) - cached_time < timedelta(hours=24):
                    return data.get('events', [])
        
        return None
    except Exception as e:
        print(f"Cache check error: {e}")
        return None

def store_cache(location, start_date, end_date, events):
    """
    Store events in cache for the given location and date range.
    """
    try:
        cache_col = get_cache_collection()
        if cache_col is None:
            print("Firebase not configured - skipping cache storage")
            return
        
        cache_key = f"{location}_{start_date}_{end_date}".replace(" ", "_").replace("/", "_")
        
        cache_data = {
            'cache_key': cache_key,
            'location': location,
            'start_date': start_date,
            'end_date': end_date,
            'events': events,
            'cached_at': datetime.now().isoformat(),
            'total_events': len(events)
        }
        
        # Use cache_key as document ID for easy lookup
        cache_col.document(cache_key).set(cache_data)
        print(f"Cached {len(events)} events for {location}")
    except Exception as e:
        print(f"Cache store error: {e}")

def apply_local_filters(events, event_type=None, category=None, min_price=None, max_price=None):
    """
    Apply filters to events list.
    """
    filtered = events
    
    if event_type:
        filtered = [e for e in filtered if event_type.lower() in (e.get('type', '') or '').lower()]
    
    if category:
        filtered = [e for e in filtered if category.lower() in (e.get('type', '') or '').lower()]
    
    if min_price is not None:
        filtered = [e for e in filtered if e.get('price') and 
                   not any(word in e['price'].lower() for word in ['free', 'unknown']) and
                   float(e['price'].replace('$', '').split()[0]) >= min_price]
    
    if max_price is not None:
        filtered = [e for e in filtered if e.get('price') and
                   not any(word in e['price'].lower() for word in ['free', 'unknown']) and
                   float(e['price'].replace('$', '').split()[0]) <= max_price]
    
    return filtered

def store_pending_events(url, events, user_email):
    """
    Store events scraped from a URL for manual approval.
    """
    try:
        pending_col = get_pending_events_collection()
        if pending_col is None:
            return None
        
        pending_data = {
            'url': url,
            'events': events,
            'user_email': user_email,
            'submitted_at': datetime.now().isoformat(),
            'status': 'pending',  # pending, approved, rejected
            'total_events': len(events)
        }
        
        # Use a unique document ID
        doc_id = f"{user_email}_{datetime.now().strftime('%Y%m%d_%H%M%S')}".replace('@', '_at_')
        pending_col.document(doc_id).set(pending_data)
        
        print(f"Stored {len(events)} pending events from {url} for {user_email}")
        return doc_id
    except Exception as e:
        print(f"Error storing pending events: {e}")
        return None
