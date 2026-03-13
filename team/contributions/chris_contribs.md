I was responsible for almost all of the backend for the project. First, I made the api and all its endpoints. This includes: ticketmaster, event aggregate, open-scrape, eventbrite, all_events, and stored urls, and their corresponding functions. I also have implemented the backend database through firebase, involving using cloudscrape, beautifulsoup, llm for website search/parsing. This serves as a cache for our events, and stores the url sites that users input. I also completed most of our sprints. Finally, I added url input, allowing users to upload a url to add as a new data point for events in a location. Also, I completed all of the design doc, and assisted Aavash in deploying our webapp.

**My PRs:**
- Added simple api structure
- Ticketmaster API added
- Removed duplicate events (gave events more structure)
- Fixed CORs so our app ran on deployment
- Added Allevents webscraper
- Added eventbrite webscraper
- Added openscraper (llm for site search->llm for site scrape)
- Added backend database
- Added URL upload
