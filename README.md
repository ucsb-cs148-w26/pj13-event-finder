# Project: Event Finder

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
- Cloud Compute: Netlify
- API: OpenAI for searching the internet for activities to do. Various API endpoints to search event sites easily, ie Reddit API, TicketMaster API

## App Plan
- Purpose: For our app, we want it to be a public website, and allow users to input any location they'd like to explore events for. There is no reason (yet) to have users create a profile to use the site, however we should implement rate limiting. The database also can reduce the number of ai credits used. The app should be simple: a user submits a date/time window and location, and the app searches for events. The user can also filter types of events, durations, categories, price, etc. There can also be an option for the user to input their precise location, and the app displays the distances to each found event on a map.
- User Role: One type of user.
