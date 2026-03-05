import os
import json
import ssl
import urllib3
import cloudscraper
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional
from pathlib import Path
from dotenv import load_dotenv, dotenv_values
from requests.adapters import HTTPAdapter

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class _SSLAdapter(HTTPAdapter):
    """
    Mounts an SSL context with certificate verification disabled.
    """
    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


# ---------------------------------------------------------
# Environment Setup
# ---------------------------------------------------------
_BACKEND_DIR = Path(__file__).resolve().parents[1]
_env_path = _BACKEND_DIR / ".env"

load_dotenv(dotenv_path=_env_path, override=True)
_parsed = dotenv_values(_env_path)

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


def _get_openai_api_key():
    return (os.environ.get("OPENAI_API_KEY") or "").strip() or (_parsed.get("OPENAI_API_KEY") or "").strip()


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

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


def _build_eventbrite_url(
    city: str,
    state_abbr: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> str:
    """
    Builds an Eventbrite search URL for a given city.
    Example: https://www.eventbrite.com/d/ca--santa-barbara/events/
    """
    city_slug = city.strip().lower().replace(" ", "-")

    if state_abbr:
        prefix = state_abbr.strip().lower()
    else:
        prefix = ""

    if prefix:
        path = f"/d/{prefix}--{city_slug}/events/"
    else:
        path = f"/d/{city_slug}/events/"

    url = f"https://www.eventbrite.com{path}"

    params = []
    if start_date:
        params.append(f"start_date={start_date}")
    if end_date:
        params.append(f"end_date={end_date}")
    if params:
        url += "?" + "&".join(params)

    return url


def _resolve_state(location: str) -> Optional[str]:
    """
    Try to extract a US state abbreviation from a location string
    like 'Santa Barbara, CA' or 'Santa Barbara, California'.
    """
    parts = [p.strip() for p in location.split(",")]
    if len(parts) >= 2:
        candidate = parts[-1].lower()
        if len(candidate) == 2 and candidate.isalpha():
            return candidate
        return _US_STATES.get(candidate)
    return None


# ---------------------------------------------------------
# Post-extraction filtering
# ---------------------------------------------------------

def _filter_events(events, start_date=None, end_date=None, event_type=None, category=None, min_price=None, max_price=None):
    filtered = []
    for ev in events:
        ev_date = ev.get("date", "")
        if start_date and ev_date and ev_date < start_date[:10]:
            continue
        if end_date and ev_date and ev_date > end_date[:10]:
            continue
        if event_type:
            ev_type = (ev.get("type") or "").lower()
            ev_name = (ev.get("name") or "").lower()
            if event_type.lower() not in ev_type and event_type.lower() not in ev_name:
                continue
        if category:
            ev_name = (ev.get("name") or "").lower()
            ev_type = (ev.get("type") or "").lower()
            if category.lower() not in ev_name and category.lower() not in ev_type:
                continue
        if min_price is not None or max_price is not None:
            price_str = str(ev.get("price", "Unknown"))
            try:
                price_val = float(price_str.replace("$", "").replace(",", "").strip())
                if min_price is not None and price_val < min_price:
                    continue
                if max_price is not None and price_val > max_price:
                    continue
            except (ValueError, TypeError):
                pass  # Keep events with non-numeric prices (Free, Unknown)
        filtered.append(ev)
    return filtered


# ---------------------------------------------------------
# Core: scrape Eventbrite
# ---------------------------------------------------------

def scrape_eventbrite(
    location: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    category: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Scrapes the Eventbrite listing page for a location, then
    uses the LLM to extract structured event data.
    """
    if OpenAI is None:
        return {"error": "OpenAI package not installed."}

    api_key = _get_openai_api_key()
    if not api_key:
        return {"error": "OPENAI_API_KEY not configured in environment."}

    # --- determine city + state ---
    parts = [p.strip() for p in location.split(",")]
    city = parts[0]
    state_abbr = _resolve_state(location)

    url = _build_eventbrite_url(city, state_abbr, start_date, end_date)

    # --- fetch page ---
    try:
        scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "desktop": True}
        )
        scraper.mount("https://", _SSLAdapter())
        res = scraper.get(url, timeout=15, verify=False)

        if res.status_code == 403:
            return {"error": "HTTP 403 Forbidden -- Eventbrite is blocking the scraper.", "url": url}
        if res.status_code == 429:
            return {"error": "HTTP 429 Too Many Requests -- rate limited.", "url": url}
        res.raise_for_status()

        soup = BeautifulSoup(res.text, "html.parser")

        # Extract image URLs from the page before stripping tags
        img_tags = soup.find_all("img")
        image_info = []
        for img in img_tags:
            src = img.get("src") or img.get("data-src") or ""
            alt = img.get("alt", "")
            if src and ("eventbrite" in src or "img.evbuc" in src):
                image_info.append(f"[IMAGE: alt=\"{alt}\" src=\"{src}\"]")

        for tag in soup(["script", "style"]):
            tag.extract()

        page_text = soup.get_text(separator=" ", strip=True)[:35000]
        if image_info:
            page_text += "\n\nEXTRACTED IMAGES:\n" + "\n".join(image_info[:50])

        if len(page_text) < 500:
            return {"error": "Page appears empty; Eventbrite may require JS rendering.", "url": url}

    except Exception as e:
        return {"error": f"Failed to fetch Eventbrite: {str(e)}", "url": url}

    # --- LLM extraction ---
    model = os.getenv("OPENAI_ROUTER_MODEL", "gpt-4.1-mini")
    client = OpenAI(api_key=api_key)

    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "event_scraper",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "events": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "name": {"type": "string"},
                                "start_date": {"type": "string", "description": "ISO 8601 format (YYYY-MM-DDTHH:MM) or YYYY-MM-DD"},
                                "end_date": {"type": "string", "description": "ISO 8601 format or YYYY-MM-DD. Use start_date if unknown."},
                                "event_type": {"type": "string", "description": "e.g., music, sports, workshop, festival"},
                                "price": {"type": "string", "description": "Price amount, 'Free', or 'Unknown'"},
                                "latitude": {"type": "number", "description": "Approximate latitude based on venue/city"},
                                "longitude": {"type": "number", "description": "Approximate longitude based on venue/city"},
                                "image": {"type": "string", "description": "URL of the event image/thumbnail if available, or empty string"},
                            },
                            "required": ["name", "start_date", "end_date", "event_type", "price", "latitude", "longitude", "image"],
                        },
                    }
                },
                "required": ["events"],
            },
        },
    }

    instructions = f"""
    You are an expert data extraction assistant. I will provide you with the raw text scraped from Eventbrite for the location: {location}.
    Extract all distinct events you can find.

    For latitude and longitude: If the exact coordinates are not in the text, use your geographic knowledge to estimate the coordinates based on the venue name and the city context ({location}).
    For price: If not listed, output 'Unknown'. If free, output 'Free'.
    For image: Extract the event image/thumbnail URL if available. If not found, output an empty string.
    """

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": instructions.strip()},
                {"role": "user", "content": f"Here is the webpage text:\n\n{page_text}"},
            ],
            response_format=response_format,
            temperature=0.1,
        )
        result = json.loads(resp.choices[0].message.content)
        raw_events = result.get("events", [])

        # Normalize each event to match the standard event format
        normalized = []
        for ev in raw_events:
            evt = {
                "name": ev.get("name", ""),
                "date": (ev.get("start_date") or "")[:10],
                "time": (ev.get("start_date") or "")[11:] if "T" in (ev.get("start_date") or "") else "",
                "end_date": (ev.get("end_date") or "")[:10],
                "location": location,
                "venue": "",
                "image": ev.get("image", ""),
                "url": url,
                "price": ev.get("price", "Unknown"),
                "type": ev.get("event_type", ""),
                "latitude": ev.get("latitude"),
                "longitude": ev.get("longitude"),
                "source": "Eventbrite",
            }
            normalized.append(evt)

        # Apply filters
        filtered = _filter_events(normalized, start_date, end_date, event_type, category, min_price, max_price)

        return {
            "source": "eventbrite",
            "url_scraped": url,
            "events": filtered,
            "total": len(filtered),
        }
    except Exception as e:
        return {"error": f"OpenAI API Error: {str(e)}"}
