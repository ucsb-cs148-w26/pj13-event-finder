# Project: Event Finder

## Deployment
Frontend: https://pj13-event-finder-2j74.vercel.app/  
Backend: https://pj13-event-finder-backend.vercel.app/
## Description
Event finder is an app that allows a user to search for events in their area and the click of a button.

## Audience
- People who are new to an area and want to look for things to do.
- People who don't want to go through the headache of searching different sources for things to do.

## Group Members
- Aavash Adhikari
- Charles Zhang
- Chris Woolson
- Wendy Song
- Whisper Xia

## Tech Stack
- Frontend: React TS    
- Backend: FastAPI
- Database: Firebase DB for caching events in a location
- Cloud Compute: Vercel
- API: OpenAI for searching the internet for activities to do. Various API endpoints to search event sites easily, ie Reddit API, TicketMaster API

## App Plan
- Purpose: For our app, we want it to be a public website, and allow users to input any location they'd like to explore events for. There is no reason (yet) to have users create a profile to use the site, however we should implement rate limiting. The database also can reduce the number of ai credits used. The app should be simple: a user submits a date/time window and location, and the app searches for events. The user can also filter types of events, durations, categories, price, etc. There can also be an option for the user to input their precise location, and the app displays the distances to each found event on a map.
- User Role: There will be one type of user (authenticated with an email address), who uses the service to receive a list of events.


# Installation

## Prerequisites

pip, node.js v24.13.0, npm v11.6.2
Obtain a TicketMaster API key from https://developer-acct.ticketmaster.com/user, add it to backend .env named TICKETMASTER_API_KEY

## Dependencies

Backend: fastapi, uvicorn, requests, python-dotenv, httpx
- These dependencies are to set up the API and enable it to fetch data from other APIs.
Frontend: React, npm
- These dependencies are simply to create an interactive and simple frontend able to present event info clearly.

## Installation Steps

Backend: pip install -r requirements.txt
Frontend: npm i

# Functionality

On Frontend terminal Run:
- npm i
- npm start

On Backend terminal Run:
- uvicorn api.index:app --reload

Open frontend app in localhost given in terminal output.

# Known Problems

Duplicate events having similar information, yet are definitely the same event.

# Contributing

Fork it!

Create your feature branch: `git checkout -b my-new-feature`

Commit your changes: `git commit -am 'Add some feature'`

Push to the branch: `git push origin my-new-feature`

Submit a pull request :D

# License
MIT license


