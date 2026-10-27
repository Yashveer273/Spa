import { useBodyClass, useTitle } from '../lib/hooks';
import { BRAND } from '../components/Logo';
import '../../styles/policy.css';

const UPDATED = 'October 2026';
const BRAND_NAME = 'Aapna Spa';

/** Policy Against Inappropriate Requests (zero tolerance). */
export default function InappropriatePolicy() {
  useTitle(`Policy Against Inappropriate Requests – ${BRAND}`);
  useBodyClass('policy-page');

  return (
    <main className="container policy-wrap">
      <section className="policy-hero">
        <svg className="policy-shield" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="M12 8v4M12 16h.01" /></svg>
        <p className="policy-eyebrow">LEGAL</p>
        <h1>Policy Against Inappropriate Requests</h1>
        <p>{BRAND_NAME} is committed to providing safe, professional and lawful services for every customer and therapist.</p>
      </section>

      <article className="policy-card">
        <p className="policy-date">Last updated: {UPDATED}</p>
        <p>{BRAND_NAME} provides professional spa and wellness services only.</p>
        <p>
          If a customer requests any illegal, inappropriate, unethical or out-of-scope service at the time of booking, before
          the service or during the service, our support team and therapists will immediately refuse such requests.
        </p>
        <p>
          In such cases, {BRAND_NAME} reserves the right to cancel the booking without prior notice and to temporarily or
          permanently suspend the customer's account.
        </p>
        <p>
          Similarly, if any authorised therapist or service agent is found participating in any illegal, unethical, prohibited
          or policy-violating activity, {BRAND_NAME} reserves the right to immediately deactivate the therapist's account,
          terminate future bookings and take appropriate legal action where required.
        </p>
        <p>
          {BRAND_NAME} follows a strict Zero Tolerance Policy against any illegal, unethical or prohibited activities and is
          committed to providing safe, professional and lawful services.
        </p>
      </article>
    </main>
  );
}
