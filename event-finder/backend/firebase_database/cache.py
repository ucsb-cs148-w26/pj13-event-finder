import hashlib
import json
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from firebase_admin import firestore as firestore_module

from api.firestore import db

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Uploaded URL queries
# ---------------------------------------------------------------------------
UPLOADED_COLLECTION = "urls_added"


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return the great-circle distance in miles between two points."""
    R = 3959  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def get_uploaded_events_near(
    lat: float,
    lng: float,
    radius_miles: float = 50,
) -> List[Dict]:
    """
    Return events from user-uploaded URLs whose centroid falls within
    *radius_miles* of the given coordinates.

    Scans all docs in urls_added and filters in-memory via haversine.
    Acceptable at small scale (tens to low hundreds of uploaded URLs).
    """
    try:
        docs = db.collection(UPLOADED_COLLECTION).stream()
        all_events: List[Dict] = []
        for doc in docs:
            data = doc.to_dict()
            c_lat = data.get("centroid_lat")
            c_lng = data.get("centroid_lng")
            if c_lat is not None and c_lng is not None:
                if _haversine_miles(lat, lng, c_lat, c_lng) <= radius_miles:
                    all_events.extend(data.get("events", []))
        return all_events
    except Exception as e:
        print(f"[uploaded] get_uploaded_events_near error: {e}")
        return []
