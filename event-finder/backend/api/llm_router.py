
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse
from api import ticketmaster, allevents
from api.eventbrite_scraper import scrape_eventbrite
from dotenv import load_dotenv

# Load backend/.env reliably regardless of current working directory
_BACKEND_DIR = Path(__file__).resolve().parents[1]  # .../backend
load_dotenv(dotenv_path=_BACKEND_DIR / ".env")

# OpenAI is optional at runtime; if missing we can fall back to heuristics
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # type: ignore

ProviderName = str

# Default to a commonly available API model. Override via OPENAI_ROUTER_MODEL if you want.
OPENAI_MODEL = os.getenv("OPENAI_ROUTER_MODEL", "gpt-4.1-mini")

# If true, we will NEVER silently fall back; we raise if OpenAI routing fails.
REQUIRE_OPENAI = os.getenv("ROUTER_REQUIRE_OPENAI", "false").strip().lower() in {"1", "true", "yes", "y"}


ROUTER_DEBUG = os.getenv("ROUTER_DEBUG", "0") == "1"

def _router_log(label: str, obj) -> None:
    if not ROUTER_DEBUG:
        return
    try:
        print(f"[router:{label}] {json.dumps(obj, default=str)[:4000]}")
    except Exception:
        print(f"[router:{label}] {obj}")

def _ticketmaster_adapter(**kwargs) -> Dict[str, Any]:
    return ticketmaster.fetch_events(**kwargs)

def _allevents_adapter(**kwargs):
    return allevents.fetch_events(
        location=kwargs.get("location", ""),
        start_date=kwargs.get("start_date"),
        end_date=kwargs.get("end_date"),
        event_type=kwargs.get("event_type"),
        category=kwargs.get("category"),
        min_price=kwargs.get("min_price"),
        max_price=kwargs.get("max_price"),
    )


def _eventbrite_adapter(**kwargs):
    return scrape_eventbrite(
        location=kwargs.get("location", ""),
        start_date=kwargs.get("start_date"),
        end_date=kwargs.get("end_date"),
        event_type=kwargs.get("event_type"),
        category=kwargs.get("category"),
        min_price=kwargs.get("min_price"),
        max_price=kwargs.get("max_price"),
    )



PROVIDERS: Dict[ProviderName, Any] = {
    "ticketmaster": _ticketmaster_adapter,
    "eventbrite": _eventbrite_adapter,
    "allevents": _allevents_adapter,
    
    # Add more providers later
}


# ----------------------------
# Routing (heuristic fallback)
# ----------------------------

def _heuristic_router(
    *,
    location: str,
    start_date: Optional[str],
    end_date: Optional[str],
    event_types: Optional[List[str]],
    categories: Optional[List[str]],
    min_price: Optional[float],
    max_price: Optional[float],
) -> Dict[str, Any]:
    types = {t.strip().lower() for t in (event_types or []) if t}
    cats = {c.strip().lower() for c in (categories or []) if c}

    tm_types = {"sports", "concert", "theater"}
    if types.intersection(tm_types) or ("music" in cats):
        return {"providers": ["ticketmaster"], "reason": "Heuristic: large/organized event types selected."}

    return {
        "providers": ["eventbrite", "ticketmaster"],
        "reason": "Heuristic: try local/community first, then Ticketmaster.",
    }



def _llm_choose_providers(
    *,
    location: str,
    start_date: Optional[str],
    end_date: Optional[str],
    event_types: Optional[List[str]],
    categories: Optional[List[str]],
    min_price: Optional[float],
    max_price: Optional[float],
) -> Dict[str, Any]:

    user_context = {
        "location": location,
        "start_date": start_date,
        "end_date": end_date,
        "event_types": event_types or [],
        "categories": categories or [],
        "min_price": min_price,
        "max_price": max_price,
    }

    _router_log("input", user_context)

    api_key = os.getenv("OPENAI_API_KEY", "")
    key_loaded = bool(api_key)
    sdk_available = OpenAI is not None

    # Helpful debug prints so you can see why it routed one way or another
    print("OPENAI_API_KEY loaded?", key_loaded)
    print("OpenAI SDK available?", sdk_available)
    print("Using OpenAI model:", OPENAI_MODEL)
    print("ROUTER_REQUIRE_OPENAI:", REQUIRE_OPENAI)

    if not key_loaded or not sdk_available:
        if REQUIRE_OPENAI:
            missing = []
            if not key_loaded:
                missing.append("OPENAI_API_KEY")
            if not sdk_available:
                missing.append("openai package")
            raise RuntimeError(f"OpenAI routing required but missing: {', '.join(missing)}")

        fallback = _heuristic_router(**user_context)
        fallback["_router_used"] = "heuristic_missing_openai"
        _router_log("decision", {
            "used": fallback["_router_used"],
            "providers": fallback.get("providers"),
            "reason": fallback.get("reason"),
        })
        return fallback

    client = OpenAI(api_key=api_key)

    provider_list = sorted(PROVIDERS.keys())
    providers_min = 2 if len(provider_list) >= 2 else 1
    providers_max = min(4, len(provider_list))

    response_format = {
        "type": "json_schema",
        "name": "event_provider_routing",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "providers": {
                    "type": "array",
                    "items": {"type": "string", "enum": provider_list},
                    "minItems": providers_min,
                    "maxItems": providers_max,
                },
                "weights": {
                    "type": "object",
                    "additionalProperties": {"type": "number", "minimum": 0, "maximum": 1}
                },

                "reason": {"type": "string", "minLength": 1, "maxLength": 240},
            },
            "required": ["providers", "reason"],
        },
    }

    instructions = """
- allevents: Best for broad local/community listings and “what's happening” coverage, especially when filters are broad or unclear.
- websearch: Best for niche/very local/uncategorized events, or when filters are sparse and you need extra recall beyond event databases.

Goal:
- Maximize relevant coverage for the selected filters. Multiple selections use OR semantics: show events matching ANY selected event_type/category.
- Prefer a diversified provider set so you capture both “big ticketed” and “local community” versions of the same filter (e.g., concerts can exist on Ticketmaster and locally via AllEvents/Eventbrite).

Routing rules (filters-only):
1) Use ONLY the filters provided. Do NOT invent intent, preferences, or context.
2) OR semantics: if multiple event_types/categories are selected, ensure the chosen providers together cover ANY of the selected filters.
3) Always choose 2-4 providers when possible. Avoid returning only one provider; if one provider is strongly indicated (e.g., Ticketmaster for sports), still include at least one complementary local/community provider if relevant results are plausible.
4) Ticketmaster signals: if event_types/categories include sports, concert/music, theater, comedy, major festivals, ticketed/venue-style events → include ticketmaster.
5) Eventbrite signals: if event_types/categories include workshop, class, meetup, networking, conference, seminar, training → include eventbrite.
6) AllEvents signals: if filters indicate community/local/family/holiday, broad “things to do”, or if the city is smaller/mid-sized → include allevents.
7) Websearch signals: if filters are empty, “other”, very niche/unusual, or the query is likely missing from event databases → include websearch.
8) Price range guidance:
   - If max_price is low (free/cheap) and filters are community-style → lean toward eventbrite/allevents/websearch in addition to any other provider.
   - If price range is moderate/high and filters suggest ticketed events → ticketmaster weight higher but do not exclude local providers.
9) Weights (how many results to prefer from each provider):
   - Return a weights object with a 0-1 value for each chosen provider.
   - Weights should reflect “more from Ticketmaster” vs “more from local/community sources” based strictly on the filters.
   - Example: for concerts/music in a big city: ticketmaster ~0.6-0.8, allevents/eventbrite/websearch split remaining.
   - For workshops/classes: eventbrite ~0.5-0.7, allevents ~0.2-0.4, optional websearch small.
   - For “other” or empty filters: allevents + websearch dominate; ticketmaster optional small if the city is large.
   - Ensure the chosen weights sum to 1 (or very close, within rounding).

Output format (JSON only):
{
  "providers": ["ticketmaster" | "eventbrite" | "allevents" | "websearch", ...],   // 2-4 items (unless fewer exist)
  "weights": {"providerA": 0.0-1.0, "providerB": 0.0-1.0, ...},  // example values only; should roughly sum to 1
  "reason": "One short sentence referencing only the filters (types/categories/price/time window)."
}
""".strip()

    try:
        resp = client.responses.create(
            model=OPENAI_MODEL,
            input=[
                {"role": "system", "content": instructions},
                {"role": "user", "content": f"Select providers for this request:\n{user_context}"},
            ],
            text={"format": response_format},
            temperature=0,
        )
        parsed = json.loads(resp.output_text)
        parsed["_router_used"] = "openai"

        _router_log("decision", {
            "used": "openai",
            "providers": parsed.get("providers"),
            "reason": parsed.get("reason"),
        })
    except Exception as e:
        print("OpenAI router failed. Error:", repr(e))
        _router_log("openai_error", {"model": OPENAI_MODEL, "error": repr(e)})

        if REQUIRE_OPENAI:
            raise RuntimeError(f"OpenAI routing failed (model={OPENAI_MODEL}): {e}") from e

        fallback = _heuristic_router(**user_context)
        fallback["_router_used"] = "heuristic_fallback_after_openai_error"
        fallback["_openai_error"] = repr(e)

        _router_log("decision", {
            "used": fallback["_router_used"],
            "providers": fallback.get("providers"),
            "reason": fallback.get("reason"),
        })

        return fallback

    parsed["providers"] = [p for p in parsed.get("providers", []) if p in PROVIDERS]
    if not parsed["providers"]:
        if REQUIRE_OPENAI:
            raise RuntimeError("OpenAI routing returned no valid providers.")
        fallback = _heuristic_router(**user_context)
        fallback["_router_used"] = "heuristic_fallback_invalid_openai_output"
        return fallback

    return parsed


_KNOWN_SOURCES: Dict[str, str] = {
    "ticketmaster": "Ticketmaster",
    "ticketweb": "Ticket Web",
    "livenation": "Live Nation",
    "eventbrite": "Eventbrite",
    "allevents": "All Events",
}


def _source_from_url(url: str, fallback: str) -> str:
    """Derive a display source name from the event's actual URL domain."""
    if not url:
        return fallback
    domain = urlparse(url).netloc.removeprefix("www.")
    if not domain:
        return fallback
    # Check if any known source keyword appears in the domain
    domain_lower = domain.lower()
    for key, name in _KNOWN_SOURCES.items():
        if key in domain_lower:
            return name
    return domain


def _normalize_event(provider: str, e: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(e)
    out["provider"] = provider
    out.setdefault("source", _source_from_url(out.get("url", ""), provider))

    out.setdefault("id", "")
    out.setdefault("name", "Unknown Event")
    out.setdefault("url", "")
    out.setdefault("date", "")
    out.setdefault("time", "")
    out.setdefault("location", "")
    out.setdefault("venue", "")
    out.setdefault("image", "")
    out.setdefault("priceRange", {})

    return out


def _dedupe_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[Tuple[str, str, str]] = set()
    out: List[Dict[str, Any]] = []

    for e in events:
        key = (
            (e.get("name") or "").strip().lower(),
            (e.get("date") or "").strip().lower(),
            (e.get("venue") or "").strip().lower(),
        )

        if key == ("", "", ""):
            key = ((e.get("id") or "").strip().lower(), "", "")

        if key in seen:
            continue

        seen.add(key)
        out.append(e)

    return out


def route_and_fetch_events(
    *,
    location: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_types: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
) -> Dict[str, Any]:
    routing = _llm_choose_providers(
        location=location,
        start_date=start_date,
        end_date=end_date,
        event_types=event_types,
        categories=categories,
        min_price=min_price,
        max_price=max_price,
    )

    chosen = routing.get("providers", [])
    provider_results: Dict[str, Any] = {}
    all_events: List[Dict[str, Any]] = []
    errors: Dict[str, str] = {}

    def _merge_results(provider: str, res: Dict[str, Any]) -> None:
        provider_results[provider] = {"total": res.get("total", 0)}
        if res.get("warning"):
            provider_results[provider]["warning"] = res["warning"]
        if res.get("error"):
            errors[provider] = str(res["error"])

        for e in (res.get("events") or []):
            all_events.append(_normalize_event(provider, e))

    for provider in chosen:
        adapter = PROVIDERS.get(provider)
        if not adapter:
            continue

        try:
            if provider == "ticketmaster":
                selected_types = [t for t in (event_types or []) if t]

                if not selected_types:
                    selected_types = [None]
                else:
                    selected_types = selected_types[:3]

                provider_results[provider] = {"calls": len(selected_types), "total": 0}
                added_before = len(all_events)

                for t in selected_types:
                    res = adapter(
                        location=location,
                        start_date=start_date,
                        end_date=end_date,
                        event_type=t,
                        category=None,    
                        min_price=min_price,
                        max_price=max_price,
                    )
                    _merge_results(provider, res)

                provider_results[provider]["added_events"] = len(all_events) - added_before

            else:
                res = adapter(
                    location=location,
                    start_date=start_date,
                    end_date=end_date,
                    event_type=None,
                    category=None,
                    min_price=min_price,
                    max_price=max_price,
                )
                _merge_results(provider, res)

        except Exception as ex:
            errors[provider] = str(ex)

    all_events = _dedupe_events(all_events)

    return {
        "routing": routing,
        "providers_called": chosen,
        "provider_results": provider_results,
        "errors": errors,
        "total": len(all_events),
        "events": all_events,
    }


# ----------------------------
# Standalone test runner
# ----------------------------

if __name__ == "__main__":
    # Tip: widen dates and remove event_type if you keep getting 0 results from Ticketmaster.
    result = route_and_fetch_events(
        location="Los Angeles",
        start_date="2026-02-01T00:00",
        end_date="2026-03-01T00:00",
        event_type=None,  # try: "concert", "sports", or None
        category=None,
        min_price=None,
        max_price=None,
    )

    print("\n=== ROUTER OUTPUT ===")
    print("Router used:", result["routing"].get("_router_used"))
    print("Providers chosen:", result["providers_called"])
    print("Routing reason:", result["routing"].get("reason"))
    if result["routing"].get("_openai_error"):
        print("OpenAI error:", result["routing"]["_openai_error"])

    print("\n=== FETCH OUTPUT ===")
    print("Errors:", result["errors"])
    print("Total events:", result["total"])
    print("First 3 event names:", [e.get("name") for e in result["events"][:3]])
