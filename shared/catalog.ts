// Typed access to the catalog (therapists, offers, prices).
// The live copy comes from the server (/api/catalog – editable in the admin); shared/catalog.json is the
// built-in starting copy. The server recalculates every price itself, so a customer can't change them.
import data from './catalog.json';

export type TherapistType = 'basic' | 'therapist' | 'premium';

export interface TherapistBase {
  key?: string;
  name: string;
  rating: number;
  reviews: number;
  speciality: string;
  price: number;
  /** Google Drive / https image address, or a file name in public/assets/images/therapists/ */
  photo: string;
  experience?: string;
  specializes?: string;
  languages?: string;
  about?: string;
  hidden?: boolean;
}
export interface Therapist extends Required<Omit<TherapistBase, 'hidden'>> {
  type: TherapistType;
  /** Stable id used in the page address (/therapist/:type/:id) */
  id: string;
}

export interface Offer {
  code: string;
  title: string;
  desc: string;
  kind: 'percent' | 'flat';
  value: number;
  max?: number;
  hidden?: boolean;
  disabled?: boolean;
}

/** Contact details (edited in Admin → Contact). Numbers are digits with country code, e.g. 919244092230. */
export interface Contact {
  whatsapp: string;
  phone: string;
  instagram: string;
  email: string;
  address: string;
  hours: string;
}

export interface CatalogData {
  visitCharge: number;
  businessWhatsapp: string;
  contact?: Partial<Contact>;
  therapistDefaults: { experience: string; specializes: string; languages: string; about: string };
  therapists: Record<TherapistType, TherapistBase[]>;
  offers: Offer[];
}

export const BUNDLED_CATALOG = data as CatalogData;
export const TYPES: TherapistType[] = ['basic', 'therapist', 'premium'];
export const PHOTO_DIR = '/assets/images/therapists/';

export const isTherapistType = (t: string): t is TherapistType => (TYPES as string[]).includes(t);

/** Stable id for a therapist. Same rule as keyOf() in backend/server.js. */
export const keyOf = (t: TherapistBase, i: number) =>
  t.key || String(t.photo || '').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9-]/gi, '') || String(i);

/** Image address for a therapist photo: uploaded (/api/photos/…) and Drive/https links as they are, file names from public/assets. */
export const photoUrl = (photo: string) => (/^(https?:\/\/|\/)/.test(photo) ? photo : photo ? PHOTO_DIR + photo : '');
export const photoLabel = (photo: string) =>
  (/^https?:\/\//.test(photo) ? 'photo link not public?' : photo.startsWith('/') ? 'photo' : 'therapists/' + (photo || 'no photo'));

/** Everything the pages need, built from one copy of the catalog. */
export function makeCatalog(c: CatalogData) {
  const offers = (c.offers || []).filter((o) => !o.disabled);
  const THERAPISTS = Object.fromEntries(TYPES.map((ty) => [ty,
    (c.therapists?.[ty] || []).map((t, i) => ({ ...t, key: keyOf(t, i) })).filter((t) => !t.hidden)])) as Record<TherapistType, (TherapistBase & { key: string })[]>;
  const all = (ty: TherapistType) => c.therapists?.[ty] || [];

  const CONTACT: Contact = {
    whatsapp: c.businessWhatsapp || '', phone: c.businessWhatsapp || '', instagram: '', email: '', address: '', hours: '',
    ...(c.contact || {}),
  };

  return {
    VISIT_CHARGE: c.visitCharge,
    BUSINESS_WHATSAPP: CONTACT.whatsapp,
    CONTACT,
    OFFERS: offers,
    THERAPISTS,
    /** Finds a therapist by its id (or by position, for old links like /therapist/basic/0). */
    getTherapist(type: string, id: string): Therapist | null {
      if (!isTherapistType(type)) return null;
      const list = all(type);
      const index = /^\d+$/.test(id) ? Number(id) : list.findIndex((t, i) => keyOf(t, i) === id);
      const base = list[index];
      if (!base || base.hidden) return null;
      return { ...c.therapistDefaults, ...base, type, id: keyOf(base, index) } as Therapist;
    },
    /** ₹ discount for an offer code on a given price (0 if the code isn't valid). Mirrors backend/server.js. */
    discountFor(code: string, price: number): number {
      const offer = offers.find((o) => o.code === String(code || '').trim().toUpperCase());
      if (!offer) return 0;
      let off = offer.kind === 'percent' ? Math.round((price * offer.value) / 100) : offer.value;
      if (offer.max) off = Math.min(off, offer.max);
      return Math.min(off, price);
    },
  };
}
export type Catalog = ReturnType<typeof makeCatalog>;

/** "919244092230" → "+91 92440 92230" for showing a phone number */
export function showPhone(digits: string): string {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return d ? '+' + d : '';
}
