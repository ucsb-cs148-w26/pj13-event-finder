from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from api.llm_router import route_and_fetch_events
from api import ticketmaster, allevents
from api.open_scraper import find_event_site_url, scrape_events_from_url
from api.eventbrite_scraper import scrape_eventbrite
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import re
import json
import threading
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
    
def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())

def _parse_dt(value: Any) -> Optional[datetime]:
    """Best-effort parse; returns None if unknown format."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        # Handles ISO-like: 2026-03-05T11:45, 2026-03-05T11:45:00, 2026-03-05 11:45
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None
    return None

def _extract_text_blob(event: Dict[str, Any]) -> str:
    parts = []
    for k in ("name", "title", "event_name", "description", "summary", "category", "type", "event_type"):
        v = event.get(k)
        if isinstance(v, str):
            parts.append(v)
        elif isinstance(v, list):
            parts.extend([str(x) for x in v if x])
    return _norm(" ".join(parts))

def _extract_price_range(event: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    """
    Return (min_price, max_price) if we can find it, else (None, None).
    Supports a few common representations.
    """
    # Common direct keys
    for min_k, max_k in [
        ("min_price", "max_price"),
        ("price_min", "price_max"),
        ("minPrice", "maxPrice"),
    ]:
        if event.get(min_k) is not None or event.get(max_k) is not None:
            try:
                mn = float(event[min_k]) if event.get(min_k) is not None else None
            except Exception:
                mn = None
            try:
                mx = float(event[max_k]) if event.get(max_k) is not None else None
            except Exception:
                mx = None
            return mn, mx

    # Ticketmaster-like: priceRanges: [{"min": 20, "max": 80}]
    pr = event.get("priceRanges")
    if isinstance(pr, list) and pr:
        obj = pr[0] if isinstance(pr[0], dict) else None
        if obj:
            try:
                mn = float(obj["min"]) if obj.get("min") is not None else None
            except Exception:
                mn = None
            try:
                mx = float(obj["max"]) if obj.get("max") is not None else None
            except Exception:
                mx = None
            return mn, mx

    return None, None

def _extract_start_end(event: Dict[str, Any]) -> Tuple[Optional[datetime], Optional[datetime]]:
    # Try common keys
    start = _parse_dt(event.get("start") or event.get("start_date") or event.get("startDate") or event.get("datetime"))
    end = _parse_dt(event.get("end") or event.get("end_date") or event.get("endDate"))
    return start, end

def _matches_any_token(text_blob: str, tokens: List[str]) -> bool:
    # tokens already normalized
    return any(t in text_blob for t in tokens)

def apply_post_filters(
    events: List[Dict[str, Any]],
    event_types: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    durations: Optional[List[str]] = None,  # e.g. ["Less than 2 hours", "2-4 hours"]
) -> List[Dict[str, Any]]:
    """
    Conservative filtering:
    - If we can't determine a field for an event (e.g., no price info), we keep it rather than incorrectly dropping it.
    """
    types_norm = [_norm(x) for x in (event_types or []) if x]
    cats_norm = [_norm(x) for x in (categories or []) if x]
    durs_norm = [_norm(x) for x in (durations or []) if x]

    out = []
    for e in events:
        blob = _extract_text_blob(e)

        # event type/category match: if user selected any, event must match at least one
        if types_norm and not _matches_any_token(blob, types_norm):
            continue
        if cats_norm and not _matches_any_token(blob, cats_norm):
            continue

        # price filter (best effort)
        if min_price is not None or max_price is not None:
            ev_min, ev_max = _extract_price_range(e)
            # If event has no price info, don't drop it (conservative).
            if ev_min is not None or ev_max is not None:
                # If only one side exists, treat it as both for overlap checks
                low = ev_min if ev_min is not None else ev_max
                high = ev_max if ev_max is not None else ev_min
                if low is None or high is None:
                    pass
                else:
                    if min_price is not None and high < float(min_price):
                        continue
                    if max_price is not None and low > float(max_price):
                        continue

        # duration filter (only if we can compute duration)
        if durs_norm:
            start, end = _extract_start_end(e)
            if start and end:
                hours = (end - start).total_seconds() / 3600.0
                ok = False
                for d in durs_norm:
                    if "less than 2" in d and hours < 2:
                        ok = True
                    elif "2-4" in d and 2 <= hours <= 4:
                        ok = True
                    elif "4+" in d and hours >= 4:
                        ok = True
                    elif "multi-day" in d and hours >= 24:
                        ok = True
                if not ok:
                    continue
            # If we can't compute duration, keep event (conservative).

        out.append(e)

    return out


@app.get("/api/events")
def get_events(
    location: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[List[str]] = Query(None),
    category: Optional[List[str]] = Query(None),
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    personalize : bool = False,
):
    if lat is None and lon is None and not location:
        return {"error": "Provide location (city, state) or lat and lon.", "events": []}

    
    event_type_one = event_type[0] if event_type else None
    category_one = category[0] if category else None

    if personalize:
        if not location:
            return {"error": "Personalization requires a location.", "events": []
            }
        res = route_and_fetch_events(
            location=location,
            start_date=start_date,
            end_date=end_date,
            event_types=event_type or [],
            categories=category or [],
            min_price=min_price,
            max_price=max_price,
        )
        personalized_events = res.get("events", [])
        personalized_events = apply_post_filters(
            personalized_events,
            event_types=None,
            categories=None,
            min_price=min_price,
            max_price=max_price,
            durations=None,
        )

        return {
          "from_cache": False,
          "router_used": res.get("routing:", {}).get("_router_used"),
          "providers_called": res.get("providers_called"),
          "events": personalized_events,
          "total": len(personalized_events),
        }


    # --- CACHE CHECK (location-string queries only) ---
    use_cache = bool(location)
    if use_cache:
        cached_events = check_cache(location, start_date, end_date)
        if cached_events is not None:
            filtered = apply_local_filters(
                cached_events, event_type_one, category_one, min_price, max_price
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
    fetch_event_type = None if use_cache else event_type_one
    fetch_category = None if use_cache else category_one
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

    print("before filter:", len(combined_events))

    combined_events = apply_post_filters(
        combined_events,
        event_types=event_type if isinstance(event_type, list) else ([event_type] if event_type else []),
        categories=category if isinstance(category, list) else ([category] if category else []),
        min_price=min_price,
        max_price=max_price,
        durations=None,  # add later if you wire duration into the request
    )

    print("after filter:", len(combined_events))

    return {
        "from_cache": False,
        "ticketmaster_status": "error" if "error" in tm_data else "ok",
        "allevents_status": "error" if "error" in ae_data else "ok",
        "eventbrite_status": "error" if "error" in eb_data else "ok",
        "openscraper_status": "error" if "error" in os_data else "ok",
        "events": combined_events,
        "total": len(combined_events),
    }

@app.get("/api/ticketmaster-event")
def ticketmaster_event_detail(id: str):
    """Return additional information for a Ticketmaster event by its ID."""
    return ticketmaster.fetch_event_details(id)
@app.get("/api/events-stream")
def get_events_stream(
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
    """
    Stream events with progress updates. Fetches from multiple sources in parallel
    and sends progress updates via Server-Sent Events.
    """
    
    def event_generator():
        # Determine total sources
        using_location = bool(location and not (lat is not None and lon is not None))
        total_sources = 4 if using_location else 1  # TM, AE, EB, OS for location; just TM for lat/lon
        
        # Storage for results from each source
        results = {
            "ticketmaster": None,
            "allevents": None,
            "eventbrite": None,
            "openscraper": None,
        }
        results_lock = threading.Lock()
        
        def fetch_ticketmaster():
            try:
                data = ticketmaster.fetch_events(
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
                with results_lock:
                    results["ticketmaster"] = data
            except Exception as e:
                print(f"Error fetching Ticketmaster: {e}")
                with results_lock:
                    results["ticketmaster"] = {"events": [], "error": str(e)}
        
        def fetch_allevents():
            try:
                data = allevents.fetch_events(
                    location=location,
                    start_date=start_date,
                    end_date=end_date,
                    event_type=event_type,
                    category=category,
                    min_price=min_price,
                    max_price=max_price,
                )
                with results_lock:
                    results["allevents"] = data
            except Exception as e:
                print(f"Error fetching AllEvents: {e}")
                with results_lock:
                    results["allevents"] = {"events": [], "error": str(e)}
        
        def fetch_eventbrite():
            try:
                data = scrape_eventbrite(
                    location=location,
                    start_date=start_date,
                    end_date=end_date,
                    event_type=event_type,
                    category=category,
                    min_price=min_price,
                    max_price=max_price,
                )
                with results_lock:
                    results["eventbrite"] = data
            except Exception as e:
                print(f"Error fetching Eventbrite: {e}")
                with results_lock:
                    results["eventbrite"] = {"events": [], "error": str(e)}
        
        def fetch_openscraper():
            try:
                site_info = find_event_site_url(location)
                site_url = site_info.get("url") if "error" not in site_info else None
                if site_url:
                    data = scrape_events_from_url(
                        site_url,
                        location,
                        start_date=start_date,
                        end_date=end_date,
                        event_type=event_type,
                        category=category,
                        min_price=min_price,
                        max_price=max_price,
                    )
                    if "error" in data or "_scrape_failure_reason" in data:
                        data = {"events": []}
                else:
                    data = {"events": []}
                with results_lock:
                    results["openscraper"] = data
            except Exception as e:
                print(f"Error fetching OpenScraper: {e}")
                with results_lock:
                    results["openscraper"] = {"events": [], "error": str(e)}
        
        # Validation check
        if lat is None and lon is None and not location:
            error_msg = "Provide location (city, state) or lat and lon."
            yield f"data: {json.dumps({'error': error_msg, 'progress': 0, 'total': 0})}\n\n"
            return
        
        # Start threads for data fetching
        threads = []
        
        t = threading.Thread(target=fetch_ticketmaster, daemon=True)
        t.start()
        threads.append(("Ticketmaster", t))
        
        if using_location:
            t = threading.Thread(target=fetch_allevents, daemon=True)
            t.start()
            threads.append(("AllEvents", t))
            
            t = threading.Thread(target=fetch_eventbrite, daemon=True)
            t.start()
            threads.append(("Eventbrite", t))
            
            t = threading.Thread(target=fetch_openscraper, daemon=True)
            t.start()
            threads.append(("OpenScraper", t))
        
        # Wait for threads and send progress updates
        completed = 0
        for source_name, thread in threads:
            thread.join()
            completed += 1
            progress_pct = int((completed / total_sources) * 100)
            yield f"data: {json.dumps({'source': source_name, 'progress': progress_pct, 'status': 'completed'})}\n\n"
        
        # Combine results (treat missing/None providers as empty)
        tm_data = results.get("ticketmaster") or {"events": []}
        ae_data = results.get("allevents") or {"events": []}
        eb_data = results.get("eventbrite") or {"events": []}
        os_data = results.get("openscraper") or {"events": []}
        
        combined_events = []
        seen_event_keys = set()
        
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
        
        for event in ae_data.get("events", []):
            key = get_event_key(event.get("name"), event.get("date"))
            if key not in seen_event_keys:
                combined_events.append(event)
                seen_event_keys.add(key)
        
        for event in eb_data.get("events", []):
            key = get_event_key(event.get("name"), event.get("date"))
            if key not in seen_event_keys:
                combined_events.append(event)
                seen_event_keys.add(key)
        
        for event in os_data.get("events", []):
            key = get_event_key(event.get("name"), event.get("date"))
            if key not in seen_event_keys:
                combined_events.append(event)
                seen_event_keys.add(key)
        
        # Send final results
        final_data = {
            "events": combined_events,
            "total": len(combined_events),
            "progress": 100,
            "status": "complete",
            "ticketmaster_status": "error" if "error" in tm_data else "ok",
            "allevents_status": "error" if "error" in ae_data else "ok",
            "eventbrite_status": "error" if "error" in eb_data else "ok",
            "openscraper_status": "error" if "error" in os_data else "ok",
        }
        yield f"data: {json.dumps(final_data)}\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")


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
