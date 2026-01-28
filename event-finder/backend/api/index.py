from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import requests
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TICKETMASTER_API_KEY = os.environ.get("TICKETMASTER_API_KEY", "")
TICKETMASTER_BASE_URL = "https://app.ticketmaster.com/discovery/v2"

@app.get("/")
def read_root():
    return {"Hello": "World", "Platform": "Vercel"}

@app.get("/items/{item_id}")
def read_item(item_id: int, q: str = None):
    return {"item_id": item_id, "q": q}

@app.get("/health")
def health_check():
    """Health check endpoint to verify backend is running"""
    return {"status": "ok", "service": "event-finder-backend"}

@app.get("/api/events")
def search_events(
    location: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None
):
    """
    Search for events using Ticketmaster API
    """
    if not TICKETMASTER_API_KEY:
        return {
            "error": "Ticketmaster API key not configured",
            "events": []
        }
    
    # Build Ticketmaster API parameters
    params = {
        "apikey": TICKETMASTER_API_KEY,
        "size": 50,  # Maximum number of results
    }
    
    # Add location (city)
    if location:
        params["city"] = location
    
    # Add date range
    if start_date:
        # Frontend sends datetime in format YYYY-MM-DDTHH:mm
        # Convert to ISO format with timezone for Ticketmaster API
        if 'T' in start_date:
            # Already has time, convert to ISO format
            params["startDateTime"] = start_date + ":00Z"
        else:
            # Only date provided, add default time 00:00:00
            params["startDateTime"] = start_date + "T00:00:00Z"
    if end_date:
        # Frontend sends datetime in format YYYY-MM-DDTHH:mm
        # Convert to ISO format with timezone for Ticketmaster API
        if 'T' in end_date:
            # Already has time, convert to ISO format
            params["endDateTime"] = end_date + ":00Z"
        else:
            # Only date provided, add default time 23:59:59
            params["endDateTime"] = end_date + "T23:59:59Z"
    
    # Add classification (event type/category)
    classifications = []
    if event_type:
        # Map our event types to Ticketmaster classifications
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
        # Map categories to Ticketmaster segment IDs
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
        response.raise_for_status()
        data = response.json()
        
        # Extract events from Ticketmaster response
        events = []
        if "_embedded" in data and "events" in data["_embedded"]:
            for event in data["_embedded"]["events"]:
                # Extract event information
                event_info = {
                    "id": event.get("id", ""),
                    "name": event.get("name", "Unknown Event"),
                    "url": event.get("url", ""),
                    "date": event.get("dates", {}).get("start", {}).get("localDate", "TBD"),
                    "time": event.get("dates", {}).get("start", {}).get("localTime", ""),
                    "location": "",
                    "venue": "",
                    "image": "",
                    "priceRange": {}
                }
                
                # Extract venue information
                if "_embedded" in event and "venues" in event["_embedded"]:
                    venue = event["_embedded"]["venues"][0]
                    event_info["venue"] = venue.get("name", "")
                    address = venue.get("address", {})
                    city = venue.get("city", {}).get("name", "")
                    state = venue.get("state", {}).get("stateCode", "")
                    event_info["location"] = f"{city}, {state}"
                
                # Extract image
                if "images" in event and len(event["images"]) > 0:
                    event_info["image"] = event["images"][0].get("url", "")
                
                # Extract price range
                if "priceRanges" in event and len(event["priceRanges"]) > 0:
                    price_range = event["priceRanges"][0]
                    event_info["priceRange"] = {
                        "min": price_range.get("min", 0),
                        "max": price_range.get("max", 0),
                        "currency": price_range.get("currency", "USD")
                    }
                
                # Filter by price if specified
                if min_price is not None or max_price is not None:
                    if event_info["priceRange"]:
                        event_min = event_info["priceRange"].get("min", 0)
                        event_max = event_info["priceRange"].get("max", float('inf'))
                        if min_price is not None and event_max < min_price:
                            continue
                        if max_price is not None and event_min > max_price:
                            continue
                
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
