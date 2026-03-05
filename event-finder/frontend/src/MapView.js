import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Circle } from '@react-google-maps/api';
import EventCard from './EventCard';

const getMapContainerStyle = (isSelectingLocation) => ({
  width: '100%',
  height: '100%',
  ...(isSelectingLocation ? { cursor: 'crosshair' } : {}),
});

const defaultCenter = { lat: 37.7749, lng: -122.4194 }; // San Francisco fallback

const MILES_TO_METERS = 1609.344;

function MapView({ userLocation, events = [], selectedMarkerKey, onMarkerClick, searchRadiusMiles, useMyLocation = true, manualSearchCenter, circleCenterOverride, isSelectingLocation = false, onLocationSelected }) {
  const mapRef = useRef(null);
  const initialManualCenterRef = useRef(null);
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
    if (!useMyLocation && manualSearchCenter && manualSearchCenter.lat != null && manualSearchCenter.lng != null) {
      return { lat: Number(manualSearchCenter.lat), lng: Number(manualSearchCenter.lng) };
    }
    if (userLocation && userLocation.lat != null && userLocation.lng != null) {
      return { lat: Number(userLocation.lat), lng: Number(userLocation.lng) };
    }
    const firstEvent = list.find(e => e && e.latitude != null && e.longitude != null);
    if (firstEvent) {
      return { lat: Number(firstEvent.latitude), lng: Number(firstEvent.longitude) };
    }
    return defaultCenter;
  }, [userLocation, events, useMyLocation, manualSearchCenter]);

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

  // When in "select location" mode: listen for map click to place pin. When pin is placed: only set center, do not report center_changed (avoids refresh loop).
  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    const map = mapRef.current;

    if (isSelectingLocation && onLocationSelected) {
      const clickListener = map.addListener('click', (e) => {
        const lat = e.latLng && (typeof e.latLng.lat === 'function' ? e.latLng.lat() : e.latLng.lat);
        const lng = e.latLng && (typeof e.latLng.lng === 'function' ? e.latLng.lng() : e.latLng.lng);
        if (typeof lat === 'number' && typeof lng === 'number') {
          onLocationSelected(lat, lng);
        }
      });
      return () => { if (clickListener && clickListener.remove) clickListener.remove(); };
    }

    // Pin placed: center the map on the selected point once; pin is rendered as a Marker at that lat/lng (fixed on map)
    if (!useMyLocation && manualSearchCenter && manualSearchCenter.lat != null && manualSearchCenter.lng != null) {
      map.setCenter(manualSearchCenter);
      return;
    }
  }, [useMyLocation, isSelectingLocation, onLocationSelected, manualSearchCenter]);

  const onLoad = useCallback(map => {
    mapRef.current = map;
    if (isSelectingLocation && onLocationSelected) {
      const clickListener = map.addListener('click', (e) => {
        const lat = e.latLng && (typeof e.latLng.lat === 'function' ? e.latLng.lat() : e.latLng.lat);
        const lng = e.latLng && (typeof e.latLng.lng === 'function' ? e.latLng.lng() : e.latLng.lng);
        if (typeof lat === 'number' && typeof lng === 'number') {
          onLocationSelected(lat, lng);
        }
      });
      return;
    }
    if (!useMyLocation && manualSearchCenter && manualSearchCenter.lat != null && manualSearchCenter.lng != null) {
      map.setCenter(manualSearchCenter);
      return;
    }
    if (bounds) {
      const gBounds = new window.google.maps.LatLngBounds(
        { lat: bounds.south, lng: bounds.west },
        { lat: bounds.north, lng: bounds.east }
      );
      map.fitBounds(gBounds, { top: 40, right: 40, bottom: 40, left: 40 });
    }
  }, [bounds, useMyLocation, manualSearchCenter, isSelectingLocation, onLocationSelected]);

  if (loadError) {
    return <div className="map-error">Error loading map. Check your API key.</div>;
  }
  if (!isLoaded) {
    return <div className="map-loading">Loading map...</div>;
  }

  // When selecting location (click-to-place), don't show circle until pin is placed
  const circleCenter = (circleCenterOverride && circleCenterOverride.lat != null && circleCenterOverride.lng != null)
    ? { lat: Number(circleCenterOverride.lat), lng: Number(circleCenterOverride.lng) }
    : !useMyLocation && !isSelectingLocation && manualSearchCenter && manualSearchCenter.lat != null && manualSearchCenter.lng != null
      ? { lat: Number(manualSearchCenter.lat), lng: Number(manualSearchCenter.lng) }
      : userLocation && userLocation.lat != null && userLocation.lng != null
        ? { lat: Number(userLocation.lat), lng: Number(userLocation.lng) }
        : null;

  const showUserMarker = useMyLocation && userLocation && userLocation.lat != null && userLocation.lng != null;

  if (useMyLocation) {
    initialManualCenterRef.current = null;
  } else if (initialManualCenterRef.current == null) {
    initialManualCenterRef.current = manualSearchCenter || (userLocation && userLocation.lat != null ? { lat: Number(userLocation.lat), lng: Number(userLocation.lng) } : null) || defaultCenter;
  }
  const initialCenterWhenManual = useMyLocation ? undefined : (initialManualCenterRef.current || defaultCenter);

  const showPlacedPin = !useMyLocation && !isSelectingLocation && manualSearchCenter && manualSearchCenter.lat != null && manualSearchCenter.lng != null;

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <GoogleMap
        mapContainerStyle={getMapContainerStyle(isSelectingLocation)}
        center={useMyLocation && events.length === 0 ? mapCenter : undefined}
        defaultCenter={initialCenterWhenManual}
        defaultZoom={10}
        zoom={useMyLocation && events.length === 0 ? 10 : undefined}
        onLoad={onLoad}
        options={{ mapTypeControl: true, fullscreenControl: true, zoomControl: true }}
      >
        {!isSelectingLocation && circleCenter && searchRadiusMiles != null && Number(searchRadiusMiles) > 0 && (
          <Circle
            center={circleCenter}
            radius={Number(searchRadiusMiles) * MILES_TO_METERS}
            options={{
              fillColor: '#4285F4',
              fillOpacity: 0.15,
              strokeColor: '#4285F4',
              strokeOpacity: 0.5,
              strokeWeight: 2,
            }}
          />
        )}
        {showUserMarker && (
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
        {showPlacedPin && (
          <Marker
            position={{ lat: Number(manualSearchCenter.lat), lng: Number(manualSearchCenter.lng) }}
            title="Search center"
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
              <InfoWindow position={pos} onCloseClick={() => onMarkerClick(null)} options={{ disableAutoPan: true }}>
                <div className="map-info-window" style={{ width: 240, maxWidth: 240, minWidth: 240 }}>
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
    </div>
  );
}

export default MapView;
