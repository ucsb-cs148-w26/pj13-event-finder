// src/components/SearchPanel.jsx
import React, { useMemo, useState, useEffect } from "react";
import { US_STATES, CITIES_BY_STATE, POPULAR_CITIES } from "../utils/locationData";

/**
 * SearchPanel owns ONLY search UI state.
 * When the user submits, it calls onSearch({ ...searchArgs }) and lets App do the fetch.
 */
export default function SearchPanel({ onSearch, loading, onLocationPreviewChange }) {
  const [stateQuery, setStateQuery] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [showStateTypeahead, setShowStateTypeahead] = useState(false);

  const [cityQuery, setCityQuery] = useState("");
  const [showCityTypeahead, setShowCityTypeahead] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [usePreciseLocation, setUsePreciseLocation] = useState(false);
  const [useMyLocation, setUseMyLocation] = useState(true);
  const [preciseLat, setPreciseLat] = useState(null);
  const [preciseLon, setPreciseLon] = useState(null);
  const [preciseLocationError, setPreciseLocationError] = useState(null);
  const [preciseLocationLoading, setPreciseLocationLoading] = useState(false);
  const [preciseRadius, setPreciseRadius] = useState(25);

  const [filters, setFilters] = useState({
    eventType: [],
    category: [],
    priceRange: { min: "", max: "" },
    duration: [],
  });
  const [showFilters, setShowFilters] = useState(false);

  // Derived: stateResults + cityResults
  const stateResults = useMemo(() => {
    const q = stateQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    return US_STATES.filter((s) => s.toLowerCase().includes(q)).slice(0, 10);
  }, [stateQuery]);

  const cityResults = useMemo(() => {
    if (!selectedState) return [];
    const allCities = CITIES_BY_STATE[selectedState] || [];
    const q = cityQuery.trim().toLowerCase();
    if (!q) return allCities.slice(0, 10);
    return allCities
      .filter((name) => name.toLowerCase().startsWith(q))
      .slice(0, 10);
  }, [cityQuery, selectedState]);

  const handlePriceRangeChange = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      priceRange: {
        ...prev.priceRange,
        [field]: value === "" ? "" : parseFloat(value) || "",
      },
    }));
  };

  const handleMultiSelectChange = (filterName, value) => {
    setFilters((prev) => {
      const currentArray = prev[filterName] || [];
      const isSelected = currentArray.includes(value);
      return {
        ...prev,
        [filterName]: isSelected
          ? currentArray.filter((item) => item !== value)
          : [...currentArray, value],
      };
    });
  };

  const handlePopularCityClick = (city, state) => {
    setSelectedState(state);
    setStateQuery(state);
    setCityQuery(city);
    setShowStateTypeahead(false);
    setShowCityTypeahead(false);
  };

  const requestPreciseLocation = () => {
    setPreciseLocationError(null);
    setPreciseLat(null);
    setPreciseLon(null);

    setPreciseLocationLoading(true);
    if (!navigator.geolocation) {
      setPreciseLocationError("Geolocation not supported");
      setPreciseLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPreciseLat(pos.coords.latitude);
        setPreciseLon(pos.coords.longitude);
        setPreciseLocationError(null);
        setPreciseLocationLoading(false);
      },
      (err) => {
        setPreciseLocationError(err.message || "Location unavailable");
        setPreciseLocationLoading(false);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  // If user toggles precise location on, request it immediately
  useEffect(() => {
    if (usePreciseLocation) requestPreciseLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usePreciseLocation]);

  // Notify parent: show=true when in location mode with coords; show=false when not (pass coords so App keeps map mounted and reuses it)
  useEffect(() => {
    if (!onLocationPreviewChange) return;
    if (usePreciseLocation && preciseLat != null && preciseLon != null) {
      onLocationPreviewChange({ show: true, lat: preciseLat, lng: preciseLon, radiusMiles: preciseRadius, useMyLocation });
    } else if (preciseLat != null && preciseLon != null) {
      onLocationPreviewChange({ show: false, lat: preciseLat, lng: preciseLon, radiusMiles: preciseRadius, useMyLocation });
    } else {
      onLocationPreviewChange(null);
    }
  }, [usePreciseLocation, preciseLat, preciseLon, preciseRadius, useMyLocation, onLocationPreviewChange]);

  // Minimum datetime for date inputs (today, now) - prevents selecting past dates, converted to local time
  const pad2 = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const todayDateLocal = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const minDateTime = `${todayDateLocal}T00:00`;

  const getDefaultDateRange = () => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return {
      startDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
      endDate: `${in24h.getFullYear()}-${pad(in24h.getMonth() + 1)}-${pad(in24h.getDate())}T${pad(in24h.getHours())}:${pad(in24h.getMinutes())}`,
    };
  };

  const buildSearchArgs = () => ({
    // location
    usePreciseLocation,
    useMyLocation,
    preciseLat,
    preciseLon,
    preciseRadius,
    preciseLocationLoading,
    // typed location
    selectedState,
    stateQuery,
    cityQuery,
    // dates
    startDate,
    endDate,
    // filters
    filters,
  });

  const onSubmit = (e) => {
    e.preventDefault();
    const start = startDate?.trim();
    const end = endDate?.trim();
    let args = buildSearchArgs();
    if (!start && !end) {
      const defaults = getDefaultDateRange();
      args = { ...args, startDate: defaults.startDate, endDate: defaults.endDate };
      setStartDate(defaults.startDate);
      setEndDate(defaults.endDate);
    }
    onSearch(args);
  };

  return (
    <form
      className={`w-full ${usePreciseLocation ? "max-w-[50%] mr-auto" : "max-w-7xl mx-auto"}`}
      onSubmit={onSubmit}
    >
      {/* Glassmorphic Search Card */}
      <div className="bg-white/80 backdrop-blur-lg border border-white/20 rounded-2xl shadow-xl p-6 mb-6">
        {/* Top row: switch on the far left in its own area */}
        <div className="flex flex-col gap-1.5 mb-4 pb-3 border-b border-gray-200/60">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <span className="text-sm font-semibold text-gray-700">Search By</span>
              <div className="flex rounded-lg border border-gray-300 bg-gray-100/80 p-0.5 shrink-0 w-fit mt-1">
                <button
                  type="button"
                  onClick={() => setUsePreciseLocation(false)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    !usePreciseLocation
                      ? "bg-white text-purple-700 shadow-sm"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  City/State
                </button>
                <button
                  type="button"
                  onClick={() => setUsePreciseLocation(true)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    usePreciseLocation
                      ? "bg-white text-purple-700 shadow-sm"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Location
                </button>
              </div>
            </div>
            {usePreciseLocation && (
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useMyLocation}
                  onChange={(e) => setUseMyLocation(e.target.checked)}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <span className="font-medium">Use my location</span>
              </label>
            )}
          </div>
        </div>

        <div
          className={
            usePreciseLocation
              ? "flex flex-col gap-4"
              : "flex flex-col lg:flex-row gap-4 items-end"
          }
        >
          {/* Location Group: state/city or radius */}
          <div className="flex-1 w-full">
            {!usePreciseLocation ? (
              <div className="flex gap-2">
                {/* State Input */}
                <div className="flex-1 flex flex-col">
                  <label htmlFor="state" className="block text-sm font-semibold text-gray-700 mb-2">
                    State
                  </label>
                  <div className="relative">
                  <input
                    type="text"
                    id="state"
                    value={stateQuery}
                    onChange={(e) => {
                      const next = e.target.value;
                      setStateQuery(next);
                      setSelectedState("");
                      setCityQuery("");
                      setShowStateTypeahead(true);
                    }}
                    onFocus={() => setShowStateTypeahead(true)}
                    onBlur={() =>
                      window.setTimeout(() => setShowStateTypeahead(false), 150)
                    }
                    placeholder="State name (e.g., California)"
                    autoComplete="off"
                    required
                    className="w-full px-4 py-2.5 bg-transparent border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium"
                  />
                  {showStateTypeahead && stateResults.length > 0 && (
                    <ul className="absolute z-50 w-full mt-1 bg-white/95 backdrop-blur-md border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {stateResults.map((state) => (
                        <li
                          key={state}
                          onMouseDown={() => {
                            setSelectedState(state);
                            setStateQuery(state);
                            setShowStateTypeahead(false);
                            setCityQuery("");
                          }}
                          className="px-4 py-2 hover:bg-purple-50 cursor-pointer text-gray-700"
                        >
                          {state}
                        </li>
                    ))}
                  </ul>
                )}
                  </div>
                </div>

                {/* City Input */}
                <div className="flex-1 flex flex-col">
                  <label htmlFor="city" className="block text-sm font-semibold text-gray-700 mb-2">
                    City
                  </label>
                  <div className="relative">
                  <input
                    type="text"
                    id="city"
                    value={cityQuery}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCityQuery(next);
                      setShowCityTypeahead(true);
                    }}
                    onFocus={() => setShowCityTypeahead(true)}
                    onBlur={() =>
                      window.setTimeout(() => setShowCityTypeahead(false), 150)
                    }
                    placeholder={selectedState ? `City in ${selectedState}` : "City name"}
                    autoComplete="off"
                    disabled={!selectedState}
                    required
                    className="w-full px-4 py-2.5 bg-transparent border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:bg-gray-100 disabled:cursor-not-allowed font-medium"
                  />
                  {showCityTypeahead &&
                    cityQuery.length >= 1 &&
                    cityResults.length === 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white/95 backdrop-blur-md border border-gray-200 rounded-lg shadow-lg px-4 py-2 text-gray-500 text-sm">
                        No matching cities found.
                      </div>
                    )}
                  {showCityTypeahead && cityResults.length > 0 && (
                    <ul className="absolute z-50 w-full mt-1 bg-white/95 backdrop-blur-md border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {cityResults.map((cityName) => (
                        <li
                          key={`${selectedState}-${cityName}`}
                          onMouseDown={() => {
                            setCityQuery(cityName);
                            setShowCityTypeahead(false);
                          }}
                          className="px-4 py-2 hover:bg-purple-50 cursor-pointer text-gray-700"
                        >
                          {`${cityName}, ${selectedState}`}
                        </li>
                      ))}
                    </ul>
                  )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-xs">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Radius (miles)
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={preciseRadius}
                  onChange={(e) =>
                    setPreciseRadius(e.target.value ? Number(e.target.value) : "")
                  }
                  placeholder="e.g. 25"
                  className="w-full px-4 py-2.5 bg-transparent border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium"
                />
              </div>
            )}
          </div>

          {/* Date Range: on same row as location in city/state mode, on next line below radius in location mode */}
          <div className="flex flex-col sm:flex-row gap-2 flex-1 w-full">
            <div className="flex-1">
              <label
                htmlFor="start-date"
                className="block text-sm font-semibold text-gray-700 mb-2"
              >
                Start Date
              </label>
              <input
                type="datetime-local"
                id="start-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={minDateTime}
                max="9999-12-31T23:59"
                className="w-full px-4 py-2.5 bg-transparent border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium"
              />
            </div>
            <div className="flex-1">
              <label
                htmlFor="end-date"
                className="block text-sm font-semibold text-gray-700 mb-2"
              >
                End Date
              </label>
              <input
                type="datetime-local"
                id="end-date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={minDateTime}
                max="9999-12-31T23:59"
                className="w-full px-4 py-2.5 bg-transparent border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Popular Cities Chips */}
        {!usePreciseLocation && (
          <div className="mt-4 pt-4 border-t border-gray-200/50">
            <p className="text-xs text-gray-500 mb-2 font-medium">Popular Cities:</p>
            <div className="flex flex-wrap gap-2">
              {POPULAR_CITIES.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePopularCityClick(item.city, item.state)}
                  className="px-3 py-1 text-xs bg-white/60 hover:bg-white/80 border border-gray-200 rounded-full text-gray-700 hover:text-purple-700 transition-all font-medium"
                >
                  {item.city}, {item.state}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Additional Options */}
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {usePreciseLocation && (
              <span className="text-sm text-gray-600">
                {preciseLocationLoading && "Getting location…"}
                {!preciseLocationLoading && preciseLocationError && (
                  <span className="text-red-600"> {preciseLocationError}</span>
                )}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="ml-auto px-4 py-2 text-sm font-medium text-gray-700 bg-transparent hover:bg-white/60 border border-gray-300 rounded-lg transition-all"
            >
              {showFilters ? "Hide" : "Show"} Filters
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white/80 backdrop-blur-lg border border-white/20 rounded-2xl shadow-xl p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Event Type
              </label>
              <div className="space-y-2">
                {[
                  { value: "concert", label: "Concert" },
                  { value: "sports", label: "Sports" },
                  { value: "theater", label: "Theater" },
                  { value: "festival", label: "Festival" },
                  { value: "conference", label: "Conference" },
                  { value: "workshop", label: "Workshop" },
                  { value: "other", label: "Other" },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-purple-700"
                  >
                    <input
                      type="checkbox"
                      value={option.value}
                      checked={filters.eventType.includes(option.value)}
                      onChange={() =>
                        handleMultiSelectChange("eventType", option.value)
                      }
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <span className="font-medium">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Category
              </label>
              <div className="space-y-2">
                {[
                  { value: "music", label: "Music" },
                  { value: "arts", label: "Arts & Culture" },
                  { value: "food", label: "Food & Drink" },
                  { value: "outdoor", label: "Outdoor" },
                  { value: "family", label: "Family" },
                  { value: "networking", label: "Networking" },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-purple-700"
                  >
                    <input
                      type="checkbox"
                      value={option.value}
                      checked={filters.category.includes(option.value)}
                      onChange={() =>
                        handleMultiSelectChange("category", option.value)
                      }
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <span className="font-medium">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Price Range ($)
              </label>
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="price-min"
                    className="block text-xs text-gray-600 mb-1 font-medium"
                  >
                    Min
                  </label>
                  <input
                    type="number"
                    id="price-min"
                    min="0"
                    step="0.01"
                    value={filters.priceRange.min}
                    onChange={(e) =>
                      handlePriceRangeChange("min", e.target.value)
                    }
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-transparent border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium"
                  />
                </div>
                <div>
                  <label
                    htmlFor="price-max"
                    className="block text-xs text-gray-600 mb-1 font-medium"
                  >
                    Max
                  </label>
                  <input
                    type="number"
                    id="price-max"
                    min="0"
                    step="0.01"
                    value={filters.priceRange.max}
                    onChange={(e) =>
                      handlePriceRangeChange("max", e.target.value)
                    }
                    placeholder="No limit"
                    className="w-full px-3 py-2 bg-transparent border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Duration
              </label>
              <div className="space-y-2">
                {[
                  { value: "short", label: "Less than 2 hours" },
                  { value: "medium", label: "2-4 hours" },
                  { value: "long", label: "4+ hours" },
                  { value: "multi-day", label: "Multi-day" },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-purple-700"
                  >
                    <input
                      type="checkbox"
                      value={option.value}
                      checked={filters.duration.includes(option.value)}
                      onChange={() =>
                        handleMultiSelectChange("duration", option.value)
                      }
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <span className="font-medium">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <button type="submit" className="search-button" disabled={loading}>
        {loading ? "Searching..." : "Search Events"}
      </button>
    </form>
  );
}