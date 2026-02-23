// src/utils/locationData.js
import citiesData from "./cities.json";

export const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana",
  "Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana",
  "Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina",
  "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming"
];

export const CITIES_BY_STATE = citiesData;

// Popular cities for quick selection
export const POPULAR_CITIES = [
  { city: "New York City", state: "New York" },
  { city: "Los Angeles", state: "California" },
  { city: "Chicago", state: "Illinois" },
  { city: "Houston", state: "Texas" },
  { city: "Phoenix", state: "Arizona" },
  { city: "Philadelphia", state: "Pennsylvania" },
  { city: "San Antonio", state: "Texas" },
  { city: "San Diego", state: "California" }
];