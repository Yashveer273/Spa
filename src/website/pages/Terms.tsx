import type { ReactNode } from 'react';
import { useBodyClass, useTitle } from '../lib/hooks';
import { useCatalog } from '../lib/catalog';
import { showPhone } from '../../../shared/catalog';
import { BRAND } from '../components/Logo';
import '../../styles/policy.css';

const UPDATED = 'October 2026';
const B = 'Aapna Spa';

// Part 1 – general terms
const GENERAL: [string, string][] = [
  ['Acceptance of Terms', `By accessing or booking a service through ${B}'s website or app, you agree to be bound by these Terms & Conditions. If you do not agree with any part of these terms, please do not use our services.`],
  ['Our Services', `${B} provides at-home, in-hotel and studio massage and wellness services delivered by certified therapists. Service availability, pricing and duration are subject to change and will be confirmed at the time of booking.`],
  ['Bookings & Scheduling', 'Bookings can be made through our website or app by providing accurate contact, address and scheduling details. We reserve the right to reschedule or decline a booking due to therapist availability, safety concerns or incomplete information. You will be notified promptly of any changes.'],
  ['Cancellations & Rescheduling', `You may cancel or reschedule a booking up to a reasonable time before your appointment as noted during checkout. Late cancellations or no-shows may be subject to a cancellation charge. ${B} may cancel a session due to therapist unavailability, in which case a full refund or reschedule will be offered.`],
  ['Payments', 'Prices listed are in Indian Rupees (INR) and are inclusive of applicable taxes unless stated otherwise. Payment may be collected online at the time of booking or directly with the therapist, depending on the option selected. Membership plans renew and are billed as described at the time of purchase.'],
  ['Client Conduct & Safety', `Our therapists are trained professionals and are entitled to a safe, respectful environment. ${B} maintains a zero-tolerance policy toward inappropriate behaviour, harassment or unsafe conditions, and reserves the right to terminate a session immediately without refund if such conduct occurs.`],
  ['Health Disclosures', `Clients are responsible for disclosing relevant health conditions, injuries, allergies or pregnancy status prior to a session so that therapists can provide safe and appropriate care. ${B} is not liable for complications arising from undisclosed health conditions.`],
  ['Limitation of Liability', `${B} strives to provide safe, professional services but is not liable for indirect, incidental or consequential damages arising from the use of our services, to the fullest extent permitted by law.`],
  ['Changes to These Terms', 'We may update these Terms & Conditions from time to time to reflect changes in our services or legal requirements. Continued use of our services after changes are posted constitutes acceptance of the revised terms.'],
  ['Governing Law', 'These Terms are governed by the laws of India, and any disputes will be subject to the jurisdiction of the courts in Indore, Madhya Pradesh.'],
];

// Part 2 – customer terms
const CUSTOMER: [string, string][] = [
  ['Correct Information', 'Customers must provide their correct name, mobile number and exact/gate location at the time of booking. If the required information is not provided, the booking may be cancelled and the eligible amount will be refunded.'],
  ['Location Change', 'If the customer changes the location after booking, the new location will be verified for safety and service availability. The therapist will not visit an unsafe location.'],
  ['Therapist Safety', 'If more than two people are present at the location, or if the therapist feels uncomfortable or has a safety concern, she has the right to cancel the booking and leave.'],
  ['Misbehaviour', 'Any rude, inappropriate, abusive or harassing behaviour towards the therapist may result in immediate termination of the service.'],
  ['Intoxication', 'If the customer is intoxicated or behaves inappropriately, the booking may be immediately terminated and appropriate legal action may be taken as per applicable law.'],
  ['Therapist Rejection', "If the therapist reaches the customer's location and the customer rejects the therapist, taxi/travel charges will be non-refundable."],
  ['Therapist Replacement', `If the selected therapist is unavailable or busy, the ${B} team may send another available therapist.`],
  ['No Therapist Exchange', `${B} provides professional therapy services only. Customers cannot request a therapist exchange based on looks, appearance, profile or personal preference.`],
  ['Refund Policy', 'If therapy is not provided due to a genuine safety concern or customer misconduct, the applicable service amount will be refunded as per the refund policy. Taxi/travel charges will remain non-refundable.'],
  ['Waiting Time', 'If the customer makes the therapist wait after arrival, a waiting charge of ₹500 per 30 minutes will apply.'],
  ['Customer Unavailable', 'If the customer remains unavailable after the applicable waiting period, the booking may be cancelled and the applicable amount may be non-refundable.'],
  ['Professional Behaviour', 'Customers must maintain respectful and professional behaviour throughout the therapy session.'],
  ['Service Duration', 'The therapy will be provided only for the duration booked by the customer.'],
  ['Additional Time', 'Requests for additional time will be accepted only subject to therapist availability and applicable additional charges.'],
  ['Service Limitation', `${B} provides professional wellness/therapy services only. Requests for any other type of service will not be accepted.`],
  ['Advance Payment', 'The required advance payment must be made by the customer at the time of booking to confirm the booking.'],
  ['Address Verification', 'Providing an incorrect, incomplete or misleading address may result in cancellation of the booking.'],
  ['Entry Access', 'The customer must provide safe and appropriate access to the therapist upon arrival.'],
  ['Third-Party Presence', 'If unnecessary third parties are present during the therapy session, the therapist may stop the service due to safety concerns.'],
  ['Safety First', `The safety of both the customer and therapist is ${B}'s priority. In case of any genuine safety concern, the service may be stopped or the booking may be cancelled immediately.`],
];

const Section = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
  <><h2>{n}. {title}</h2><p>{children}</p></>
);

/** Terms & Conditions: general terms + customer terms. The contact line comes from Admin → Contact. */
export default function Terms() {
  useTitle(`Terms & Conditions – ${BRAND}`);
  useBodyClass('policy-page');
  const { CONTACT } = useCatalog();
  const contact = CONTACT.email
    ? <>reach out to us at <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></>
    : CONTACT.whatsapp
      ? <>message us on <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noopener">WhatsApp ({showPhone(CONTACT.whatsapp)})</a></>
      : <>contact us through the website</>;

  return (
    <main className="container policy-wrap">
      <section className="policy-hero">
        <svg className="policy-shield" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h5M16 13H8M16 17H8M10 9H8" /></svg>
        <p className="policy-eyebrow">LEGAL</p>
        <h1>Terms &amp; Conditions</h1>
        <p>Please read these terms carefully before booking a session with {B}.</p>
      </section>

      <article className="policy-card">
        <p className="policy-date">Last updated: {UPDATED}</p>
        {GENERAL.map(([t, body], i) => <Section key={t} n={i + 1} title={t}>{body}</Section>)}
        <Section n={GENERAL.length + 1} title="Contact Us">For any questions about these Terms &amp; Conditions, {contact}.</Section>
      </article>

      <article className="policy-card" id="customer-terms">
        <h2 className="policy-part">{B} – Customer Terms &amp; Conditions</h2>
        {CUSTOMER.map(([t, body], i) => <Section key={t} n={i + 1} title={t}>{body}</Section>)}
      </article>
    </main>
  );
}
