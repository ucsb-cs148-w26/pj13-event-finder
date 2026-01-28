from fastapi import FastAPI, HTTPException
from .ticketmaster import TicketmasterService

app = FastAPI()

tm_service = TicketmasterService()

@app.get("/api/events")
async def get_events(location: str, date: str):
    try:
        events = await tm_service.search_events(city=location, date_str=date)
        
        if not events:
            return {"message": "No events found for this location/date", "data": []}
            
        return {"data": events}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))