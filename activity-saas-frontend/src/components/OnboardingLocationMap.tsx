import { useEffect, useRef } from 'react';

const DEFAULT_LOCATION: [number, number] = [10.2381, 77.4892];

type ReverseGeocodeDetails = { address?: string; city?: string; state?: string; pincode?: string };

export function OnboardingLocationMap({ latitude, longitude, onChange, onReverseGeocode }: { latitude?: string | number | null; longitude?: string | number | null; onChange: (latitude: string, longitude: string) => void; onReverseGeocode?: (details: ReverseGeocodeDetails) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const onReverseGeocodeRef = useRef(onReverseGeocode);
  onChangeRef.current = onChange;
  onReverseGeocodeRef.current = onReverseGeocode;

  const lat = latitude === '' || latitude == null ? Number.NaN : Number(latitude);
  const lng = longitude === '' || longitude == null ? Number.NaN : Number(longitude);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
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

  return <div className="onboarding-location-map" ref={containerRef} aria-label="Business location map" />;
}
