import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { Icon } from './Icon';
import { useToast } from './Toast';
import { api, ApiError } from '../lib/api';
import { copyText, useEscape } from '../lib/hooks';
import { rupee } from '../lib/format';
import { shrinkImage } from '../lib/image';
import { getDeviceId } from '../lib/storage';
import '../../styles/upi.css';

export interface UpiPayment { bookingId: string; amount: number; upiId: string; payeeName: string }

const QR_MINUTES = 10;

/** "upi://pay?…" – opens Google Pay / PhonePe / Paytm with the amount and booking filled in */
function upiLink(p: UpiPayment) {
  const q = new URLSearchParams({ pa: p.upiId, pn: p.payeeName, am: p.amount.toFixed(2), cu: 'INR', tn: `AAPNA SPA ${p.bookingId}` });
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`;
}

/**
 * UPI checkout: 1) animated QR for the business UPI ID  2) customer uploads the payment screenshot + UTR
 * 3) "Payment submitted" – the admin checks the bank app and confirms the booking.
 */
export function UpiPay({ payment, onClose }: { payment: UpiPayment; onClose: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState<'pay' | 'proof' | 'done'>('pay');
  const [qr, setQr] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(QR_MINUTES * 60);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [utr, setUtr] = useState('');
  const [errors, setErrors] = useState<{ utr?: string; screenshot?: string; form?: string }>({});
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const link = useMemo(() => upiLink(payment), [payment]);

  useEscape(true, onClose);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  // QR code for the exact amount
  useEffect(() => {
    QRCode.toDataURL(link, { width: 520, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1f2a14', light: '#ffffff' } })
      .then(setQr).catch(() => setQr(''));
  }, [link]);

  // Countdown – keeps the customer moving; "Refresh QR" simply restarts it
  useEffect(() => {
    if (step !== 'pay' || secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [step, secondsLeft]);

  // Screenshot preview
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErrors((e) => ({ ...e, screenshot: 'Please choose an image (the screenshot of your payment).' })); return; }
    if (f.size > 25 * 1024 * 1024) { setErrors((e) => ({ ...e, screenshot: 'That file is too big.' })); return; }
    setFile(f); setErrors((e) => ({ ...e, screenshot: '' }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = utr.replace(/\D/g, '');
    const errs: typeof errors = {};
    if (!file) errs.screenshot = 'Please attach the screenshot of your payment.';
    if (!/^\d{12}$/.test(clean)) errs.utr = 'The UTR / UPI reference number has 12 digits – find it in your payment app.';
    setErrors(errs);
    if (errs.screenshot || errs.utr) return;
    setSending(true);
    try {
      const small = await shrinkImage(file!, 1600, 0.85);
      await api.submitPaymentProof(payment.bookingId, clean, small, getDeviceId());
      setStep('done');
    } catch (err) {
      const ae = err as ApiError;
      if (ae.field === 'utr' || ae.field === 'screenshot') setErrors({ [ae.field]: ae.message });
      else setErrors({ form: ae.message || 'Could not submit. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="upi-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="upi-sheet" role="dialog" aria-modal="true" aria-labelledby="upiTitle">
        <button className="sheet-close" aria-label="Close" onClick={onClose}>×</button>

        <ol className="upi-steps" aria-label="Payment steps">
          <li className={step === 'pay' ? 'on' : 'done'}><span>1</span>Pay</li>
          <li className={step === 'proof' ? 'on' : step === 'done' ? 'done' : ''}><span>2</span>Upload proof</li>
          <li className={step === 'done' ? 'on' : ''}><span>3</span>Done</li>
        </ol>

        {step === 'pay' && (
          <>
            <h3 id="upiTitle">Scan &amp; pay {rupee(payment.amount)}</h3>
            <p className="upi-sub">Use any UPI app – Google Pay, PhonePe, Paytm or BHIM.</p>
            <div className={`qr-frame ${secondsLeft <= 0 ? 'expired' : ''}`}>
              <div className="qr-inner">
                {qr ? <img src={qr} alt={`UPI QR code to pay ${rupee(payment.amount)} to ${payment.payeeName}`} /> : <div className="qr-loading" />}
                <span className="qr-scan" aria-hidden="true" />
                {secondsLeft <= 0 && (
                  <button type="button" className="qr-refresh" onClick={() => setSecondsLeft(QR_MINUTES * 60)}>↻ Refresh QR</button>
                )}
              </div>
            </div>
            <p className={`upi-timer ${secondsLeft < 60 ? 'low' : ''}`}>{secondsLeft > 0 ? <>QR valid for <b>{mm}:{ss}</b></> : 'QR expired – tap Refresh'}</p>

            <div className="upi-payee">
              <div><small>Pay to</small><b>{payment.payeeName}</b></div>
              <div className="upi-id">
                <span className="allow-copy">{payment.upiId}</span>
                <button type="button" onClick={async () => { await copyText(payment.upiId, null); toast('UPI ID copied'); }}><Icon name="copy" />Copy</button>
              </div>
              <div><small>Amount</small><b>{rupee(payment.amount)}</b></div>
              <div><small>Booking</small><b className="allow-copy">{payment.bookingId}</b></div>
            </div>

            <a className="btn btn-dark block upi-app" href={link}>Pay with UPI app <span>→</span></a>
            <button type="button" className="btn btn-primary block" onClick={() => setStep('proof')}>I have paid – upload proof <span>→</span></button>
            <p className="upi-note">Pay exactly {rupee(payment.amount)}. Your booking is confirmed after we verify the payment.</p>
          </>
        )}

        {step === 'proof' && (
          <form onSubmit={submit} noValidate>
            <h3 id="upiTitle">Upload payment proof</h3>
            <p className="upi-sub">Add the screenshot from your UPI app and the 12-digit UTR (also called UPI Ref. No. or Transaction ID).</p>

            <label className="lbl">Payment screenshot</label>
            <button type="button" className={`proof-drop ${errors.screenshot ? 'err' : ''} ${preview ? 'has' : ''}`} onClick={() => fileInput.current?.click()}>
              {preview
                ? <img src={preview} alt="Your payment screenshot" />
                : <><Icon name="file" /><b>Tap to choose screenshot</b><small>JPG or PNG from your gallery</small></>}
            </button>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
            {preview && <button type="button" className="link-btn" onClick={() => fileInput.current?.click()}>Choose a different screenshot</button>}
            {errors.screenshot && <p className="upi-err" role="alert">{errors.screenshot}</p>}

            <label className="lbl" htmlFor="utr">UTR / UPI reference number</label>
            <input id="utr" className={`inp ${errors.utr ? 'err' : ''}`} inputMode="numeric" autoComplete="off" maxLength={14} placeholder="12-digit number, e.g. 412345678901"
              value={utr} onChange={(e) => { setUtr(e.target.value.replace(/[^\d ]/g, '')); setErrors((x) => ({ ...x, utr: '' })); }} />
            <p className="upi-hint">{utr.replace(/\D/g, '').length}/12 digits</p>
            {errors.utr && <p className="upi-err" role="alert">{errors.utr}</p>}
            {errors.form && <p className="upi-err" role="alert">{errors.form}</p>}

            <button type="submit" className="btn btn-primary block" disabled={sending}>{sending ? 'Submitting…' : <>Submit payment proof <span>→</span></>}</button>
            <button type="button" className="link-btn center" onClick={() => setStep('pay')}>← Back to QR</button>
          </form>
        )}

        {step === 'done' && (
          <div className="upi-done">
            <span className="upi-tick" aria-hidden="true"><Icon name="check" /></span>
            <h3 id="upiTitle">Payment submitted</h3>
            <p>Thank you! We're verifying your payment of <b>{rupee(payment.amount)}</b>. Your booking <b className="allow-copy">{payment.bookingId}</b> will show as <b>Confirmed</b> in My Bookings once it's checked – usually within a few minutes.</p>
            <Link className="btn btn-dark block" to="/bookings" onClick={onClose}>View my bookings <span>→</span></Link>
          </div>
        )}
      </div>
    </div>
  );
}
