We agree that the github commit graph is an accurate representation of our work.

### Aavash's Contributions

I have worked on the LLM that operates in the backend of our app. This LLM has been prompted to choose the appropriate API when searching for events. We are incorporating multiple APIs for finding events such as Ticketmaster and EventBrite. The different websites host different types of events and by using the LLM we can display events that better suit the user. For example, Ticketmaster tends to host bigger, more formal events like concerts or sports games while Eventbrite has smaller community made events. Using the filters chosen, size of the event, and other metrics, the LLM works to display events that match the users needs.

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
