import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Bundlers break Leaflet's default marker image paths – point them at the bundled files
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

export type LatLng = [number, number];
const MAP_CENTER: LatLng = [22.7196, 75.8577]; // Indore

/** OpenStreetMap map; tap to drop a pin. `pin` can also be set from outside (Use Location). */
export function MapPicker({ pin, zoom, onPick }: { pin: LatLng | null; zoom?: number; onPick: (ll: LatLng) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { scrollWheelZoom: false }).setView(MAP_CENTER, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => pickRef.current([e.latlng.lat, e.latlng.lng]));
    map.current = m;
    return () => { m.remove(); map.current = null; marker.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !pin) return;
    if (marker.current) marker.current.setLatLng(pin); else marker.current = L.marker(pin).addTo(m);
    m.setView(pin, zoom ?? m.getZoom());
  }, [pin, zoom]);

  return <div ref={box} className="map" />;
}
