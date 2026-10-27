import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { Photo } from '../components/Photo';
import { useBodyClass, useTitle } from '../lib/hooks';
import { isTherapistType, photoLabel, photoUrl, type TherapistType } from '../../../shared/catalog';
import { useCatalog } from '../lib/catalog';
import '../../styles/book.css';

const TABS: { type: TherapistType; title: string; sub: string; icon: IconName }[] = [
  { type: 'basic', title: 'Basic Therapist', sub: 'Single therapist at your service', icon: 'sprout' },
  { type: 'therapist', title: 'Therapist', sub: 'Choose your favourite therapist', icon: 'user' },
  { type: 'premium', title: 'Premium Therapist', sub: 'A team of therapists for complete care', icon: 'users' },
];

export default function BookNow() {
  useTitle('Choose Booking Type – AAPNA SPA');
  useBodyClass('book-page');
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { THERAPISTS, ready, CONTACT } = useCatalog();
  // The open tab lives in the address (#basic / #therapist / #premium), so links can open a tab directly
  const hashType = hash.slice(1);
  const type: TherapistType = isTherapistType(hashType) ? hashType : 'basic';
  useEffect(() => { if (!isTherapistType(hashType)) navigate('/book-now#basic', { replace: true }); }, [hashType, navigate]);

  return (
    <main className="book-wrap">
      <div className="book-top">
        <Link to="/" className="circle-btn" aria-label="Back"><Icon name="arrowLeft" /></Link>
        <Link to="/#contact" className="circle-btn ring" aria-label="Help"><Icon name="help" /></Link>
      </div>

      <h1 className="book-title">Choose Booking Type</h1>
      <p className="book-sub">Select the type of service that suits your needs</p>

      <div className="type-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.type} className={`type-tab ${t.type === type ? 'active' : ''}`} role="tab" aria-selected={t.type === type}
            onClick={() => navigate(`/book-now#${t.type}`, { replace: true })}>
            <Icon name={t.icon} /><b>{t.title}</b><small>{t.sub}</small>
          </button>
        ))}
      </div>

      <h2 className="fav-title">Your Favourite Therapists</h2>

      <div className="therapist-grid" key={type}>
        {ready && !THERAPISTS[type].length && <p className="book-sub">No therapists listed here right now – please check another type.</p>}
        {THERAPISTS[type].map((t, i) => (
          <Link key={t.key} to={`/therapist/${type}/${t.key}`} className="t-card" style={{ animationDelay: `${i * 40}ms` }}>
            {/* PHOTO: Google Drive link set in the admin, or public/assets/images/therapists/<photo> */}
            <Photo src={photoUrl(t.photo)} alt={t.name} className="t-photo" label={photoLabel(t.photo)} />
            <p className="t-status">Available</p>
            <h3 className="t-name">{t.name}</h3>
            <p className="t-rating"><i>★</i> {t.rating} ({t.reviews})</p>
            <div className="t-foot">
              <span className="t-tag">{t.speciality}</span>
              <span className="t-price">₹{t.price}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="member-bar">
        <span className="crown"><Icon name="crown" /></span>
        <div className="marquee"><span>Become a Premium Member &nbsp;·&nbsp; Unlock exclusive offers &amp; savings &nbsp;&nbsp;&nbsp; Become a Premium Member &nbsp;·&nbsp; Unlock exclusive offers &amp; savings</span></div>
        {CONTACT.whatsapp && <a href={`https://wa.me/${CONTACT.whatsapp}`} className="mini-btn" aria-label="WhatsApp" target="_blank" rel="noopener"><Icon name="whatsapp" /></a>}
        {CONTACT.phone && <a href={`tel:+${CONTACT.phone}`} className="mini-btn" aria-label="Call"><Icon name="phone" /></a>}
        <Link to="/offers" className="join-btn">Join Now <span>→</span></Link>
      </div>

      <div className="fav-card">
        <span className="heart"><Icon name="heart" /></span>
        <div>
          <b>Your Favourite, Our Priority</b>
          <p>Quickly book your favourite therapist and enjoy personalized care.</p>
        </div>
      </div>
    </main>
  );
}
