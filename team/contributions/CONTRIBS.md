We agree that the github commit graph is an accurate representation of our work.

### Aavash's Contributions

I have worked on the LLM that operates in the backend of our app as well as handling the deployment on Vercel. This LLM has been prompted to choose the appropriate API when searching for events based on the filter choices the user has selected. There are multiple APIs for finding events such as Ticketmaster, EventBrite, AllEvents, and an open LLM websearch for local event sites. The different websites host different types of events and by using the LLM router I developed, the app can display events that better suit the user. It does this when the user toggles the "personalize" button and selects the filters they want. I prompted it so that it doesn't return events from just a single API but rather returns a holistic weighted average of events that favor some API calls over the others. Using the filters chosen, size of the event, and other metrics, the LLM works to display events that match the users needs. 

I also worked on the entire Vercel deployment. This included setting up and hosting the frontend and backend servers, ensuring the proper ENV variables are set up, and debugging the issues that occured on the Vercel deployment. There were often times where new features would work on local deployments but not on the production and I had to go through the logs to debug and solve these issues. Vercel didn't allow multiple contributors to the project unless we paid for the premium version so the vast majority of deployment issues were on me to resolve.

I worked on a few bugs that occured when sending information from frontend to backend and with the LLM's connection to the backend. One of them was fixing the filter so that when multiple filters were chosen, all of the selected filters were properly sent to the backend. Originally, even when you checked multiple filters, it would only apply the first filter you selected. This was a key bug I needed to fix as my LLM relied on the filters for the user input. 

PRs: create basic LLM router, connect router to backend, connect router to frontend, incorporate filters into LLM reasoning, add personalize button, fix filter bug


### Whisper's Contributions 

I have worked on connecting the google map API to the webapp, and was responsible for all the features related to location and map. I've implemented the search by location feature and allowed using the user's GPS location and free selecting location from the map. I've added the instruction to pull the longitude and latitude from Ticketmaster API and use it to display the search result events on the map. I also contributed to the frontend design, and fixed many frontend bugs covering both UI issue and interaction issue.

### Charles's Contributions 

I created the structure of the frontend and implemented the majority of frontend features including the entire UI, how the results are displayed, the filter system, and the dropdown system with a database for cities. I revamped the UI to a better design from the original and also fixed a lot of bugs involving setting dates for the time range going into the past or extending past the year limit. I also created the initial unit and component tests for the program to check api functionality and the overall functionality of the UI.

### Chris's Contributions 

 was responsible for almost all of the backend for the project. First, I made the api and all its endpoints. This includes: ticketmaster, event aggregate, open-scrape, eventbrite, all_events, and stored urls, and their corresponding functions. I also have implemented the backend database through firebase, involving using cloudscrape, beautifulsoup, llm for website search/parsing. This serves as a cache for our events, and stores the url sites that users input. I also completed a large majority of our sprints. In addition, I did all of the design document.

My PRs: Added simple api structure Ticketmaster API added Removed duplicate events (gave events more structure) Fixed CORs so our app ran on deployment Added Allevents webscraper Added eventbrite webscraper Added openscraper (llm for site search->llm for site scrape) Added backend database, URL Upload

### Wendy's Contributions 

I have set up firebase in the frontend to allow users to sign-in with google oauth and bookmark events, hashed with firebase ID. I helped clean up the codebase from a spaghetti-like App.js to a structured hierarchy of components, pages, and utils. I have also fixed various frontend bugs such as problems with inputting the date, the headers, and certain views from a user standpoint.

My PRs: set up bookmarks and profile page, added sign in for google oauth and firebase (frontend), code cleanup, fixing ui bugs such as removing popular cities from location view, adjusting the search button, fixing timezone option, fixing more bookmarks bugs with the map view
