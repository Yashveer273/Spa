import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { copyText, useBodyClass, useTitle } from '../lib/hooks';
import { savedOffer } from '../lib/storage';
import type { Offer } from '../../../shared/catalog';
import { useCatalog } from '../lib/catalog';
import '../../styles/offers.css';

const badge = (o: Offer) => (o.kind === 'percent' ? `${o.value}% OFF` : `₹${o.value} OFF`);

export default function Offers() {
  useTitle('Offers – AAPNA SPA');
  useBodyClass('offers-page');
  const toast = useToast();
  const { OFFERS } = useCatalog();
  const navigate = useNavigate();
  const [copied, setCopied] = useState('');
  const visible = OFFERS.filter((o) => !o.hidden);

  // Copying or picking an offer remembers it; the checkout applies it automatically
  const copy = async (code: string) => {
    savedOffer.set(code); // remember first, so checkout applies it even if copying is blocked
    setCopied(code);
    toast(`${code} copied – it will be applied at checkout`);
    window.setTimeout(() => setCopied((c) => (c === code ? '' : c)), 1800);
    await copyText(code, null);
  };
  const book = (code: string) => { savedOffer.set(code); navigate('/book-now'); };

  return (
    <main className="container offers-wrap">
      <section className="offers-hero">
        <svg className="hero-spark" viewBox="0 0 120 120" aria-hidden="true">
          <path d="M50 10 58 52 100 60 58 68 50 110 42 68 0 60 42 52Z" />
          <path d="M96 8v28M82 22h28" />
        </svg>
        <p className="eyebrow-sm">SAVINGS</p>
        <h1>Offers</h1>
        <p className="lead-light">Seasonal spa savings, member perks, and wellness bundles for your next session.</p>
        <Link to="/book-now" className="btn btn-primary block" onClick={() => { if (visible[0]) savedOffer.set(visible[0].code); }}>Book with Offer</Link>
      </section>

      <section className="offer-list" aria-label="Available offers">
        {!visible.length && <p className="offers-empty">No offers right now – check back soon!</p>}
        {visible.map((o, i) => (
          <article key={o.code} className="deal" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="deal-top">
              <span className="deal-icon"><Icon name="tag" /></span>
              <span className="deal-badge">{badge(o)}</span>
            </div>
            <h2>{o.title}</h2>
            <p>{o.desc}</p>
            <div className="code-box">
              <small>Use code</small>
              <b className="allow-copy">{o.code}</b>
              <button type="button" className={`copy-btn ${copied === o.code ? 'done' : ''}`} onClick={() => copy(o.code)}>
                <Icon name={copied === o.code ? 'check' : 'copy'} />{copied === o.code ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button type="button" className="use-btn" onClick={() => book(o.code)}>BOOK WITH THIS OFFER <span>→</span></button>
          </article>
        ))}
      </section>
    </main>
  );
}
