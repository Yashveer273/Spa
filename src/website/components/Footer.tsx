import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { BRAND, LotusMark } from './Logo';
import { useCatalog } from '../lib/catalog';
import { showPhone } from '../../../shared/catalog';
import { useToast } from './Toast';
import { api } from '../lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POLICIES = ['Privacy Policy', 'Terms & Conditions', 'Refund Policy', 'Inappropriate Requests Policy'];
const POLICY_PAGES: Record<string, string> = { 'Privacy Policy': '/privacy-policy', 'Refund Policy': '/refund-policy',
  'Inappropriate Requests Policy': '/policy-against-inappropriate-requests',
  'Terms & Conditions': '/terms-and-conditions',
}; // others: coming soon
const TREATMENTS = ['Swedish Massage', 'Deep Tissue', 'Aromatherapy', 'Hot Stone Therapy', 'Thai Massage', 'Foot Reflexology'];

export function Footer() {
  const { CONTACT } = useCatalog();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Newsletter → saved in MongoDB (shows up live on the admin dashboard)
  const subscribe = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setMsg('Please enter a valid email address.'); return; }
    setBusy(true);
    try {
      const r = await api.subscribe(email.trim());
      setMsg(r.already ? "You're already subscribed – thank you!" : 'Thanks for subscribing!');
      setEmail('');
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <div className="f-brand">
            <LotusMark className="f-logo" />
            <div><b>{BRAND}</b><small>RELAX • REJUVENATE • RENEW</small></div>
          </div>
          <p>Premium spa experiences delivered to your home or hotel in Indore since 2016.</p>
          <div className="f-socials">
            {CONTACT.instagram && <a href={`https://www.instagram.com/${CONTACT.instagram}`} className="f-social" aria-label="Instagram" target="_blank" rel="noopener"><Icon name="instagram" /></a>}
            {CONTACT.whatsapp && <a href={`https://wa.me/${CONTACT.whatsapp}`} className="f-social" aria-label="WhatsApp" target="_blank" rel="noopener"><Icon name="whatsapp" /></a>}
          </div>
        </div>
        <div>
          <h5>Quick Links</h5>
          <Link to="/">Home</Link><Link to="/#services">Services</Link><Link to="/#massages">Massages</Link>
          <Link to="/offers">Membership</Link><Link to="/#why">About</Link><Link to="/#contact">Contact</Link>
        </div>
        <div>
          <h5>Treatments</h5>
          {TREATMENTS.map((t) => <Link key={t} to="/book-now">{t}</Link>)}
        </div>
        <div>
          <h5>Contact</h5>
          {CONTACT.phone && <a className="f-row" href={`tel:+${CONTACT.phone}`}><Icon name="phone" />{showPhone(CONTACT.phone)}</a>}
          {CONTACT.email && <a className="f-row" href={`mailto:${CONTACT.email}`}><Icon name="mail" />{CONTACT.email}</a>}
          {CONTACT.address && <p className="f-row"><Icon name="pin" />{CONTACT.address}</p>}
          {CONTACT.hours && <p className="f-row"><Icon name="clock" />{CONTACT.hours}</p>}
          <p className="f-small">Get wellness tips in your inbox</p>
          <form className="newsletter" onSubmit={subscribe} noValidate>
            <input type="email" placeholder="your@email.com" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" disabled={busy}>Join</button>
          </form>
          <p className="f-small newsletter-msg" role="status">{msg}</p>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} {BRAND}. All rights reserved.</span>
        <nav>
          {POLICIES.map((p) => (POLICY_PAGES[p] ? (
            <Link key={p} to={POLICY_PAGES[p]}>{p === 'Terms & Conditions' ? 'Terms' : p}</Link>
          ) : (
            <a key={p} href="#" onClick={(e) => { e.preventDefault(); toast(`${p} page is coming soon`); }}>
              {p === 'Terms & Conditions' ? 'Terms' : p}
            </a>
          )))}
        </nav>
      </div>
    </footer>
  );
}
