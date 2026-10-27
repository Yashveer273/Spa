import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type CashfreeStatus } from '../lib/api';
import { useTitle } from '../lib/hooks';
import { rupee } from '../lib/format';
import { useCatalog } from '../lib/catalog';

/**
 * Cashfree sends customers here after paying (/payment-return?order_id=…).
 * The page asks our server, which asks Cashfree, so the result can't be faked from the address bar.
 */
export default function PaymentReturn() {
  useTitle('Payment – AAPNA SPA');
  const { BUSINESS_WHATSAPP } = useCatalog();
  const [params] = useSearchParams();
  const orderId = params.get('order_id') || '';
  const [result, setResult] = useState<CashfreeStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) { setError('No payment to check.'); return; }
    let stop = false;
    (async () => {
      // UPI and some banks take a few seconds to confirm
      for (let i = 0; i < 8 && !stop; i++) {
        try {
          const r = await api.cashfreeVerify(orderId);
          if (stop) return;
          setResult(r);
          if (r.status !== 'pending') return;
        } catch (e) {
          if (!stop) setError((e as Error).message);
          return;
        }
        await new Promise((ok) => setTimeout(ok, 3000));
      }
    })();
    return () => { stop = true; };
  }, [orderId]);

  const wa = `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(`Hi, about my booking ${orderId} – AAPNA SPA`)}`;
  const box = { maxWidth: 460, margin: '0 auto', padding: '64px 16px', textAlign: 'center' as const };

  if (error) {
    return (
      <main className="container" style={box}>
        <h1 style={{ color: 'var(--ink)', fontSize: 26 }}>We couldn't check this payment</h1>
        <p style={{ margin: '10px 0 22px' }}>{error} If money was deducted, WhatsApp us with booking ID <b>{orderId}</b> and we'll sort it out.</p>
        <a className="btn btn-primary" href={wa} target="_blank" rel="noopener">WhatsApp us</a>
      </main>
    );
  }
  if (!result || result.status === 'pending') {
    return (
      <main className="container" style={box} aria-live="polite">
        <h1 style={{ color: 'var(--ink)', fontSize: 26 }}>Confirming your payment…</h1>
        <p style={{ margin: '10px 0 22px' }}>Please don't close this page. This usually takes a few seconds.</p>
        {result && <p className="muted">Still waiting for the bank. Booking ID <b className="allow-copy">{orderId}</b> – you can also check <Link to="/bookings">My Bookings</Link> in a minute.</p>}
      </main>
    );
  }
  if (result.status === 'failed') {
    return (
      <main className="container" style={box}>
        <h1 style={{ color: 'var(--ink)', fontSize: 26 }}>Payment not completed</h1>
        <p style={{ margin: '10px 0 22px' }}>{result.message || 'The payment was cancelled or declined.'} No money was taken for this booking. You can try again.</p>
        <Link className="btn btn-primary" to="/book-now">Book again</Link>
        <p style={{ marginTop: 16 }}><a href={wa} target="_blank" rel="noopener">Need help? WhatsApp us</a></p>
      </main>
    );
  }
  return (
    <main className="container" style={box}>
      <h1 style={{ color: 'var(--ink)', fontSize: 26 }}>Booking confirmed 🎉</h1>
      <div className="success-box" style={{ margin: '16px 0' }}>
        <b className="allow-copy">Booking ID: {result.bookingId}</b>
        {result.paymentId && <small>Payment ID: {result.paymentId}</small>}
      </div>
      <p style={{ margin: '0 0 22px' }}>
        {result.amount !== undefined && <>{rupee(result.amount)} received{result.therapist ? ` for ${result.therapist}` : ''}. </>}
        Our therapist will reach you at the chosen time{result.slot ? ` (${result.slot})` : ''}.
      </p>
      <Link className="btn btn-primary block" to="/bookings">View my bookings</Link>
      <p style={{ marginTop: 16 }}><a href={wa} target="_blank" rel="noopener">Need help? WhatsApp us</a></p>
    </main>
  );
}
