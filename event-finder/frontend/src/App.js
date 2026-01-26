import React, { useState } from 'react';
import './App.css';

function App() {
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [usePreciseLocation, setUsePreciseLocation] = useState(false);
  const [filters, setFilters] = useState({
    eventType: '',
    category: '',
    priceRange: '',
    duration: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [events, setEvents] = useState([]);

  const handleSearch = (e) => {
    e.preventDefault();
    // TODO: Implement API call to backend
    console.log('Searching for events:', { location, startDate, endDate, filters });
    // Placeholder: Set some mock events
    setEvents([
      { id: 1, name: 'Sample Event 1', location: location || 'Location', date: startDate || 'TBD' },
      { id: 2, name: 'Sample Event 2', location: location || 'Location', date: startDate || 'TBD' }
    ]);
  };

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
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
            <label htmlFor="location">Location *</label>
            <input
              type="text"
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Enter city, address, or area"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-section">
              <label htmlFor="start-date">Start Date & Time</label>
              <input
                type="datetime-local"
                id="start-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="form-section">
              <label htmlFor="end-date">End Date & Time</label>
              <input
                type="datetime-local"
                id="end-date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
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
                <label htmlFor="event-type">Event Type</label>
                <select
                  id="event-type"
                  value={filters.eventType}
                  onChange={(e) => handleFilterChange('eventType', e.target.value)}
                >
                  <option value="">All Types</option>
                  <option value="concert">Concert</option>
                  <option value="sports">Sports</option>
                  <option value="theater">Theater</option>
                  <option value="festival">Festival</option>
                  <option value="conference">Conference</option>
                  <option value="workshop">Workshop</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-section">
                <label htmlFor="category">Category</label>
                <select
                  id="category"
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                >
                  <option value="">All Categories</option>
                  <option value="music">Music</option>
                  <option value="arts">Arts & Culture</option>
                  <option value="food">Food & Drink</option>
                  <option value="outdoor">Outdoor</option>
                  <option value="family">Family</option>
                  <option value="networking">Networking</option>
                </select>
              </div>

              <div className="form-section">
                <label htmlFor="price-range">Price Range</label>
                <select
                  id="price-range"
                  value={filters.priceRange}
                  onChange={(e) => handleFilterChange('priceRange', e.target.value)}
                >
                  <option value="">Any Price</option>
                  <option value="free">Free</option>
                  <option value="low">$0 - $25</option>
                  <option value="medium">$25 - $50</option>
                  <option value="high">$50+</option>
                </select>
              </div>

              <div className="form-section">
                <label htmlFor="duration">Duration</label>
                <select
                  id="duration"
                  value={filters.duration}
                  onChange={(e) => handleFilterChange('duration', e.target.value)}
                >
                  <option value="">Any Duration</option>
                  <option value="short">Less than 2 hours</option>
                  <option value="medium">2-4 hours</option>
                  <option value="long">4+ hours</option>
                  <option value="multi-day">Multi-day</option>
                </select>
              </div>
            </div>
          )}

          <button type="submit" className="search-button">
            Search Events
          </button>
        </form>

        <div className="results-section">
          <h2>Search Results</h2>
          {events.length === 0 ? (
            <div className="no-results">
              <p>Enter a location and click "Search Events" to find events in your area.</p>
            </div>
          ) : (
            <div className="events-list">
              {events.map(event => (
                <div key={event.id} className="event-card">
                  <h3>{event.name}</h3>
                  <p className="event-location">📍 {event.location}</p>
                  <p className="event-date">📅 {event.date}</p>
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