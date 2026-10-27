import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { BRAND, LotusMark } from './Logo';
import { useToast } from './Toast';
import { useAuth } from '../lib/auth';
import { useEscape } from '../lib/hooks';
import { getDeviceId, savedCity } from '../lib/storage';
import { api, type AppNotification } from '../lib/api';
import { UpiPay, type UpiPayment } from './UpiPay';
import { rupee } from '../lib/format';
import { cityLabel, cleanTypedCity, detectCity } from '../lib/location';

// Which notifications this browser has already seen ("Mark all read")
const READ_KEY = 'apkaspa:notif-read';
const readIds = (): string[] => { try { return JSON.parse(localStorage.getItem(READ_KEY) || '[]') as string[]; } catch { return []; } };
const slotLabel = (n: AppNotification) => {
  const d = n.date ? new Date(n.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  return [d, n.time].filter(Boolean).join(' at ');
};

// ---- Menu items (edit links here). Legal pages with no link yet show "coming soon". ----
const MAIN: [string, string, IconName][] = [
  ['Home', '/', 'homeDoor'],
  ['Bookings', '/bookings', 'calendarDots'],
  ['Book Now', '/book-now', 'lotus'],
  ['Offers', '/offers', 'tag'],
  ['Profile', '/login', 'user'],
  ['Contact', '/#contact', 'chat'],
  ['About Us', '/#why', 'building'],
];
// Legal pages that exist (others still show "coming soon")
const LEGAL_PAGES: Record<string, string> = { 'Privacy Policy': '/privacy-policy', 'Refund & Cancellation': '/refund-policy',
  'Inappropriate Requests Policy': '/policy-against-inappropriate-requests',
  'Terms & Conditions': '/terms-and-conditions',
};
const LEGAL: [string, IconName][] = [
  ['Careers', 'briefcase'],
  ['Terms & Conditions', 'file'],
  ['Privacy Policy', 'shield'],
  ['Refund & Cancellation', 'undo'],
  ['Disclaimer', 'warn'],
  ['Inappropriate Requests Policy', 'shieldAlert'],
];

export function Header() {
  const toast = useToast();
  const { user } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [pop, setPop] = useState<'notif' | 'city' | null>(null);
  // The customer's city as "City, State" (detected from their location or typed), kept in this browser
  const [city, setCity] = useState(() => savedCity.get() || '');
  const cityChosen = Boolean(city);
  const [cityName, cityState] = city.split(/,\s*/);
  // Logged-in customer on a new device: start from the city detected at login / sign-up.
  // A city chosen in this browser always wins, so a later pick isn't overwritten on the next page.
  useEffect(() => { if (user?.city && !savedCity.get()) { setCity(user.city); savedCity.set(user.city); } }, [user?.city]);
  const [hidden, setHidden] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  const [avatarOk, setAvatarOk] = useState(true);
  const lastY = useRef(0);
  const [notes, setNotes] = useState<AppNotification[]>([]);
  const [seen, setSeen] = useState<string[]>(readIds);
  const [payingId, setPayingId] = useState('');

  // Logged-in customers: bookings still waiting for payment (checked again when the bell opens or the tab returns)
  const loadNotes = useCallback(() => {
    if (!user) { setNotes([]); return; }
    api.notifications().then((r) => setNotes(r.notifications)).catch(() => { /* keep what we have */ });
  }, [user]);
  useEffect(() => {
    loadNotes();
    const onVisible = () => { if (!document.hidden) loadNotes(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadNotes]);
  useEffect(() => { if (pop === 'notif') loadNotes(); }, [pop, loadNotes]);
  const unread = notes.filter((n) => !seen.includes(n.id)).length;
  const markAllRead = () => {
    const ids = [...new Set([...seen, ...notes.map((n) => n.id)])].slice(-200);
    setSeen(ids);
    try { localStorage.setItem(READ_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
  };
  // "Pay now": show the UPI QR again for the same booking and amount
  const [upi, setUpi] = useState<UpiPayment | null>(null);
  const payNow = async (n: AppNotification) => {
    setPayingId(n.bookingId);
    try {
      const r = await api.resumePayment(n.bookingId, getDeviceId());
      if (r.status === 'payment_submitted') toast('Your payment proof is being verified ✓');
      else if (r.status === 'paid') toast('This booking is already paid 🎉');
      else if (r.upiId && r.amount !== undefined) { setPop(null); setUpi({ bookingId: r.bookingId, amount: r.amount, upiId: r.upiId, payeeName: r.payeeName || 'AAPNA SPA' }); }
      else toast('This booking cannot be paid online. Please contact us on WhatsApp.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setPayingId('');
      loadNotes();
    }
  };

  const closeAll = useCallback(() => { setDrawer(false); setPop(null); }, []);
  useEscape(drawer || pop !== null, closeAll);

  // Lock page scroll while the menu is open
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawer]);

  // Close popovers on any outside click
  useEffect(() => {
    if (!pop) return;
    const h = () => setPop(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [pop]);

  // Dissolve while scrolling down, come back when scrolling up
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < 80 || drawer || pop) setHidden(false);
        else if (y > lastY.current + 4) setHidden(true);
        else if (y < lastY.current - 4) setHidden(false);
        if (Math.abs(y - lastY.current) > 4) lastY.current = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [drawer, pop]);

  const togglePop = (e: MouseEvent, which: 'notif' | 'city') => {
    e.stopPropagation();
    setPop((p) => (p === which ? null : which));
  };
  const pickCity = (c: string) => {
    setCity(c); savedCity.set(c); setPop(null);
    toast(`Showing services in ${c.split(',')[0]}`);
  };
  // Typing a city by hand, optionally with the state: "navi mumbai, maharashtra" → "Navi Mumbai, Maharashtra"
  const [typedCity, setTypedCity] = useState('');
  const [typedErr, setTypedErr] = useState('');
  const submitTypedCity = (e: FormEvent) => {
    e.preventDefault();
    const c = cleanTypedCity(typedCity);
    if (!c) { setTypedErr('Please type a city name, e.g. "Pune" or "Pune, Maharashtra".'); return; }
    setTypedCity(''); setTypedErr('');
    pickCity(c);
  };
  // "Use my current location": the browser asks for permission, then we look up the city
  const [locating, setLocating] = useState(false);
  const [locateMsg, setLocateMsg] = useState('');
  const useMyLocation = useCallback(async () => {
    setLocating(true); setLocateMsg('');
    const r = await detectCity();
    setLocating(false);
    if (r.status === 'found') pickCity(cityLabel(r.city, r.state));
    else setLocateMsg(r.message);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // First time the picker opens with no city chosen yet: ask straight away
  const askedOnce = useRef(false);
  useEffect(() => {
    if (pop === 'city' && !cityChosen && !askedOnce.current) { askedOnce.current = true; useMyLocation(); }
  }, [pop, cityChosen, useMyLocation]);

  return (
    <>
      <header className={`topbar ${hidden ? 'hd-hidden' : ''}`} onFocus={() => setHidden(false)}>
        <div className="container topbar-inner">
          <Link to="/login" className="avatar" aria-label="Profile">
            {/* PHOTO: public/assets/images/avatar.jpg */}
            {avatarOk && <img src="/assets/images/avatar.jpg" alt="" onError={() => setAvatarOk(false)} />}
          </Link>

          <Link to="/" className="brand">
            {/* LOGO: the AAPNA SPA lotus (components/Logo.tsx). Put a photo logo at public/assets/images/logo.png to use that instead. */}
            {logoOk ? <img src="/assets/images/logo.png" alt="" className="brand-icon" onError={() => setLogoOk(false)} /> : <LotusMark className="brand-lotus" />}
            <span>{BRAND}</span>
          </Link>

          <div className="topbar-actions">
            <button className={`icon-btn ${pop === 'notif' ? 'open' : ''}`} aria-label="Notifications" aria-haspopup="dialog"
              aria-expanded={pop === 'notif'} onClick={(e) => togglePop(e, 'notif')}>
              <Icon name="bell" />
              {unread > 0 && <span className="bell-dot" aria-label={`${unread} new`}>{unread}</span>}
            </button>
            <button className="icon-btn" id="menuBtn" aria-label="Menu" onClick={(e) => { e.stopPropagation(); setPop(null); setDrawer(true); }}>
              <Icon name="menu" />
            </button>
            <button className={`city-pill ${pop === 'city' ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={pop === 'city'}
              onClick={(e) => togglePop(e, 'city')}>
              <Icon name="pin" /> {cityName || 'Choose city'} <Icon name="chevronDown" className="chev" />
            </button>
          </div>

          {pop === 'notif' && (
            <div className="hd-pop notif" role="dialog" aria-label="Notifications" onClick={(e) => e.stopPropagation()}>
              <div className="notif-head">
                <span className="notif-bell"><Icon name="bell" /></span>
                <div><b>Notifications</b><small>Booking and payment updates</small></div>
                <span className="notif-count">{unread} new</span>
              </div>
              {unread > 0 && (
                <div className="notif-actions"><button type="button" className="notif-read" onClick={markAllRead}><Icon name="check" /> Mark all read</button></div>
              )}
              <div className="notif-body">
                {notes.map((n) => (
                  <article key={n.id} className={`notif-item ${seen.includes(n.id) ? '' : 'unread'}`}>
                    <span className={`notif-ic ${n.type}`}><Icon name={n.type === 'payment_submitted' ? 'clock' : 'check'} /></span>
                    <div className="notif-text">
                      <div className="notif-top">
                        <b>{n.type === 'payment_verified' ? 'Payment verified 🎉' : n.type === 'payment_submitted' ? 'Payment submitted' : n.rejected ? 'Payment rejected' : 'Payment pending'}</b>
                        <span className="notif-id">#{n.bookingId.slice(-6)}</span>
                      </div>
                      <p>{n.type === 'payment_verified'
                        ? <>We received {rupee(n.amount || 0)} – your {n.speciality || n.therapist || 'session'} booking is confirmed.</>
                        : n.type === 'payment_submitted'
                          ? <>We're verifying your payment of {rupee(n.amount || 0)}{n.utr ? ` (UTR ${n.utr})` : ''}. You'll be notified here.</>
                          : n.rejected
                            ? <>We couldn't verify your last payment ({n.rejected}). Please pay again and upload the proof.</>
                            : <>Complete the payment for {n.speciality || n.therapist || 'your session'} to secure your slot.</>}</p>
                      <div className="notif-meta">
                        {slotLabel(n) && <span className="notif-when">{slotLabel(n)}</span>}
                        {n.type === 'payment_pending' && (
                          <button type="button" className="notif-pay" disabled={payingId === n.bookingId} onClick={() => payNow(n)}>
                            {payingId === n.bookingId ? 'Opening…' : <>Pay {rupee(n.amount || 0)} now →</>}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
                {!notes.length && <div className="notif-empty">
                  <span className="notif-ring"><span><Icon name="bell" /></span></span>
                  <b>No notifications yet</b>
                  <p>{user ? 'Book a session to start receiving booking and payment updates here.' : 'Log in or book a session to start receiving updates here.'}</p>
                </div>}
              </div>
              <div className="notif-foot"><Link to="/bookings" className="btn btn-dark block" onClick={() => setPop(null)}>View all bookings</Link></div>
            </div>
          )}

          {pop === 'city' && (
            <div className="hd-pop city" role="listbox" aria-label="Choose your city" onClick={(e) => e.stopPropagation()}>
              <p className="city-head">CHOOSE YOUR CITY</p>
              <button type="button" className="city-opt city-locate" onClick={useMyLocation} disabled={locating}>
                <span><Icon name="pin" />{locating ? 'Finding your location…' : 'Use my current location'}</span>
              </button>
              <form className="city-type" onSubmit={submitTypedCity}>
                <input value={typedCity} onChange={(e) => { setTypedCity(e.target.value); setTypedErr(''); }} placeholder="Or type your city, state" aria-label="Type your city and state" maxLength={60} />
                <button type="submit" disabled={!typedCity.trim()}>Set</button>
              </form>
              {typedErr && <p className="city-err" role="alert">{typedErr}</p>}
              {cityChosen && (
                <div className="city-opt on city-current" role="option" aria-selected="true">
                  <span><b>{cityName}</b>{cityState && <small>{cityState}</small>}</span><Icon name="check" />
                </div>
              )}
              {locateMsg
                ? <p className="city-note">{locateMsg} You can also type your city above.</p>
                : !cityChosen && !locating && <p className="city-note">Allow location to detect your city, or type the city you'd like service in.</p>}
            </div>
          )}
        </div>
      </header>

      {/* Side menu */}
      <div className={`hd-overlay ${drawer ? 'show' : ''}`} hidden={!drawer} onClick={() => setDrawer(false)} />
      <aside className={`hd-drawer ${drawer ? 'open' : ''}`} aria-label="Menu" aria-hidden={!drawer}>
        <div className="hd-drawer-head">
          <span>MENU</span>
          <button type="button" className="hd-x" aria-label="Close menu" onClick={() => setDrawer(false)}><Icon name="close" /></button>
        </div>
        <nav className="hd-main">
          {MAIN.map(([label, to, icon]) => (
            <NavLink key={label} to={to} end className={({ isActive }) => `hd-item ${isActive && label !== 'Profile' && !to.includes('#') ? 'current' : ''}`}
              onClick={() => setDrawer(false)}>
              <Icon name={icon} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="hd-section">LEGAL &amp; POLICIES</p>
        <nav className="hd-legal">
          {LEGAL.map(([label, icon]) => (LEGAL_PAGES[label] ? (
            <Link key={label} to={LEGAL_PAGES[label]} className="hd-item sm" onClick={() => setDrawer(false)}>
              <Icon name={icon} /><span>{label}</span>
            </Link>
          ) : (
            <button key={label} type="button" className="hd-item sm" onClick={() => toast(`${label} page is coming soon`)}>
              <Icon name={icon} /><span>{label}</span>
            </button>
          )))}
        </nav>
      </aside>
      {upi && <UpiPay payment={upi} onClose={() => { setUpi(null); loadNotes(); }} />}
    </>
  );
}
