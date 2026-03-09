import os
import json
from datetime import datetime, timedelta
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from api.firestore import get_db

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