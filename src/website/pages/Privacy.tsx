import { useBodyClass, useTitle } from '../lib/hooks';
import { useCatalog } from '../lib/catalog';
import { showPhone } from '../../../shared/catalog';
import { BRAND } from '../components/Logo';
import '../../styles/policy.css';

const UPDATED = 'October 2026';

/** Privacy Policy. Contact details at the end come from Admin → Contact. */
export default function Privacy() {
  useTitle(`Privacy Policy – ${BRAND}`);
  useBodyClass('policy-page');
  const { CONTACT } = useCatalog();
  const contactLine = CONTACT.email
    ? <>email us at <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></>
    : CONTACT.whatsapp
      ? <>message us on <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener">WhatsApp ({showPhone(CONTACT.whatsapp)})</a></>
      : <>contact us through the website</>;

  return (
    <main className="container policy-wrap">
      <section className="policy-hero">
        <svg className="policy-shield" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></svg>
        <h1>Privacy Policy</h1>
        <p>Your privacy matters to us. Here's how {BRAND} collects, uses and protects your information.</p>
      </section>

      <article className="policy-card">
        <p className="policy-date">Last updated: {UPDATED}</p>

        <h2>1. Information We Collect</h2>
        <p>
          We collect the details you give us when you create an account, book a session or contact us – such as your name,
          mobile number, email address, home or hotel address, preferred date and time, and any offer code you use.
          If you allow it, we use your device's location to detect your city, and you can drop a pin on the map to help the
          therapist find your address. We only keep the city name and the pin you choose – not your continuous location.
        </p>

        <h2>2. How We Use Your Information</h2>
        <p>
          We use your information to confirm and manage your bookings, send a therapist to the right place at the right time,
          take payments, run your account, answer your questions and improve our service. We may contact you about your
          bookings (for example, a reminder to complete a pending payment) and, if you sign up for our newsletter, about offers.
        </p>

        <h2>3. Sharing of Information</h2>
        <p>
          We share only what is needed to provide your service – such as your name, address and contact number – with the
          therapist assigned to your booking. We do not sell your personal information. Trusted service providers who help us run
          {' '}{BRAND} (website hosting, our database, and our payment partner Cashfree) process data on our behalf and must keep it
          confidential. Card and UPI details are entered on Cashfree's secure page and are never stored by us.
        </p>

        <h2>4. Cookies &amp; Tracking</h2>
        <p>
          We use a small number of cookies and similar browser storage to keep you logged in, remember your city, favourites
          and chosen offer, and keep the site working smoothly. We do not use advertising trackers. You can clear or block
          cookies in your browser settings, but some features (like staying logged in) may stop working.
        </p>

        <h2>5. Data Security</h2>
        <p>
          We take reasonable technical and organisational measures to protect your information from unauthorised access, loss
          or misuse – for example, passwords are stored only in encrypted (hashed) form and the website uses secure connections.
          However, no method of transmission over the internet is completely secure, and we cannot guarantee absolute security.
        </p>

        <h2>6. Data Retention</h2>
        <p>
          We keep your information for as long as needed to provide our services, meet legal and accounting obligations,
          resolve disputes and enforce our agreements. When it is no longer needed, we delete it or make it anonymous.
        </p>

        <h2>7. Your Rights</h2>
        <p>
          You can ask to see, correct or delete the personal information we hold about you by contacting us. You can also stop
          sharing your location at any time from your browser settings, and unsubscribe from our newsletter whenever you like.
        </p>

        <h2>8. Children's Privacy</h2>
        <p>
          Our services are meant for adults aged 18 and over. We do not knowingly collect personal information from anyone
          under 18. If you believe a minor has shared information with us, please contact us and we will remove it.
        </p>

        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time to reflect changes in our services or legal requirements. The
          "Last updated" date above shows when it last changed. Continuing to use {BRAND} after changes are posted means you
          accept the updated policy.
        </p>

        <h2>10. Contact Us</h2>
        <p>If you have any questions about this Privacy Policy or how your data is handled, please {contactLine}.</p>
      </article>
    </main>
  );
}
