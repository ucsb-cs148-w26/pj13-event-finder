import os
import requests
from pathlib import Path
from typing import Optional, Dict, List, Any
from dotenv import load_dotenv, dotenv_values

# Load backend/.env by path so it works regardless of process CWD; override so our .env wins over empty system env vars
_BACKEND_DIR = Path(__file__).resolve().parents[1]
_env_path = _BACKEND_DIR / ".env"
load_dotenv(dotenv_path=_env_path, override=True)
_parsed = dotenv_values(_env_path)
TICKETMASTER_API_KEY = (os.environ.get("TICKETMASTER_API_KEY") or "").strip() or (_parsed.get("TICKETMASTER_API_KEY") or "").strip()

TICKETMASTER_BASE_URL = "https://app.ticketmaster.com/discovery/v2"

def fetch_events(
    location: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Service function to query Ticketmaster API and format the results.
    Uses latlong + radius when lat/lon provided; otherwise uses city (location).
    """
    if not TICKETMASTER_API_KEY:
        _key_present_but_empty = "TICKETMASTER_API_KEY" in os.environ and not (os.environ.get("TICKETMASTER_API_KEY") or "").strip()
        return {
            "error": "Ticketmaster API key not configured. Add your key in backend/.env as TICKETMASTER_API_KEY=your_key (value was empty)." if _key_present_but_empty else "Ticketmaster API key not configured",
            "events": []
        }
    
    params = {
        "apikey": TICKETMASTER_API_KEY,
        "size": 50,
        "includeSpellcheck": "yes"
        
    }
    
    if lat is not None and lon is not None:
        params["latlong"] = f"{lat},{lon}"
        params["radius"] = str(radius if radius is not None and radius > 0 else 25)
        params["unit"] = "miles"
    elif location:
        params["city"] = location
    
    if start_date:
        if 'T' in start_date:
            params["startDateTime"] = start_date + ":00Z"
        else:
            params["startDateTime"] = start_date + "T00:00:00Z"
            
    if end_date:
        if 'T' in end_date:
            params["endDateTime"] = end_date + ":00Z"
        else:
            params["endDateTime"] = end_date + "T23:59:59Z"
    
    classifications = []
    if event_type:
        type_mapping = {
            "concert": "KZFzniwnSyZfZ7v7nJ",
            "sports": "KZFzniwnSyZfZ7v7nE",
            "theater": "KZFzniwnSyZfZ7v7na",
            "festival": "KZFzniwnSyZfZ7v7n1",
            "conference": "KZFzniwnSyZfZ7v7n1",
            "workshop": "KZFzniwnSyZfZ7v7n1",
        }
        if event_type in type_mapping:
            classifications.append(type_mapping[event_type])
    
    if category:
        category_mapping = {
            "music": "KZFzniwnSyZfZ7v7nJ",
            "arts": "KZFzniwnSyZfZ7v7na",
            "food": "KZFzniwnSyZfZ7v7n1",
            "outdoor": "KZFzniwnSyZfZ7v7n1",
            "family": "KZFzniwnSyZfZ7v7n1",
        }
        if category in category_mapping:
            classifications.append(category_mapping[category])
    
    if classifications:
        params["classificationId"] = ",".join(classifications)
    
    try:
        response = requests.get(f"{TICKETMASTER_BASE_URL}/events.json", params=params)
        print(f"Querying URL: {response.url}")
        response.raise_for_status()
        data = response.json()
        
        events = []
        seen_names = set()
        if "_embedded" in data and "events" in data["_embedded"]:
            for event in data["_embedded"]["events"]:
                event_info = {
                    "id": event.get("id", ""),
                    "name": event.get("name", "Unknown Event"),
                    "url": event.get("url", ""),
                    "date": event.get("dates", {}).get("start", {}).get("localDate", "TBD"),
                    "status": event.get("dates", {}).get("status", {}).get("code", "unknown"),
                    "time": event.get("dates", {}).get("start", {}).get("localTime", ""),
                    "location": "",
                    "venue": "",
                    "image": "",
                    "priceRange": {}
                }
                
                if "_embedded" in event and "venues" in event["_embedded"]:
                    venue = event["_embedded"]["venues"][0]
                    event_info["venue"] = venue.get("name", "")
                    address = venue.get("address", {})
                    city = venue.get("city", {}).get("name", "")
                    state = venue.get("state", {}).get("stateCode", "")
                    event_info["location"] = f"{city}, {state}"
                
                if "images" in event and len(event["images"]) > 0:
                    event_info["image"] = event["images"][0].get("url", "")
                
                if "priceRanges" in event and len(event["priceRanges"]) > 0:
                    price_range = event["priceRanges"][0]
                    event_info["priceRange"] = {
                        "min": price_range.get("min", 0),
                        "max": price_range.get("max", 0),
                        "currency": price_range.get("currency", "USD")
                    }
                
                if min_price is not None or max_price is not None:
                    if event_info["priceRange"]:
                        event_min = event_info["priceRange"].get("min", 0)
                        event_max = event_info["priceRange"].get("max", float('inf'))
                        if min_price is not None and event_max < min_price:
                            continue
                        if max_price is not None and event_min > max_price:
                            continue
                
                if event_info["name"] in seen_names or event_info["url"] == "" or event_info["status"] != "onsale":
                    continue
                print(f"Adding event: {event_info['name']}")
                seen_names.add(event_info["name"])
                events.append(event_info)
        
        return {
            "events": events,
            "total": len(events)
        }
    
    except requests.exceptions.RequestException as e:
        return {
            "error": f"Failed to fetch events: {str(e)}",
            "events": []
        }
    except Exception as e:
        return {
            "error": f"An error occurred: {str(e)}",
            "events": []
        }