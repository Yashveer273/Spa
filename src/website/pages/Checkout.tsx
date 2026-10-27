import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { MapPicker, type LatLng } from '../components/MapPicker';
import { UpiPay, type UpiPayment } from '../components/UpiPay';
import { api, ApiError } from '../lib/api';
import { copyText, useBodyClass, useTitle } from '../lib/hooks';
import { favourite, getDeviceId, savedOffer } from '../lib/storage';
import { hourLabel, rupee, shortDate, toISODate } from '../lib/format';
import type { BookingDetails, PayMethod } from '../lib/types';
import { photoLabel, photoUrl, type Therapist } from '../../../shared/catalog';
import { useCatalog } from '../lib/catalog';
import '../../styles/book.css';
import '../../styles/therapist.css';

// ---- Settings you may want to change ----
const OPEN_HOUR = 10;  // first slot 10 AM
const CLOSE_HOUR = 21; // last slot 9 PM (service ends 10 PM)
const FLOORS = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor+'];

type Stay = 'Home Stay' | 'Hotel Stay';
type Errors = Partial<Record<'time' | 'address' | 'mobile' | 'name', boolean>>;

function firstDay() {
  const d = new Date();
  if (d.getHours() + 1 > CLOSE_HOUR) d.setDate(d.getDate() + 1); // no slots left today
  return toISODate(d);
}

export default function Checkout() {
  useBodyClass('book-page checkout-page');
  const params = useParams();
  const { getTherapist, ready } = useCatalog();
  const t = getTherapist(params.type || 'basic', params.id || '0');
  if (!t) {
    return ready ? (
      <main className="container" style={{ padding: '80px 16px', textAlign: 'center' }}>
        <h1 style={{ color: 'var(--ink)', fontSize: 26 }}>Therapist not available</h1>
        <p style={{ margin: '10px 0 20px' }}>This therapist isn't taking bookings right now. Please choose another one.</p>
        <Link to="/book-now" className="btn btn-primary">Choose a therapist</Link>
      </main>
    ) : null;
  }
  return <CheckoutPage key={`${t.type}/${t.id}`} t={t} />;
}

function CheckoutPage({ t }: { t: Therapist }) {
  const { VISIT_CHARGE, discountFor } = useCatalog();
  useTitle(`Book ${t.name} – AAPNA SPA`);

  // ---- Form state ----
  const [stay, setStay] = useState<Stay>('Home Stay');
  const [date, setDate] = useState(firstDay);
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [flat, setFlat] = useState('');
  const [floor, setFloor] = useState('');
  const [pin, setPin] = useState<LatLng | null>(null);
  const [pinZoom, setPinZoom] = useState<number | undefined>();
  const [codeInput, setCodeInput] = useState('');
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [codeMsg, setCodeMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pay, setPay] = useState<PayMethod | ''>('');
  const [errors, setErrors] = useState<Errors>({});
  const [locating, setLocating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [upi, setUpi] = useState<UpiPayment | null>(null);
  const [upiOpen, setUpiOpen] = useState(false);
  const upiFor = useRef(''); // booking details the current UPI payment was made for
  const [fav, setFav] = useState(() => favourite.has(`${t.type}:${t.name}`));
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutLong, setAboutLong] = useState(true);
  const [bannerOk, setBannerOk] = useState(true);
  const aboutRef = useRef<HTMLParagraphElement>(null);
  const slotsRef = useRef<HTMLDivElement>(null);
  const payRef = useRef<HTMLLabelElement>(null);
  const fieldRefs = { address: useRef<HTMLInputElement>(null), mobile: useRef<HTMLInputElement>(null), name: useRef<HTMLInputElement>(null) };

  const treatment = Math.max(t.price - discount, 0);
  const hotel = stay === 'Hotel Stay';
  const gatewayName = 'UPI (Google Pay, PhonePe, Paytm, BHIM)';

  useLayoutEffect(() => { const p = aboutRef.current; if (p) setAboutLong(p.scrollHeight > p.clientHeight + 2); }, [t.about]);

  // ---- Offer codes ----
  const applyCode = useCallback((raw: string) => {
    const c = raw.trim().toUpperCase();
    if (!c) return;
    const off = discountFor(c, t.price);
    if (off > 0) { setCode(c); setDiscount(off); setCodeMsg({ text: `Code applied – ₹${off} off!`, ok: true }); }
    else { setCode(''); setDiscount(0); setCodeMsg({ text: 'This code is not valid.', ok: false }); }
  }, [t.price]);
  // Auto-apply an offer picked on the Offers page
  useEffect(() => {
    const saved = savedOffer.get();
    if (saved && discountFor(saved, t.price) > 0) { setCodeInput(saved); applyCode(saved); }
  }, [t.price, applyCode]);

  // ---- Time slots (need at least 1 hour notice today) ----
  const slots = useMemo(() => {
    const now = new Date();
    const isToday = date === toISODate(now);
    const list = [];
    for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) list.push({ label: hourLabel(h), disabled: isToday && h <= now.getHours() + 1 });
    return list;
  }, [date]);
  const minDate = toISODate(new Date());
  const maxDate = toISODate(new Date(Date.now() + 30 * 864e5));

  // ---- Use Location ----
  const locateMe = () => {
    if (!navigator.geolocation) { alert('Location is not supported on this device.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const ll: LatLng = [pos.coords.latitude, pos.coords.longitude];
      setPin(ll); setPinZoom(17);
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${ll[0]}&lon=${ll[1]}`);
        const j = await r.json();
        if (j.display_name) { setAddress(j.display_name); setErrors((e) => ({ ...e, address: false })); }
      } catch { /* the pin is enough */ }
      setLocating(false);
    }, () => {
      setLocating(false);
      alert('Could not get your location. Please allow location access or type your address.');
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  // ---- Booking details sent to the server ----
  const details = (): BookingDetails => ({
    type: t.type, id: t.id, pay, code, deviceId: getDeviceId(),
    customer: {
      name: name.trim(), mobile: mobile.trim(), stay, date, time, address: address.trim(), flat: flat.trim(), floor,
      landmark: landmark.trim(), pin: pin ? `${pin[0].toFixed(6)},${pin[1].toFixed(6)}` : '',
    },
  });

  const validate = () => {
    const e: Errors = {
      time: !time,
      address: address.trim().length < 5,
      mobile: !/^[6-9]\d{9}$/.test(mobile),
      name: name.trim().length < 2,
    };
    setErrors(e);
    const first = e.time ? slotsRef.current : e.address ? fieldRefs.address.current : e.mobile ? fieldRefs.mobile.current
      : e.name ? fieldRefs.name.current : !pay ? payRef.current : null;
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return !first;
  };

  // ---- Pay: UPI QR for the business UPI ID, then screenshot + UTR (see components/UpiPay.tsx) ----
  const onPay = async () => {
    if (!validate() || !pay) return;
    const d = details();
    const key = JSON.stringify({ ...d, deviceId: '' });
    // Closed the QR and tapped Pay again without changing anything: reopen the same booking instead of making a new one
    if (upi && upiFor.current === key) { setUpiOpen(true); return; }
    setPaying(true);
    try {
      var order = await api.createOrder(d);
      const getupi=await api.getupi();
      upiFor.current = key;
      console.log(order,getupi);
      setUpi(order);
      setUpiOpen(true);
    } catch (err) {
      const e = err as ApiError;
      alert(e.code === 'payment_unavailable' ? e.message : e.status >= 500 || e.status === 0 ? 'Online payment is not available right now. Please try again in a minute.' : e.message);
    } finally {
      setPaying(false);
    }
  };

  const share = async () => {
    const url = location.href;
    if (navigator.share) { try { await navigator.share({ title: `Book ${t.name} – AAPNA SPA`, url }); } catch { /* cancelled */ } return; }
    if (await copyText(url, 'Copy this link to share:')) alert('Link copied!');
  };
  const toggleFav = () => { setFav((f) => { favourite.set(`${t.type}:${t.name}`, !f); return !f; }); };

  // ---- Sticky bar text ----
  const when = time ? `${time} · ${shortDate(date)}` : 'Select a time';

  return (
    <>
      <main className="book-wrap">
        <div className="book-top">
          <Link to={`/book-now#${t.type}`} className="circle-btn" aria-label="Back"><Icon name="arrowLeft" /></Link>
          <div className="top-right">
            <button className={`circle-btn ${fav ? 'on' : ''}`} id="favBtn" aria-label="Add to favourites" aria-pressed={fav} onClick={toggleFav}><Icon name="heart" /></button>
            <Link to="/#contact" className="circle-btn ring" aria-label="Help"><Icon name="help" /></Link>
            <button className="circle-btn" aria-label="Share" onClick={share}><Icon name="share" /></button>
          </div>
        </div>

        {/* Therapist profile */}
        <section className="card profile-card">
          <div className="profile-head">
            <Photo src={photoUrl(t.photo)} alt={t.name} className="p-photo" label={photoLabel(t.photo)}>
              <span className="online-dot" />
            </Photo>
            <div className="p-info">
              <h1>{t.name}</h1>
              <p className="p-role">{t.speciality} Therapist</p>
              <p className="p-rating"><i>★</i> <b>{t.rating}</b> <span>({t.reviews} reviews)</span></p>
              <div className="p-meta">
                <div><small><Icon name="award" />Experience</small><b>{t.experience}</b></div>
                <div><small><Icon name="sparkle" />Specializes in</small><b>{t.specializes}</b></div>
                <div><small><Icon name="languages" />Languages</small><b>{t.languages}</b></div>
              </div>
            </div>
          </div>
          <div className="about">
            <h3>About {t.name}</h3>
            <p ref={aboutRef} className={aboutOpen ? '' : 'clamp'}>{t.about}</p>
            {aboutLong && <button className="read-more" type="button" onClick={() => setAboutOpen((o) => !o)}>{aboutOpen ? 'Show less' : 'Read more'}</button>}
          </div>
        </section>

        <form noValidate onSubmit={(e) => e.preventDefault()}>
          {/* 1. Service, Date & Time */}
          <section className="card step">
            <h2 className="step-title"><span>1</span>Service, Date &amp; Time</h2>
            <div className="stay-tabs">
              {(['Home Stay', 'Hotel Stay'] as Stay[]).map((s) => (
                <button key={s} type="button" className={`type-tab ${stay === s ? 'active' : ''}`} onClick={() => setStay(s)}>
                  <Icon name={s === 'Home Stay' ? 'homeDoor' : 'hotel'} />
                  <b>{s}</b><small>{s === 'Home Stay' ? 'We come to your home' : 'Service at your hotel'}</small>
                </button>
              ))}
            </div>

            <div className="time-head">
              <label className="lbl-icon" htmlFor="date"><Icon name="clock" />Preferred Time <em>*</em></label>
              <label className="date-pill">
                <Icon name="calendar" />
                <input type="date" id="date" required aria-label="Date" value={date} min={minDate} max={maxDate}
                  onChange={(e) => { setDate(e.target.value); setTime(''); }} />
              </label>
            </div>

            {/* PHOTO (optional notice banner, e.g. holiday closure): public/assets/images/notice-banner.jpg */}
            {bannerOk && <img src="/assets/images/notice-banner.jpg" alt="" className="notice-banner" onError={() => setBannerOk(false)} />}

            <div className="slots" ref={slotsRef}>
              {slots.every((s) => s.disabled)
                ? <p className="slots-empty">No slots left for this day. Please pick another date.</p>
                : slots.map((s) => (
                  <button key={s.label} type="button" className={`slot ${time === s.label ? 'on' : ''}`} disabled={s.disabled}
                    onClick={() => { setTime(s.label); setErrors((e) => ({ ...e, time: false })); }}>{s.label}</button>
                ))}
            </div>
            <p className={`field-error ${errors.time ? 'show' : ''}`}>Please choose a time slot.</p>
          </section>

          {/* 2. Address & Contact */}
          <section className="card step">
            <h2 className="step-title"><span>2</span>Address &amp; Contact</h2>
            <label className="lbl" htmlFor="address">{hotel ? 'Hotel Name & Address' : 'Full Address'}</label>
            <div className="row-2 addr-row">
              <input ref={fieldRefs.address} className={`inp ${errors.address ? 'err' : ''}`} id="address" required autoComplete="street-address"
                placeholder={hotel ? 'Hotel name, area...' : 'Apartment, street...'} value={address}
                onChange={(e) => { setAddress(e.target.value); setErrors((x) => ({ ...x, address: false })); }} />
              <button type="button" className={`outline-btn ${locating ? 'loading' : ''}`} onClick={locateMe}>
                <Icon name="pin" /><span>{locating ? 'Locating...' : 'Use Location'}</span>
              </button>
            </div>
            <p className={`field-error ${errors.address ? 'show' : ''}`}>Please enter your address.</p>

            <label className="lbl">Exact Location (Optional, but helps the therapist find you)</label>
            <MapPicker pin={pin} zoom={pinZoom} onPick={(ll) => { setPin(ll); setPinZoom(undefined); }} />
            <p className={`hint ${pin ? 'ok' : ''}`}>{pin ? `Pin dropped at ${pin[0].toFixed(5)}, ${pin[1].toFixed(5)}` : 'Tap the map to drop a pin at the exact spot'}</p>

            <label className="lbl" htmlFor="landmark">Landmark (Optional)</label>
            <input className="inp" id="landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} />

            <div className="row-2">
              <div>
                <label className="lbl" htmlFor="mobile">Mobile Number</label>
                <input ref={fieldRefs.mobile} className={`inp ${errors.mobile ? 'err' : ''}`} id="mobile" type="tel" inputMode="numeric" maxLength={10}
                  required autoComplete="tel-national" value={mobile}
                  onChange={(e) => { setMobile(e.target.value.replace(/\D/g, '').slice(0, 10)); setErrors((x) => ({ ...x, mobile: false })); }} />
                <p className={`field-error ${errors.mobile ? 'show' : ''}`}>Enter a valid 10-digit number.</p>
              </div>
              <div>
                <label className="lbl" htmlFor="fullName">Full Name</label>
                <input ref={fieldRefs.name} className={`inp ${errors.name ? 'err' : ''}`} id="fullName" required autoComplete="name" value={name}
                  onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: false })); }} />
                <p className={`field-error ${errors.name ? 'show' : ''}`}>Please enter your name.</p>
              </div>
            </div>

            <div className="row-2">
              <div>
                <label className="lbl" htmlFor="flat">{hotel ? 'Room No. (Optional)' : 'Flat/House No. (Optional)'}</label>
                <input className="inp" id="flat" value={flat} onChange={(e) => setFlat(e.target.value)} />
              </div>
              <div>
                <label className="lbl" htmlFor="floor">Floor (Optional)</label>
                <select className="inp" id="floor" value={floor} onChange={(e) => setFloor(e.target.value)}>
                  <option value="">Select floor</option>
                  {FLOORS.map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>

            <label className="lbl" htmlFor="referral">Have an offer or referral code? (Optional)</label>
            <div className="row-2 addr-row">
              <input className="inp upper" id="referral" placeholder="ENTER CODE" value={codeInput} onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCode(codeInput); } }} />
              <button type="button" className={`outline-btn muted ${codeInput.trim() ? 'ready' : ''}`} onClick={() => applyCode(codeInput)}>
                <Icon name="tag" /><span>Apply</span>
              </button>
            </div>
            {codeMsg && <p className={`hint ${codeMsg.ok ? 'ok' : 'bad'}`}>{codeMsg.text}</p>}
          </section>

          {/* 3. Payment Method */}
          <section className="card step">
            <h2 className="step-title"><span>3</span>Payment Method</h2>
            <label className="pay-opt" ref={payRef}>
              <input type="radio" name="pay" value="online" checked={pay === 'online'} onChange={() => setPay('online')} />
              <span className="pay-icon"><Icon name="card" /></span>
              <span className="pay-text">
                <b>Pay Online <em className="rec">Recommended</em></b>
                <small>Pay the treatment + {rupee(VISIT_CHARGE)} visiting/travel charge now – secure, instant confirmation via UPI, card or netbanking.</small>
              </span>
              <span className="radio" />
            </label>
            <label className="pay-opt">
              <input type="radio" name="pay" value="cod" checked={pay === 'cod'} onChange={() => setPay('cod')} />
              <span className="pay-icon"><Icon name="cash" /></span>
              <span className="pay-text">
                <b>Cash on Delivery</b>
                <small>Pay a {rupee(VISIT_CHARGE)} visiting charge online now to confirm; pay the treatment amount in cash when the therapist arrives.</small>
              </span>
              <span className="radio" />
            </label>
            <p className={`secure-note ${pay ? 'show' : ''}`}>
              <Icon name="shield" />
              <span>{pay === 'cod'
                ? `The ${rupee(VISIT_CHARGE)} visiting charge is processed securely via ${gatewayName}; the therapist collects the treatment amount in person.`
                : `Payments are processed securely via ${gatewayName}.`}</span>
            </p>
          </section>

          {/* 4. Bill Details */}
          <section className="card step">
            <h2 className="step-title"><span>4</span>Bill Details</h2>
            {!pay && <p className="hint">Choose a payment method above to see your bill.</p>}
            {pay === 'online' && <>
              <div className="bill-row"><span>Treatment Amount</span><b>{rupee(t.price)}</b></div>
              {discount > 0 && <div className="bill-row discount"><span>Offer ({code})</span><b>−{rupee(discount)}</b></div>}
              <div className="bill-row"><span>Visiting / Travel Charge</span><b>{rupee(VISIT_CHARGE)}</b></div>
              <div className="bill-row total"><span>Total Payable</span><b>{rupee(treatment + VISIT_CHARGE)}</b></div>
              <div className="pay-now"><span><small>PAY NOW</small><b>{rupee(treatment + VISIT_CHARGE)}</b></span><span>{rupee(treatment)} + {rupee(VISIT_CHARGE)} visiting charge</span></div>
            </>}
            {pay === 'cod' && <>
              <div className="bill-row"><span>Treatment Amount (Cash on Delivery)</span><b>{rupee(t.price)}</b></div>
              {discount > 0 && <div className="bill-row discount"><span>Offer ({code})</span><b>−{rupee(discount)}</b></div>}
              <div className="bill-row"><span>Visiting / Travel Charge (Pay Online Now)</span><b>{rupee(VISIT_CHARGE)}</b></div>
              <div className="bill-row total"><span>Total Payable</span><b>{rupee(treatment + VISIT_CHARGE)}</b></div>
              <p className="bill-note">Pay the {rupee(VISIT_CHARGE)} visiting charge online now to confirm your booking. The remaining {rupee(treatment)} treatment amount is paid in cash to the therapist at the time of service.</p>
              <div className="pay-now"><span><small>PAY NOW</small><b>{rupee(VISIT_CHARGE)}</b></span><span>{rupee(treatment)} + {rupee(VISIT_CHARGE)} = {rupee(treatment + VISIT_CHARGE)} total</span></div>
            </>}
          </section>
        </form>
      </main>

      {/* Sticky checkout bar */}
      <div className="checkout-bar">
        <div className="cb-left">
          {!pay && <span className="hint">Select a payment method</span>}
          {pay === 'online' && <><b>{rupee(treatment + VISIT_CHARGE)}</b><small>incl. {rupee(VISIT_CHARGE)} visiting charge · {when}</small></>}
          {pay === 'cod' && <><b>{rupee(VISIT_CHARGE)}</b><small>Pay {rupee(VISIT_CHARGE)} now · {rupee(treatment)} after service</small></>}
        </div>
        <button className={`btn btn-primary cb-btn ${paying ? 'loading' : ''}`} type="button" disabled={paying} onClick={onPay}>
          {paying ? 'Please wait…' : <>{pay === 'online' ? 'Pay Online' : pay === 'cod' ? 'Pay Visiting Charge' : 'Continue'} <span>→</span></>}
        </button>
      </div>

      {upi && upiOpen && <UpiPay payment={upi} onClose={() => setUpiOpen(false)} />}
    </>
  );
}
