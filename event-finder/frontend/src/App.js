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

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Event Finder</h1>
        <p className="subtitle">Discover events in your area with the click of a button</p>
      </header>

      <main className="main-content">
        <form className="search-form" onSubmit={handleSearch}>
          <div className="form-section">
            <label>Location *</label>

            <div className="location-grid">
              <div className="typeahead">
                <label className="sub-label" htmlFor="state">State</label>
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
                />

                {showStateTypeahead && stateResults.length > 0 && (
                  <ul className="typeahead-results" role="listbox" aria-label="State suggestions">
                    {stateResults.map(state => (
                      <li
                        key={state}
                        role="option"
                        tabIndex={-1}
                        onMouseDown={() => {
                          setSelectedState(state);
                          setStateQuery(state);
                          setShowStateTypeahead(false);
                          setCityQuery('');
                        }}
                      >
                        {state}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="typeahead">
                <label className="sub-label" htmlFor="city">City</label>
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
                  placeholder={selectedState ? `Start typing a city in ${selectedState}` : 'Select a state first'}
                  autoComplete="off"
                  disabled={!selectedState}
                  required
                />

                {showCityTypeahead && cityQuery.length >= 1 && cityResults.length === 0 && (
                  <div className="typeahead-status">No matching cities found.</div>
                )}

                {showCityTypeahead && cityResults.length > 0 && (
                  <ul className="typeahead-results" role="listbox" aria-label="City suggestions">
                    {cityResults.map(cityName => (
                      <li
                        key={`${selectedState}-${cityName}`}
                        role="option"
                        tabIndex={-1}
                        onMouseDown={() => {
                          setCityQuery(cityName);
                          setShowCityTypeahead(false);
                        }}
                      >
                        {`${cityName}, ${selectedState}`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-section">
              <label htmlFor="start-date">Start Date & Time</label>
              <input
                type="datetime-local"
                id="start-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div className="form-section">
              <label htmlFor="end-date">End Date & Time</label>
              <input
                type="datetime-local"
                id="end-date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-section checkbox-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={usePreciseLocation}
                onChange={(e) => setUsePreciseLocation(e.target.checked)}
              />
              Use My Precise Location
            </label>
          </div>

          <div className="filters-toggle">
            <button
              type="button"
              className="toggle-filters-btn"
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? 'Hide' : 'Show'} Filters
            </button>
          </div>

          {showFilters && (
            <div className="filters-section">
              <div className="form-section">
                <label>Event Type</label>
                <div className="checkbox-group">
                  {[
                    { value: 'concert', label: 'Concert' },
                    { value: 'sports', label: 'Sports' },
                    { value: 'theater', label: 'Theater' },
                    { value: 'festival', label: 'Festival' },
                    { value: 'conference', label: 'Conference' },
                    { value: 'workshop', label: 'Workshop' },
                    { value: 'other', label: 'Other' }
                  ].map(option => (
                    <label key={option.value} className="checkbox-label">
                      <input
                        type="checkbox"
                        value={option.value}
                        checked={filters.eventType.includes(option.value)}
                        onChange={(e) => handleMultiSelectChange('eventType', option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-section">
                <label>Category</label>
                <div className="checkbox-group">
                  {[
                    { value: 'music', label: 'Music' },
                    { value: 'arts', label: 'Arts & Culture' },
                    { value: 'food', label: 'Food & Drink' },
                    { value: 'outdoor', label: 'Outdoor' },
                    { value: 'family', label: 'Family' },
                    { value: 'networking', label: 'Networking' }
                  ].map(option => (
                    <label key={option.value} className="checkbox-label">
                      <input
                        type="checkbox"
                        value={option.value}
                        checked={filters.category.includes(option.value)}
                        onChange={(e) => handleMultiSelectChange('category', option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-section">
                <label>Price Range ($)</label>
                <div className="price-range-inputs">
                  <div className="price-input-group">
                    <label htmlFor="price-min">Min</label>
                    <input
                      type="number"
                      id="price-min"
                      min="0"
                      step="0.01"
                      value={filters.priceRange.min}
                      onChange={(e) => handlePriceRangeChange('min', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <span className="price-range-separator">-</span>
                  <div className="price-input-group">
                    <label htmlFor="price-max">Max</label>
                    <input
                      type="number"
                      id="price-max"
                      min="0"
                      step="0.01"
                      value={filters.priceRange.max}
                      onChange={(e) => handlePriceRangeChange('max', e.target.value)}
                      placeholder="No limit"
                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <label>Duration</label>
                <div className="checkbox-group">
                  {[
                    { value: 'short', label: 'Less than 2 hours' },
                    { value: 'medium', label: '2-4 hours' },
                    { value: 'long', label: '4+ hours' },
                    { value: 'multi-day', label: 'Multi-day' }
                  ].map(option => (
                    <label key={option.value} className="checkbox-label">
                      <input
                        type="checkbox"
                        value={option.value}
                        checked={filters.duration.includes(option.value)}
                        onChange={(e) => handleMultiSelectChange('duration', option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button type="submit" className="search-button" disabled={loading}>
            {loading ? 'Searching...' : 'Search Events'}
          </button>
        </form>

        <div className="results-section">
          <h2>Search Results</h2>
          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}
          {loading ? (
            <div className="loading">
              <p>Loading events...</p>
            </div>
          ) : events.length === 0 && !error ? (
            <div className="no-results">
              <p>Enter a location and click "Search Events" to find events in your area.</p>
            </div>
          ) : (
            <div className="events-list">
              {events.map(event => (
                <div key={event.id} className="event-card">
                  {event.image && (
                    <img src={event.image} alt={event.name} className="event-image" />
                  )}
                  <div className="event-content">
                    <h3>{event.name}</h3>
                    {event.venue && (
                      <p className="event-venue">🏢 {event.venue}</p>
                    )}
                    {event.location && (
                      <p className="event-location">📍 {event.location}</p>
                    )}
                    <p className="event-date">
                      📅 {event.date}
                      {event.time && ` at ${event.time}`}
                    </p>
                    {event.priceRange && event.priceRange.min !== undefined && (
                      <p className="event-price">
                        💵 {event.priceRange.currency || 'USD'} ${event.priceRange.min}
                        {event.priceRange.max && event.priceRange.max !== event.priceRange.min && ` - $${event.priceRange.max}`}
                      </p>
                    )}
                    {event.url && (
                      <a href={event.url} target="_blank" rel="noopener noreferrer" className="event-link">
                        View on Ticketmaster →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>Event Finder - Find events in your area</p>
      </footer>
    </div>
  );
}

export default App;