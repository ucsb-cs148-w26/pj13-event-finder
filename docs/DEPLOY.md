## Deployment
Frontend: https://pj13-event-finder-2j74.vercel.app/  
Backend: https://pj13-event-finder-backend.vercel.app/

## Local Deployment
# Installation

## Prerequisites

pip, node.js v24.13.0, npm v11.6.2
Obtain a TicketMaster API key from https://developer-acct.ticketmaster.com/user, add it to backend .env named TICKETMASTER_API_KEY

## Dependencies

Backend: fastapi, uvicorn, requests, python-dotenv, httpx, openai, beautifulsoup4
- These dependencies are to set up the API and enable it to fetch data from other APIs.
Frontend: React, npm
- These dependencies are simply to create an interactive and simple frontend able to present event info clearly.

## Installation Steps

clone the repo
```
git clone https://github.com/ucsb-cs148-w26/pj13-event-finder
```
install backend dependencies
```
cd backend
pip install -r requirements.txt
```
install frontend dependencies
```
cd frontend
npm install
```

# Functionality

to start the frontend
```
cd frontend
npm start
```
on a separate terminal
```
cd backend
uvicorn api.index:app --reload
```

the app should be opened in `localhost:3000`

# License
MIT license

