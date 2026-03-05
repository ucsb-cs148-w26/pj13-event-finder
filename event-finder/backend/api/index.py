from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import Optional
from dotenv import load_dotenv
from api.llm_router import route_and_fetch_events
from api import ticketmaster, allevents
import json

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
    max_price: Optional[float] = None,
):
    """
    Aggregates events from Ticketmaster and AllEvents and streams back
    JSON lines with progress updates.

    Each line is a JSON object terminated by a newline, for example:
      {"progress": 10, "message": "Starting search"}
      {"progress": 50, "message": "Fetched Ticketmaster results"}
      {"progress": 100, "message": "Done", "events": [...], "total": 42}
    """

    if lat is None and lon is None and not location:
        # Simple error payload (non-streaming) for invalid inputs
        return {
            "error": "Provide location (city, state) or lat and lon.",
            "events": [],
            "total": 0,
            "progress": 100,
        }

    def event_stream():
        def chunk(progress: int, message: str, extra: Optional[dict] = None) -> str:
            payload = {"progress": progress, "message": message}
            if extra:
                payload.update(extra)
            return json.dumps(payload) + "\n"

        # Initial progress
        yield chunk(5, "Starting search across providers...")

        # Fetch from Ticketmaster
        tm_data = ticketmaster.fetch_events(
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
        yield chunk(40, "Fetched Ticketmaster results")

        # Fetch from AllEvents when we have a city/state location string
        ae_data = {"events": []}
        if location:
            ae_data = allevents.fetch_events(
                location=location,
                start_date=start_date,
                end_date=end_date,
                event_type=event_type,
                category=category,
                min_price=min_price,
                max_price=max_price,
            )
            yield chunk(80, "Fetched AllEvents results")
        else:
            yield chunk(60, "Skipped AllEvents (no city/state location provided)")

        combined_events = []
        seen_event_keys = set()
        tm_count = 0
        ae_count = 0

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

        print("TM events:", tm_count)
        print("AE events:", ae_count)

        final_payload = {
            "ticketmaster_status": "error" if "error" in tm_data else "ok",
            "allevents_status": "error" if "error" in ae_data else "ok",
            "events": combined_events,
            "total": len(combined_events),
        }
        yield chunk(100, "Aggregation complete", final_payload)

    # Stream JSON lines; the frontend parses each newline-delimited object.
    return StreamingResponse(event_stream(), media_type="application/json")

@app.get("/api/direct-events")
def get_direct_events(location: str):
    """
    Proxies the request to AllEvents.in, handling the POST requirements.
    Usage: /api/direct-events?location=New York
    """
    return allevents.fetch_events(location=location)
