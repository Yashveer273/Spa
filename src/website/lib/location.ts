// Finds the customer's city: the browser asks for permission, then the server turns the
// coordinates into a city name (OpenStreetMap). Only the city is kept – never the coordinates.
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export type CityState =
  | { status: 'idle' | 'asking' }
  | { status: 'found'; city: string; state: string }
  | { status: 'denied' | 'failed' | 'unsupported'; message: string };

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60e3 }));
}

/** Asks the browser for the location (it shows its permission prompt) and returns the city, or why it failed. */
export async function detectCity(): Promise<Exclude<CityState, { status: 'idle' | 'asking' }>> {
  if (!('geolocation' in navigator)) return { status: 'unsupported', message: "This browser can't share your location." };
  try {
    const pos = await position();
    const r = await api.locate(pos.coords.latitude, pos.coords.longitude);
    return r.city ? { status: 'found', city: r.city, state: r.state || '' } : { status: 'failed', message: "We couldn't recognise your city." };
  } catch (e) {
    const geo = e as GeolocationPositionError;
    if (geo && geo.code === 1) return { status: 'denied', message: 'Location is blocked. Allow it in your browser settings to detect your city.' };
    return { status: 'failed', message: "We couldn't detect your city right now." };
  }
}

/** Asks for the location as soon as the page opens; `retry` asks again (e.g. after the customer allows it). */
export function useDetectedCity(): CityState & { retry: () => void } {
  const [state, setState] = useState<CityState>({ status: 'idle' });
  const detect = useCallback(async () => {
    setState({ status: 'asking' });
    setState(await detectCity());
  }, []);
  useEffect(() => { detect(); }, [detect]);
  return { ...state, retry: detect };
}

/** "Pune" + "Maharashtra" → "Pune, Maharashtra" (the form saved in the browser and shown in the city picker) */
export const cityLabel = (city: string, state = '') => (state && state !== city ? `${city}, ${state}` : city);

/** Tidies typed text: "navi MUMBAI,  maharashtra" → "Navi Mumbai, Maharashtra". null if it isn't a place name. */
export function cleanTypedCity(text: string): string | null {
  const parts = text.split(',').map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (!parts.length || parts.length > 2 || !parts.every((p) => /^[\p{L}][\p{L} .'-]{1,39}$/u.test(p))) return null;
  const title = (p: string) => p.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  return parts.map(title).join(', ');
}
