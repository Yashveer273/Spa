import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { adminApi, rupee, SessionEnded, type AdminEvent, type Summary } from './api';
import { BookingsPanel } from './components/Bookings';
import { CustomersPanel, Feed, SubscribersPanel } from './components/Panels';
import { Analytics } from './components/Analytics';
import { LotusMark } from '../website/components/Logo';
import { ContactPanel, OffersPanel, TherapistsPanel } from './components/Catalog';

type Tab = 'bookings' | 'analytics' | 'therapists' | 'offers' | 'contact' | 'customers' | 'subscribers' | 'activity';
const TABS: Record<Tab, [string, string]> = {
  bookings: ['Bookings', 'Every booking, updated in real time.'],
  analytics: ['Analytics', 'How the business is doing – updates live as bookings come in.'],
  therapists: ['Therapists', 'Add or edit therapists, prices and photos – changes show on the website straight away.'],
  offers: ['Offers', 'Offer codes for the Offers page and checkout.'],
  contact: ['Contact', 'WhatsApp, phone, Instagram, email, address and hours shown on the website.'],
  customers: ['Customers', 'People who created an account on the website.'],
  subscribers: ['Subscribers', 'Newsletter sign-ups from the website footer.'],
  activity: ['Activity', 'Everything happening on the website, as it happens.'],
};
const NAV_ICONS: Record<Tab, ReactNode> = {
  bookings: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  analytics: <><path d="M3 3v18h18" /><path d="M7 16v-4M12 16V8M17 16v-7" /></>,
  therapists: <><circle cx="12" cy="7" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /><path d="m17 3 1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L14 5.3l2-.3z" /></>,
  offers: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  contact: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />,
  customers: <><circle cx="9" cy="8" r="4" /><path d="M1 21a8 8 0 0 1 16 0M16 4a4 4 0 0 1 0 8M23 21a8 8 0 0 0-5-7.4" /></>,
  subscribers: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
};
const BASE_TITLE = 'Admin – AAPNA SPA';

// ---------------- Login ----------------
function Login({ message, onDone }: { message: string; onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(message);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await adminApi.login(username.trim(), password); setPassword(''); onDone(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <main className="login-view">
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="login-brand"><LotusMark className="brand-mark" />AAPNA SPA</div>
        <p className="login-tag">ADMIN DASHBOARD</p>
        <h1>Sign in</h1>
        <p className="login-sub">Bookings, customers and payments – live.</p>
        {error && <div className="alert" role="alert">{error}</div>}
        <label htmlFor="username">Username</label>
        <input id="username" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <a href="/" className="back-link">← Back to website</a>
      </form>
    </main>
  );
}

// ---------------- Sound for new bookings / payments ----------------
let audioCtx: AudioContext | null = null;
function ding() {
  try {
    audioCtx = audioCtx || new AudioContext();
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.frequency.value = 880; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.5);
  } catch { /* no audio */ }
}

// ---------------- Dashboard ----------------
function StatTile({ label, value, className = '', note }: { label: string; value: string | number | undefined; className?: string; note?: string }) {
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== undefined && prev.current !== value) { setBump(true); const t = window.setTimeout(() => setBump(false), 400); prev.current = value; return () => window.clearTimeout(t); }
    prev.current = value;
  }, [value]);
  return <div className={`stat ${className} ${bump ? 'bump' : ''}`}><small>{label}</small><b>{value ?? '–'}</b>{note && <em>{note}</em>}</div>;
}

function Dashboard({ onSessionEnd }: { onSessionEnd: (msg?: string) => void }) {
  const [tab, setTab] = useState<Tab>('bookings');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [highlight, setHighlight] = useState<string>();
  const [live, setLive] = useState<'' | 'on' | 'off'>('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toasts, setToasts] = useState<{ id: number; msg: string; err?: boolean }[]>([]);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('apkaspa:admin-sound') === '1'; } catch { return false; } });
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const toast = useCallback((msg: string, err = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, err }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  const onError = useCallback((e: unknown) => {
    if (e instanceof SessionEnded) onSessionEnd(e.message); else toast((e as Error).message, true);
  }, [onSessionEnd, toast]);

  // Summary + activity (reloaded whenever something happens)
  useEffect(() => { adminApi.summary().then(setSummary).catch(onError); }, [refreshKey, onError]);
  useEffect(() => { adminApi.events().then((r) => setEvents(r.events)).catch(onError); }, [onError]);

  // Real time: every saved change arrives here over Server-Sent Events
  useEffect(() => {
    let refreshTimer: number | undefined;
    let unseen = 0;
    const src = new EventSource('/api/admin/stream');
    let connectedBefore = false;
    src.onopen = () => {
      setLive('on');
      // After a reconnect (e.g. every ~55 s on Vercel), reload so nothing from the gap is missed
      if (connectedBefore) {
        setRefreshKey((k) => k + 1);
        adminApi.events().then((r) => setEvents(r.events)).catch(() => {});
      }
      connectedBefore = true;
    };
    src.onmessage = (msg) => {
      let e: AdminEvent;
      try { e = JSON.parse(msg.data) as AdminEvent; } catch { return; }
      setEvents((list) => [e, ...list].slice(0, 60));
      setHighlight(e._id);
      if (e.type !== 'status_change') toast(e.message);
      if (soundRef.current && ['booking_request', 'payment_success'].includes(e.type)) ding();
      if (document.hidden) { unseen++; document.title = `(${unseen}) ${BASE_TITLE}`; }
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => setRefreshKey((k) => k + 1), 300);
    };
    src.onerror = async () => {
      setLive('off');
      // If the admin session expired, go back to the login screen
      try { const me = await adminApi.me(); if (!me.admin) { src.close(); onSessionEnd('Your session ended. Please sign in again.'); } } catch { /* offline – EventSource retries */ }
    };
    const onVisible = () => { if (!document.hidden) { unseen = 0; document.title = BASE_TITLE; } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { src.close(); window.clearTimeout(refreshTimer); document.removeEventListener('visibilitychange', onVisible); };
  }, [toast, onSessionEnd]);

  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    try { localStorage.setItem('apkaspa:admin-sound', on ? '1' : '0'); } catch { /* ignore */ }
    if (on) ding();
  };
  const logout = async () => { try { await adminApi.logout(); } catch { /* ignore */ } onSessionEnd(); };
  const noFeed = tab === 'activity' || tab === 'analytics' || tab === 'therapists' || tab === 'offers' || tab === 'contact';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-brand"><LotusMark className="brand-mark" />AAPNA SPA<small>Admin</small></div>
        <nav className="side-nav">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{NAV_ICONS[t]}</svg>{TABS[t][0]}
              {t === 'bookings' && summary && summary.requests > 0 && <span className="badge">{summary.requests}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <a href="/" target="_blank" rel="noopener">View website ↗</a>
          <button className="link" onClick={logout}>Log out</button>
        </div>
      </aside>

      <main className="main">
        <header className="topline">
          <div><h1>{TABS[tab][0]}</h1><p className="muted">{TABS[tab][1]}</p></div>
          <div className="top-actions">
            <button className="chip" aria-pressed={sound} title="Play a sound for new bookings" onClick={toggleSound}>{sound ? '🔔 Sound on' : '🔕 Sound off'}</button>
            <span className={`live ${live}`}><i /><b>{live === 'on' ? 'Live' : live === 'off' ? 'Reconnecting…' : 'Connecting…'}</b></span>
            <button className="chip mobile-only" onClick={logout}>Log out</button>
          </div>
        </header>

        <section className="stats">
          <StatTile label="Bookings today" value={summary?.today} />
          <StatTile label="New requests" value={summary?.requests} className="warn" note="waiting for you" />
          <StatTile label="Upcoming sessions" value={summary?.upcoming} />
          <StatTile label="Paid online" value={summary ? rupee(summary.revenue) : undefined} className="money" />
          <StatTile label="Total bookings" value={summary?.total} />
          <StatTile label="Customers" value={summary?.customers} />
          <StatTile label="Subscribers" value={summary?.subscribers} />
        </section>

        <div className={`layout ${noFeed ? 'no-feed' : ''}`}>
          <div className="panel-wrap">
            {tab === 'bookings' && <BookingsPanel refreshKey={refreshKey} onError={onError} toast={toast} />}
            {tab === 'analytics' && <Analytics refreshKey={refreshKey} onError={onError} />}
            {tab === 'therapists' && <TherapistsPanel refreshKey={refreshKey} onError={onError} toast={toast} />}
            {tab === 'offers' && <OffersPanel refreshKey={refreshKey} onError={onError} toast={toast} />}
            {tab === 'contact' && <ContactPanel refreshKey={refreshKey} onError={onError} toast={toast} />}
            {tab === 'customers' && <CustomersPanel refreshKey={refreshKey} onError={onError} />}
            {tab === 'subscribers' && <SubscribersPanel refreshKey={refreshKey} onError={onError} toast={toast} />}
            {tab === 'activity' && <section className="panel"><Feed events={events} highlight={highlight} big /></section>}
          </div>
          {!noFeed && (
            <aside className="panel feed-side">
              <h2>Live activity</h2>
              <Feed events={events} highlight={highlight} />
            </aside>
          )}
        </div>
      </main>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>{t.msg}</div>)}
      </div>
    </div>
  );
}

// ---------------- App: login or dashboard ----------------
export default function AdminApp() {
  const [state, setState] = useState<'loading' | 'login' | 'app'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    adminApi.me().then((me) => {
      if (!me.enabled) { setMessage('Admin login is turned off. Set ADMIN_PASSWORD (10+ characters) in the .env file and restart the server.'); setState('login'); }
      else setState(me.admin ? 'app' : 'login');
    }).catch((e: Error) => {
      // Show the server's own explanation when it gives one (e.g. a missing Vercel setting)
      const generic = !e.message || /^Request failed|Failed to fetch|NetworkError|JSON/i.test(e.message);
      setMessage(generic
        ? 'Could not reach the server. Check that it is running – on Vercel, open /api/health to see what is wrong.'
        : e.message);
      setState('login');
    });
  }, []);

  const endSession = useCallback((msg = '') => { setMessage(msg); setState('login'); }, []);

  if (state === 'loading') return null;
  if (state === 'login') return <Login key={message} message={message} onDone={() => { setMessage(''); setState('app'); }} />;
  return <Dashboard onSessionEnd={endSession} />;
}
