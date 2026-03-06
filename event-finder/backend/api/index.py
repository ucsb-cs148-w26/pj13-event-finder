from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from dotenv import load_dotenv
from api.llm_router import route_and_fetch_events
from api import ticketmaster, allevents
from api.open_scraper import find_event_site_url, scrape_events_from_url
from api.eventbrite_scraper import scrape_eventbrite
from firebase_database.cache import check_cache, store_cache, apply_local_filters

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"Hello": "World", "Platform": "Vercel"}

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "event-finder-backend"}

@app.get("/api/router-test")
def router_test(
    location: str = "Los Angeles",
    start_date: str = "2026-02-01T00:00",
    end_date: str = "2026-03-01T00:00",
    event_type: Optional[str] = None,
):
    res = route_and_fetch_events(
        location=location,
        start_date=start_date,
        end_date=end_date,
        event_type=event_type,
        category=None,
        min_price=None,
        max_price=None,
    )

    # Return a small debug payload so you can confirm OpenAI is used
    return {
        "router_used": res.get("routing", {}).get("_router_used"),
        "providers_called": res.get("providers_called"),
        "routing_reason": res.get("routing", {}).get("reason"),
        "total": res.get("total"),
        "sample_names": [e.get("name") for e in (res.get("events") or [])[:5]],
        "errors": res.get("errors"),
    }

@app.get("/api/ticketmaster")
def search_events(
    location: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None
):
    if lat is not None and lon is not None:
        return ticketmaster.fetch_events(
            location=location or "",
            start_date=start_date,
            end_date=end_date,
            event_type=event_type,
            category=category,
            min_price=min_price,
            max_price=max_price,
            lat=lat,
            lon=lon,
            radius=radius,  
        )
    if not location:
        return {"error": "Provide location (city, state) or lat and lon.", "events": []}
    res = route_and_fetch_events(
        location=location,
        start_date=start_date,
        end_date=end_date,
        event_type=event_type,
        category=category,
        min_price=min_price,
        max_price=max_price
    )
    return {"events": res.get("events", []), "total": res.get("total", 0)}
    
    
@app.get("/api/events")
def get_events(
    location: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None
):
    if lat is None and lon is None and not location:
        return {"error": "Provide location (city, state) or lat and lon.", "events": []}

    # --- CACHE CHECK (location-string queries only) ---
    use_cache = bool(location)
    if use_cache:
        cached_events = check_cache(location, start_date, end_date)
        if cached_events is not None:
            filtered = apply_local_filters(
                cached_events, event_type, category, min_price, max_price
            )
            print(f"[cache] HIT for '{location}' — {len(cached_events)} cached, {len(filtered)} after filters")
            return {
                "from_cache": True,
                "ticketmaster_status": "cached",
                "allevents_status": "cached",
                "eventbrite_status": "cached",
                "openscraper_status": "cached",
                "events": filtered,
                "total": len(filtered),
            }

    # --- CACHE MISS: fetch from sources ---
    # For cacheable queries, omit category/type/price filters so we store
    # the broadest possible dataset.  Date range is still passed because it
    # defines the *scope* of the query, not a post-hoc filter.
    fetch_event_type = None if use_cache else event_type
    fetch_category = None if use_cache else category
    fetch_min_price = None if use_cache else min_price
    fetch_max_price = None if use_cache else max_price

    tm_data = ticketmaster.fetch_events(
        location=location or "",
        start_date=start_date,
        end_date=end_date,
        event_type=fetch_event_type,
        category=fetch_category,
        min_price=fetch_min_price,
        max_price=fetch_max_price,
        lat=lat,
        lon=lon,
        radius=radius,
    )
    ae_data = {"events": []}
    eb_data = {"events": []}
    os_data = {"events": []}

    if location:
        ae_data = allevents.fetch_events(
            location=location,
            start_date=start_date,
            end_date=end_date,
            event_type=fetch_event_type,
            category=fetch_category,
            min_price=fetch_min_price,
            max_price=fetch_max_price,
        )
        eb_data = scrape_eventbrite(
            location=location,
            start_date=start_date,
            end_date=end_date,
            event_type=fetch_event_type,
            category=fetch_category,
            min_price=fetch_min_price,
            max_price=fetch_max_price,
        )
        site_info = find_event_site_url(location)
        site_url = site_info.get("url") if "error" not in site_info else None
        if site_url:
            os_data = scrape_events_from_url(
                site_url,
                location,
                start_date=start_date,
                end_date=end_date,
                event_type=fetch_event_type,
                category=fetch_category,
                min_price=fetch_min_price,
                max_price=fetch_max_price,
            )
            if "error" in os_data or "_scrape_failure_reason" in os_data:
                print("Open scraper failed for URL:", site_url, "Reason:", os_data.get("error") or os_data.get("_scrape_failure_reason"))
                os_data = {"events": []}

    # --- COMBINE + DEDUPLICATE ---
    combined_events = []
    seen_event_keys = set()
    tm_count = 0
    ae_count = 0
    eb_count = 0
    os_count = 0

    def get_event_key(name, date_str):
        name_norm = str(name).lower().strip()
        date_norm = str(date_str)[:10] if date_str else "unknown-date"
        return f"{name_norm}|{date_norm}"

    for event in tm_data.get("events", []):
        key = get_event_key(event.get("name"), event.get("date"))
        if key not in seen_event_keys:
            event["source"] = "Ticketmaster"
            combined_events.append(event)
            seen_event_keys.add(key)
            tm_count += 1

    for event in ae_data.get("events", []):
        key = get_event_key(event.get("name"), event.get("date"))
        if key not in seen_event_keys:
            combined_events.append(event)
            seen_event_keys.add(key)
            ae_count += 1

    for event in eb_data.get("events", []):
        key = get_event_key(event.get("name"), event.get("date"))
        if key not in seen_event_keys:
            combined_events.append(event)
            seen_event_keys.add(key)
            eb_count += 1

    for event in os_data.get("events", []):
        key = get_event_key(event.get("name"), event.get("date"))
        if key not in seen_event_keys:
            combined_events.append(event)
            seen_event_keys.add(key)
            os_count += 1

    print("TM events:", tm_count)
    print("AE events:", ae_count)
    print("EB events:", eb_count)
    print("OS events:", os_count)

    # --- STORE IN CACHE ---
    if use_cache:
        store_cache(location, start_date, end_date, combined_events)

    # --- APPLY FILTERS LOCALLY ---
    if use_cache:
        combined_events = apply_local_filters(
            combined_events, event_type, category, min_price, max_price
        )

    return {
        "from_cache": False,
        "ticketmaster_status": "error" if "error" in tm_data else "ok",
        "allevents_status": "error" if "error" in ae_data else "ok",
        "eventbrite_status": "error" if "error" in eb_data else "ok",
        "openscraper_status": "error" if "error" in os_data else "ok",
        "events": combined_events,
        "total": len(combined_events),
    }

@app.get("/api/direct-events")
def get_direct_events(location: str):
    """
    Proxies the request to AllEvents.in, handling the POST requirements.
    Usage: /api/direct-events?location=New York
    """
    return allevents.fetch_events(location=location)

@app.get("/api/open_scrape")
def find(prompt: str):
    """
    Basic open-ended LLM query using the configured model.
    Usage: /api/query?prompt=What is the capital of France?
    """
    
@app.get("/api/scrape-events")
def scrape_events(location: str):
    """
    Finds the official event site URL for a given location, then scrapes
    that URL and uses the LLM to extract structured event data.
    Returns an empty event list if the site cannot be accessed.
    Usage: /api/scrape-events?location=santa barbara
    """
    site_info = find_event_site_url(location)

    if "error" in site_info:
        return {"events": [], "total": 0, "error": site_info["error"]}

    url = site_info.get("url")
    if not url:
        return {"events": [], "total": 0, "error": f"Could not find an event site URL for '{location}'."}

    scrape_result = scrape_events_from_url(url, location)

    if "error" in scrape_result or "_scrape_failure_reason" in scrape_result:
        return {
            "events": [],
            "total": 0,
            "error": scrape_result.get("error", "Site could not be accessed."),
            "attempted_url": url,
        }

    scrape_result["source_url"] = url
    return scrape_result


@app.get("/api/eventbrite-scrape")
def eventbrite_scrape(
    location: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
):
    """
    Scrapes Eventbrite for events in a given location.
    Usage: /api/eventbrite-scrape?location=santa barbara&start_date=2026-03-01&end_date=2026-04-01
    """
    return scrape_eventbrite(
        location,
        start_date=start_date,
        end_date=end_date,
        event_type=event_type,
        category=category,
        min_price=min_price,
        max_price=max_price,
    )
