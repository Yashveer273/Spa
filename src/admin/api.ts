// Admin calls to backend/server.js (/api/admin/*). A 401 means the admin session ended.
export type Status = 'requested' | 'pending_payment' | 'payment_submitted' | 'paid' | 'confirmed' | 'completed' | 'cancelled';

export interface AdminBooking {
  _id: string;
  bookingId: string;
  source: 'online' | 'whatsapp';
  status: Status;
  createdAt: string;
  therapist?: { name?: string; speciality?: string };
  payment?: {
    method?: 'online' | 'cod'; price?: number; discount?: number; referral?: string; paidOnline?: number;
    cashOnService?: number; total?: number; visitCharge?: number; paymentId?: string;
    gateway?: string; utr?: string; proofId?: string; submittedAt?: string; rejected?: string;
  };
  customer?: {
    name?: string; mobile?: string; stay?: string; date?: string; time?: string; address?: string;
    flat?: string; floor?: string; landmark?: string; pin?: string; slot?: string;
  };
}
export interface Summary {
  total: number; today: number; upcoming: number; requests: number; revenue: number; customers: number; subscribers: number;
}
export interface Customer { _id: string; name: string; email: string; mobile?: string; city?: string; createdAt: string; lastLoginAt?: string; bookings: number }
export interface Subscriber { email: string; createdAt: string }
export interface AdminEvent { _id: string; type: string; message: string; at: string }
export interface Analytics {
  days: number;
  total: number;
  daily: { date: string; bookings: number; revenue: number }[];
  hours: { hour: number; bookings: number }[];
  therapists: { label: string; value: number }[];
  statuses: { label: string; value: number }[];
  channels: { label: string; value: number }[];
  offers: { label: string; value: number }[];
  tiles: { avgValue: number; cancelRate: number; repeatCustomers: number; uniqueCustomers: number; offerShare: number; discountSum: number; revenue: number };
}

export type TherapistType = 'basic' | 'therapist' | 'premium';
export interface AdminTherapist {
  key?: string; name: string; speciality: string; price: number; rating: number; reviews: number; photo: string;
  experience?: string; specializes?: string; languages?: string; about?: string; hidden?: boolean;
}
export interface AdminOffer { code: string; title: string; desc: string; kind: 'percent' | 'flat'; value: number; max?: number; hidden?: boolean; disabled?: boolean }
export interface AdminUpi { upiId: string; upiName: string }
export interface AdminContact { whatsapp: string; phone: string; instagram: string; email: string; address: string; hours: string; upiId?: string; upiName?: string; upiAccounts: AdminUpi[]; upiActive: number }
export interface AdminCatalog { therapists: Record<TherapistType, AdminTherapist[]>; offers: AdminOffer[]; contact: AdminContact; version: string }

export class SessionEnded extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...init });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && !path.endsWith('/login')) throw new SessionEnded('Your session ended. Please sign in again.');
  if (!res.ok) throw new Error(String(data.error || `Request failed (${res.status})`));
  return data as T;
}

export const adminApi = {
  me: () => call<{ admin: boolean; enabled: boolean; username: string | null }>('/api/admin/me'),
  login: (username: string, password: string) => call<{ ok: true }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => call<{ ok: true }>('/api/admin/logout', { method: 'POST' }),
  summary: () => call<Summary>('/api/admin/summary'),
  bookings: (status: string, q: string) => call<{ bookings: AdminBooking[] }>('/api/admin/bookings?' + new URLSearchParams({ status, q })),
  /** UPI payment checked in the bank app: approve → Paid, reject → customer pays / submits again */
  verifyPayment: (bookingId: string, action: 'approve' | 'reject', reason = '') =>
    call<{ booking: AdminBooking }>(`/api/admin/bookings/${encodeURIComponent(bookingId)}/verify`, { method: 'POST', body: JSON.stringify({ action, reason }) }),
  proofUrl: (proofId: string) => `/api/admin/proofs/${encodeURIComponent(proofId)}`,
  setStatus: (bookingId: string, status: Status) =>
    call<{ booking: AdminBooking }>(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  customers: () => call<{ customers: Customer[] }>('/api/admin/customers'),
  subscribers: () => call<{ subscribers: Subscriber[] }>('/api/admin/subscribers'),
  events: () => call<{ events: AdminEvent[] }>('/api/admin/events'),
  catalog: () => call<AdminCatalog>('/api/admin/catalog'),
  /** Uploads a (resized) therapist photo; returns its permanent address, e.g. /api/photos/…jpg */
  uploadPhoto: (photo: Blob) => call<{ url: string }>('/api/admin/photos', { method: 'POST', body: photo, headers: { 'Content-Type': photo.type || 'image/jpeg' } }),
  saveCatalog: (b: Partial<Pick<AdminCatalog, 'therapists' | 'offers' | 'contact'>> & { version: string; note: string }) =>
    call<{ ok: true; version: string }>('/api/admin/catalog', { method: 'PUT', body: JSON.stringify(b) }),
  analytics: (days: number) => call<Analytics>('/api/admin/analytics?days=' + days),
};

// ---- Formatting (all times shown in Indian time) ----
export const rupee = (n?: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
export const when = (d?: string) => d
  ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
  : '–';
export const day = (ymd?: string) => ymd
  ? new Date(ymd + 'T00:00:00+05:30').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  : '–';
export function ago(d: string) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return when(d);
}
