// src/App.js
import React, { useCallback, useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import "./App.css";

import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "./utils/firebase";

import SearchPanel from "./components/searchPanel";
import ResultsPanel from "./components/resultsPanel";
import ProfileBookmarksPage from "./components/profileBookmarksPage";
import MapView from "./MapView";

function add24HoursToDateTime(dateTimeStr) {
  if (!dateTimeStr?.trim()) return null;
  const s = dateTimeStr.trim();
  const hasTime = s.includes("T");
  const date = new Date(hasTime ? s : s + "T00:00");
  if (isNaN(date.getTime())) return null;
  const next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

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
  const [locationPreview, setLocationPreview] = useState(null); // { lat, lng, radiusMiles } once we have coords; kept so preview map never unmounts
  const [showMapPreview, setShowMapPreview] = useState(false); // true only when "search by location" is selected and coords available
  const [useMyLocationInPreview, setUseMyLocationInPreview] = useState(true);
  const [manualSearchCenter, setManualSearchCenter] = useState(null); // { lat, lng } when "select location" is used and user has placed pin
  const [isSelectingLocationOnMap, setIsSelectingLocationOnMap] = useState(false); // true when waiting for user to click on map to place pin
  const location = useLocation();
  const navigate = useNavigate();

  const onBookmarksPage = location.pathname === "/bookmarks";

  const handleLocationPreviewChange = useCallback((payload) => {
    if (!payload) {
      // Keep locationPreview so the map stays mounted (avoid remount when switching to city/state and back)
      setShowMapPreview(false);
      setIsSelectingLocationOnMap(false);
      return;
    }
    if (payload.show && payload.lat != null && payload.lng != null) {
      setLocationPreview({
        lat: payload.lat,
        lng: payload.lng,
        radiusMiles: payload.radiusMiles ?? 25,
      });
      setUseMyLocationInPreview(payload.useMyLocation !== false);
      if (payload.useMyLocation === false) {
        if (payload.startSelectingLocation) {
          setIsSelectingLocationOnMap(true);
          setManualSearchCenter(null);
        } else {
          setManualSearchCenter((prev) => prev ?? { lat: payload.lat, lng: payload.lng });
          setIsSelectingLocationOnMap(false);
        }
      } else {
        setManualSearchCenter(null);
        setIsSelectingLocationOnMap(false);
      }
      setShowMapPreview(true);
      setEvents([]);
      setError("");
      setLoading(false);
      setSelectedMarkerKey(null);
    } else {
      setShowMapPreview(false);
      if (payload.lat != null && payload.lng != null) {
        setLocationPreview((prev) => ({ lat: payload.lat, lng: payload.lng, radiusMiles: payload.radiusMiles ?? prev?.radiusMiles ?? 25 }));
        setUseMyLocationInPreview(payload.useMyLocation !== false);
        if (payload.useMyLocation === false && payload.startSelectingLocation) {
          setIsSelectingLocationOnMap(true);
          setManualSearchCenter(null);
        } else if (payload.useMyLocation === false) {
          setManualSearchCenter((prev) => prev || { lat: payload.lat, lng: payload.lng });
          setIsSelectingLocationOnMap(false);
        }
      }
    }
  }, []);

  const handleMapLocationSelected = useCallback((lat, lng) => {
    setManualSearchCenter({ lat, lng });
    setIsSelectingLocationOnMap(false);
  }, []);

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
        const radius =
          searchArgs.preciseRadius && Number(searchArgs.preciseRadius) > 0
            ? Number(searchArgs.preciseRadius)
            : 25;

        const effectiveLat = searchArgs.useMyLocation
          ? searchArgs.preciseLat
          : manualSearchCenter?.lat;
        const effectiveLon = searchArgs.useMyLocation
          ? searchArgs.preciseLon
          : manualSearchCenter?.lng;

        if (searchArgs.useMyLocation) {
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
          params.append("lat", String(searchArgs.preciseLat));
          params.append("lon", String(searchArgs.preciseLon));
        } else {
          if (!manualSearchCenter || manualSearchCenter.lat == null || manualSearchCenter.lng == null) {
            setError("Please position the map to set the search center.");
            setLoading(false);
            return;
          }
          params.append("lat", String(manualSearchCenter.lat));
          params.append("lon", String(manualSearchCenter.lng));
        }
        setLastSearchArgs({
          ...searchArgs,
          searchCenterLat: effectiveLat != null ? Number(effectiveLat) : undefined,
          searchCenterLon: effectiveLon != null ? Number(effectiveLon) : undefined,
        });
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

      // Dates: when both empty, default to next 24 hours from now
      const startDateArg = searchArgs.startDate?.trim();
      const endDateArg = searchArgs.endDate?.trim();
      let startDate = startDateArg;
      let endDate = endDateArg;
      if (!startDate && !endDate) {
        const now = new Date();
        const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const pad = (n) => String(n).padStart(2, "0");
        startDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
        endDate = `${in24h.getFullYear()}-${pad(in24h.getMonth() + 1)}-${pad(in24h.getDate())}T${pad(in24h.getHours())}:${pad(in24h.getMinutes())}`;
      } else if (startDate && !endDate) {
        endDate = add24HoursToDateTime(startDate);
      } else if (!startDate && endDate) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        startDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      }
      const { processedStartDate, processedEndDate } = ensureDateTimeDefaults({
        startDate,
        endDate,
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
        <p className="mt-2 mb-0 text-gray-600 text-lg">Find events in your area</p>
      </header>

      <main className={`flex-1 w-full mx-auto px-4 py-8 flex flex-col gap-6 ${showPreciseLocationSplitView ? "max-w-[100%]" : "max-w-7xl"}`}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <div
                  className={
                    locationPreview && (showMapPreview || showPreciseLocationSplitView)
                      ? showPreciseLocationSplitView
                        ? "split-results-container w-full max-w-[100%]"
                        : "flex w-full gap-6 items-stretch"
                      : undefined
                  }
                >
                  <div
                    className={locationPreview && (showMapPreview || showPreciseLocationSplitView) ? "flex-shrink-0 min-w-0" : ""}
                    style={{
                      display: showPreciseLocationSplitView && (events.length > 0 || loading || error) ? "none" : "block",
                      flex: locationPreview && (showMapPreview || showPreciseLocationSplitView) ? "0 1 auto" : 1,
                      minWidth: locationPreview && (showMapPreview || showPreciseLocationSplitView) ? 420 : undefined,
                      maxWidth: locationPreview && (showMapPreview || showPreciseLocationSplitView) ? "50%" : undefined,
                    }}
                  >
                    <SearchPanel
                      onSearch={handleSearch}
                      loading={loading}
                      onLocationPreviewChange={handleLocationPreviewChange}
                      isSelectingLocationOnMap={isSelectingLocationOnMap}
                      hasSelectedLocation={!useMyLocationInPreview && !!manualSearchCenter}
                      onReselectLocation={() => {
                        setIsSelectingLocationOnMap(true);
                        setManualSearchCenter(null);
                      }}
                      fullWidthInLayout={!!(locationPreview && (showMapPreview || showPreciseLocationSplitView))}
                    />
                  </div>
                  {showPreciseLocationSplitView && (events.length > 0 || loading || error) && (
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
                      listOnly
                    />
                  )}
                  {locationPreview && (
                    <div
                      className={`flex-1 min-w-0 min-h-0 rounded-2xl overflow-hidden border border-white/20 shadow-xl self-stretch ${
                        showPreciseLocationSplitView ? "split-results-right" : ""
                      } ${!showMapPreview ? "hidden" : ""}`}
                    >
                      <MapView
                        userLocation={
                          showPreciseLocationSplitView &&
                          lastSearchArgs?.preciseLat != null &&
                          lastSearchArgs?.preciseLon != null
                            ? { lat: lastSearchArgs.preciseLat, lng: lastSearchArgs.preciseLon }
                            : locationPreview
                        }
                        events={showPreciseLocationSplitView ? events : []}
                        selectedMarkerKey={showPreciseLocationSplitView ? selectedMarkerKey : null}
                        onMarkerClick={showPreciseLocationSplitView ? setSelectedMarkerKey : () => {}}
                        searchRadiusMiles={locationPreview.radiusMiles ?? 25}
                        containerVisible={showMapPreview}
                        useMyLocation={useMyLocationInPreview}
                        manualSearchCenter={manualSearchCenter}
                        isSelectingLocation={!showPreciseLocationSplitView && isSelectingLocationOnMap}
                        onLocationSelected={showPreciseLocationSplitView ? undefined : handleMapLocationSelected}
                        circleCenterOverride={
                          showPreciseLocationSplitView &&
                          lastSearchArgs?.searchCenterLat != null &&
                          lastSearchArgs?.searchCenterLon != null
                            ? {
                                lat: lastSearchArgs.searchCenterLat,
                                lng: lastSearchArgs.searchCenterLon,
                              }
                            : undefined
                        }
                      />
                    </div>
                  )}
                </div>
                {(events.length > 0 || loading || error) && !showPreciseLocationSplitView && (
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
                )}
              </>
            }
          />

          <Route
            path="/bookmarks"
            element={<ProfileBookmarksPage user={user} />}
          />
        </Routes>
      </main>

    </div>
  );
}

export default App;