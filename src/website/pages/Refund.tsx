import { useBodyClass, useTitle } from '../lib/hooks';
import { useCatalog } from '../lib/catalog';
import { showPhone } from '../../../shared/catalog';
import { BRAND } from '../components/Logo';
import '../../styles/policy.css';

const UPDATED = 'October 2026';
const BRAND_NAME = 'Aapna Spa';

/** Refund & Cancellation Policy. Support contact and hours come from Admin → Contact. */
export default function Refund() {
  useTitle(`Refund & Cancellation Policy – ${BRAND}`);
  useBodyClass('policy-page');
  const { CONTACT } = useCatalog();
  const hours = CONTACT.hours || 'Daily, 10:00 AM to 10:00 PM';

  return (
    <main className="container policy-wrap">
      <section className="policy-hero">
        <svg className="policy-shield" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
        <p className="policy-eyebrow">LEGAL</p>
        <h1>Refund &amp; Cancellation Policy</h1>
        <p>{BRAND_NAME} follows a transparent and customer-friendly refund policy to ensure a safe and reliable booking experience.</p>
      </section>

      <article className="policy-card">
        <p className="policy-date">Last updated: {UPDATED}</p>

        <h2>1. Service Unavailable</h2>
        <p>
          If a customer has successfully completed the booking and payment, but {BRAND_NAME} is unable to provide the booked
          service due to operational reasons, the customer will receive a 100% refund within 5–7 business days to the original
          payment method.
        </p>

        <h2>2. Customer Unavailable or Service Not Allowed</h2>
        <p>
          If our authorised service agent or therapist arrives at the booked location but the customer is unavailable, refuses
          entry, provides an incorrect address, or prevents the service from being delivered for any customer-related reason,
          the booking will be treated as a Customer Cancellation.
        </p>
        <p>
          In such cases, 20% to 30% of the total booking amount may be deducted to cover travel expenses, operational costs and
          service agent charges. The remaining amount will be refunded within 5–7 business days.
        </p>

        <h2>3. Booking Hours</h2>
        <p>{BRAND_NAME} operates {hours.replace(/^daily,?\s*/i, 'daily, ')}.</p>
        <p>
          Bookings made during operating hours will be processed for the same day, subject to availability. Bookings placed
          outside business hours may be scheduled for the next available date selected by the customer.
        </p>

        <h2>4. No Extra Payment to Therapist</h2>
        <p>
          Customers are requested not to make any additional cash or online payment directly to our service agent or therapist
          beyond the payment made through the official website. (For Cash on Delivery bookings, only the treatment amount shown
          on your booking is paid in cash at the time of service.)
        </p>
        <p>
          If a customer voluntarily makes any extra payment to the therapist or service agent, {BRAND_NAME} shall not be
          responsible or liable for such transactions.
        </p>

        <h2>5. Customer Support</h2>
        <p>For any booking, payment, refund or service-related queries, please contact us at:</p>
        {CONTACT.email && <p>Email: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></p>}
        {CONTACT.whatsapp && <p>WhatsApp: <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener">{showPhone(CONTACT.whatsapp)}</a></p>}
        {CONTACT.phone && <p>Phone: <a href={`tel:+${CONTACT.phone}`}>{showPhone(CONTACT.phone)}</a></p>}
        <p>Our support team will assist you as soon as possible.</p>

        <h2>6. Refund Processing</h2>
        <p>
          All approved refunds will be processed within 5–7 business days and credited to the original payment method used
          during booking.
        </p>
      </article>
    </main>
  );
}
