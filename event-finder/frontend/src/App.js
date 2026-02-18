import React, { useState } from 'react';
import './App.css';
import citiesData from './cities.json';

function App() {
  const US_STATES = [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
    'Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana',
    'Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana',
    'Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina',
    'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina',
    'South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
    'Wisconsin','Wyoming'
  ];

  // Import comprehensive city database from JSON file
  const CITIES_BY_STATE = citiesData;

  const [stateQuery, setStateQuery] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [showStateTypeahead, setShowStateTypeahead] = useState(false);

  const [cityQuery, setCityQuery] = useState('');
  const [showCityTypeahead, setShowCityTypeahead] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [usePreciseLocation, setUsePreciseLocation] = useState(false);
  const [keywordFilter, setKeywordFilter] = useState('');
  const [filters, setFilters] = useState({
    eventType: [],
    category: [],
    priceRange: { min: '', max: '' },
    duration: []
  });
  const [showFilters, setShowFilters] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Popular cities for quick selection
  const popularCities = [
    { city: 'New York City', state: 'New York' },
    { city: 'Los Angeles', state: 'California' },
    { city: 'Chicago', state: 'Illinois' },
    { city: 'Houston', state: 'Texas' },
    { city: 'Phoenix', state: 'Arizona' },
    { city: 'Philadelphia', state: 'Pennsylvania' },
    { city: 'San Antonio', state: 'Texas' },
    { city: 'San Diego', state: 'California' }
  ];

  // Compute state results directly from stateQuery
  const getStateResults = () => {
    const q = stateQuery.trim();
    if (q.length < 1) {
      return [];
    }
    const lowered = q.toLowerCase();
    return US_STATES.filter(s => s.toLowerCase().includes(lowered)).slice(0, 10);
  };

  // Compute city results directly from cityQuery and selectedState
  const getCityResults = () => {
    if (!selectedState) return [];
    const allCities = CITIES_BY_STATE[selectedState] || [];
    const q = cityQuery.trim().toLowerCase();

    if (!q) {
      return allCities.slice(0, 10);
    }

    return allCities
      .filter((name) => name.toLowerCase().startsWith(q))
      .slice(0, 10);
  };

  const stateResults = getStateResults();
  const cityResults = getCityResults();

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setEvents([]);
    setKeywordFilter('');

    try {
      // Build query parameters
      const params = new URLSearchParams();
      // Combine city and state into location string format: "City, State"
      const locationString = cityQuery && selectedState 
        ? `${cityQuery}, ${selectedState}` 
        : cityQuery || selectedState || '';
      
      if (!locationString) {
        setError('Please select a city and state');
        setLoading(false);
        return;
      }
      
      params.append('location', locationString);
      
      // Auto-fill default times if user only entered dates
      let processedStartDate = startDate;
      let processedEndDate = endDate;
      
      if (startDate) {
        // If no time portion, default to 00:00 (midnight)
        if (!startDate.includes('T')) {
          processedStartDate = startDate + 'T00:00';
        } else {
          // If time portion exists but is empty or 00:00, ensure it's 00:00
          const [datePart, timePart] = startDate.split('T');
          if (!timePart || timePart === '00:00') {
            processedStartDate = datePart + 'T00:00';
          }
        }
        // Send full datetime to backend
        params.append('start_date', processedStartDate);
      }
      
      if (endDate) {
        // If no time portion, default to 23:59 (11:59 PM)
        if (!endDate.includes('T')) {
          processedEndDate = endDate + 'T23:59';
        } else {
          // If time portion exists but is empty or 00:00, set to 23:59
          const [datePart, timePart] = endDate.split('T');
          if (!timePart || timePart === '00:00') {
            processedEndDate = datePart + 'T23:59';
          }
        }
        // Send full datetime to backend
        params.append('end_date', processedEndDate);
      }
      if (filters.eventType.length > 0) {
        params.append('event_type', filters.eventType[0]); // Ticketmaster API typically takes one classification
      }
      if (filters.category.length > 0) {
        params.append('category', filters.category[0]);
      }
      if (filters.priceRange.min) {
        params.append('min_price', filters.priceRange.min);
      }
      if (filters.priceRange.max) {
        params.append('max_price', filters.priceRange.max);
      }

      // Call backend API
      // For local development, use http://localhost:8000 or your backend URL
      // For production, set REACT_APP_BACKEND_URL=https://pj13-event-finder-backend.vercel.app in .env
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
      const apiUrl = `${backendUrl}/api/events?${params.toString()}`;
      console.log('API URL:', apiUrl);
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setEvents(data.events || []);
        if (data.events && data.events.length === 0) {
          setError('No events found. Try adjusting your search criteria.');
        }
      }
    } catch (err) {
      setError(`Failed to search events: ${err.message}`);
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePriceRangeChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      priceRange: {
        ...prev.priceRange,
        [field]: value === '' ? '' : parseFloat(value) || ''
      }
    }));
  };

  const handleMultiSelectChange = (filterName, value) => {
    setFilters(prev => {
      const currentArray = prev[filterName] || [];
      const isSelected = currentArray.includes(value);
      
      if (isSelected) {
        // Remove the value if it's already selected
        return {
          ...prev,
          [filterName]: currentArray.filter(item => item !== value)
        };
      } else {
        // Add the value if it's not selected
        return {
          ...prev,
          [filterName]: [...currentArray, value]
        };
      }
    });
  };

  const handlePopularCityClick = (city, state) => {
    setSelectedState(state);
    setStateQuery(state);
    setCityQuery(city);
    setShowStateTypeahead(false);
    setShowCityTypeahead(false);
  };

  // Filter events client-side by keyword (event name, venue, or location)
  const normalizedKeyword = keywordFilter.trim().toLowerCase();
  const filteredEvents = !normalizedKeyword
    ? events
    : events.filter((event) => {
        const name = (event.name || '').toLowerCase();
        const venue = (event.venue || '').toLowerCase();
        const location = (event.location || '').toLowerCase();
        return (
          name.includes(normalizedKeyword) ||
          venue.includes(normalizedKeyword) ||
          location.includes(normalizedKeyword)
        );
      });

  return (
    <div
      className="min-h-screen flex flex-col app-bg"
      style={{ backgroundImage: "url('/background.jpeg')" }}
    >
      <header className="bg-white/95 backdrop-blur-sm shadow-md py-8 px-4 text-center">
        <h1 className="m-0 text-gray-800 text-4xl font-bold">Event Finder</h1>
        <p className="mt-2 mb-0 text-gray-600 text-lg">Discover events in your area with the click of a button</p>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col gap-6">
        <form className="w-full max-w-6xl mx-auto" onSubmit={handleSearch}>
          {/* Glassmorphic Search Card */}
          <div className="bg-white/80 backdrop-blur-lg border border-white/20 rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex flex-col lg:flex-row gap-4 items-end">
              {/* Location Group */}
              <div className="flex-1 w-full">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Location *</label>
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
                        setSelectedState('');
                        setCityQuery('');
                        setShowStateTypeahead(true);
                      }}
                      onFocus={() => setShowStateTypeahead(true)}
                      onBlur={() => window.setTimeout(() => setShowStateTypeahead(false), 150)}
                      placeholder="Start typing a state (e.g., California)"
                      autoComplete="off"
                      required
                      className="w-full px-4 py-2.5 bg-transparent border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium"
                    />
                    {showStateTypeahead && stateResults.length > 0 && (
                      <ul className="absolute z-50 w-full mt-1 bg-white/95 backdrop-blur-md border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {stateResults.map(state => (
                          <li
                            key={state}
                            onMouseDown={() => {
                              setSelectedState(state);
                              setStateQuery(state);
                              setShowStateTypeahead(false);
                              setCityQuery('');
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
                      onBlur={() => window.setTimeout(() => setShowCityTypeahead(false), 150)}
                      placeholder={selectedState ? `City in ${selectedState}` : 'Select state first'}
                      autoComplete="off"
                      disabled={!selectedState}
                      required
                      className="w-full px-4 py-2.5 bg-transparent border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:bg-gray-100 disabled:cursor-not-allowed font-medium"
                    />
                    {showCityTypeahead && cityQuery.length >= 1 && cityResults.length === 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white/95 backdrop-blur-md border border-gray-200 rounded-lg shadow-lg px-4 py-2 text-gray-500 text-sm">
                        No matching cities found.
                      </div>
                    )}
                    {showCityTypeahead && cityResults.length > 0 && (
                      <ul className="absolute z-50 w-full mt-1 bg-white/95 backdrop-blur-md border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {cityResults.map(cityName => (
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
                  <label htmlFor="start-date" className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                  <input
                    type="datetime-local"
                    id="start-date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-transparent border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="end-date" className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
                  <input
                    type="datetime-local"
                    id="end-date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
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
                {popularCities.map((item, idx) => (
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
            <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usePreciseLocation}
                  onChange={(e) => setUsePreciseLocation(e.target.checked)}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <span className="font-medium">Use My Precise Location</span>
              </label>
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-transparent hover:bg-white/60 border border-gray-300 rounded-lg transition-all"
              >
                {showFilters ? 'Hide' : 'Show'} Filters
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="bg-white/80 backdrop-blur-lg border border-white/20 rounded-2xl shadow-xl p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Event Type</label>
                  <div className="space-y-2">
                    {[
                      { value: 'concert', label: 'Concert' },
                      { value: 'sports', label: 'Sports' },
                      { value: 'theater', label: 'Theater' },
                      { value: 'festival', label: 'Festival' },
                      { value: 'conference', label: 'Conference' },
                      { value: 'workshop', label: 'Workshop' },
                      { value: 'other', label: 'Other' }
                    ].map(option => (
                      <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-purple-700">
                        <input
                          type="checkbox"
                          value={option.value}
                          checked={filters.eventType.includes(option.value)}
                          onChange={(e) => handleMultiSelectChange('eventType', option.value)}
                          className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                        <span className="font-medium">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Category</label>
                  <div className="space-y-2">
                    {[
                      { value: 'music', label: 'Music' },
                      { value: 'arts', label: 'Arts & Culture' },
                      { value: 'food', label: 'Food & Drink' },
                      { value: 'outdoor', label: 'Outdoor' },
                      { value: 'family', label: 'Family' },
                      { value: 'networking', label: 'Networking' }
                    ].map(option => (
                      <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-purple-700">
                        <input
                          type="checkbox"
                          value={option.value}
                          checked={filters.category.includes(option.value)}
                          onChange={(e) => handleMultiSelectChange('category', option.value)}
                          className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                        <span className="font-medium">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Price Range ($)</label>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="price-min" className="block text-xs text-gray-600 mb-1 font-medium">Min</label>
                      <input
                        type="number"
                        id="price-min"
                        min="0"
                        step="0.01"
                        value={filters.priceRange.min}
                        onChange={(e) => handlePriceRangeChange('min', e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 bg-transparent border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium"
                      />
                    </div>
                    <div>
                      <label htmlFor="price-max" className="block text-xs text-gray-600 mb-1 font-medium">Max</label>
                      <input
                        type="number"
                        id="price-max"
                        min="0"
                        step="0.01"
                        value={filters.priceRange.max}
                        onChange={(e) => handlePriceRangeChange('max', e.target.value)}
                        placeholder="No limit"
                        className="w-full px-3 py-2 bg-transparent border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Duration</label>
                  <div className="space-y-2">
                    {[
                      { value: 'short', label: 'Less than 2 hours' },
                      { value: 'medium', label: '2-4 hours' },
                      { value: 'long', label: '4+ hours' },
                      { value: 'multi-day', label: 'Multi-day' }
                    ].map(option => (
                      <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-purple-700">
                        <input
                          type="checkbox"
                          value={option.value}
                          checked={filters.duration.includes(option.value)}
                          onChange={(e) => handleMultiSelectChange('duration', option.value)}
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
            {loading ? 'Searching...' : 'Search Events'}
          </button>
        </form>

        <div className="bg-white/80 backdrop-blur-lg border border-white/20 rounded-2xl shadow-xl p-6">
          <h2 className="m-0 mb-6 text-gray-800 text-3xl font-bold">Search Results</h2>
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6 text-red-700">
              <p className="m-0">{error}</p>
            </div>
          )}
          {loading ? (
            <div className="text-center py-12 text-purple-600 text-lg">
              <p>Loading events...</p>
            </div>
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
                  Showing <span className="font-semibold">{filteredEvents.length}</span> of{' '}
                  <span className="font-semibold">{events.length}</span> events
                </p>
              </div>

              {filteredEvents.length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <p>No events match your keywords. Try a different search term.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredEvents.map(event => (
                    <div key={event.id} className="bg-gray-50 rounded-lg border-2 border-gray-200 transition-all overflow-hidden flex flex-col hover:border-purple-500 hover:shadow-lg hover:-translate-y-1">
                      {event.image && (
                        <img src={event.image} alt={event.name} className="w-full h-48 object-cover bg-gray-200" />
                      )}
                      <div className="p-6">
                        <h3 className="m-0 mb-3 text-gray-800 text-xl font-bold">{event.name}</h3>
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
                            💵 {event.priceRange.currency || 'USD'} ${event.priceRange.min}
                            {event.priceRange.max && event.priceRange.max !== event.priceRange.min && ` - $${event.priceRange.max}`}
                          </p>
                        )}
                        {event.url && (
                          <a href={event.url} target="_blank" rel="noopener noreferrer" className="inline-block mt-4 text-purple-600 no-underline font-semibold transition-colors hover:text-purple-800 hover:underline">
                            View on Ticketmaster →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="bg-white/95 backdrop-blur-sm py-6 px-4 text-center text-gray-600 mt-auto">
        <p className="m-0">Event Finder - Find events in your area</p>
      </footer>
    </div>
  );
}

export default App;