import { useEffect, useRef, useState, type FormEvent } from 'react';

const DEFAULT_LOCATION: [number, number] = [10.2381, 77.4892];

export type ReverseGeocodeDetails = { address?: string; city?: string; state?: string; country?: string; pincode?: string };
type SearchResult = { place_id: number; display_name: string; lat: string; lon: string; address?: Record<string, string> };

function resultDetails(result: SearchResult): ReverseGeocodeDetails {
  const address = result.address ?? {};
  return {
    address: result.display_name,
    city: address.city ?? address.town ?? address.village ?? address.municipality,
    state: address.state,
    country: address.country,
    pincode: address.postcode,
  };
}

export function OnboardingLocationMap({ latitude, longitude, address, city, state, country, autoGeocodeAddress = false, onChange, onReverseGeocode, searchId = 'onboarding-location-search', mapLabel = 'Business location map' }: { latitude?: string | number | null; longitude?: string | number | null; address?: string | null; city?: string | null; state?: string | null; country?: string | null; autoGeocodeAddress?: boolean; onChange: (latitude: string, longitude: string) => void; onReverseGeocode?: (details: ReverseGeocodeDetails) => void; searchId?: string; mapLabel?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const onReverseGeocodeRef = useRef(onReverseGeocode);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const lastSelectedQueryRef = useRef('');
  onChangeRef.current = onChange;
  onReverseGeocodeRef.current = onReverseGeocode;

  const lat = latitude === '' || latitude == null ? Number.NaN : Number(latitude);
  const lng = longitude === '' || longitude == null ? Number.NaN : Number(longitude);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const center: [number, number] = hasCoordinates ? [lat, lng] : DEFAULT_LOCATION;

  async function reverseGeocode(latitudeValue: number, longitudeValue: number) {
    if (!onReverseGeocodeRef.current) return;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitudeValue}&lon=${longitudeValue}&zoom=18&addressdetails=1`);
      if (!response.ok) return;
      const result = await response.json() as { display_name?: string; address?: Record<string, string> };
      const address = result.address ?? {};
      onReverseGeocodeRef.current({
        address: result.display_name,
        city: address.city ?? address.town ?? address.village ?? address.municipality,
        state: address.state,
        country: address.country,
        pincode: address.postcode,
      });
    } catch {
      // Selecting a point remains usable when the optional reverse-geocoder is unavailable.
    }
  }

  useEffect(() => {
    let disposed = false;
    import('leaflet').then((L) => {
      if (disposed || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(center, hasCoordinates ? 14 : 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
      const marker = L.marker(center, { draggable: true, icon: L.divIcon({ className: 'voyaMapMarker', html: '<span></span>', iconSize: [24, 32], iconAnchor: [12, 30] }) }).addTo(map);
      const updateLocation = (latitudeValue: number, longitudeValue: number) => { onChangeRef.current(latitudeValue.toFixed(6), longitudeValue.toFixed(6)); void reverseGeocode(latitudeValue, longitudeValue); };
      marker.on('dragend', () => { const position = marker.getLatLng(); updateLocation(position.lat, position.lng); });
      map.on('click', (event: any) => { marker.setLatLng(event.latlng); updateLocation(event.latlng.lat, event.latlng.lng); });
      mapRef.current = map;
      markerRef.current = marker;
      window.setTimeout(() => map.invalidateSize(), 0);
    });
    return () => { disposed = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; } };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !hasCoordinates) return;
    const next: [number, number] = [lat, lng];
    markerRef.current.setLatLng(next);
    mapRef.current.setView(next);
  }, [latitude, longitude, lat, lng, hasCoordinates]);

  async function searchLocation(searchValue = query) {
    const search = searchValue.trim();
    if (!search) {
      setResults([]);
      setSearchError('Enter a city, address or landmark to search.');
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const params = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '5', q: search });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
      if (!response.ok) throw new Error('Location search is unavailable right now.');
      const matches = await response.json() as SearchResult[];
      setResults(matches);
      if (!matches.length) setSearchError('No matching locations found. Try a broader search.');
    } catch (error) {
      setResults([]);
      setSearchError((error as Error).message || 'Location search is unavailable right now.');
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    const search = query.trim();
    if (search.length < 3 || lastSelectedQueryRef.current === search) {
      if (search.length < 3) {
        setResults([]);
        setSearchError('');
      }
      return;
    }
    const timer = window.setTimeout(() => { void searchLocation(search); }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!autoGeocodeAddress || hasCoordinates || !address?.trim()) return;
    const search = [address, city, state, country].filter((value) => value?.trim()).join(', ');
    const queries = [...new Set([search, address.trim(), address.split(',')[0]?.trim()].filter((value) => value && value.length >= 3))];
    if (!queries.length || lastSelectedQueryRef.current === `auto:${search}`) return;
    let disposed = false;
    const timer = window.setTimeout(async () => {
      try {
        for (const query of queries) {
          const params = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '1', q: query });
          const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
          if (!response.ok || disposed) {
            if (disposed) return;
            continue;
          }
          const matches = await response.json() as SearchResult[];
          const result = matches[0];
          const nextLatitude = Number(result?.lat);
          const nextLongitude = Number(result?.lon);
          if (!result || !Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) continue;
          lastSelectedQueryRef.current = `auto:${search}`;
          onChangeRef.current(nextLatitude.toFixed(6), nextLongitude.toFixed(6));
          onReverseGeocodeRef.current?.(resultDetails(result));
          return;
        }
      } catch {
        // The user can still use the visible search box or map pin when automatic lookup is unavailable.
      }
    }, 250);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [address, city, state, country, autoGeocodeAddress, hasCoordinates]);

  function selectResult(result: SearchResult) {
    const nextLatitude = Number(result.lat);
    const nextLongitude = Number(result.lon);
    if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) return;
    onChange(nextLatitude.toFixed(6), nextLongitude.toFixed(6));
    onReverseGeocode?.(resultDetails(result));
    lastSelectedQueryRef.current = result.display_name;
    setQuery(result.display_name);
    setResults([]);
    setSearchError('');
  }

  return <div className="onboarding-location-widget"><form className="location-search" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void searchLocation(); }}><label htmlFor={searchId}>Search location</label><div className="location-search-row"><input id={searchId} value={query} onChange={(event) => { lastSelectedQueryRef.current = ''; setQuery(event.target.value); }} placeholder="Type a city, address or landmark" autoComplete="off" aria-autocomplete="list" aria-controls={`${searchId}-results`} />{searching && <span className="location-search-status" aria-live="polite">Searching…</span>}</div>{searchError && <small className="field-error" role="alert">{searchError}</small>}{results.length > 0 && <div id={`${searchId}-results`} className="location-search-results" role="listbox" aria-label="Location search results">{results.map((result) => <button key={result.place_id} type="button" role="option" onClick={() => selectResult(result)}><b>{result.display_name}</b><small>Select this location to move the map</small></button>)}</div>}</form><div className="onboarding-location-map" ref={containerRef} aria-label={mapLabel} /></div>;
}
