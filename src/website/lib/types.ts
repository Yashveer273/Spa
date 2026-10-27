export type BookingStatus = 'requested' | 'pending_payment' | 'payment_submitted' | 'paid' | 'confirmed' | 'completed' | 'cancelled';
export type PayMethod = 'online' | 'cod';

export interface User {
  name: string;
  email: string;
  mobile?: string;
  /** City detected from the customer's location at login / sign-up */
  city?: string;
}

export interface CustomerBooking {
  bookingId: string;
  createdAt: string;
  status: BookingStatus;
  source?: 'online' | 'whatsapp';
  therapist: { name?: string; speciality?: string };
  payment: {
    method?: PayMethod | '';
    paidOnline?: number;
    cashOnService?: number;
    total?: number;
    referral?: string;
    paymentId?: string;
    utr?: string;
    gateway?: string;
    /** Admin's reason when a UPI payment proof was rejected */
    rejected?: string;
  };
  customer: { stay?: string; date?: string; time?: string; address?: string };
}

/** What the checkout sends to the server */
export interface BookingDetails {
  type: string;
  id: string;
  pay: PayMethod | '';
  code: string;
  deviceId: string;
  customer: {
    name: string; mobile: string; stay: string; date: string; time: string;
    address: string; flat: string; floor: string; landmark: string; pin: string;
  };
}
