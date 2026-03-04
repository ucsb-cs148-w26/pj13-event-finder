import os
import json
import cloudscraper
from bs4 import BeautifulSoup
from typing import Dict, Any
from pathlib import Path
from dotenv import load_dotenv, dotenv_values

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
    You are a helpful assistant that finds official tourism or city event calendar URLs for specific locations.
    For example, if the location is 'santa barbara', the URL should be 'https://santabarbaraca.com/plan-your-trip/calendar-of-events/'.
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


def scrape_events_from_url(url: str, location_context: str) -> Dict[str, Any]:
    """
    Scrapes a given URL using cloudscraper, extracts its text, and uses 
    the LLM to parse out structured event data including lat/long.
    """
    if OpenAI is None:
        return {"error": "OpenAI package not installed."}

    api_key = get_openai_api_key()
    if not api_key:
        return {"error": "OPENAI_API_KEY not configured in environment."}

    # 1. Fetch and clean the webpage text using cloudscraper
    try:
        # Create a Cloudscraper instance designed to bypass WAFs/Cloudflare
        scraper = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'desktop': True
            }
        )
        
        res = scraper.get(url, timeout=15, verify=False)
        res.raise_for_status()
        
        soup = BeautifulSoup(res.text, "html.parser")
        
        # Remove script and style elements to reduce noise
        for script in soup(["script", "style"]):
            script.extract()
            
        # Get text and condense whitespace
        page_text = soup.get_text(separator=' ', strip=True)
        
        # Truncate text to avoid blowing up the LLM context window (~40k chars is safe)
        page_text = page_text[:40000] 
        
        # If the page text is practically empty, it might be heavily JS-rendered
        if len(page_text) < 200:
            return {"error": "Page loaded but appears empty. The site may require JavaScript rendering."}
            
    except Exception as e:
        return {"error": f"Failed to fetch or parse URL: {str(e)}"}

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
                                "longitude": {"type": "number", "description": "Approximate longitude based on venue/city"}
                            },
                            "required": ["name", "start_date", "end_date", "event_type", "price", "latitude", "longitude"]
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
        return {
            "url_scraped": url,
            "events": result.get("events", []),
            "total": len(result.get("events", []))
        }
    except Exception as e:
        return {"error": f"OpenAI API Error: {str(e)}"}