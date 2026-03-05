import os
import requests
from pathlib import Path
from typing import Optional, Dict, List, Any
from dotenv import load_dotenv, dotenv_values
from typing import Optional, Dict, Any
from datetime import datetime
import dateutil.parser

# Load backend/.env by path so it works regardless of process CWD; override so our .env wins over empty system env vars
_BACKEND_DIR = Path(__file__).resolve().parents[1]
_env_path = _BACKEND_DIR / ".env"
load_dotenv(dotenv_path=_env_path, override=True)
_parsed = dotenv_values(_env_path)
TICKETMASTER_API_KEY = (os.environ.get("TICKETMASTER_API_KEY") or "").strip() or (_parsed.get("TICKETMASTER_API_KEY") or "").strip()

TICKETMASTER_BASE_URL = "https://app.ticketmaster.com/discovery/v2"

def format_tm_date(date_str: str, is_end_of_day: bool = False) -> str:
    """
    Helper to ensure date string strictly matches Ticketmaster's requirements:
    YYYY-MM-DDTHH:mm:ssZ
    """
    if not date_str:
        return ""
        
    try:
        # 1. Try parsing full datetime with 'T' (e.g., "2026-02-18T15:30")
        if 'T' in date_str:
            # Flexible parsing of ISO strings
            dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        else:
            # 2. Handle simple date (e.g., "2026-02-18")
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            # If start date, default to 00:00:00, if end date default to 23:59:59
            if is_end_of_day:
                dt = dt.replace(hour=23, minute=59, second=59)
            else:
                dt = dt.replace(hour=0, minute=0, second=0)

        # 3. Strictly format to the API's required string
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        
    except ValueError:
        # Fallback: Return original if parsing fails (log this in production)
        return date_str

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
        "includeSpellcheck": "yes",
        "sort": "date,asc"
    }
    
    if lat is not None and lon is not None:
        params["latlong"] = f"{lat},{lon}"
        params["radius"] = str(radius if radius is not None and radius > 0 else 25)
        params["unit"] = "miles"
    elif location:
        params["city"] = location
    
    # --- FIXED DATE LOGIC ---
    if start_date:
        params["startDateTime"] = format_tm_date(start_date, is_end_of_day=False)
            
    if end_date:
        params["endDateTime"] = format_tm_date(end_date, is_end_of_day=True)
    # ------------------------
    
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
        # Debug print to verify the format being sent
        # print(f"DEBUG: Start: {params.get('startDateTime')} | End: {params.get('endDateTime')}")
        
        response = requests.get(f"{TICKETMASTER_BASE_URL}/events.json", params=params)
        response.raise_for_status()
        data = response.json()
        
        events = []
        seen_names = set()
        
        if "_embedded" in data and "events" in data["_embedded"]:
            for event in data["_embedded"]["events"]:
                # Extract Price Info safely
                price_data = {}
                if "priceRanges" in event and event["priceRanges"]:
                    p = event["priceRanges"][0]
                    price_data = {
                        "min": p.get("min", 0),
                        "max": p.get("max", 0),
                        "currency": p.get("currency", "USD")
                    }
                    
                    # Filter locally if API didn't handle it (API doesn't support price filter)
                    if min_price is not None and price_data["max"] < min_price:
                        continue
                    if max_price is not None and price_data["min"] > max_price:
                        continue

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
                    "priceRange": price_data
                }
                
                if "_embedded" in event and "venues" in event["_embedded"]:
                    venue = event["_embedded"]["venues"][0]
                    event_info["venue"] = venue.get("name", "")
                    location_obj = venue.get("location", {})
                    event_info["latitude"] = location_obj.get("latitude")
                    event_info["longitude"] = location_obj.get("longitude")
                    address = venue.get("address", {}) or {}
                    city = venue.get("city", {}).get("name", "") or (address.get("city") or "")
                    state = (venue.get("state", {}).get("stateCode", "") or address.get("stateCode", "") or "").strip()
                    postal = (address.get("postalCode") or "").strip()
                    line1 = (address.get("line1") or "").strip()
                    line2 = (address.get("line2") or "").strip()
                    parts = [p for p in [line1, line2] if p]
                    city_state = ", ".join(filter(None, [city, state]))
                    if postal and city_state:
                        city_state = f"{city_state} {postal}"
                    elif postal:
                        city_state = postal
                    if parts:
                        full_address = ", ".join(parts) + (f", {city_state}" if city_state else "")
                    else:
                        full_address = city_state or "Address not available"
                    event_info["location"] = full_address
                
                if "images" in event and event["images"]:
                    event_info["image"] = event["images"][0].get("url", "")
                
                # if "priceRanges" in event and len(event["priceRanges"]) > 0:
                #     price_range = event["priceRanges"][0]
                #     event_info["priceRange"] = {
                #         "min": price_range.get("min", 0),
                #         "max": price_range.get("max", 0),
                #         "currency": price_range.get("currency", "USD")
                #     }
                
                # if min_price is not None or max_price is not None:
                #     if event_info["priceRange"]:
                #         event_min = event_info["priceRange"].get("min", 0)
                #         event_max = event_info["priceRange"].get("max", float('inf'))
                #         if min_price is not None and event_max < min_price:
                #             continue
                #         if max_price is not None and event_min > max_price:
                #             continue
                
                # if event_info["name"] in seen_names or event_info["url"] == "" or event_info["status"] != "onsale":
                #     continue
                # print(f"Adding event: {event_info['name']}")
                # seen_names.add(event_info["name"])
                # events.append(event_info)

                if event_info["name"] not in seen_names and event_info["url"] != "":
                    seen_names.add(event_info["name"])
                    events.append(event_info)
        
        return {
            "events": events,
            "total": len(events)
        }
    
    except requests.exceptions.RequestException as e:
        # If response exists, try to get the error detail
        err_msg = str(e)
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_json = e.response.json()
                if "errors" in error_json:
                    err_msg = f"{error_json['errors'][0].get('detail', 'Unknown error')}"
            except:
                pass
        return {"error": f"Ticketmaster API Error: {err_msg}", "events": []}
    except Exception as e:
        return {"error": f"An error occurred: {str(e)}", "events": []}