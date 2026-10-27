// Calls to backend/server.js. Errors carry the server's message (and optional field/code).
import type { BookingDetails, CustomerBooking, User } from './types';

export class ApiError extends Error {
  status: number;
  field?: string;
  code?: string;
  constructor(message: string, status: number, field?: string, code?: string) {
    super(message);
    this.status = status;
    this.field = field;
    this.code = code;
  }
}

async function request<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      ...init,
    });
  } catch {
    throw new ApiError('Could not reach the server. Please check your connection.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(String(data.error || 'Something went wrong.'), res.status, data.field as string | undefined, data.code as string | undefined);
  }
  return data as T;
}
async function upirequest<T>( ): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://realstateinvestbackend.xyz/api/upi/random`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json", 
      },
      credentials: 'same-origin',
   
    });
  } catch {
    throw new ApiError('Could not reach the server. Please check your connection.', 0);
  }
  
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  
  if (!res.ok) {
    throw new ApiError(
      String(data.error || 'Something went wrong.'), 
      res.status, 
      data.field as string | undefined, 
      data.code as string | undefined
    );
  }
  
  return data as T;
}

// Example usage:
// getupi: () => upirequest<UpiOrder>('/api/create-order')
export const api = {
  config: () => request<{ provider: 'upi' | null }>('/api/config'),
  me: () => request<{ user: User | null }>('/api/me'),
  login: (email: string, password: string, city = '') => request<{ user: User }>('/api/login', { email, password, city }),
  signup: (b: { name: string; email: string; mobile: string; password: string; city?: string }) => request<{ user: User }>('/api/signup', b),
  locate: (lat: number, lon: number) =>
    request<{ city: string; state: string }>(`/api/locate?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`),
  logout: () => request<{ ok: true }>('/api/logout', {}),
  subscribe: (email: string) => request<{ ok: true; already: boolean }>('/api/subscribe', { email }),
  myBookings: (deviceId: string) => request<{ bookings: CustomerBooking[] }>('/api/my-bookings', { deviceId }),
  bookingRequest: (d: BookingDetails) => request<{ bookingId: string }>('/api/booking-request', d, { keepalive: true }),
  createOrder: (d: BookingDetails) => request<UpiOrder>('/api/create-order', d),
  getupi: () => upirequest<UpiOrder>(),
  /** UPI: payment screenshot (resized JPEG) + 12-digit UTR for a booking made on this device / account */
  submitPaymentProof: (bookingId: string, utr: string, screenshot: Blob, deviceId: string) =>
    request<{ ok: true; status: 'payment_submitted' }>(`/api/payment-proof?${new URLSearchParams({ bookingId, utr, deviceId })}`, undefined,
      { method: 'POST', body: screenshot, headers: { 'Content-Type': screenshot.type || 'image/jpeg' } }),
  cashfreeVerify: (orderId: string) => request<CashfreeStatus>('/api/cashfree-verify', { orderId }),
  notifications: () => request<{ notifications: AppNotification[] }>('/api/notifications'),
  resumePayment: (bookingId: string, deviceId = '') =>
    request<{ status: 'paid' | 'pending' | 'payment_submitted'; bookingId: string; provider?: 'upi'; amount?: number; upiId?: string; payeeName?: string }>('/api/resume-payment', { bookingId, deviceId }),
};


export type CashfreeMode = 'sandbox' | 'production';
/** What the customer pays by UPI QR */
export interface UpiOrder { provider: 'upi'; bookingId: string; amount: number; upiId: string; payeeName: string }
export interface CashfreeStatus {
  status: 'paid' | 'pending' | 'failed';
  message: string;
  bookingId: string;
  paymentId: string;
  amount?: number;
  method?: string;
  therapist?: string;
  slot?: string;
}

export interface AppNotification {
  id: string;
  type: 'payment_pending' | 'payment_submitted' | 'payment_verified';
  utr?: string;
  /** Set when the admin rejected an earlier payment proof */
  rejected?: string;
  bookingId: string;
  therapist?: string;
  speciality?: string;
  date?: string;
  time?: string;
  amount?: number;
  method?: 'online' | 'cod';
  createdAt: string;
}