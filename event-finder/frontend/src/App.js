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
  const [progress, setProgress] = useState(0); // 0-100 for progress bar
  const [lastSearchArgs, setLastSearchArgs] = useState(null);
  const [selectedMarkerKey, setSelectedMarkerKey] = useState(null);
  const [locationPreview, setLocationPreview] = useState(null); // { lat, lng, radiusMiles } once we have coords; kept so preview map never unmounts
  const [showMapPreview, setShowMapPreview] = useState(false); // true only when "search by location" is selected and coords available
  const [useMyLocationInPreview, setUseMyLocationInPreview] = useState(true);
  const [manualSearchCenter, setManualSearchCenter] = useState(null); // { lat, lng } when "select location" is used and user has placed pin
  const [isSelectingLocationOnMap, setIsSelectingLocationOnMap] = useState(false); // true when waiting for user to click on map to place pin
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadInputText, setUploadInputText] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);  // show green check on successful submission
  // event detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
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
    setProgress(0); // Reset progress
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
      const apiUrl = `${backendUrl}/api/events-stream?${params.toString()}`;
      console.log("API URL:", apiUrl);

      // Use EventSource for streaming progress updates
      const eventSource = new EventSource(apiUrl);
      
      eventSource.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("Received stream data:", data);
          
          // Update progress
          if (data.progress !== undefined) {
            setProgress(data.progress);
          }
          
          // When complete, set events and close connection
          if (data.status === "complete") {
            if (data.error) {
              setError(data.error);
              setEvents([]);
            } else {
              const nextEvents = data.events || [];
              setEvents(nextEvents);
              if (nextEvents.length === 0) {
                setError("No events found. Try adjusting your search criteria.");
              }
            }
            setLoading(false);
            eventSource.close();
          }
        } catch (parseErr) {
          console.error("Error parsing stream data:", parseErr);
        }
      });
      
      eventSource.addEventListener("error", (event) => {
        console.error("Stream error:", event);
        setError("Failed to fetch events. Please try again.");
        setLoading(false);
        eventSource.close();
      });
    } catch (err) {
      console.error("Search error:", err);
      setError(`Failed to search events: ${err.message}`);
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

  // called when user clicks an event card
  const handleEventClick = async (event) => {
    setDetailEvent(event);
    setDetailError("");
    setDetailLoading(true);
    setDetailModalOpen(true);

    // if ticketmaster, fetch extra details
    if (event.source === "Ticketmaster" && event.id) {
      try {
        const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
        const res = await fetch(`${backendUrl}/api/ticketmaster-event?id=${encodeURIComponent(event.id)}`);
        const data = await res.json();
        if (data.error) {
          setDetailError(data.error);
        } else {
          setDetailEvent((prev) => ({ ...prev, details: data.details || data }));
        }
      } catch (err) {
        setDetailError(err.message || String(err));
      }
    }

    setDetailLoading(false);
  };

  return (
    <div
      className="min-h-screen flex flex-col app-bg"
      style={{ backgroundImage: "url('/background.jpeg')" }}
    >
      {/* ONE header */}
      <header className="bg-white/95 backdrop-blur-sm shadow-md py-8 px-4 text-center relative">
        {/* Top-left Upload button (only when signed in) */}
        {user && (
          <div className="absolute top-4 left-4 flex items-center">
            <button type="button" className="sign-in-btn" onClick={() => {
                setUploadModalOpen(true);
                setUploadInputText("");
                setUploadSuccess(false);
              }}>
              Upload URL
            </button>
          </div>
        )}

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

      {/* Upload modal */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => { setUploadModalOpen(false); setUploadSuccess(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-modal-title"
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="upload-modal-title" className="text-lg font-semibold text-gray-800 mt-0 mb-4">
              Upload URL
            </h2>
            <div className="relative">
              <input
                type="text"
                value={uploadInputText}
                onChange={(e) => setUploadInputText(e.target.value)}
                placeholder="Enter event website URL..."
                className={`w-full px-4 py-2.5 border rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 mb-4 ${uploadSuccess ? 'border-green-500' : 'border-gray-300'}`}
                autoFocus
              />
              {uploadSuccess && (
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500 text-xl">
                  ✓
                </span>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="sign-in-btn"
                onClick={() => {
                  setUploadModalOpen(false);
                  setUploadInputText("");
                  setUploadSuccess(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sign-in-btn"
                onClick={async () => {
                  if (!uploadInputText.trim()) {
                    alert("Please enter a URL");
                    return;
                  }
                  
                  try {
                    const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
                    const response = await fetch(`${backendUrl}/api/upload-url`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        url: uploadInputText.trim(),
                        user_email: user?.email || null
                      })
                    });
                    
                    const result = await response.json();
                    
                    if (result.error) {
                      alert(`Error: ${result.error}`);
                      setUploadSuccess(false);
                    } else {
                      alert(result.message);
                      setUploadSuccess(true);
                      setUploadInputText("");
                      // clear check after a few seconds and auto-close modal
                      setTimeout(() => {
                        setUploadSuccess(false);
                      }, 3000);
                      setTimeout(() => {
                        setUploadModalOpen(false);
                      }, 2000);
                    }
                  } catch (error) {
                    console.error('Upload error:', error);
                    alert('Failed to upload URL. Please try again.');
                    setUploadSuccess(false);
                    // keep modal open so user can retry
                  }
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event detail modal */}
      {detailModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setDetailModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-detail-title"
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="event-detail-title" className="text-lg font-semibold text-gray-800 mt-0 mb-4">
              {detailEvent?.name || "Event details"}
            </h2>
            {detailLoading ? (
              <p>Loading...</p>
            ) : detailError ? (
              <p className="text-red-600">{detailError}</p>
            ) : (
              <>
                {(detailEvent?.details?.description || detailEvent?.description) && (
                  <p className="mb-4 text-gray-700">
                    {detailEvent.details?.description || detailEvent.description}
                  </p>
                )}
                <p className="text-gray-600 mb-2">
                  📅 {detailEvent?.date || detailEvent?.details?.date}{detailEvent?.time || detailEvent?.details?.time ? ` at ${detailEvent?.time || detailEvent?.details?.time}` : ""}
                </p>
                {detailEvent?.venue && <p className="text-gray-600 mb-2">🏢 {detailEvent.venue}</p>}
                {detailEvent?.location && <p className="text-gray-600 mb-2">📍 {detailEvent.location}</p>}
                {detailEvent?.priceRange && detailEvent.priceRange.min !== undefined && (
                  <p className="text-gray-600 mb-2">
                    💵 {detailEvent.priceRange.currency || "USD"} ${detailEvent.priceRange.min}
                    {detailEvent.priceRange.max && detailEvent.priceRange.max !== detailEvent.priceRange.min && ` - $${detailEvent.priceRange.max}`}
                  </p>
                )}
                {detailEvent?.url && (
                  <a
                    href={detailEvent.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-4 text-purple-600 no-underline font-semibold transition-colors hover:text-purple-800 hover:underline"
                  >
                    View on {detailEvent.source} →
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      )}

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
                      progress={progress}
                      user={user}
                      showPreciseLocationSplitView={showPreciseLocationSplitView}
                      lastSearchArgs={lastSearchArgs}
                      onBackToSearch={handleBackToSearch}
                      selectedMarkerKey={selectedMarkerKey}
                      onMarkerClick={setSelectedMarkerKey}
                      onEventClick={handleEventClick}
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
                    progress={progress}
                    user={user}
                    showPreciseLocationSplitView={showPreciseLocationSplitView}
                    lastSearchArgs={lastSearchArgs}
                    onBackToSearch={handleBackToSearch}
                    selectedMarkerKey={selectedMarkerKey}
                    onMarkerClick={setSelectedMarkerKey}
                    onEventClick={handleEventClick}
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