import { useEffect, useRef, useState } from 'react';
import { adminApi, day, rupee, when, type AdminBooking, type Status } from '../api';

const FILTERS: [string, string][] = [['active', 'Active'], ['payment_submitted', 'To verify'], ['requested', 'Requested'], ['paid', 'Paid'], ['confirmed', 'Confirmed'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['', 'All']];
const STATUS_OPTIONS: [Status, string][] = [['requested', 'Requested'], ['paid', 'Paid'], ['confirmed', 'Confirmed'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];

function Payment({ p }: { p: NonNullable<AdminBooking['payment']> }) {
  if (p.method === 'cod') {
    return <><b>Cash on delivery</b><small>{p.paymentId ? `Visit fee ${rupee(p.paidOnline)} paid` : `Visit fee ${rupee(p.visitCharge || p.paidOnline)}`} · {rupee(p.cashOnService)} cash</small></>;
  }
  return <><b>{p.paymentId ? `Paid ${rupee(p.paidOnline)}` : `${rupee(p.total ?? p.paidOnline)} online`}</b><small>{p.paymentId || 'not paid yet'}</small></>;
}

/** UPI payment waiting for the admin: screenshot, UTR, amount, and Approve / Reject */
function VerifyBox({ b, busy, onVerify }: { b: AdminBooking; busy: boolean; onVerify: (action: 'approve' | 'reject') => void }) {
  const p = b.payment || {};
  return (
    <div className="verify-box">
      <b>Check your bank app for {rupee(p.paidOnline)}</b>
      <small>UTR <span className="mono">{p.utr}</span>{p.submittedAt ? ` · ${when(p.submittedAt)}` : ''}</small>
      {p.proofId && <a href={adminApi.proofUrl(p.proofId)} target="_blank" rel="noopener" className="proof-link">
        <img src={adminApi.proofUrl(p.proofId)} alt={`Payment screenshot for ${b.bookingId}`} loading="lazy" />
      </a>}
      <div className="verify-actions">
        <button className="btn primary" disabled={busy} onClick={() => onVerify('approve')}>✓ Mark paid</button>
        <button className="btn" disabled={busy} onClick={() => onVerify('reject')}>Reject</button>
      </div>
    </div>
  );
}

/** Bookings tab. Everything shown was typed by customers – React escapes it, so it can't run as code. */
export function BookingsPanel({ refreshKey, onError, toast }: { refreshKey: number; onError: (e: unknown) => void; toast: (m: string, err?: boolean) => void }) {
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AdminBooking[] | null>(null);
  const [saving, setSaving] = useState('');
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => { const t = window.setTimeout(() => setQuery(search.trim()), 250); return () => window.clearTimeout(t); }, [search]);

  useEffect(() => {
    let alive = true;
    adminApi.bookings(filter, query).then(({ bookings }) => {
      if (!alive) return;
      // Highlight bookings that arrived since the last load
      if (known.current) setFresh(new Set(bookings.filter((b) => !known.current!.has(b.bookingId)).map((b) => b.bookingId)));
      known.current = new Set([...(known.current || []), ...bookings.map((b) => b.bookingId)]);
      setRows(bookings);
    }).catch(onError);
    return () => { alive = false; };
  }, [filter, query, refreshKey, onError]);

  const changeStatus = async (b: AdminBooking, status: Status) => {
    setSaving(b.bookingId);
    try {
      const { booking } = await adminApi.setStatus(b.bookingId, status);
      setRows((rs) => rs && rs.map((r) => (r.bookingId === b.bookingId ? { ...r, status: booking.status } : r)));
      toast(`${b.bookingId} → ${STATUS_OPTIONS.find(([v]) => v === status)?.[1]}`);
    } catch (err) {
      onError(err);
    } finally {
      setSaving('');
    }
  };

  const verify = async (b: AdminBooking, action: 'approve' | 'reject') => {
    let reason = '';
    if (action === 'reject') {
      const r = window.prompt(`Reject the payment for ${b.bookingId}? The customer will be asked to pay again.\nReason (shown to the customer):`, 'Payment not received');
      if (r === null) return;
      reason = r;
    }
    setSaving(b.bookingId);
    try {
      const { booking } = await adminApi.verifyPayment(b.bookingId, action, reason);
      setRows((rs) => rs && (filter === 'payment_submitted' ? rs.filter((r) => r.bookingId !== b.bookingId) : rs.map((r) => (r.bookingId === b.bookingId ? booking : r))));
      toast(action === 'approve' ? `${b.bookingId} marked Paid ✓` : `${b.bookingId}: payment rejected`);
    } catch (err) {
      onError(err);
    } finally {
      setSaving('');
    }
  };

  return (
    <section className="panel">
      <div className="toolbar">
        <div className="filters">
          {FILTERS.map(([v, l]) => <button key={l} className={`chip ${filter === v ? 'on' : ''}`} onClick={() => setFilter(v)}>{l}</button>)}
        </div>
        <input type="search" placeholder="Search name, mobile, ID, therapist…" aria-label="Search bookings" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="table-wrap">
        <table className="table bookings-table">
          <thead><tr><th>Booking</th><th>Customer</th><th>Therapist &amp; slot</th><th>Address</th><th>Payment</th><th>Status</th></tr></thead>
          <tbody>
            {(rows || []).map((b) => {
              const c = b.customer || {}; const p = b.payment || {}; const t = b.therapist || {};
              const mobile = String(c.mobile || '').replace(/\D/g, '');
              const pin = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(c.pin || '') ? c.pin! : '';
              return (
                <tr key={b.bookingId} className={fresh.has(b.bookingId) ? 'flash' : ''}>
                  <td data-label="Booking">
                    <b className="mono">{b.bookingId}</b><small>{when(b.createdAt)}</small>
                    <span className={`src ${b.source === 'whatsapp' ? 'whatsapp' : ''}`}>{b.source === 'whatsapp' ? 'WhatsApp' : 'Online'}</span>
                  </td>
                  <td data-label="Customer">
                    <b>{c.name || '–'}</b><small>{c.mobile ? '+91 ' + c.mobile : ''}</small>
                    {mobile && <span className="contact-links"><a href={`tel:+91${mobile}`}>Call</a><a href={`https://wa.me/91${mobile}`} target="_blank" rel="noopener">WhatsApp</a></span>}
                  </td>
                  <td data-label="Therapist & slot">
                    <b>{t.name || '–'}</b><small>{t.speciality}</small><small>{day(c.date)}, {c.time} · {c.stay}</small>
                  </td>
                  <td data-label="Address" className="addr">
                    {[c.flat, c.floor, c.address].filter(Boolean).join(', ') || c.slot || '–'}
                    {c.landmark && <small>Near {c.landmark}</small>}
                    {pin && <small><a href={`https://maps.google.com/?q=${encodeURIComponent(pin)}`} target="_blank" rel="noopener">Open map pin ↗</a></small>}
                  </td>
                  <td data-label="Payment">
                    <Payment p={p} />{p.referral && <small>Code {p.referral} (−{rupee(p.discount)})</small>}
                    {b.status === 'payment_submitted' && <VerifyBox b={b} busy={saving === b.bookingId} onVerify={(a) => verify(b, a)} />}
                    {b.status !== 'payment_submitted' && p.gateway === 'upi' && p.paymentId && p.proofId && <small><a href={adminApi.proofUrl(p.proofId)} target="_blank" rel="noopener">View payment screenshot ↗</a></small>}
                  </td>
                  <td data-label="Status">
                    {b.status === 'payment_submitted' ? <span className="status-select payment_submitted">Payment submitted – verify</span> : <select className={`status-select ${b.status}`} aria-label={`Status for ${b.bookingId}`} value={b.status} disabled={saving === b.bookingId}
                      onChange={(e) => changeStatus(b, e.target.value as Status)}>
                      {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows && !rows.length && <p className="empty">No bookings here yet.</p>}
      </div>
    </section>
  );
}
