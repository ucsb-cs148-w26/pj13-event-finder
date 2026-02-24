import requests
import json
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional

def extract_price(item: Dict) -> float:
    offers = item.get("offers", {})
    try:
        if isinstance(offers, dict):
            return float(offers.get("price", 0.0) or 0.0)
        elif isinstance(offers, list) and len(offers) > 0:
            return float(offers[0].get("price", 0.0) or 0.0)
    except (ValueError, TypeError):
        pass
    return 0.0

def process_event(item: Dict, default_loc: str) -> Dict:
    return {
        "name": item.get("name", ""),
        "date": item.get("startDate", "")[:10],
        "end_date": item.get("endDate", "")[:10],
        "location": item.get("location", {}).get("name", default_loc),
        "image": item.get("image", ""),
        "url": item.get("url", ""),
        "price": extract_price(item),
        "description": item.get("description", ""),
        "type": item.get("@type", ""),
        "source": "All Events"
    }

def fetch_events(
    location: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None
) -> Dict[str, Any]:
    
    city_part = location.split(',')[0].strip()
    city_slug = city_part.lower().replace(" ", "-")
    
    url = f"https://allevents.in/{city_slug}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        
        scripts = soup.find_all("script", type="application/ld+json")
        raw_events = []
        
        for script in scripts:
            try:
                data = json.loads(script.string)
                items = data if isinstance(data, list) else [data]
                
                for item in items:
                    if item.get("@type") == "ItemList":
                        item_list = item.get("itemListElement", [])
                        for element in item_list:
                            ev = element.get("item", {})
                            if ev.get("@type") in ["Event", "MusicEvent", "SocialEvent"]:
                                raw_events.append(process_event(ev, location))
                    elif item.get("@type") in ["Event", "MusicEvent", "SocialEvent"]:
                        raw_events.append(process_event(item, location))
            except:
                continue
                
        filtered_events = []
        for ev in raw_events:
            if start_date and ev["date"] and ev["date"] < start_date:
                continue
            if end_date and ev["date"] and ev["date"] > end_date:
                continue
                
            if min_price is not None and ev["price"] < min_price:
                continue
            if max_price is not None and ev["price"] > max_price:
                continue
                
            if event_type:
                etype_query = event_type.lower()
                if etype_query not in ev["type"].lower() and etype_query not in ev["name"].lower():
                    continue
                    
            if category:
                cat_query = category.lower()
                if cat_query not in ev["name"].lower() and cat_query not in ev["description"].lower():
                    continue
                    
            ev.pop("description", None) 
            filtered_events.append(ev)
                
        return {"events": filtered_events, "total": len(filtered_events), "source": "allevents"}

    except Exception as e:
        return {"error": f"Scraping failed: {str(e)}", "events": []}