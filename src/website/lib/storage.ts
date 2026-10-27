// Small things remembered in this browser (localStorage). Every access is wrapped,
// because private mode or blocked storage must never break the site.
import type { CustomerBooking } from './types';

const KEYS = {
  device: 'apkaspa:device',
  requests: 'apkaspa:requests',
  offer: 'apkaspa:offer',
  city: 'apkaspa:city',
};

function get(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function set(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* ignore */ }
}

/** A random ID for this browser, so the server can show "bookings made on this device". */
export function getDeviceId(): string {
  let id = get(KEYS.device);
  if (!id || !/^[a-f0-9-]{20,64}$/.test(id)) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    set(KEYS.device, id);
  }
  return id;
}

/** WhatsApp requests that couldn't reach the server are kept here as a backup. */
export function readLocalBookings(): CustomerBooking[] {
  try { return JSON.parse(get(KEYS.requests) || '[]') as CustomerBooking[]; } catch { return []; }
}
export function saveLocalBooking(b: CustomerBooking) {
  set(KEYS.requests, JSON.stringify([b, ...readLocalBookings()].slice(0, 50)));
}

export const savedOffer = {
  get: () => get(KEYS.offer),
  set: (code: string) => set(KEYS.offer, code),
};
export const savedCity = {
  get: () => get(KEYS.city),
  set: (city: string) => set(KEYS.city, city),
};
export const favourite = {
  has: (key: string) => Boolean(get('fav:' + key)),
  set: (key: string, on: boolean) => set('fav:' + key, on ? '1' : null),
};
