// src/App.js
import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import "./App.css";

import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "./utils/firebase";

import SearchPanel from "./components/searchPanel";
import ResultsPanel from "./components/resultsPanel";
import ProfileBookmarksPage from "./components/profileBookmarksPage";

function ensureDateTimeDefaults({ startDate, endDate }) {
  let processedStartDate = startDate;
  let processedEndDate = endDate;

  if (startDate) {
    if (!startDate.includes("T")) {
      processedStartDate = startDate + "T00:00";
    } else {
      const [datePart, timePart] = startDate.split("T");
      if (!timePart || timePart === "00:00") processedStartDate = datePart + "T00:00";
    }
  }

  if (endDate) {
    if (!endDate.includes("T")) {
      processedEndDate = endDate + "T23:59";
    } else {
      const [datePart, timePart] = endDate.split("T");
      if (!timePart || timePart === "00:00") processedEndDate = datePart + "T23:59";
    }
  }

  return { processedStartDate, processedEndDate };
}

function App() {
  const [user, setUser] = useState(null);

  // Results state (owned by App)
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSearchArgs, setLastSearchArgs] = useState(null);
  const [selectedMarkerKey, setSelectedMarkerKey] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  const onBookmarksPage = location.pathname === "/bookmarks";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Firebase sign-in error:", e);
      alert(`${e.code}\n${e.message}`);
      setError(`Sign-in failed: ${e.code} ${e.message}`);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // SearchPanel calls this with all search args; App does fetch + sets results
  const handleSearch = async (searchArgs) => {
    setLastSearchArgs(searchArgs);
    setLoading(true);
    setError("");
    setEvents([]);
    setSelectedMarkerKey(null);

    try {
      const params = new URLSearchParams();

      // Location: precise vs city/state
      if (searchArgs.usePreciseLocation) {
        if (
          searchArgs.preciseLocationLoading ||
          searchArgs.preciseLat == null ||
          searchArgs.preciseLon == null
        ) {
          setError(
            searchArgs.preciseLocationLoading
              ? "Getting your location…"
              : "Please allow location or enter city and state"
          );
          setLoading(false);
          return;
        }

        const radius =
          searchArgs.preciseRadius && Number(searchArgs.preciseRadius) > 0
            ? Number(searchArgs.preciseRadius)
            : 25;

        params.append("lat", String(searchArgs.preciseLat));
        params.append("lon", String(searchArgs.preciseLon));
        params.append("radius", String(radius));
      } else {
        const locationString =
          searchArgs.cityQuery && searchArgs.selectedState
            ? `${searchArgs.cityQuery}, ${searchArgs.selectedState}`
            : searchArgs.cityQuery || searchArgs.selectedState || "";

        if (!locationString) {
          setError("Please select a city and state");
          setLoading(false);
          return;
        }
        params.append("location", locationString);
      }

      // Dates
      const { processedStartDate, processedEndDate } = ensureDateTimeDefaults({
        startDate: searchArgs.startDate,
        endDate: searchArgs.endDate,
      });

      if (processedStartDate) params.append("start_date", processedStartDate);
      if (processedEndDate) params.append("end_date", processedEndDate);

      // Filters (backend expects first selected, per your original code)
      const f = searchArgs.filters || {};
      if (f.eventType?.length > 0) params.append("event_type", f.eventType[0]);
      if (f.category?.length > 0) params.append("category", f.category[0]);
      if (f.priceRange?.min) params.append("min_price", f.priceRange.min);
      if (f.priceRange?.max) params.append("max_price", f.priceRange.max);

      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
      const apiUrl = `${backendUrl}/api/events?${params.toString()}`;
      console.log("API URL:", apiUrl);

      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        const nextEvents = data.events || [];
        setEvents(nextEvents);
        if (nextEvents.length === 0) setError("No events found. Try adjusting your search criteria.");
      }
    } catch (err) {
      console.error("Search error:", err);
      setError(`Failed to search events: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const showPreciseLocationSplitView =
    lastSearchArgs?.usePreciseLocation && events.length > 0 && !loading && !error;

  const handleBackToSearch = () => {
    setEvents([]);
    setError("");
    setSelectedMarkerKey(null);
  };

  return (
    <div
      className="min-h-screen flex flex-col app-bg"
      style={{ backgroundImage: "url('/background.jpeg')" }}
    >
      {/* ONE header */}
      <header className="bg-white/95 backdrop-blur-sm shadow-md py-8 px-4 text-center relative">
        {/* Top-right auth area */}
        <div className="absolute top-4 right-4 flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-gray-700 max-w-[220px] truncate">
                {user.email}
              </span>

              {/* route-based profile navigation */}
              <button
                type="button"
                onClick={() => navigate(onBookmarksPage ? "/" : "/bookmarks")}
                className="..."
              >
                {onBookmarksPage ? "Back to home" : "View bookmarks"}
              </button>

              <button type="button" className="sign-in-btn" onClick={handleLogout}>
                Sign out
              </button>
            </>
          ) : (
            <button type="button" className="sign-in-btn" onClick={handleGoogleSignIn}>
              Sign in
            </button>
          )}
        </div>

        <h1
          onClick={() => navigate("/")}
          className="m-0 text-gray-800 text-4xl font-bold cursor-pointer select-none"
          role="link"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") navigate("/");
          }}
        >
          Event Finder
        </h1>
        <p className="mt-2 mb-0 text-gray-600 text-lg">
          Discover events in your area with the click of a button
        </p>
      </header>

      <main className={`flex-1 w-full mx-auto px-4 py-8 flex flex-col gap-6 ${showPreciseLocationSplitView ? "max-w-[100%]" : "max-w-7xl"}`}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                {!showPreciseLocationSplitView && (
                  <SearchPanel onSearch={handleSearch} loading={loading} />
                )}
                <ResultsPanel
                  events={events}
                  loading={loading}
                  error={error}
                  user={user}
                  showPreciseLocationSplitView={showPreciseLocationSplitView}
                  lastSearchArgs={lastSearchArgs}
                  onBackToSearch={handleBackToSearch}
                  selectedMarkerKey={selectedMarkerKey}
                  onMarkerClick={setSelectedMarkerKey}
                />
              </>
            }
          />

          <Route
            path="/bookmarks"
            element={<ProfileBookmarksPage user={user} />}
          />
        </Routes>
      </main>

      <footer className="bg-white/95 backdrop-blur-sm py-6 px-4 text-center text-gray-600 mt-auto">
        <p className="m-0">Event Finder - Find events in your area</p>
      </footer>
    </div>
  );
}

export default App;