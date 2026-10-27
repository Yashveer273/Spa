import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { useCatalog } from '../lib/catalog';
import { showPhone, type Contact } from '../../../shared/catalog';
import { Photo } from '../components/Photo';
import { useReveal, useTitle } from '../lib/hooks';

const OFFERINGS = [
  { title: 'Home Service', tag: 'We come to you', photo: 'home-service.webp', icon: 'home' as IconName, to: '/book-now#basic', cta: 'BOOK THIS SERVICE',
    text: 'Our certified therapists arrive at your door with everything — massage table, linens, premium oils, and complete expertise.' },
  { title: 'Hotel Service', tag: 'Perfect for your stay', photo: 'hotel-service.webp', icon: 'hotel' as IconName, to: '/book-now#basic', cta: 'BOOK THIS SERVICE',
    text: 'Visiting Indore? We come to you. Available at all major hotels — we turn your room into a private wellness sanctuary.' },
  { title: 'Book a Therapist', tag: 'Pick your favourite', photo: 'therapist.webp', icon: 'user' as IconName, to: '/book-now#therapist', cta: 'CHOOSE A THERAPIST',
    text: "Browse our certified therapists, compare ratings and specialties, and book the one who's right for you." },
];
const QUICK = [
  { title: 'Home Service', sub: 'We come to you', icon: 'homeDoor' as IconName, to: '/book-now#basic' },
  { title: 'Hotel Service', sub: 'Perfect for your stay', icon: 'building' as IconName, to: '/book-now#basic' },
  { title: 'Book a Therapist', sub: 'Pick your favourite', icon: 'users' as IconName, to: '/book-now#therapist' },
];
const MASSAGES = [
  { title: 'Full Body', text: 'Reduces stress & promotes relaxation.', photo: 'full-body.webp' },
  { title: 'Head, Neck & Shoulder', text: 'Relieves chronic pain & muscle tension.', photo: 'head-neck-shoulder.webp' },
  { title: 'Foot Reflexology', text: 'Targeted reflex-point pressure on feet that energises the whole body.', photo: 'foot-reflexology.webp', badge: 'BEST VALUE' },
];
// Contact cards come from Admin → Contact; a card is hidden while its detail is empty
function contactCards(c: Contact) {
  return [
    c.whatsapp && { label: 'WhatsApp', sub: 'Chat with us now', href: `https://wa.me/${c.whatsapp}`, icon: 'whatsapp' as IconName, bg: '#25d366', external: true },
    c.phone && { label: 'Call Now', sub: showPhone(c.phone), href: `tel:+${c.phone}`, icon: 'phone' as IconName, bg: '#b89a5a', external: false },
    c.instagram && { label: 'Instagram', sub: '@' + c.instagram, href: `https://www.instagram.com/${c.instagram}`, icon: 'instagram' as IconName, bg: 'linear-gradient(45deg,#f9a825,#e91e63,#8e24aa)', external: true },
    c.email && { label: 'Email', sub: c.email, href: `mailto:${c.email}`, icon: 'mail' as IconName, bg: '#3b82f6', external: false },
  ].filter(Boolean) as { label: string; sub: string; href: string; icon: IconName; bg: string; external: boolean }[];
}
const FEATURES = [
  { icon: 'shield' as IconName, title: 'Verified & Trained Therapists', text: 'Every therapist is background-verified, certified, and trained in multiple therapeutic disciplines.' },
  { icon: 'leaf' as IconName, title: 'Safe & Hygienic Service', text: 'Hospital-grade hygiene protocols, sanitised equipment, and single-use linens every session.' },
  { icon: 'refresh' as IconName, title: '24/7 Customer Support', text: "Round-the-clock assistance via call, WhatsApp, or chat. We're always here when you need us." },
  { icon: 'card' as IconName, title: 'Easy Booking & Secure Payment', text: 'Book in 60 seconds, pay securely, and receive instant confirmation — completely hassle-free.' },
];
const Swirl = () => <svg className="swirl" viewBox="0 0 200 200" aria-hidden="true"><path d="M20 180 C 60 40, 160 40, 120 120 S 40 160, 180 20" /></svg>;

export default function Home() {
  useTitle('AAPNA SPA – Spa & Massage at Home in Indore');
  const { CONTACT } = useCatalog();
  const page = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [videoMissing, setVideoMissing] = useState(false);
  useReveal(page);

  // Background video: always silent (React doesn't set the "muted" attribute reliably)
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = true; v.volume = 0;
    const keepMuted = () => { v.muted = true; };
    v.addEventListener('volumechange', keepMuted);
    if (v.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) setVideoMissing(true);
    return () => v.removeEventListener('volumechange', keepMuted);
  }, []);

  const scrollCards = (dir: number) => {
    const t = track.current;
    const card = t?.querySelector<HTMLElement>('.massage-card');
    if (t && card) t.scrollBy({ left: dir * (card.offsetWidth + 26), behavior: 'smooth' });
  };

  return (
    <main ref={page}>
      {/* ================= HERO ================= */}
      <section className="hero-wrap">
        <div className="container">
          <div className={`hero ${videoMissing ? 'missing-video' : ''}`}>
            {/* VIDEO: public/assets/videos/hero.mp4 (poster: public/assets/images/hero-poster.jpg) */}
            <video ref={video} className="hero-media" autoPlay muted loop playsInline poster="/assets/images/hero-poster.jpg">
              <source src="/assets/videos/hero.mp4" type="video/mp4" onError={() => setVideoMissing(true)} />
            </video>
            <div className="hero-shade" />
            <span className="ph-label hero-ph">assets/videos/hero.mp4</span>

            <div className="hero-content">
              <p className="eyebrow light"><span className="line" />RELAX · REJUVENATE · WELLNESS</p>
              <h1>Professional<br /><span>Spa &amp; Massage</span><br /><span>Service</span></h1>
              <p className="hero-hours m-only"><Icon name="clock" />Available Daily · 10 AM – 10 PM</p>
              <p className="hero-sub">Premium wellness delivered to your home or hotel in Indore. Certified therapists, spa-grade oils, and everything set up for you.</p>
              <div className="hero-cta">
                <Link to="/book-now" className="btn btn-primary">
                  <span className="d-only">Book Your Session</span><span className="m-only">Book Now</span> <span className="btn-arrow">→</span>
                </Link>
                <Link to="/#massages" className="btn btn-ghost"><Icon name="sparkle" />View Treatments</Link>
              </div>
            </div>

            <div className="hero-strip">
              <span><Icon name="shield" />Certified &amp; verified therapists</span>
              <span><Icon name="home" />At your home or hotel</span>
              <span><Icon name="clock" />Daily, 10 AM – 10 PM</span>
            </div>
          </div>
        </div>
      </section>

      {/* ================= OFFERINGS ================= */}
      <section className="section" id="services">
        <div className="container">
          <div className="section-head split">
            <div>
              <p className="eyebrow"><span className="line" />OUR OFFERINGS</p>
              <h2>Designed around<br /><span>your comfort</span></h2>
            </div>
            <p className="lead">Choose how and where you experience our signature treatments — we bring the entire spa to you.</p>
          </div>

          {/* Phone layout: compact quick actions (the photo cards below show on tablet/desktop) */}
          <nav className="quick-actions m-only" aria-label="Book a service">
            {QUICK.map((q) => (
              <Link key={q.title} to={q.to}><span className="qa-icon"><Icon name={q.icon} /></span><b>{q.title}</b><small>{q.sub}</small></Link>
            ))}
          </nav>

          {/* Banner photos (public/assets/images/*-service.webp, therapist.webp) already carry the title and logo */}
          <div className="grid-3 offer-banners">
            {OFFERINGS.map((o) => (
              <article key={o.title} className="offer-card banner reveal">
                <Link to={o.to} aria-label={o.title}>
                  <Photo src={`/assets/images/${o.photo}`} alt={`${o.title} – ${o.tag}`} className="offer-media" />
                </Link>
                <div className="offer-body">
                  <h3>{o.title}</h3>
                  <p>{o.text}</p>
                  <Link to={o.to} className="link-cta">{o.cta} <span>→</span></Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ================= MASSAGES ================= */}
      <section className="section" id="massages">
        <div className="container">
          <div className="m-card">
            <div className="section-head split center-y">
              <div>
                <p className="eyebrow"><span className="line" />SIGNATURE TREATMENTS</p>
                <h2><span className="d-only">Our most loved<br /><span>massages</span></span><span className="m-only m-title">Popular Massages</span></h2>
              </div>
              <div className="head-actions">
                <button className="round-btn" aria-label="Previous" onClick={() => scrollCards(-1)}>←</button>
                <button className="round-btn" aria-label="Next" onClick={() => scrollCards(1)}>→</button>
                <Link to="/book-now" className="btn btn-white view-all"><span className="d-only">View Full Menu</span><span className="m-only">View All</span> <span>→</span></Link>
              </div>
            </div>

            <div className="carousel" ref={track}>
              {MASSAGES.map((m) => (
                <article key={m.title} className="massage-card reveal">
                  {/* Banner photo (public/assets/images/<photo>) – carries its own title, so only the badge sits on top */}
                  <Photo src={`/assets/images/${m.photo}`} alt={`${m.title} massage`} className="massage-media banner">
                    {m.badge && <span className="badge">{m.badge}</span>}
                  </Photo>
                  <div className="massage-body">
                    <h3>{m.title}</h3>
                    <p>{m.text}</p>
                    <Link to="/book-now" className="btn btn-dark block">Book Session <span>→</span></Link>
                    <p className="m-dur"><Icon name="clock" />45 Min</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= CONTACT ================= */}
      <section className="section" id="contact">
        <div className="container">
          <div className="contact-box">
            <Swirl />
            <div className="contact-text">
              <p className="eyebrow light"><span className="line" />GET IN TOUCH</p>
              <h2 className="light">Questions? We're<br />one tap away.</h2>
              <p>Reach us on whichever channel suits you — our team replies through the day, every day, 10 AM to 10 PM.</p>
            </div>
            <div className="contact-grid">
              {contactCards(CONTACT).map((c) => (
                <a key={c.label} className="contact-tile" href={c.href} {...(c.external ? { target: '_blank', rel: 'noopener' } : {})}>
                  <span className="ci" style={{ background: c.bg }}><Icon name={c.icon} /></span>
                  <span><b>{c.label}</b><small>{c.sub}</small></span><i>↗</i>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= WHY US ================= */}
      <section className="section" id="why">
        <div className="container">
          <div className="why-box">
            <div className="why-left">
              <Swirl />
              <p className="eyebrow light"><span className="line" />WHY AAPNA SPA</p>
              <h2 className="light">The standard of<br /><span>wellness excellence</span></h2>
              <p>We believe exceptional spa care should be accessible to everyone — brought directly to your comfort zone, with nothing for you to arrange.</p>
              <div className="hero-cta">
                <Link to="/#massages" className="btn btn-primary">Explore Treatments</Link>
                <Link to="/book-now" className="btn btn-ghost">Book Now</Link>
              </div>
              <div className="stats">
                <div><b>8+</b><small>Years of care</small></div>
                <div><b>50+</b><small>Treatments</small></div>
                <div><b>4.9★</b><small>Average rating</small></div>
              </div>
            </div>
            <div className="why-right">
              {FEATURES.map((f) => (
                <div key={f.title} className="feature">
                  <span className="fi"><Icon name={f.icon} /></span>
                  <h4>{f.title}</h4>
                  <p>{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      {/* Floating hint from the original site (hidden on phones) */}
      <div className="tap-hint" aria-hidden="true"><span>👆 बुक करने के लिए टैप करें</span><b>↓</b></div>
    </main>
  );
}
