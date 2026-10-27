import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { UpiPay, type UpiPayment } from '../components/UpiPay';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBodyClass, useTitle } from '../lib/hooks';
import { getDeviceId, readLocalBookings } from '../lib/storage';
import { rupee } from '../lib/format';
import type { CustomerBooking } from '../lib/types';
import { useCatalog } from '../lib/catalog';
import '../../styles/bookings.css';

// "4:00 PM" + "2026-10-20" → Date (for sorting into upcoming / past)
function slotDate(b: CustomerBooking): Date {
  const d = b.customer?.date;
  if (!d) return new Date(b.createdAt || 0);
  const m = String(b.customer?.time || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  const h = m ? (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0) : 0;
  return new Date(`${d}T${String(h).padStart(2, '0')}:${m ? m[2] : '00'}:00`);
}

const STATUS: Record<string, [string, string]> = {
  requested: ['requested', 'Requested'],
  payment_submitted: ['requested', 'Verifying payment'],
  pending_payment: ['cancelled', 'Payment rejected'],
  paid: ['paid', 'Confirmed'],
  confirmed: ['paid', 'Confirmed'],
  completed: ['done', 'Completed'],
  cancelled: ['cancelled', 'Cancelled'],
};

function PayLine({ b }: { b: CustomerBooking }) {
  const { VISIT_CHARGE } = useCatalog();
  const p = b.payment || {};
  const paidOnline = Boolean(p.paymentId) || b.status === 'paid';
  if (b.status === 'cancelled' && !paidOnline) return <>No payment due</>;
  if (b.status === 'pending_payment' && p.rejected) return <>Payment of <b>{rupee(p.paidOnline || 0)}</b> not verified – {p.rejected}</>;
  if (b.status === 'payment_submitted') return <>Paid <b>{rupee(p.paidOnline || 0)}</b> by UPI · verifying{p.utr ? <> (UTR <span className="allow-copy">{p.utr}</span>)</> : ''}</>;
  if (!paidOnline && b.status !== 'requested') return <>Total <b>{rupee(p.total || 0)}</b> · pay as agreed on WhatsApp</>;
  if (!paidOnline) {
    return p.method === 'cod'
      ? <>{rupee(VISIT_CHARGE)} visiting charge + <b>{rupee(p.cashOnService || 0)}</b> cash · awaiting confirmation</>
      : <>Total <b>{rupee(p.total || 0)}</b> · awaiting payment link</>;
  }
  return p.method === 'cod'
    ? <>Paid {rupee(p.paidOnline || 0)} online · <b>{rupee(p.cashOnService || 0)}</b> in cash at service</>
    : <>Paid <b>{rupee(p.paidOnline || 0)}</b> online</>;
}

function BookingCard({ b, past, index }: { b: CustomerBooking; past: boolean; index: number }) {
  const { BUSINESS_WHATSAPP } = useCatalog();
  const toast = useToast();
  const [upi, setUpi] = useState<UpiPayment | null>(null);
  const [opening, setOpening] = useState(false);
  // Rejected UPI payment: show the QR again for the same booking
  const payAgain = async () => {
    setOpening(true);
    try {
      const r = await api.resumePayment(b.bookingId, getDeviceId());
      if (r.upiId && r.amount !== undefined) setUpi({ bookingId: r.bookingId, amount: r.amount, upiId: r.upiId, payeeName: r.payeeName || 'AAPNA SPA' });
      else toast(r.status === 'payment_submitted' ? 'Your payment proof is being verified ✓' : 'This booking is already paid 🎉');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setOpening(false);
    }
  };
  const when = slotDate(b);
  const status = past && ['paid', 'confirmed'].includes(b.status) ? STATUS.completed : STATUS[b.status] || STATUS.requested;
  const help = encodeURIComponent(`Hi, I need help with my booking ${b.bookingId}`);
  return (
    <article className="bk-card" style={{ animationDelay: `${index * 50}ms` }}>
      <div className="bk-head">
        <div className="bk-date"><b>{when.getDate()}</b><small>{when.toLocaleDateString('en-IN', { month: 'short' })}</small></div>
        <div className="bk-main">
          <h3>{b.therapist?.name || 'Therapist'}</h3>
          <p>{b.therapist?.speciality || 'Massage'} · {b.customer?.stay || 'Home Stay'}</p>
        </div>
        <span className={`bk-status ${status[0]}`}>{status[1]}</span>
      </div>
      <div className="bk-rows">
        <div className="bk-row"><Icon name="clock" /><span>{when.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, {b.customer?.time}</span></div>
        {b.customer?.address && <div className="bk-row"><Icon name="pin" /><span>{b.customer.address}</span></div>}
        <div className="bk-row"><Icon name="card" /><span><PayLine b={b} />{b.payment?.referral ? ` · code ${b.payment.referral}` : ''}</span></div>
      </div>
      <div className="bk-foot">
        <span>ID: <span className="allow-copy">{b.bookingId}</span></span>
        {b.status === 'pending_payment' && b.payment?.rejected && !past
          ? <button type="button" className="bk-pay" disabled={opening} onClick={payAgain}>{opening ? 'Opening…' : 'Pay again →'}</button>
          : <a href={`https://wa.me/${BUSINESS_WHATSAPP}?text=${help}`} target="_blank" rel="noopener">Need help?</a>}
      </div>
      {upi && <UpiPay payment={upi} onClose={() => { setUpi(null); window.dispatchEvent(new Event('bookings:refresh')); }} />}
    </article>
  );
}

export default function Bookings() {
  useTitle('My Bookings – AAPNA SPA');
  useBodyClass('bookings-page');
  const { user } = useAuth();
  const [list, setList] = useState<CustomerBooking[] | null>(null);
  const [reload, setReload] = useState(0);
  // Reload after "Pay again" (the booking moves to "Verifying payment")
  useEffect(() => {
    const again = () => setReload((n) => n + 1);
    window.addEventListener('bookings:refresh', again);
    return () => window.removeEventListener('bookings:refresh', again);
  }, []);

  // Bookings from the server (this device or this account) + WhatsApp requests kept on this device
  useEffect(() => {
    let alive = true;
    api.myBookings(getDeviceId())
      .then((r) => r.bookings).catch(() => [] as CustomerBooking[])
      .then((server) => { if (alive) setList([...server, ...readLocalBookings()]); });
    return () => { alive = false; };
  }, [user, reload]);

  const now = Date.now();
  const upcoming = (list || []).filter((b) => slotDate(b).getTime() + 3600e3 >= now).sort((a, b) => +slotDate(a) - +slotDate(b));
  const past = (list || []).filter((b) => slotDate(b).getTime() + 3600e3 < now).sort((a, b) => +slotDate(b) - +slotDate(a));

  return (
    <main className="container bookings-wrap">
      <h1 className="bk-title">My Bookings</h1>
      {list === null && <div className="bk-loading">Loading your bookings…</div>}
      {list !== null && list.length === 0 && (
        <div className="bk-empty">
          <p>You haven't booked with this device yet.</p>
          <Link to="/book-now" className="bk-cta">Book a session →</Link>
          {!user && <p className="bk-login">Booked on another phone? <Link to="/login?next=/bookings">Log in</Link> to see bookings linked to your account.</p>}
        </div>
      )}
      {upcoming.length > 0 && (
        <section>
          <h2 className="bk-section">Upcoming</h2>
          <div className="bk-list">{upcoming.map((b, i) => <BookingCard key={b.bookingId} b={b} past={false} index={i} />)}</div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="bk-section">Past</h2>
          <div className="bk-list">{past.map((b, i) => <BookingCard key={b.bookingId} b={b} past index={i} />)}</div>
        </section>
      )}
    </main>
  );
}
