import os
import json
import ssl
import urllib3
from urllib.parse import urlparse
import cloudscraper
from bs4 import BeautifulSoup
from typing import Dict, Any
from pathlib import Path
from dotenv import load_dotenv, dotenv_values
from requests.adapters import HTTPAdapter

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class _SSLAdapter(HTTPAdapter):
    """
    Mounts an SSL context with certificate verification disabled.
    Required for urllib3 2.x + OpenSSL 3.x where passing verify=False alone
    raises 'Cannot set verify_mode to CERT_NONE when check_hostname is enabled'.
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
_BACKEND_DIR = Path(__file__).resolve().parents[1]  # .../backend
_env_path = _BACKEND_DIR / ".env"

# Use override=True so the .env file wins over empty system environment variables
load_dotenv(dotenv_path=_env_path, override=True)
_parsed = dotenv_values(_env_path)

OPENAI_MODEL = os.getenv("OPENAI_ROUTER_MODEL", "gpt-4.1-mini")
REQUIRE_OPENAI = os.getenv("ROUTER_REQUIRE_OPENAI", "false").strip().lower() in {"1", "true", "yes", "y"}

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

# ---------------------------------------------------------
# Utility: Get API Key safely
# ---------------------------------------------------------
def get_openai_api_key():
    return (os.environ.get("OPENAI_API_KEY") or "").strip() or (_parsed.get("OPENAI_API_KEY") or "").strip()

# ---------------------------------------------------------
# Endpoints / Functions
# ---------------------------------------------------------

def run_open_query(prompt: str) -> Dict[str, Any]:
    """
    Executes a basic open-ended query against the configured OpenAI model.
    """
    if OpenAI is None:
        return {"error": "OpenAI package not installed. Please install it to use this endpoint."}

    api_key = get_openai_api_key()
    if not api_key:
        return {"error": "OPENAI_API_KEY not configured in environment."}

    model = os.getenv("OPENAI_ROUTER_MODEL", "gpt-4.1-mini")
    client = OpenAI(api_key=api_key)

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7
        )
        return {
            "model_used": model,
            "response": resp.choices[0].message.content
        }
    except Exception as e:
        return {"error": f"OpenAI API Error: {str(e)}"}


def find_event_site_url(location: str) -> Dict[str, Any]:
    """
    Given a location, uses the LLM to find the official tourism or 
    city calendar of events URL.
    """
    if OpenAI is None:
        return {"error": "OpenAI package not installed."}

    api_key = get_openai_api_key()
    if not api_key:
        return {"error": "OPENAI_API_KEY not configured in environment."}

    model = os.getenv("OPENAI_ROUTER_MODEL", "gpt-4.1-mini")
    client = OpenAI(api_key=api_key)

    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "event_site_locator",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The official event site URL for the location"
                    }
                },
                "required": ["url"]
            }
        }
    }

    instructions = """
    You are a helpful assistant that finds event calendar URLs for specific locations.
    IMPORTANT: You MUST prefer URLs that serve fully-rendered HTML (not JavaScript single-page apps).

    BEST sources (in order of preference):
      1. Local alternative-weekly newspaper event listings that render in plain HTML:
           - Austin     -> https://do512.com/
           - Seattle    -> https://www.thestranger.com/events
           - Portland   -> https://www.portlandmercury.com/events
           - Santa Barbara -> https://www.independent.com/events/
           - SF         -> https://sfweekly.com/events/
           - Denver     -> https://www.westword.com/events/
      2. Local city government calendar pages that render full HTML.
      3. Any other local event listing site that renders full HTML.

    AVOID:
      - Official tourism React/Angular SPAs (nycgo.com, choosechicago.com, visitseattle.org, etc.)
        since these load event data via JavaScript and return empty or near-empty HTML pages.
      - Eventbrite (handled separately).

    Return ONLY a valid URL in the JSON format requested. If you cannot find one, return an empty string.
    """

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": instructions.strip()},
                {"role": "user", "content": f"Find the official event calendar URL for: {location}"}
            ],
            response_format=response_format,
            temperature=0,
        )
        
        result = json.loads(resp.choices[0].message.content)
        return {
            "location": location,
            "url": result.get("url", "")
        }
    except Exception as e:
        return {"error": f"OpenAI API Error: {str(e)}"}


def find_fallback_event_site_url(location: str, failed_url: str, reason: str) -> Dict[str, Any]:
    """
    Asked when the primary URL fails (403, empty page, SSL error, etc.).
    Returns a different candidate URL for the same location.
    """
    if OpenAI is None:
        return {"error": "OpenAI package not installed."}

    api_key = get_openai_api_key()
    if not api_key:
        return {"error": "OPENAI_API_KEY not configured in environment."}

    model = os.getenv("OPENAI_ROUTER_MODEL", "gpt-4.1-mini")
    client = OpenAI(api_key=api_key)

    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "event_site_locator",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "An alternative event site URL for the location"
                    }
                },
                "required": ["url"]
            }
        }
    }

    instructions = """
    You are a helpful assistant that finds event calendar URLs for specific locations.
    A previous URL attempt has failed and you must suggest a DIFFERENT one.
    IMPORTANT: Prefer pages that render full HTML without requiring JavaScript execution.

    BEST fallback options to try (in order):
      1. Local alternative-weekly newspaper event listings:
         (do512.com, thestranger.com/events, portlandmercury.com/events, independent.com/events, etc.)
      2. Local newspaper event sections that render HTML.
      3. Any other local event listing site that renders full HTML.

    AVOID: timeout.com (blocks scrapers), nycgo.com (JS-rendered), laweekly.com (403), Eventbrite (handled separately).

    Return ONLY a valid URL that is DIFFERENT from the failed URL.
    """

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": instructions.strip()},
                {"role": "user", "content": (
                    f"Find an alternative event calendar URL for: {location}. "
                    f"The following URL failed ({reason}): {failed_url}. "
                    f"Return a completely different URL."
                )}
            ],
            response_format=response_format,
            temperature=0,
        )
        result = json.loads(resp.choices[0].message.content)
        return {
            "location": location,
            "url": result.get("url", "")
        }
    except Exception as e:
        return {"error": f"OpenAI API Error: {str(e)}"}


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
                pass
        filtered.append(ev)
    return filtered


def _fetch_and_clean(url: str) -> Dict[str, Any]:
    """
    Fetches a URL with cloudscraper and returns cleaned page text.
    Returns {"page_text": str} on success, or {"error": str, "_scrape_failure_reason": str} on failure.
    """
    try:
        scraper = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'desktop': True
            }
        )
        scraper.mount("https://", _SSLAdapter())
        res = scraper.get(url, timeout=15, verify=False)

        if res.status_code == 403:
            return {
                "error": "HTTP 403 Forbidden — site is blocking the scraper.",
                "_scrape_failure_reason": "http_403",
            }
        if res.status_code == 429:
            return {
                "error": "HTTP 429 Too Many Requests — rate limited.",
                "_scrape_failure_reason": "http_429",
            }
        res.raise_for_status()

        soup = BeautifulSoup(res.text, "html.parser")

        img_tags = soup.find_all("img")
        image_info = []
        for img in img_tags:
            src = img.get("src") or img.get("data-src") or ""
            alt = img.get("alt", "")
            if src and src.startswith("http"):
                image_info.append(f'[IMAGE: alt="{alt}" src="{src}"]')

        # Extract links so the LLM can map events to individual URLs
        link_tags = soup.find_all("a", href=True)
        link_info = []
        for a in link_tags:
            href = a["href"]
            text = a.get_text(strip=True)[:100]
            if href.startswith("http") and text:
                link_info.append(f'[LINK: text="{text}" href="{href}"]')

        for script in soup(["script", "style"]):
            script.extract()

        page_text = soup.get_text(separator=' ', strip=True)
        page_text = page_text[:35000]
        if image_info:
            page_text += "\n\nEXTRACTED IMAGES:\n" + "\n".join(image_info[:50])
        if link_info:
            page_text += "\n\nEXTRACTED LINKS:\n" + "\n".join(link_info[:100])

        if len(page_text) < 500:
            return {
                "error": "Page loaded but appears empty. The site may require JavaScript rendering.",
                "_scrape_failure_reason": "js_rendered",
            }

        return {"page_text": page_text}

    except Exception as e:
        return {
            "error": f"Failed to fetch or parse URL: {str(e)}",
            "_scrape_failure_reason": "fetch_error",
        }


def scrape_events_from_url(
    url: str,
    location_context: str,
    start_date: str = None,
    end_date: str = None,
    event_type: str = None,
    category: str = None,
    min_price: float = None,
    max_price: float = None,
) -> Dict[str, Any]:
    """
    Scrapes a given URL using cloudscraper, extracts its text, and uses 
    the LLM to parse out structured event data including lat/long.
    """
    if OpenAI is None:
        return {"error": "OpenAI package not installed."}

    api_key = get_openai_api_key()
    if not api_key:
        return {"error": "OPENAI_API_KEY not configured in environment."}

    # 1. Fetch and clean the webpage text
    fetch_result = _fetch_and_clean(url)
    if "error" in fetch_result:
        return fetch_result
    page_text = fetch_result["page_text"]

    # 2. Setup the LLM request
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
                            "required": ["name", "start_date", "end_date", "event_type", "price", "latitude", "longitude", "image"]
                        }
                    }
                },
                "required": ["events"]
            }
        }
    }

    instructions = f"""
    You are an expert data extraction assistant. I will provide you with the raw text scraped from an event website for the location: {location_context}.
    Extract all distinct events you can find.

    For latitude and longitude: If the exact coordinates are not in the text, use your geographic knowledge to estimate the coordinates based on the venue name and the city context ({location_context}).
    For price: If not listed, output 'Unknown'. If free, output 'Free'.
    For image: Extract the event image/thumbnail URL if available from the EXTRACTED IMAGES section. Match images to events by alt text or proximity. If not found, output an empty string.
    """

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": instructions.strip()},
                {"role": "user", "content": f"Here is the webpage text:\n\n{page_text}"}
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
                "location": location_context,
                "venue": "",
                "image": ev.get("image", ""),
                "url": url,
                "price": ev.get("price", "Unknown"),
                "type": ev.get("event_type", ""),
                "latitude": ev.get("latitude"),
                "longitude": ev.get("longitude"),
                "source": "OpenScraper",
            }
            normalized.append(evt)

        # Apply filters
        filtered = _filter_events(normalized, start_date, end_date, event_type, category, min_price, max_price)

        return {
            "url_scraped": url,
            "events": filtered,
            "total": len(filtered),
        }
    except Exception as e:
        return {"error": f"OpenAI API Error: {str(e)}"}


def scrape_events_with_location(url: str) -> Dict[str, Any]:
    """
    Scrapes a URL and extracts events along with the detected city/state.
    Used by the upload-url endpoint where the location is unknown and must be
    inferred from the page content.

    Returns:
        On success: {"events": [...], "detected_city": str, "detected_state": str, "url_scraped": str}
        On failure: {"error": str, "_scrape_failure_reason": str}
    """
    if OpenAI is None:
        return {"error": "OpenAI package not installed."}

    api_key = get_openai_api_key()
    if not api_key:
        return {"error": "OPENAI_API_KEY not configured in environment."}

    fetch_result = _fetch_and_clean(url)
    if "error" in fetch_result:
        return fetch_result
    page_text = fetch_result["page_text"]

    model = os.getenv("OPENAI_ROUTER_MODEL", "gpt-4.1-mini")
    client = OpenAI(api_key=api_key)

    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "event_scraper_with_location",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "detected_city": {
                        "type": "string",
                        "description": "The city where most events on this page take place"
                    },
                    "detected_state": {
                        "type": "string",
                        "description": "The US state (full name) where most events take place, or empty string if not in the US"
                    },
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
                                "venue": {"type": "string", "description": "Name of the venue where the event takes place, or empty string if unknown"},
                                "description": {"type": "string", "description": "Brief description of the event (1-2 sentences), or empty string if not available"},
                                "event_url": {"type": "string", "description": "Direct URL to this specific event's detail page if a link is found in the HTML, or empty string if not found"},
                            },
                            "required": ["name", "start_date", "end_date", "event_type", "price", "latitude", "longitude", "image", "venue", "description", "event_url"]
                        }
                    }
                },
                "required": ["detected_city", "detected_state", "events"]
            }
        }
    }

    instructions = """
    You are an expert data extraction assistant. Extract all distinct events from the following webpage.
    Also determine the primary city and US state where these events take place, based on venue names,
    addresses, and other geographic clues in the text.

    For latitude and longitude: Use your geographic knowledge to estimate coordinates based on venue names and addresses found in the text.
    For price: If not listed, output 'Unknown'. If free, output 'Free'.
    For image: Extract the event image/thumbnail URL if available from the EXTRACTED IMAGES section. Match images to events by alt text or proximity. If not found, output an empty string.
    For detected_state: Use the full state name (e.g., "California", not "CA"). If the events are not in the US, output an empty string.
    For venue: Extract the venue or location name where the event is held (e.g., "Madison Square Garden", "Central Park"). Output empty string if not found.
    For description: Write a brief 1-2 sentence description of the event based on the page content. Output empty string if insufficient information.
    For event_url: Look for hyperlinks in the page that lead to individual event detail pages. Extract the full absolute URL. Output empty string if no specific event link is found.
    """

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": instructions.strip()},
                {"role": "user", "content": f"Here is the webpage text:\n\n{page_text}"}
            ],
            response_format=response_format,
            temperature=0.1,
        )

        result = json.loads(resp.choices[0].message.content)
        raw_events = result.get("events", [])
        detected_city = result.get("detected_city", "")
        detected_state = result.get("detected_state", "")
        location_label = f"{detected_city}, {detected_state}" if detected_city and detected_state else detected_city or "Unknown"

        # Extract domain name for display (e.g., "eventbrite.com")
        domain = urlparse(url).netloc.removeprefix("www.")

        normalized = []
        for ev in raw_events:
            event_url = ev.get("event_url", "").strip()
            evt = {
                "name": ev.get("name", ""),
                "date": (ev.get("start_date") or "")[:10],
                "time": (ev.get("start_date") or "")[11:] if "T" in (ev.get("start_date") or "") else "",
                "end_date": (ev.get("end_date") or "")[:10],
                "location": location_label,
                "venue": ev.get("venue", ""),
                "description": ev.get("description", ""),
                "image": ev.get("image", ""),
                "url": event_url if event_url else url,
                "price": ev.get("price", "Unknown"),
                "type": ev.get("event_type", ""),
                "latitude": ev.get("latitude"),
                "longitude": ev.get("longitude"),
                "source": domain,
            }
            normalized.append(evt)

        return {
            "url_scraped": url,
            "events": normalized,
            "total": len(normalized),
            "detected_city": detected_city,
            "detected_state": detected_state,
        }
    except Exception as e:
        return {"error": f"OpenAI API Error: {str(e)}"}