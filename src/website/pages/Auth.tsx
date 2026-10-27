import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LotusMark } from '../components/Logo';
import { useCatalog } from '../lib/catalog';
import { cityLabel, useDetectedCity } from '../lib/location';
import { savedCity } from '../lib/storage';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBodyClass, useTitle } from '../lib/hooks';
import '../../styles/auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Where to go after logging in: ?next=/page (same-site paths only), else home. */
function useNext() {
  const [params] = useSearchParams();
  const next = params.get('next') || '';
  // Only plain same-site paths. Block "//x", "/\x" (browsers read both as another website) and "x:" schemes.
  return /^\/(?![/\\])[^:\\]*$/.test(next) ? next : '/';
}

function AuthLayout({ title, side, children }: { title: string; side: string; children: ReactNode }) {
  useBodyClass('auth-page');
  useTitle(title);
  const [bgOk, setBgOk] = useState(true);
  return (
    <main className="container auth-wrap">
      <div className="auth-card">
        <aside className="auth-side">
          {/* PHOTO: public/assets/images/login-bg.jpg */}
          {bgOk && <img src="/assets/images/login-bg.jpg" alt="" className="auth-side-bg" onError={() => setBgOk(false)} />}
          <div className="auth-side-inner">
            <div className="f-brand">
              <LotusMark className="f-logo" />
              <div><b>AAPNA SPA</b><small>RELAX • REJUVENATE • RENEW</small></div>
            </div>
            <p className="eyebrow light"><span className="line" />{side === 'login' ? 'MEMBER ACCESS' : 'NEW MEMBER'}</p>
            <h2 className="side-title">{side === 'login' ? 'Welcome back.' : 'Join the circle.'}</h2>
            <ul className="side-points">
              <li><span><Icon name="calendar" /></span><div><b>All your bookings in one place</b><small>Track upcoming sessions and rebook a favourite in a tap.</small></div></li>
              <li><span><Icon name="tag" /></span><div><b>Member-only offers</b><small>Exclusive pricing and seasonal wellness deals.</small></div></li>
              <li><span><Icon name="shield" /></span><div><b>Private and secure</b><small>Your details stay encrypted and are never shared.</small></div></li>
            </ul>
            <p className="side-foot">Certified therapists, at your home or hotel — daily, 10 AM to 10 PM.</p>
          </div>
        </aside>
        <section className="auth-form-side">{children}</section>
      </div>
    </main>
  );
}

function PasswordInput({ id, value, onChange, error, autoComplete, placeholder }: {
  id: string; value: string; onChange: (v: string) => void; error?: string; autoComplete: string; placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input className={`inp ${error ? 'err' : ''}`} id={id} type={show ? 'text' : 'password'} placeholder={placeholder}
        autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className={`pw-toggle ${show ? 'on' : ''}`} aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}>
        <Icon name="eye" />
      </button>
    </div>
  );
}

const FieldError = ({ msg }: { msg?: string }) => <p className={`field-error ${msg ? 'show' : ''}`}>{msg}</p>;

function CityChip({ loc }: { loc: ReturnType<typeof useDetectedCity> }) {
  return (
    <div className={`city-chip ${loc.status}`} aria-live="polite">
      <Icon name="pin" />
      {loc.status === 'found' && <span>Your city: <b>{cityLabel(loc.city, loc.state)}</b></span>}
      {(loc.status === 'idle' || loc.status === 'asking') && <span>Detecting your city… please allow location</span>}
      {(loc.status === 'denied' || loc.status === 'failed' || loc.status === 'unsupported') && (
        <span>{loc.message}{loc.status !== 'unsupported' && <> <button type="button" onClick={loc.retry}>Try again</button></>}</span>
      )}
    </div>
  );
}

export function Login() {
  const { user, refresh, logout } = useAuth();
  const { BUSINESS_WHATSAPP } = useCatalog();
  const loc = useDetectedCity();
  const city = loc.status === 'found' ? loc.city : '';
  const navigate = useNavigate();
  const next = useNext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) errs.email = 'Please enter a valid email address.';
    if (!password) errs.password = 'Please enter your password.';
    setErrors(errs); setAlert(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api.login(email.trim(), password, city);
      if (loc.status === 'found') savedCity.set(cityLabel(loc.city, loc.state));
      await refresh();
      navigate(next);
    } catch (err) {
      setAlert({ text: (err as Error).message });
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Log In – AAPNA SPA" side="login">
      {user ? (
        <div className="signed-in">
          <span className="auth-icon"><Icon name="user" /></span>
          <h1>Hi, {user.name.split(' ')[0]}</h1>
          <p className="auth-sub">{user.email}</p>
          <Link to="/book-now" className="btn btn-dark block">Book a Session</Link>
          <button type="button" className="btn btn-outline block" onClick={() => logout()}>Log Out</button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <span className="auth-icon"><Icon name="logIn" /></span>
          <h1>Log In</h1>
          <p className="auth-sub">Welcome back to AAPNA SPA</p>
          <CityChip loc={loc} />
          {alert && <div className={`form-alert ${alert.ok ? 'ok' : ''}`} role="alert">{alert.text}</div>}

          <label className="lbl" htmlFor="email">Email Address</label>
          <input className={`inp ${errors.email ? 'err' : ''}`} id="email" type="email" placeholder="you@example.com" autoComplete="email"
            value={email} onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: '' })); }} />
          <FieldError msg={errors.email} />

          <label className="lbl" htmlFor="password">Password</label>
          <PasswordInput id="password" value={password} placeholder="••••••••" autoComplete="current-password" error={errors.password}
            onChange={(v) => { setPassword(v); setErrors((x) => ({ ...x, password: '' })); }} />
          <FieldError msg={errors.password} />

          <button type="submit" className="btn btn-dark block submit-btn" disabled={busy}>{busy ? 'Please wait…' : 'Log In'}</button>
          <div className="or"><span>OR</span></div>
          <p className="auth-links main">New here? <Link to={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></p>
          <p className="auth-links">Are you a therapist? <a href={`https://wa.me/${BUSINESS_WHATSAPP}?text=` + encodeURIComponent("Hi, I'm a therapist and need partner login access.")} target="_blank" rel="noopener">Log in here</a></p>
          <p className="auth-links">Are you a hotel? <a href={`https://wa.me/${BUSINESS_WHATSAPP}?text=` + encodeURIComponent("Hi, we're a hotel and need partner login access.")} target="_blank" rel="noopener">Log in here</a></p>
        </form>
      )}
    </AuthLayout>
  );
}

export function Signup() {
  const { refresh } = useAuth();
  const loc = useDetectedCity();
  const city = loc.status === 'found' ? loc.city : '';
  const navigate = useNavigate();
  const next = useNext();
  const [f, setF] = useState({ name: '', email: '', mobile: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((x) => ({ ...x, [k]: '' })); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (f.name.trim().length < 2) errs.name = 'Please enter your full name.';
    if (!EMAIL_RE.test(f.email.trim())) errs.email = 'Please enter a valid email address.';
    if (f.mobile && !/^[6-9]\d{9}$/.test(f.mobile)) errs.mobile = 'Enter a valid 10-digit mobile number.';
    if (f.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    setErrors(errs); setAlert('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api.signup({ name: f.name.trim(), email: f.email.trim(), mobile: f.mobile.trim(), password: f.password, city });
      if (loc.status === 'found') savedCity.set(cityLabel(loc.city, loc.state));
      await refresh();
      navigate(next);
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.field) setErrors({ [e2.field]: e2.message }); else setAlert(e2.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Create Account – AAPNA SPA" side="signup">
      <form className="auth-form" onSubmit={submit} noValidate>
        <span className="auth-icon"><Icon name="userPlus" /></span>
        <h1>Create Account</h1>
        <p className="auth-sub">Join AAPNA SPA in under a minute</p>
        <CityChip loc={loc} />
        {alert && <div className="form-alert" role="alert">{alert}</div>}

        <label className="lbl" htmlFor="name">Full Name</label>
        <input className={`inp ${errors.name ? 'err' : ''}`} id="name" placeholder="Your name" autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} />
        <FieldError msg={errors.name} />

        <label className="lbl" htmlFor="email">Email Address</label>
        <input className={`inp ${errors.email ? 'err' : ''}`} id="email" type="email" placeholder="you@example.com" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        <FieldError msg={errors.email} />

        <label className="lbl" htmlFor="mobile">Mobile Number (Optional)</label>
        <input className={`inp ${errors.mobile ? 'err' : ''}`} id="mobile" type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit number" autoComplete="tel-national"
          value={f.mobile} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))} />
        <FieldError msg={errors.mobile} />

        <label className="lbl" htmlFor="password">Password</label>
        <PasswordInput id="password" value={f.password} placeholder="At least 8 characters" autoComplete="new-password" error={errors.password} onChange={(v) => set('password', v)} />
        <FieldError msg={errors.password} />

        <button type="submit" className="btn btn-dark block submit-btn" disabled={busy}>{busy ? 'Please wait…' : 'Create Account'}</button>
        <div className="or"><span>OR</span></div>
        <p className="auth-links main">Already have an account? <Link to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Log in</Link></p>
      </form>
    </AuthLayout>
  );
}
