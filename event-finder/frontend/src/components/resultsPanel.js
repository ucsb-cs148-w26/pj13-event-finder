// src/components/ResultsPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import BookmarkStar from "./bookmarkStar";
import EventCard from "../EventCard";
import MapView from "../MapView";
import ProgressBar from "./progressBar";

/** Straight-line distance in miles (haversine) between two lat/lng points. */
function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function ResultsPanel({
  events,
  loading,
  error,
  progress = 0,
  user,
  showPreciseLocationSplitView,
  lastSearchArgs,
  onBackToSearch,
  selectedMarkerKey,
  onMarkerClick,
  listOnly = false,
}) {
  const [keywordFilter, setKeywordFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredEvents = useMemo(() => {
    const normalizedKeyword = keywordFilter.trim().toLowerCase();
    if (!normalizedKeyword) return events;

    return events.filter((event) => {
      const name = (event.name || "").toLowerCase();
      const venue = (event.venue || "").toLowerCase();
      const location = (event.location || "").toLowerCase();
      return (
        name.includes(normalizedKeyword) ||
        venue.includes(normalizedKeyword) ||
        location.includes(normalizedKeyword)
      );
    });
  }, [events, keywordFilter]);

  // Reset to page 1 when keyword filter changes or new events arrive
  useEffect(() => {
    setCurrentPage(1);
  }, [keywordFilter, events]);

  // Pagination
  const EVENTS_PER_PAGE = 12;
  const totalPages = Math.ceil(filteredEvents.length / EVENTS_PER_PAGE);
  const startIndex = (currentPage - 1) * EVENTS_PER_PAGE;
  const paginatedEvents = filteredEvents.slice(startIndex, startIndex + EVENTS_PER_PAGE);

  // Optional categorization (available if you want to render sections later)

  const handlePreviousPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const handleNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1));

  // Precise location split: list only (map is rendered by parent) or full split with map
  if (showPreciseLocationSplitView && events.length > 0) {
    const centerLat =
      lastSearchArgs?.searchCenterLat ?? lastSearchArgs?.preciseLat ?? null;
    const centerLon =
      lastSearchArgs?.searchCenterLon ?? lastSearchArgs?.preciseLon ?? null;
    const hasCenter =
      centerLat != null && centerLon != null && Number.isFinite(centerLat) && Number.isFinite(centerLon);

    const listContent = (
      <>
        <div className="split-results-header">
          <p className="m-0 text-gray-700 font-semibold">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""} found
          </p>
          <button type="button" onClick={onBackToSearch} className="back-to-search-btn">
            Back to search
          </button>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Filter by keyword</label>
          <input
            type="text"
            value={keywordFilter}
            onChange={(e) => setKeywordFilter(e.target.value)}
            placeholder="Search within results (event name, venue, location)..."
            className="w-full px-4 py-2.5 bg-white/80 border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>
        <div className="split-events-list">
          {filteredEvents.map((event) => {
            const distMi =
              hasCenter &&
              event?.latitude != null &&
              event?.longitude != null &&
              Number.isFinite(Number(event.latitude)) &&
              Number.isFinite(Number(event.longitude))
                ? distanceMiles(centerLat, centerLon, Number(event.latitude), Number(event.longitude))
                : null;
            return (
              <EventCard
                key={event.id}
                event={event}
                user={user}
                distanceFromCenterMiles={distMi != null ? Math.round(distMi * 10) / 10 : undefined}
              />
            );
          })}
        </div>
      </>
    );
    if (listOnly) {
      return <div className="split-results-left">{listContent}</div>;
    }
    const userLocation =
      lastSearchArgs?.preciseLat != null && lastSearchArgs?.preciseLon != null
        ? { lat: lastSearchArgs.preciseLat, lng: lastSearchArgs.preciseLon }
        : null;
    const circleCenterOverride =
      lastSearchArgs?.searchCenterLat != null && lastSearchArgs?.searchCenterLon != null
        ? { lat: lastSearchArgs.searchCenterLat, lng: lastSearchArgs.searchCenterLon }
        : null;
    return (
      <div className="split-results-container w-full max-w-[100%]">
        <div className="split-results-left">{listContent}</div>
        <div className="split-results-right">
          <div className="map-panel">
            <MapView
              userLocation={userLocation}
              events={filteredEvents}
              selectedMarkerKey={selectedMarkerKey}
              onMarkerClick={onMarkerClick}
              searchRadiusMiles={lastSearchArgs?.preciseRadius}
              circleCenterOverride={circleCenterOverride}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-lg border border-white/20 rounded-2xl shadow-xl p-6">
      <h2 className="m-0 mb-6 text-gray-800 text-3xl font-bold">Search Results</h2>

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6 text-red-700">
          <p className="m-0">{error}</p>
        </div>
      )}

      {loading ? (
        <ProgressBar progress={progress} label="Aggregating events from all sources..." />
      ) : events.length === 0 && !error ? (
        <div className="text-center py-12 text-gray-600">
          <p>Enter a location and click "Search" to find events in your area.</p>
        </div>
      ) : (
        <>
          {/* Keyword filter appears only when there are search results */}
          <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Filter by keyword
              </label>
              <input
                type="text"
                value={keywordFilter}
                onChange={(e) => setKeywordFilter(e.target.value)}
                placeholder="Search within results (event name, venue, location)..."
                className="w-full px-4 py-2.5 bg-white/80 border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
            <p className="m-0 text-sm text-gray-600 md:ml-4">
              Showing <span className="font-semibold">{paginatedEvents.length}</span> of{" "}
              <span className="font-semibold">{events.length}</span> events
            </p>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <p>No events match your keywords. Try a different search term.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedEvents.map((event) => (
                  <div
                    key={event.id}
                    className="bg-gray-50 rounded-lg border-2 border-gray-200 transition-all overflow-hidden flex flex-col hover:border-purple-500 hover:shadow-lg hover:-translate-y-1"
                  >
                    <div className="relative">
                        {event.image && (
                        <img
                            src={event.image}
                            alt={event.name}
                            className="w-full h-48 object-cover bg-gray-200"
                        />
                        )}

                        {/* Star in the top-right */}
                        <BookmarkStar user={user} event={event} className="absolute top-3 right-3" />
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                      <h3 className="m-0 mb-3 text-gray-800 text-xl font-bold">
                        {event.name}
                      </h3>
                      {event.venue && (
                        <p className="m-2 text-gray-600 text-sm">🏢 {event.venue}</p>
                      )}
                      {event.location && (
                        <p className="m-2 text-gray-600 text-sm">📍 {event.location}</p>
                      )}
                      <p className="m-2 text-gray-600 text-sm">
                        📅 {event.date}
                        {event.time && ` at ${event.time}`}
                      </p>
                      {event.priceRange && event.priceRange.min !== undefined && (
                        <p className="m-2 text-gray-600 text-sm">
                          💵 {event.priceRange.currency || "USD"} ${event.priceRange.min}
                          {event.priceRange.max &&
                            event.priceRange.max !== event.priceRange.min &&
                            ` - $${event.priceRange.max}`}
                        </p>
                      )}
                      {event.url && (
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-auto pt-4 text-purple-600 no-underline font-semibold transition-colors hover:text-purple-800 hover:underline"
                        >
                          View on {event.source} →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-8 pt-6 border-t border-gray-200">
                  <button
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-lg transition-all hover:bg-gray-50 hover:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300"
                  >
                    ← Back
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-lg transition-all hover:bg-gray-50 hover:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}