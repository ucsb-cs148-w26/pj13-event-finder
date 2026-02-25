import React, { useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import EventCard from './EventCard';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = { lat: 37.7749, lng: -122.4194 }; // San Francisco fallback

function MapView({ userLocation, events = [], selectedMarkerKey, onMarkerClick }) {
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
  });

  // Group events by lat/lon (rounded to avoid float precision issues). Coerce to number so Maps API gets numeric position.
  const locationGroups = useMemo(() => {
    const groups = new Map();
    const list = Array.isArray(events) ? events : [];
    const eventsWithCoords = list.filter(e => e && e.latitude != null && e.longitude != null);
    eventsWithCoords.forEach(event => {
      const lat = Number(event.latitude);
      const lng = Number(event.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;
      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(event);
    });
    return groups;
  }, [events]);

  const mapCenter = useMemo(() => {
    const list = Array.isArray(events) ? events : [];
    if (userLocation && userLocation.lat != null && userLocation.lng != null) {
      return { lat: Number(userLocation.lat), lng: Number(userLocation.lng) };
    }
    const firstEvent = list.find(e => e && e.latitude != null && e.longitude != null);
    if (firstEvent) {
      return { lat: Number(firstEvent.latitude), lng: Number(firstEvent.longitude) };
    }
    return defaultCenter;
  }, [userLocation, events]);

  const bounds = useMemo(() => {
    const list = Array.isArray(events) ? events : [];
    const pts = [];
    if (userLocation && userLocation.lat != null && userLocation.lng != null) {
      pts.push({ lat: userLocation.lat, lng: userLocation.lng });
    }
    list.forEach(e => {
      if (e && e.latitude != null && e.longitude != null) {
        pts.push({ lat: e.latitude, lng: e.longitude });
      }
    });
    if (pts.length < 2) return null;
    const lats = pts.map(p => p.lat);
    const lngs = pts.map(p => p.lng);
    return {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      west: Math.min(...lngs),
    };
  }, [userLocation, events]);

  const onLoad = useCallback(map => {
    if (bounds) {
      const gBounds = new window.google.maps.LatLngBounds(
        { lat: bounds.south, lng: bounds.west },
        { lat: bounds.north, lng: bounds.east }
      );
      map.fitBounds(gBounds, { top: 40, right: 40, bottom: 40, left: 40 });
    }
  }, [bounds]);

  if (loadError) {
    return <div className="map-error">Error loading map. Check your API key.</div>;
  }
  if (!isLoaded) {
    return <div className="map-loading">Loading map...</div>;
  }

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={mapCenter}
      zoom={10}
      onLoad={onLoad}
      options={{ mapTypeControl: true, fullscreenControl: true, zoomControl: true }}
    >
      {userLocation && userLocation.lat != null && userLocation.lng != null && (
        <Marker
          position={{ lat: Number(userLocation.lat), lng: Number(userLocation.lng) }}
          title="Your location"
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#4285F4',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          }}
        />
      )}
      {Array.from(locationGroups.entries()).map(([key, groupEvents]) => {
        const first = groupEvents[0];
        const lat = Number(first.latitude);
        const lng = Number(first.longitude);
        const pos = { lat, lng };
        const isSelected = selectedMarkerKey === key;
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
        return (
          <Marker
            key={key}
            position={pos}
            onClick={() => onMarkerClick(key)}
            title={first.name}
          >
            {isSelected && (
              <InfoWindow position={pos} onCloseClick={() => onMarkerClick(null)}>
                <div className="map-info-window" style={{ maxWidth: 320, maxHeight: 400, overflow: 'auto' }}>
                  {groupEvents.length > 1 ? (
                    <div>
                      <p className="m-0 mb-2 text-sm font-semibold text-gray-700">{groupEvents.length} events at this location</p>
                      {groupEvents.map(ev => (
                        <div key={ev.id} className="mb-4 last:mb-0">
                          <EventCard event={ev} compact />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EventCard event={first} compact />
                  )}
                </div>
              </InfoWindow>
            )}
          </Marker>
        );
      })}
    </GoogleMap>
  );
}

export default MapView;
