import os
import httpx

from dotenv import load_dotenv
  # This finds the .env file and loads it

class TicketmasterService:
    BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json"

    def __init__(self):
        load_dotenv()
        self.api_key = os.environ.get("TICKETMASTER_API_KEY")
        if not self.api_key:
            raise ValueError("TICKETMASTER_API_KEY is not set in environment variables")

    async def search_events(self, city: str, date_str: str):
        formatted_date = f"{date_str}T00:00:00Z"

        params = {
            "apikey": self.api_key,
            "city": city,
            "startDateTime": formatted_date,
            "sort": "date,asc",
            "size": 10
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(self.BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()
                
                return self._parse_events(data)
                
            except httpx.HTTPError as e:
                print(f"Ticketmaster API Error: {e}")
                raise e

    def _parse_events(self, data):
        clean_events = []
        
        if "_embedded" in data and "events" in data["_embedded"]:
            for event in data["_embedded"]["events"]:
                venue_info = event.get("_embedded", {}).get("venues", [{}])[0]
                
                clean_events.append({
                    "name": event.get("name"),
                    "url": event.get("url"),
                    "date": event.get("dates", {}).get("start", {}).get("localDate"),
                    "venue": venue_info.get("name", "TBA"),
                    "city": venue_info.get("city", {}).get("name", "Unknown")
                })
                
        return clean_events