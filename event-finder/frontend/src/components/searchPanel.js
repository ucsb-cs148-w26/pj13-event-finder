// src/components/SearchPanel.jsx
import React, { useMemo, useState, useEffect } from "react";
import { US_STATES, CITIES_BY_STATE, POPULAR_CITIES } from "../utils/locationData";

/**
 * SearchPanel owns ONLY search UI state.
 * When the user submits, it calls onSearch({ ...searchArgs }) and lets App do the fetch.
 */
export default function SearchPanel({ onSearch, loading }) {
  const [stateQuery, setStateQuery] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [showStateTypeahead, setShowStateTypeahead] = useState(false);

  const [cityQuery, setCityQuery] = useState("");
  const [showCityTypeahead, setShowCityTypeahead] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [usePreciseLocation, setUsePreciseLocation] = useState(false);
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

  // Minimum datetime for date inputs (today, now) - prevents selecting past dates, converted to local time
  const now = new Date();
  const minDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const buildSearchArgs = () => ({
    // location
    usePreciseLocation,
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
    onSearch(buildSearchArgs());
  };

  return (
    <form className="w-full max-w-6xl mx-auto" onSubmit={onSubmit}>
      {/* Glassmorphic Search Card */}
      <div className="bg-white/80 backdrop-blur-lg border border-white/20 rounded-2xl shadow-xl p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          {/* Location Group */}
          <div className="flex-1 w-full">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Location *
            </label>
            <div className="flex gap-2">
              {/* State Input */}
              <div className="flex-1 relative">
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
                  required={!usePreciseLocation}
                  disabled={usePreciseLocation}
                  className="w-full px-4 py-2.5 bg-transparent border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
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

              {/* City Input */}
              <div className="flex-1 relative">
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
                  disabled={!selectedState || usePreciseLocation}
                  required={!usePreciseLocation}
                  className="w-full px-4 py-2.5 bg-transparent border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:bg-gray-100 disabled:cursor-not-allowed font-medium"
                />
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

          {/* Date Range */}
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
                required
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
                required
                className="w-full px-4 py-2.5 bg-transparent border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Popular Cities Chips */}
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

        {/* Additional Options */}
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usePreciseLocation}
                  onChange={(e) => setUsePreciseLocation(e.target.checked)}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <span className="font-medium">Use My Precise Location</span>
              </label>

              {usePreciseLocation && (
                <span className="text-sm text-gray-600">
                  {preciseLocationLoading && "Getting location…"}
                  {!preciseLocationLoading && preciseLocationError && (
                    <span className="text-red-600"> {preciseLocationError}</span>
                  )}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-transparent hover:bg-white/60 border border-gray-300 rounded-lg transition-all"
            >
              {showFilters ? "Hide" : "Show"} Filters
            </button>
          </div>

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
              disabled={!usePreciseLocation}
              placeholder="e.g. 25"
              className="w-full px-4 py-2.5 bg-transparent border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
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