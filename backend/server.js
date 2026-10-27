// ============================================================
// AAPNA SPA website server
// - Serves the React website and admin dashboard built into dist/ (npm run build)
// - Stores everything in MongoDB (see db.js): accounts, bookings, newsletter, activity
// - Creates Razorpay orders (amount is calculated here, never trusted from the browser)
// - Verifies Razorpay payment signatures
// - Pushes every new event to open admin dashboards in real time (Server-Sent Events)
//
// Run:   node backend/server.js        (then open http://localhost:5500 and http://localhost:5500/admin)
// Setup: copy .env.example to .env (MongoDB address, admin password, Razorpay keys)
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./db');

const ROOT = path.join(__dirname, '..'); // the project folder (backend/ lives inside it)
const DATA_DIR = path.join(ROOT, 'data');
const DIST = path.join(ROOT, 'dist'); // built React apps (npm run build)
const CATALOG_FILE = path.join(ROOT, 'shared', 'catalog.json'); // therapists, offers, prices – shared with the website

// ---------- .env loader (no packages needed) ----------
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
const PORT = Number(process.env.PORT) || 5500;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/apkaspa';
const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || ''; // Razorpay → Settings → Webhooks
const RAZORPAY_ENABLED = Boolean(KEY_ID && KEY_SECRET);
// Cashfree (Payment Gateway → Developers → API Keys). CASHFREE_ENV=production for live keys, otherwise sandbox.
const CF_APP_ID = process.env.CASHFREE_APP_ID || '';
const CF_SECRET = process.env.CASHFREE_SECRET_KEY || '';
const CF_LIVE = String(process.env.CASHFREE_ENV || '').toLowerCase() === 'production';
const CASHFREE_ENABLED = Boolean(CF_APP_ID && CF_SECRET);
// New bookings are paid by UPI QR (business UPI ID in Admin → Contact). The Cashfree / Razorpay keys above are
// only used to finish bookings that were already started with them (return page, webhooks, Pay now).
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_ENABLED = ADMIN_PASSWORD.length >= 10;

const { col, toId } = store;

// ---------- Catalog: therapists, offers & prices ----------
// Stored in MongoDB (collection "settings", document "catalog") so the admin can edit it.
// On first run it is copied from shared/catalog.json. The server always prices bookings from here.
const TYPES = ['basic', 'therapist', 'premium'];
const CATALOG_ID = 'catalog';
// Stable id for a therapist (used in page addresses). Same rule as keyOf() in shared/catalog.ts.
const keyOf = (t, i) => t.key || String(t.photo || '').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9-]/gi, '') || String(i);

async function readCatalog() {
  const found = await col('settings').findOne({ _id: CATALOG_ID });
  if (found) return found;
  const c = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  const seed = {
    _id: CATALOG_ID, visitCharge: c.visitCharge, businessWhatsapp: c.businessWhatsapp, therapistDefaults: c.therapistDefaults,
    therapists: Object.fromEntries(TYPES.map((ty) => [ty, (c.therapists[ty] || []).map((t, i) => ({ ...t, key: keyOf(t, i) }))])),
    offers: c.offers, contact: c.contact, updatedAt: new Date(),
  };
  try { await col('settings').insertOne(seed); } catch (e) { if (e.code !== 11000) throw e; } // another copy seeded it first
  return col('settings').findOne({ _id: CATALOG_ID });
}

async function loadCatalog() {
  const c = await readCatalog();
  const offers = (c.offers || []).filter((o) => !o.disabled);
  return {
    VISIT_CHARGE: c.visitCharge,
    getTherapist(type, id) {
      const list = c.therapists?.[type] || [];
      const sid = String(id);
      const base = /^\d+$/.test(sid) ? list[Number(sid)] : list.find((t, i) => keyOf(t, i) === sid); // numbers = old links
      return base && !base.hidden ? { ...c.therapistDefaults, ...base } : null;
    },
    // Same rule as discountFor() in shared/catalog.ts
    discountFor(code, price) {
      const offer = offers.find((o) => o.code === String(code || '').trim().toUpperCase());
      if (!offer) return 0;
      let off = offer.kind === 'percent' ? Math.round((price * offer.value) / 100) : offer.value;
      if (offer.max) off = Math.min(off, offer.max);
      return Math.min(off, price);
    },
  };
}

/** What the website needs: visible therapists and active offers. */
async function publicCatalog() {
  const c = await readCatalog();
  return {
    visitCharge: c.visitCharge, businessWhatsapp: contactOf(c).whatsapp || c.businessWhatsapp,
    // Only the display fields go to the public website – never the UPI IDs (they're used server-side)
    contact: (({ whatsapp, phone, instagram, email, address, hours }) => ({ whatsapp, phone, instagram, email, address, hours }))(contactOf(c)),
    therapistDefaults: c.therapistDefaults,
    therapists: Object.fromEntries(TYPES.map((ty) => [ty, (c.therapists?.[ty] || [])
      .map((t, i) => ({ ...t, key: keyOf(t, i) })).filter((t) => !t.hidden)])),
    offers: (c.offers || []).filter((o) => !o.disabled),
  };
}

/**
 * Turns a Google Drive share link into a direct image address.
 * Accepts: drive.google.com/file/d/ID/view, …open?id=ID, …uc?id=ID, lh3.googleusercontent.com/d/ID,
 * any other https:// image address, or a file name in public/assets/images/therapists/.
 */
// Uploaded photos: allowed types, checked by their first bytes (not just the name)
const PHOTO_MAX = 3 * 1024 * 1024;
const PHOTO_TYPES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP',
};
const PHOTO_URL_RE = /^\/api\/photos\/([a-f0-9]{24})\.(jpg|png|webp)$/;

function normalizePhoto(input) {
  const v = String(input || '').trim();
  if (!v) return '';
  if (PHOTO_URL_RE.test(v)) return v; // uploaded in the admin
  if (/drive\.google\.com\/drive\/(u\/\d+\/)?folders\//.test(v)) throw new Error('That is a folder link. Open the photo itself in Google Drive and copy its link.');
  const drive = v.match(/(?:drive|docs)\.google\.com\/(?:file\/d\/|(?:open|uc)\?(?:[^#]*&)?id=)([\w-]{10,})/)
    || v.match(/googleusercontent\.com\/d\/([\w-]{10,})/);
  if (drive) return `https://lh3.googleusercontent.com/d/${drive[1]}`;
  if (/^https:\/\/[^\s"'<>]{4,490}$/.test(v)) return v;
  if (/^[\w.-]{1,80}\.(jpe?g|png|webp|gif|avif)$/i.test(v)) return v;
  throw new Error('Photo must be a Google Drive link (or an https:// image address).');
}

const num = (v, min, max, label, int = true) => {
  const n = Number(v);
  if (v === '' || v === null || !Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) {
    throw new Error(`${label} must be a ${int ? 'whole ' : ''}number from ${min} to ${max}.`);
  }
  return n;
};
const text = (v, max, label, required = false) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (required && !s) throw new Error(`${label} is required.`);
  if (s.length > max) throw new Error(`${label} must be at most ${max} characters.`);
  return s;
};

/**
 * Contact details shown on the website (WhatsApp, phone, Instagram, email, address, hours).
 * Edited in Admin → Contact. Anything left empty is hidden on the website.
 */
const DEFAULT_CONTACT = { whatsapp: '', phone: '', instagram: '', email: '', address: '', hours: '', upiAccounts: [], upiActive: 0 };
// Who the customer pays by UPI (shown on the QR) – the admin's chosen "active" UPI ID
const upiPayee = (c) => { const a = (c.upiAccounts || [])[c.upiActive] || {}; return { upiId: a.upiId || '', payeeName: a.upiName || 'AAPNA SPA' }; };
function contactOf(c) {
  // Not saved from the admin yet: use the starting values in shared/catalog.json
  let start = {};
  if (!c.contact) { try { start = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8')).contact || {}; } catch (e) { /* ignore */ } }
  const out = { ...DEFAULT_CONTACT, whatsapp: c.businessWhatsapp || '', phone: c.businessWhatsapp || '', ...start, ...(c.contact || {}) };
  // Older data had a single upiId/upiName – turn it into the one-item list
  if (!Array.isArray(out.upiAccounts) || !out.upiAccounts.length) {
    out.upiAccounts = out.upiId ? [{ upiId: out.upiId, upiName: out.upiName || '' }] : [];
  }
  out.upiActive = Math.min(Math.max(0, out.upiActive | 0), Math.max(0, out.upiAccounts.length - 1));
  const active = out.upiAccounts[out.upiActive] || {};
  out.upiId = active.upiId || '';       // kept so the rest of the server reads one "current" UPI ID
  out.upiName = active.upiName || '';
  return out;
}
function cleanContact(input = {}) {
  // Indian numbers: 10 digits get the 91 country code; other numbers keep their own code
  const phoneNum = (v, label) => {
    let d = String(v || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    if (d.length === 10) d = '91' + d;
    if (d.length < 11 || d.length > 15) throw new Error(`${label}: enter a 10-digit mobile number (or one with country code).`);
    return d;
  };
  let insta = String(input.instagram || '').trim();
  const m = insta.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  insta = (m ? m[1] : insta).replace(/^@/, '').replace(/\/+$/, '');
  if (insta && !/^[A-Za-z0-9._]{1,30}$/.test(insta)) throw new Error('Instagram: enter the username (like aapnaspa) or the profile link.');
  const email = String(input.email || '').trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) throw new Error('Email: enter a valid email address.');
  return {
    whatsapp: phoneNum(input.whatsapp, 'WhatsApp'),
    phone: phoneNum(input.phone, 'Phone'),
    instagram: insta,
    email,
    address: text(input.address, 120, 'Address'),
    hours: text(input.hours, 60, 'Opening hours'),
    ...cleanUpiAccounts(input),
  };
}
// Up to 5 business UPI IDs (all the admin's own); the "active" one is shown on the QR
function cleanUpiAccounts(input) {
  let list = Array.isArray(input.upiAccounts) ? input.upiAccounts
    : input.upiId ? [{ upiId: input.upiId, upiName: input.upiName }] : []; // older single-field form
  if (list.length > 5) throw new Error('At most 5 UPI IDs.');
  const seen = new Set();
  const upiAccounts = list.map((a) => {
    const upiId = String(a.upiId || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,63}$/.test(upiId)) throw new Error(`UPI ID "${a.upiId}": enter it like yourname@okhdfcbank or 9876543210@ybl.`);
    if (seen.has(upiId)) throw new Error(`The UPI ID ${upiId} is listed twice.`);
    seen.add(upiId);
    return { upiId, upiName: text(a.upiName, 60, 'UPI payee name') };
  });
  const upiActive = Math.min(Math.max(0, Number(input.upiActive) | 0), Math.max(0, upiAccounts.length - 1));
  return { upiAccounts, upiActive };
}

function cleanTherapists(input) {
  const out = {};
  const keys = new Set();
  for (const ty of TYPES) {
    const list = Array.isArray(input?.[ty]) ? input[ty] : [];
    if (list.length > 60) throw new Error('At most 60 therapists per type.');
    out[ty] = list.map((t, i) => {
      const name = text(t.name, 40, `Name (${ty} therapist #${i + 1})`, true);
      let key = /^[a-z0-9][a-z0-9-]{1,39}$/i.test(String(t.key || '')) ? String(t.key) : 't' + crypto.randomBytes(4).toString('hex');
      if (keys.has(key)) key = 't' + crypto.randomBytes(4).toString('hex');
      keys.add(key);
      let photo;
      try { photo = normalizePhoto(t.photo); } catch (e) { throw new Error(`${name}: ${e.message}`); }
      const r = {
        key, name, photo,
        rating: Math.round(num(t.rating ?? 5, 0, 5, `${name}: Rating`, false) * 10) / 10,
        reviews: num(t.reviews ?? 0, 0, 1e6, `${name}: Reviews`),
        speciality: text(t.speciality, 60, `${name}: Speciality`, true),
        price: num(t.price, 1, 100000, `${name}: Price`),
      };
      // Optional texts – the "therapistDefaults" are shown when they're empty
      for (const [f, max] of [['experience', 40], ['specializes', 80], ['languages', 80], ['about', 600]]) {
        const v = text(t[f], max, `${name}: ${f}`);
        if (v) r[f] = v;
      }
      if (t.hidden) r.hidden = true;
      return r;
    });
  }
  return out;
}

function cleanOffers(input) {
  const list = Array.isArray(input) ? input : [];
  if (list.length > 30) throw new Error('At most 30 offers.');
  const codes = new Set();
  return list.map((o, i) => {
    const code = String(o.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new Error(`Offer #${i + 1}: the code must be 3–20 letters/numbers (no spaces).`);
    if (codes.has(code)) throw new Error(`The code ${code} is used twice.`);
    codes.add(code);
    const kind = o.kind === 'flat' ? 'flat' : 'percent';
    const r = {
      code, title: text(o.title, 60, `${code}: Title`, true), desc: text(o.desc, 200, `${code}: Description`), kind,
      value: kind === 'percent' ? num(o.value, 1, 90, `${code}: Percent off`) : num(o.value, 1, 100000, `${code}: ₹ off`),
    };
    if (o.max !== undefined && o.max !== null && o.max !== '' && Number(o.max) > 0) r.max = num(o.max, 1, 100000, `${code}: Maximum discount`);
    if (o.hidden) r.hidden = true;     // works at checkout but isn't listed on the Offers page
    if (o.disabled) r.disabled = true; // switched off completely
    return r;
  });
}

async function quote({ type, id, pay, code }) {
  const cat = await loadCatalog();
  const t = cat.getTherapist(String(type), clip(id, 40));
  if (!t) throw new Error('Unknown therapist');
  if (pay !== 'online' && pay !== 'cod') throw new Error('Unknown payment method');
  const cleanCode = String(code || '').trim().toUpperCase();
  const discount = cat.discountFor(cleanCode, t.price);
  const treatment = Math.max(t.price - discount, 0);
  // Pay Online: treatment + visiting/travel charge now. Cash on Delivery: visiting charge now, treatment in cash.
  const payNow = pay === 'online' ? treatment + cat.VISIT_CHARGE : cat.VISIT_CHARGE;
  const cashLater = pay === 'online' ? 0 : treatment;
  return { therapist: t, price: t.price, discount, code: discount ? cleanCode : '', treatment, payNow, cashLater, visitCharge: cat.VISIT_CHARGE };
}

// ---------- Razorpay API ----------
async function razorpay(method, endpoint, body) {
  const res = await fetch('https://api.razorpay.com/v1' + endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64'),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.description || `Razorpay error ${res.status}`);
  return json;
}

/**
 * Records a successful payment. Safe to call twice for the same payment (the checkout page and the
 * Razorpay webhook both report it): only the first call updates the booking and notifies the admin.
 */
async function markPaid(orderId, paymentId, via) {
  const booking = await col('bookings').findOneAndUpdate(
    { 'payment.orderId': orderId, status: 'pending_payment' },
    { $set: { status: 'paid', paidAt: new Date(), 'payment.paymentId': paymentId, 'payment.confirmedVia': via } },
    { returnDocument: 'after' });
  if (booking) {
    await logEvent('payment_success', `Payment received: ₹${booking.payment?.paidOnline ?? '?'} from ${booking.customer?.name || 'customer'} (${booking.bookingId})`, { bookingId: booking.bookingId });
    console.log(`✔ Paid booking ${booking.bookingId} – ${booking.customer?.name || ''} – ₹${booking.payment?.paidOnline ?? '?'} (via ${via})`);
    return booking;
  }
  const existing = await col('bookings').findOne({ 'payment.orderId': orderId });
  if (existing) return existing; // already recorded
  if (!orderId.startsWith('order_')) throw new Error('Booking not found for this payment.'); // only Razorpay orders can be rebuilt
  // Order isn't in the database (e.g. made before this version): rebuild it from Razorpay
  const order = await razorpay('GET', `/orders/${encodeURIComponent(orderId)}`).catch(() => ({}));
  const recovered = {
    bookingId: order.receipt || newBookingId('APK'), source: 'online', status: 'paid', createdAt: new Date(), paidAt: new Date(),
    therapist: { name: order.notes?.therapist },
    payment: { method: order.notes?.payment, paidOnline: order.amount ? order.amount / 100 : 0, orderId, paymentId, confirmedVia: via },
    customer: { name: order.notes?.customer, mobile: order.notes?.mobile, slot: order.notes?.slot },
    note: 'Recovered from Razorpay order – check the Razorpay dashboard for full details',
  };
  try { await col('bookings').insertOne(recovered); } catch (e) {
    if (e.code === 11000) return (await col('bookings').findOne({ bookingId: recovered.bookingId })) || recovered; // the other report won
    throw e;
  }
  await logEvent('payment_success', `Payment received: ₹${recovered.payment.paidOnline} from ${recovered.customer.name || 'customer'} (${recovered.bookingId})`, { bookingId: recovered.bookingId });
  return recovered;
}

function signatureValid(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Cashfree API ----------
async function cashfree(method, endpoint, body) {
  const res = await fetch((CF_LIVE ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg') + endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json', 'x-api-version': '2023-08-01',
      'x-client-id': CF_APP_ID, 'x-client-secret': CF_SECRET,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || `Cashfree error ${res.status}`);
  return json;
}

/**
 * Asks Cashfree for the real state of an order (never trusts the browser) and records it.
 * Used by the return page and the webhook, so it's safe if both report the same payment.
 * Returns 'paid', 'pending' (not finished yet) or 'failed'.
 */
async function confirmCashfree(orderId, via) {
  const booking = await col('bookings').findOne({ 'payment.orderId': orderId, 'payment.gateway': 'cashfree' });
  if (!booking) throw new Error('Booking not found for this payment.');
  if (booking.status !== 'pending_payment') return { status: 'paid', booking };
  const order = await cashfree('GET', `/orders/${encodeURIComponent(orderId)}`);
  const payments = await cashfree('GET', `/orders/${encodeURIComponent(orderId)}/payments`).catch(() => []);
  const list = (Array.isArray(payments) ? payments : [])
    .sort((a, b) => String(b.payment_time || '').localeCompare(String(a.payment_time || '')));
  if (order.order_status === 'PAID') {
    if (Number(order.order_amount) !== Number(booking.payment.paidOnline)) {
      await logEvent('payment_failed', `Amount mismatch on ${booking.bookingId}: Cashfree ₹${order.order_amount}, booking ₹${booking.payment.paidOnline} – check Cashfree`, { bookingId: booking.bookingId });
      throw new Error('Payment amount did not match. Please contact us.');
    }
    const ok = list.find((p) => p.payment_status === 'SUCCESS');
    return { status: 'paid', booking: await markPaid(orderId, String(ok?.cf_payment_id || order.cf_order_id || ''), via) };
  }
  // Not paid: if the latest attempt failed, note it once in the admin's activity feed
  const last = list[0];
  const failed = last && ['FAILED', 'USER_DROPPED', 'CANCELLED'].includes(last.payment_status) ? last : null;
  if (failed) {
    const pid = String(failed.cf_payment_id);
    const r = await col('bookings').updateOne({ _id: booking._id, 'payment.lastFailedId': { $ne: pid } }, { $set: { 'payment.lastFailedId': pid } });
    if (r.modifiedCount) {
      await logEvent('payment_failed', `Payment failed for ${booking.customer?.name || 'a customer'} (${booking.bookingId}): ${failed.payment_message || failed.payment_status}`, { bookingId: booking.bookingId });
    }
  }
  const status = order.order_status === 'ACTIVE' && !failed ? 'pending' : 'failed';
  return { status, booking, message: failed?.payment_message || '' };
}

// Address customers return to after paying on Cashfree's page (taken from the request, so it works on any domain)
function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

// ---------- Small helpers ----------
const clip = (v, n = 300) => String(v ?? '').slice(0, n);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE_RE = /^[6-9]\d{9}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const deviceHashOf = (deviceId) => (/^[a-f0-9-]{20,64}$/.test(String(deviceId || '')) ? sha256(deviceId) : '');
const newBookingId = (prefix) => prefix + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function cleanCustomer(c = {}) {
  return {
    name: clip(c.name, 80).trim(), mobile: clip(c.mobile, 15).replace(/\D/g, ''), stay: clip(c.stay, 20),
    date: clip(c.date, 20), time: clip(c.time, 20), address: clip(c.address, 400).trim(),
    flat: clip(c.flat, 60), floor: clip(c.floor, 30), landmark: clip(c.landmark, 150),
    pin: /^-?\d{1,3}\.\d+,-?\d{1,3}\.\d+$/.test(String(c.pin || '')) ? String(c.pin) : '',
  };
}
function customerError(c) {
  if (c.name.length < 2) return 'Please enter your name.';
  if (!MOBILE_RE.test(c.mobile)) return 'Enter a valid 10-digit mobile number.';
  if (c.address.length < 5) return 'Please enter your address.';
  if (!DATE_RE.test(c.date) || !c.time) return 'Please choose a date and time.';
  return '';
}

// ---------- Live updates for the admin dashboard ----------
// Every saved change is logged in "events" and pushed to open dashboards straight away.
//  • On Atlas (and on Vercel) each dashboard connection watches the events collection with a
//    MongoDB change stream, so it works no matter which copy of the server saved the event.
//  • On a plain local MongoDB (no change streams) this server pushes its own events directly.
const liveClients = new Set();
const sseLine = (event) => `data: ${JSON.stringify({ ...event, _id: String(event._id || '') })}\n\n`;
async function logEvent(type, message, ref = {}) {
  const event = { type, message, ref, at: new Date() };
  try { await col('events').insertOne(event); } catch (e) { console.error('event log failed:', e.message); }
  if (!store.supportsChangeStreams()) for (const res of liveClients) res.write(sseLine(event));
}
// Vercel functions have a time limit, so live connections there end after ~55 s and the browser reconnects
const LIVE_STREAM_MS = (Number(process.env.LIVE_STREAM_SECONDS) || (process.env.VERCEL ? 55 : 0)) * 1000;

function openLiveStream(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  let stream = null;
  if (store.supportsChangeStreams()) {
    stream = col('events').watch([{ $match: { operationType: 'insert' } }]);
    stream.on('change', (ch) => res.write(sseLine(ch.fullDocument)));
    stream.on('error', (e) => { console.error('live stream error:', e.message); res.end(); });
  } else {
    liveClients.add(res);
  }
  const limit = LIVE_STREAM_MS ? setTimeout(() => res.end(), LIVE_STREAM_MS) : null;
  const cleanup = () => {
    clearInterval(ping);
    if (limit) clearTimeout(limit);
    liveClients.delete(res);
    if (stream) stream.close().catch(() => {});
  };
  req.on('close', cleanup);
  res.on('finish', cleanup);
}

// ---------- Customer accounts ----------
// Passwords are stored only as scrypt hashes. Logins use a signed, HttpOnly cookie.
const SECRET_FILE = path.join(DATA_DIR, 'session-secret');
const SESSION_DAYS = 30;
const COOKIE = 'apk_session';
const ADMIN_COOKIE = 'apk_admin';
const ADMIN_HOURS = 12;

function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.VERCEL) {
    // Vercel's disk is read-only and shared by many copies, so the secret must be a setting
    throw new Error('SESSION_SECRET is not set. Add it in Vercel → Project → Settings → Environment Variables (a long random string).');
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(SECRET_FILE, 'utf8').trim();
}
const SESSION_SECRET = sessionSecret();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function passwordMatches(password, stored) {
  const [, salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(password, salt, 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Used when the email doesn't exist, so a wrong email takes as long as a wrong password
const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));

function sign(payload, purpose) {
  return crypto.createHmac('sha256', `${SESSION_SECRET}:${purpose}`).update(payload).digest('base64url');
}
function makeToken(subject, ms, purpose) {
  const payload = `${subject}.${Date.now() + ms}`;
  return `${payload}.${sign(payload, purpose)}`;
}
function readToken(req, cookieName, purpose) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(cookieName + '='));
  if (!raw) return null;
  const [subject, exp, sig] = decodeURIComponent(raw.slice(cookieName.length + 1)).split('.');
  if (!subject || !exp || !sig || Number(exp) < Date.now()) return null;
  const good = sign(`${subject}.${exp}`, purpose);
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  return subject;
}
function cookie(req, name, value, maxAge, sameSite = 'Lax') {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure}`;
}

async function currentUser(req) {
  const id = readToken(req, COOKIE, 'user');
  if (!id) return null;
  const _id = toId(id);
  return _id ? col('users').findOne({ _id }) : col('users').findOne({ legacyId: id });
}
const userCookie = (req, user) => cookie(req, COOKIE, makeToken(String(user._id), SESSION_DAYS * 864e5, 'user'), SESSION_DAYS * 86400);
const publicUser = (u) => ({ name: u.name, email: u.email, mobile: u.mobile, city: u.city || '' });
// A city name from the browser's location lookup: letters, spaces, dots and dashes only
const cleanCity = (v) => { const c = String(v || '').trim().replace(/\s+/g, ' ').slice(0, 60); return /^[\p{L}][\p{L} .'-]*$/u.test(c) ? c : ''; };
const locateCache = new Map(); // "lat,lon" (rounded) → { city, state }
const locateHits = new Map();  // ip → recent lookup times

const isAdmin = (req) => ADMIN_ENABLED && readToken(req, ADMIN_COOKIE, 'admin') === 'admin';

// Slow down password guessing: max 5 failed logins per account+IP every 15 minutes
const failedLogins = new Map();
function tooManyAttempts(key) {
  const now = Date.now();
  const list = (failedLogins.get(key) || []).filter((t) => now - t < 15 * 60e3);
  failedLogins.set(key, list);
  return list.length >= 5;
}
function recordFailure(key) { failedLogins.set(key, [...(failedLogins.get(key) || []), Date.now()]); }
function sameSecret(a, b) { return crypto.timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b))); }

// ---------- HTTP helpers ----------
function sendJSON(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
// On Vercel, the platform may read the request body before our code runs and put it in req.body.
// Then the stream is already finished, so we must use req.body instead of waiting for data.
function preReadBody(req) {
  if (!Object.getOwnPropertyDescriptor(req, 'body') && !req.readableEnded) return undefined;
  try { return req.body; } catch (e) { return undefined; } // Vercel's getter throws on invalid JSON
}
/** The exact bytes that were sent (needed to check Razorpay webhook signatures). null = not available. */
function readRawBody(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    const pre = preReadBody(req);
    if (pre !== undefined || req.readableEnded) {
      if (Buffer.isBuffer(pre)) return resolve(pre);
      if (typeof pre === 'string') return resolve(Buffer.from(pre));
      return resolve(pre == null ? Buffer.alloc(0) : null); // already parsed – original bytes are gone
    }
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readBody(req) {
  const pre = preReadBody(req);
  if (pre && typeof pre === 'object' && !Buffer.isBuffer(pre)) return pre; // already parsed JSON (Vercel)
  const raw = await readRawBody(req);
  if (!raw || !raw.length) return {};
  try { return JSON.parse(raw.toString()); } catch (e) { throw new Error('Invalid JSON'); }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8',
};

function serveFile(req, res, file, extraHeaders = {}) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && type.startsWith('video/')) { // lets videos seek/stream
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = Number(s) || 0;
      const end = e ? Number(e) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, ...extraHeaders });
    fs.createReadStream(file).pipe(res);
  });
}
// Only files inside dist/ (the built React apps + your photos) are ever served.
// server.js, db.js, .env, data/, shared/, src/ and node_modules/ stay private.
function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let urlPath;
  try { urlPath = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end('Bad request'); }


  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('The website has not been built yet. Run "npm run build", then start the server again.');
  }

  const isAdmin = urlPath === '/admin' || urlPath.startsWith('/admin/');
  const file = path.normalize(path.join(DIST, urlPath));
  if (file !== DIST && !file.startsWith(DIST + path.sep)) { res.writeHead(404); return res.end('Not found'); }

  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) {
      const cache = urlPath.startsWith('/_app/') ? 'public, max-age=31536000, immutable' // file names change on every build
        : file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600';
      return serveFile(req, res, file, { 'Cache-Control': cache });
    }
    // A missing photo/video/file stays a 404 (the site then shows its placeholder)
    if (path.extname(urlPath)) { res.writeHead(404); return res.end('Not found'); }
    // Any page address → the React app, which picks the right page
    if (isAdmin) {
      return serveFile(req, res, path.join(DIST, 'admin', 'index.html'),
        { 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex' });
    }
    serveFile(req, res, path.join(DIST, 'index.html'), { 'Cache-Control': 'no-cache', 'X-Frame-Options': 'SAMEORIGIN' });
  });
}

// ---------- Shaping data for the browser ----------
const iso = (d) => (d instanceof Date ? d.toISOString() : d);
function bookingForCustomer(b) {
  return {
    bookingId: b.bookingId, createdAt: iso(b.createdAt), status: b.status, source: b.source,
    therapist: { name: b.therapist?.name, speciality: b.therapist?.speciality },
    payment: {
      method: b.payment?.method, paidOnline: b.payment?.paidOnline || 0, cashOnService: b.payment?.cashOnService || 0,
      total: b.payment?.total, referral: b.payment?.referral, paymentId: b.payment?.paymentId, utr: b.payment?.utr,
      gateway: b.payment?.gateway, rejected: b.payment?.rejected,
    },
    customer: {
      stay: b.customer?.stay, date: b.customer?.date, time: b.customer?.time,
      address: [b.customer?.flat, b.customer?.address].filter(Boolean).join(', '),
    },
  };
}
function bookingForAdmin(b) {
  const { deviceHash, ...rest } = b; // never needed by the admin
  return { ...rest, _id: String(b._id), createdAt: iso(b.createdAt), paidAt: iso(b.paidAt), updatedAt: iso(b.updatedAt) };
}

// When a booking's session starts ("2026-10-24" + "3:00 PM", Indian time), in ms
function slotStart(b) {
  const m = String(b.customer?.time || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  const h = m ? (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0) : 23;
  const t = Date.parse(`${b.customer?.date}T${String(h).padStart(2, '0')}:${m ? m[2] : '59'}:00+05:30`);
  return Number.isNaN(t) ? 0 : t;
}

// Today's date in India, as YYYY-MM-DD, and midnight IST as a Date
function istToday() {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return { ymd, start: new Date(`${ymd}T00:00:00+05:30`) };
}

const ADMIN_STATUSES = ['requested', 'paid', 'confirmed', 'completed', 'cancelled'];
const STATUS_LABEL = { requested: 'Requested', pending_payment: 'Awaiting payment', payment_submitted: 'Payment submitted – verify', paid: 'Paid', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };

// ---------- Routes ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const { pathname } = url;

  // ---------- UPI API Tester ----------
  if (pathname === '/api/upi/random' && req.method === 'GET') {
    const catalog = await readCatalog();
    const contact = contactOf(catalog);

    if (!contact.upiId) {
      return sendJSON(res, 404, {
        success: false,
        message: 'No business UPI ID configured. Set it in Admin → Contact.',
      });
    }

    return sendJSON(res, 200, {
      success: true,
      data: {
        upiId: contact.upiId,
        payeeName: contact.upiName || 'AAPNA SPA',
      },
    });
  }

  if (pathname === '/api/config' && req.method === 'GET') {
    const upi = Boolean(contactOf(await readCatalog()).upiId);
    return sendJSON(res, 200, { provider: upi ? 'upi' : null, razorpay: false, keyId: null, cashfreeMode: null });
  }

  if (pathname === '/api/catalog' && req.method === 'GET') {
    return sendJSON(res, 200, await publicCatalog());
  }

  // City from the customer's location (they allow it in the browser on the login / sign-up page).
  // Looks the coordinates up on OpenStreetMap; the coordinates themselves are not stored.
  if (pathname === '/api/locate' && req.method === 'GET') {
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return sendJSON(res, 400, { error: 'Invalid location.' });
    }
    const ipKey = `locate|${clientIp(req)}`;
    const hits = (locateHits.get(ipKey) || []).filter((t) => t > Date.now() - 60e3);
    if (hits.length >= 10) return sendJSON(res, 429, { error: 'Too many location lookups. Please try again in a minute.' });
    locateHits.set(ipKey, [...hits, Date.now()]);
    const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`; // ~1 km – nearby customers share one lookup
    if (!locateCache.has(cacheKey)) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=${lat}&lon=${lon}`, {
          headers: { 'User-Agent': 'AAPNA-SPA-website/1.0 (city lookup at login)' },
          signal: AbortSignal.timeout(8000),
        });
        const j = await r.json();
        const a = j.address || {};
        // City if there is one, else the district (e.g. Talegaon → Pune District → Pune)
        const district = String(a.state_district || a.county || '').replace(/\s+(District|Subdistrict|Tahsil|Tehsil)$/i, '');
        const city = cleanCity(a.city || a.town || district || a.village || '');
        locateCache.set(cacheKey, { city, state: cleanCity(a.state || '') });
        if (locateCache.size > 2000) locateCache.delete(locateCache.keys().next().value);
      } catch (e) {
        console.error('City lookup failed:', e.message);
        return sendJSON(res, 502, { error: 'Could not look up your city right now.' });
      }
    }
    return sendJSON(res, 200, locateCache.get(cacheKey));
  }

  // Therapist photos uploaded in the admin – stored in MongoDB (collection "photos"), so they survive
  // restarts and redeploys (Vercel's own disk is temporary). Each photo never changes, so browsers cache it for a year.
  const photoMatch = pathname.match(/^\/api\/photos\/([a-f0-9]{24})(?:\.(?:jpg|png|webp))?$/);
  if (photoMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const photo = await col('photos').findOne({ _id: toId(photoMatch[1]) });
    if (!photo) return sendJSON(res, 404, { error: 'Photo not found' });
    const buf = Buffer.from(photo.data.buffer || photo.data);
    res.writeHead(200, {
      'Content-Type': photo.type, 'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
    });
    return res.end(req.method === 'HEAD' ? undefined : buf);
  }

  // ===== Customer accounts =====
  if (pathname === '/api/signup' && req.method === 'POST') {
    const body = await readBody(req);
    const name = clip(body.name, 80).trim();
    const email = clip(body.email, 120).trim().toLowerCase();
    const mobile = clip(body.mobile, 10).replace(/\D/g, '');
    const password = String(body.password || '');
    if (name.length < 2) return sendJSON(res, 400, { error: 'Please enter your full name.', field: 'name' });
    if (!EMAIL_RE.test(email)) return sendJSON(res, 400, { error: 'Please enter a valid email address.', field: 'email' });
    if (mobile && !MOBILE_RE.test(mobile)) return sendJSON(res, 400, { error: 'Enter a valid 10-digit mobile number.', field: 'mobile' });
    if (password.length < 8 || password.length > 128) return sendJSON(res, 400, { error: 'Password must be at least 8 characters.', field: 'password' });
    const city = cleanCity(body.city);
    const user = { name, email, mobile, password: hashPassword(password), createdAt: new Date(), lastLoginAt: new Date(), ...(city ? { city, cityAt: new Date() } : {}) };
    try {
      const r = await col('users').insertOne(user);
      user._id = r.insertedId;
    } catch (e) {
      if (e.code === 11000) return sendJSON(res, 409, { error: 'An account with this email already exists. Please log in.', field: 'email' });
      throw e;
    }
    await logEvent('signup', `New customer account: ${name}${city ? ` (${city})` : ''}`, { email });
    return sendJSON(res, 201, { ok: true, user: publicUser(user) }, { 'Set-Cookie': userCookie(req, user) });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const body = await readBody(req);
    const email = clip(body.email, 120).trim().toLowerCase();
    const password = String(body.password || '').slice(0, 128);
    const key = `${email}|${clientIp(req)}`;
    if (tooManyAttempts(key)) return sendJSON(res, 429, { error: 'Too many attempts. Please wait 15 minutes and try again.' });
    const user = await col('users').findOne({ email });
    const ok = passwordMatches(password, user ? user.password : DUMMY_HASH) && !!user;
    if (!ok) { recordFailure(key); return sendJSON(res, 401, { error: 'Incorrect email or password.' }); }
    failedLogins.delete(key);
    const city = cleanCity(body.city);
    await col('users').updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), ...(city ? { city, cityAt: new Date() } : {}) } });
    if (city) user.city = city;
    return sendJSON(res, 200, { ok: true, user: publicUser(user) }, { 'Set-Cookie': userCookie(req, user) });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, COOKIE, '', 0) });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    const user = await currentUser(req);
    return sendJSON(res, 200, { user: user ? publicUser(user) : null });
  }

  // ===== Newsletter =====
  if (pathname === '/api/subscribe' && req.method === 'POST') {
    const email = clip((await readBody(req)).email, 120).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return sendJSON(res, 400, { error: 'Please enter a valid email address.' });
    const r = await col('subscribers').updateOne({ email }, { $setOnInsert: { email, createdAt: new Date() } }, { upsert: true });
    if (r.upsertedCount) await logEvent('subscribe', `Newsletter sign-up: ${email}`, { email });
    return sendJSON(res, 200, { ok: true, already: !r.upsertedCount });
  }

  // ===== Bookings =====
  // WhatsApp booking request (no online payment) – saved so the admin sees it immediately
  if (pathname === '/api/booking-request' && req.method === 'POST') {
    const body = await readBody(req);
    const q = await quote(body);
    const customer = cleanCustomer(body.customer);
    const problem = customerError(customer);
    if (problem) return sendJSON(res, 400, { error: problem });
    const user = await currentUser(req);
    const booking = {
      bookingId: newBookingId('REQ'), source: 'whatsapp', status: 'requested', createdAt: new Date(),
      deviceHash: deviceHashOf(body.deviceId), userId: user ? String(user._id) : '',
      therapist: { type: clip(body.type, 20), id: clip(body.id, 40), name: q.therapist.name, speciality: q.therapist.speciality },
      payment: {
        method: body.pay, price: q.price, discount: q.discount, referral: q.code, paidOnline: 0,
        total: q.treatment + q.visitCharge, cashOnService: q.cashLater,
        visitCharge: q.visitCharge,
      },
      customer,
    };
    await col('bookings').insertOne(booking);
    await logEvent('booking_request', `New WhatsApp booking request from ${customer.name} for ${q.therapist.name}`, { bookingId: booking.bookingId });
    return sendJSON(res, 201, { ok: true, bookingId: booking.bookingId });
  }

  // ===== Notifications for logged-in customers: bookings still waiting for payment =====
  if (pathname === '/api/notifications' && req.method === 'GET') {
    const user = await currentUser(req);
    if (!user) return sendJSON(res, 200, { notifications: [] });
    const mine = await col('bookings')
      .find({ userId: String(user._id), 'customer.date': { $gte: istToday().ymd } })
      .sort({ createdAt: -1 }).limit(100).toArray();
    // A slot the customer already has a paid/confirmed booking for doesn't need a reminder
    const slotKey = (b) => `${b.therapist?.name}|${b.customer?.date}|${b.customer?.time}`;
    const covered = new Set(mine.filter((b) => b.status !== 'pending_payment' && b.status !== 'cancelled').map(slotKey));
    const seen = new Set();
    const notifications = [];
    for (const b of mine) {
      if (b.status !== 'pending_payment' || !['cashfree', 'upi'].includes(b.payment?.gateway)) continue;
      if (slotStart(b) < Date.now()) continue; // the time has passed
      const k = slotKey(b);
      if (covered.has(k) || seen.has(k)) continue; // paid already, or an older attempt for the same slot
      seen.add(k);
      notifications.push({
        id: `pay:${b.bookingId}`, type: 'payment_pending', bookingId: b.bookingId,
        therapist: b.therapist?.name, speciality: b.therapist?.speciality,
        date: b.customer?.date, time: b.customer?.time, amount: b.payment?.paidOnline, method: b.payment?.method,
        rejected: b.payment?.rejected || '',
        createdAt: iso(b.createdAt),
      });
    }
    // UPI results the customer should hear about
    const weekAgo = Date.now() - 7 * 864e5;
    for (const b of mine) {
      if (b.payment?.gateway !== 'upi') continue;
      const base = {
        bookingId: b.bookingId, therapist: b.therapist?.name, speciality: b.therapist?.speciality,
        date: b.customer?.date, time: b.customer?.time, amount: b.payment?.paidOnline, method: b.payment?.method, utr: b.payment?.utr || '',
      };
      if (b.status === 'payment_submitted') {
        notifications.push({ ...base, id: `sub:${b.bookingId}`, type: 'payment_submitted', createdAt: iso(b.payment?.submittedAt || b.createdAt) });
      } else if (['paid', 'confirmed'].includes(b.status) && b.payment?.confirmedVia === 'upi-verified' && new Date(b.paidAt).getTime() > weekAgo) {
        notifications.push({ ...base, id: `ok:${b.bookingId}`, type: 'payment_verified', createdAt: iso(b.paidAt) });
      }
    }
    notifications.sort((a, c) => String(c.createdAt).localeCompare(String(a.createdAt)));
    return sendJSON(res, 200, { notifications });
  }

  // Pay for an unpaid booking again (from the notification). Only the customer who made it can do this.
  if (pathname === '/api/resume-payment' && req.method === 'POST') {
    const user = await currentUser(req);
    const body = await readBody(req);
    const bookingId = clip(body.bookingId, 40);
    const owner = [{ deviceHash: deviceHashOf(body.deviceId) || '-' }];
    if (user) owner.push({ userId: String(user._id) });
    const b = await col('bookings').findOne({ bookingId, $or: owner });
    if (!b) return sendJSON(res, user ? 404 : 401, { error: user ? 'Booking not found.' : 'Please log in to complete this payment.' });
    if (b.payment?.gateway === 'upi') {
      if (b.status !== 'pending_payment') return sendJSON(res, 200, { status: b.status === 'payment_submitted' ? 'payment_submitted' : 'paid', bookingId });
      if (slotStart(b) < Date.now()) return sendJSON(res, 400, { error: 'This time slot has passed. Please make a new booking.' });
      const contact = contactOf(await readCatalog());
      if (!contact.upiId) return sendJSON(res, 503, { error: 'Online payment is not set up yet. Please contact us on WhatsApp.' });
      return sendJSON(res, 200, { status: 'pending', provider: 'upi', bookingId, amount: b.payment.paidOnline, ...upiPayee(contact) });
    }
    if (!CASHFREE_ENABLED) return sendJSON(res, 503, { error: 'Online payment is not set up yet.' });
    if (b.payment?.gateway !== 'cashfree') return sendJSON(res, 400, { error: 'This booking cannot be paid online. Please contact us.' });
    if (b.status !== 'pending_payment') return sendJSON(res, 200, { status: 'paid', bookingId });
    if (slotStart(b) < Date.now()) return sendJSON(res, 400, { error: 'This time slot has passed. Please make a new booking.' });
    // Maybe it was paid and we missed the news: ask Cashfree first
    const check = await confirmCashfree(b.payment.orderId, 'checkout').catch(() => null);
    if (check?.status === 'paid') return sendJSON(res, 200, { status: 'paid', bookingId });
    let order = await cashfree('GET', `/orders/${encodeURIComponent(b.payment.orderId)}`).catch(() => null);
    if (!order || order.order_status !== 'ACTIVE' || !order.payment_session_id) {
      // The old order expired: open a new one for the same booking and amount
      const orderId = `${bookingId}R${Date.now().toString(36).toUpperCase()}`.slice(0, 45);
      try {
        order = await cashfree('POST', '/orders', {
          order_id: orderId, order_amount: b.payment.paidOnline, order_currency: 'INR',
          customer_details: {
            customer_id: String(user._id), customer_name: b.customer?.name || user.name,
            customer_phone: b.customer?.mobile || user.mobile, ...(user.email ? { customer_email: user.email } : {}),
          },
          order_meta: { return_url: `${siteOrigin(req)}/payment-return?order_id={order_id}` },
          order_note: `${b.payment.method === 'online' ? 'Treatment' : 'Visiting charge'} – ${b.therapist?.name || ''}`.slice(0, 200),
        });
      } catch (e) {
        console.error('Cashfree resume failed:', e.message);
        return sendJSON(res, 502, { error: 'Online payment is not available right now. Please try again in a minute.', code: 'payment_unavailable' });
      }
      await col('bookings').updateOne({ _id: b._id }, { $set: { 'payment.orderId': orderId } });
    }
    await logEvent('payment_started', `${b.customer?.name || 'A customer'} reopened payment for ₹${b.payment.paidOnline} (${b.bookingId})`, { bookingId });
    return sendJSON(res, 200, { status: 'pending', bookingId, orderId: order.order_id, paymentSessionId: order.payment_session_id, mode: CF_LIVE ? 'production' : 'sandbox' });
  }

  // My Bookings: bookings made on this device or by this account
  if (pathname === '/api/my-bookings' && req.method === 'POST') {
    const { deviceId } = await readBody(req);
    const deviceHash = deviceHashOf(deviceId);
    const user = await currentUser(req);
    const or = [];
    if (deviceHash) or.push({ deviceHash });
    if (user) or.push({ userId: String(user._id) });
    if (!or.length) return sendJSON(res, 200, { bookings: [] });
    const list = await col('bookings')
      .find({ $or: or, $nor: [{ status: 'pending_payment', 'payment.rejected': { $exists: false } }] })
      .sort({ createdAt: -1 }).limit(100).toArray();
    return sendJSON(res, 200, { bookings: list.map(bookingForCustomer) });
  }

  if (pathname === '/api/create-order' && req.method === 'POST') {
    const body = await readBody(req);
    const q = await quote(body);
    const customer = cleanCustomer(body.customer);
    const problem = customerError(customer);
    if (problem) return sendJSON(res, 400, { error: problem });
    const bookingId = newBookingId('APK');
    const user = await currentUser(req);
    const newBooking = (orderId, gateway) => ({
      bookingId, source: 'online', status: 'pending_payment', createdAt: new Date(),
      deviceHash: deviceHashOf(body.deviceId), userId: user ? String(user._id) : '',
      therapist: { type: clip(body.type, 20), id: clip(body.id, 40), name: q.therapist.name, speciality: q.therapist.speciality },
      payment: {
        method: body.pay, price: q.price, discount: q.discount, referral: q.code, paidOnline: q.payNow,
        cashOnService: q.cashLater, total: q.payNow + q.cashLater, orderId, gateway,
        visitCharge: q.visitCharge,
      },
      customer,
    });

    // UPI: the customer pays the business UPI ID (Admin → Contact) by QR, then uploads a screenshot + UTR.
    // The booking waits as "Awaiting payment" until then, and is marked Paid only after the admin checks the bank.
    const contact = contactOf(await readCatalog());
    if (!contact.upiId) return sendJSON(res, 503, { error: 'Online payment is not set up yet. Please contact us on WhatsApp to book.', code: 'payment_unavailable' });
    await col('bookings').insertOne(newBooking(bookingId, 'upi'));
    await logEvent('payment_started', `${customer.name} opened UPI payment for ₹${q.payNow} (${q.therapist.name})`, { bookingId });
    return sendJSON(res, 200, { provider: 'upi', bookingId, amount: q.payNow, ...upiPayee(contact) });
  }

  // UPI payment proof: screenshot (request body = the image) + UTR (12-digit bank reference).
  // Only the device or account that made the booking can submit it.
  if (pathname === '/api/payment-proof' && req.method === 'POST') {
    const bookingId = clip(url.searchParams.get('bookingId'), 40);
    const utr = String(url.searchParams.get('utr') || '').replace(/\s/g, '');
    if (!/^\d{12}$/.test(utr)) return sendJSON(res, 400, { error: 'Enter the 12-digit UTR / UPI reference number from your payment app.', field: 'utr' });
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!PHOTO_TYPES[type]) return sendJSON(res, 400, { error: 'Please attach the payment screenshot (JPG, PNG or WebP).', field: 'screenshot' });
    if (Number(req.headers['content-length']) > PHOTO_MAX) return sendJSON(res, 413, { error: 'Screenshot is too big (max 3 MB).', field: 'screenshot' }, { Connection: 'close' });
    let buf;
    try { buf = await readRawBody(req, PHOTO_MAX); } catch (e) { return sendJSON(res, 413, { error: 'Screenshot is too big (max 3 MB).', field: 'screenshot' }); }
    if (!buf || !buf.length || !PHOTO_TYPES[type](buf)) return sendJSON(res, 400, { error: "That file isn't a valid image.", field: 'screenshot' });

    const user = await currentUser(req);
    const owner = [{ deviceHash: deviceHashOf(url.searchParams.get('deviceId')) || '-' }];
    if (user) owner.push({ userId: String(user._id) });
    const b = await col('bookings').findOne({ bookingId, $or: owner });
    if (!b) return sendJSON(res, 404, { error: 'Booking not found.' });
    if (b.payment?.gateway !== 'upi') return sendJSON(res, 400, { error: 'This booking is not a UPI payment.' });
    if (b.status === 'payment_submitted') return sendJSON(res, 409, { error: 'Payment proof was already submitted – we are verifying it.' });
    if (b.status !== 'pending_payment') return sendJSON(res, 409, { error: 'This booking is already paid.' });
    if (await col('bookings').findOne({ 'payment.utr': utr, bookingId: { $ne: bookingId } })) {
      return sendJSON(res, 409, { error: 'This UTR number was already used for another booking.', field: 'utr' });
    }
    const proof = await col('proofs').insertOne({ bookingId, type, data: buf, size: buf.length, createdAt: new Date() });
    let updated;
    try {
      updated = await col('bookings').findOneAndUpdate(
        { _id: b._id, status: 'pending_payment' },
        { $set: { status: 'payment_submitted', 'payment.utr': utr, 'payment.proofId': String(proof.insertedId), 'payment.submittedAt': new Date(), updatedAt: new Date() },
          $unset: { 'payment.rejected': '' } },
        { returnDocument: 'after' });
    } catch (e) {
      await col('proofs').deleteOne({ _id: proof.insertedId });
      if (e.code === 11000) return sendJSON(res, 409, { error: 'This UTR number was already used for another booking.', field: 'utr' });
      throw e;
    }
    if (!updated) { await col('proofs').deleteOne({ _id: proof.insertedId }); return sendJSON(res, 409, { error: 'This booking was updated meanwhile. Please refresh.' }); }
    if (b.payment?.proofId) await col('proofs').deleteOne({ _id: toId(b.payment.proofId) }).catch(() => {}); // earlier rejected proof
    await logEvent('payment_submitted', `${b.customer?.name || 'A customer'} submitted UPI payment ₹${b.payment.paidOnline} (UTR ${utr}) for ${b.bookingId} – please verify`, { bookingId });
    return sendJSON(res, 200, { ok: true, status: 'payment_submitted', bookingId });
  }

  // Cashfree: the checkout page (or the return page after a redirect) asks whether the order is paid.
  // The answer comes from Cashfree's servers, not from the browser.
  if (pathname === '/api/cashfree-verify' && req.method === 'POST') {
    if (!CASHFREE_ENABLED) return sendJSON(res, 503, { error: 'Online payment is not set up yet.' });
    const orderId = clip((await readBody(req)).orderId, 60);
    if (!/^[A-Za-z0-9_-]{3,50}$/.test(orderId)) return sendJSON(res, 400, { error: 'Unknown order.' });
    const r = await confirmCashfree(orderId, 'checkout');
    const b = r.booking;
    return sendJSON(res, 200, {
      status: r.status, message: r.message || '', bookingId: b.bookingId, paymentId: b.payment?.paymentId || '',
      amount: b.payment?.paidOnline, method: b.payment?.method, therapist: b.therapist?.name,
      slot: `${b.customer?.date || ''} ${b.customer?.time || ''}`.trim(),
    });
  }

  // Cashfree webhook – records payments even if the customer never comes back to the site.
  // Cashfree → Developers → Webhooks → add https://YOUR-SITE/api/cashfree-webhook (Payment events).
  if (pathname === '/api/cashfree-webhook' && req.method === 'POST') {
    if (!CASHFREE_ENABLED) return sendJSON(res, 503, { error: 'Cashfree is not set up.' });
    const raw = await readRawBody(req, 1e6);
    if (!raw) return sendJSON(res, 500, { error: 'Webhook body unavailable. On Vercel, add the environment variable NODEJS_HELPERS=0 and redeploy.' });
    const ts = String(req.headers['x-webhook-timestamp'] || '');
    const given = String(req.headers['x-webhook-signature'] || '');
    const expected = crypto.createHmac('sha256', CF_SECRET).update(ts + raw.toString()).digest('base64');
    if (!ts || expected.length !== given.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
      return sendJSON(res, 400, { error: 'Invalid webhook signature.' });
    }
    let evt;
    try { evt = JSON.parse(raw.toString()); } catch (e) { return sendJSON(res, 400, { error: 'Invalid JSON' }); }
    const orderId = String(evt.data?.order?.order_id || '');
    if (/PAYMENT/.test(String(evt.type || '')) && orderId) {
      await confirmCashfree(orderId, 'webhook').catch((e) => console.error('Cashfree webhook:', orderId, e.message));
    }
    return sendJSON(res, 200, { ok: true }); // 200 for every genuine event so Cashfree doesn't retry
  }

  if (pathname === '/api/verify-payment' && req.method === 'POST') {
    if (!RAZORPAY_ENABLED) return sendJSON(res, 503, { error: 'Online payment is not set up yet.' });
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig } = await readBody(req);
    if (!signatureValid(orderId, paymentId, sig)) return sendJSON(res, 400, { error: 'Payment could not be verified.' });
    const booking = await markPaid(String(orderId), String(paymentId), 'checkout');
    return sendJSON(res, 200, { ok: true, bookingId: booking.bookingId });
  }

  // Razorpay webhook – Razorpay's servers tell us about payments directly, so a payment is recorded
  // even if the customer closes the page before returning. Set it up in Razorpay → Settings → Webhooks.
  if (pathname === '/api/razorpay-webhook' && req.method === 'POST') {
    if (!WEBHOOK_SECRET) return sendJSON(res, 503, { error: 'RAZORPAY_WEBHOOK_SECRET is not set.' });
    const raw = await readRawBody(req, 1e6);
    if (!raw) return sendJSON(res, 500, { error: 'Webhook body unavailable. On Vercel, add the environment variable NODEJS_HELPERS=0 and redeploy.' });
    const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
    const given = String(req.headers['x-razorpay-signature'] || '');
    if (expected.length !== given.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
      return sendJSON(res, 400, { error: 'Invalid webhook signature.' });
    }
    let evt;
    try { evt = JSON.parse(raw.toString()); } catch (e) { return sendJSON(res, 400, { error: 'Invalid JSON' }); }
    const payment = evt.payload?.payment?.entity || {};
    const orderId = String(payment.order_id || evt.payload?.order?.entity?.id || '');
    if ((evt.event === 'payment.captured' || evt.event === 'order.paid') && orderId && payment.id) {
      await markPaid(orderId, String(payment.id), 'webhook');
    } else if (evt.event === 'payment.failed' && orderId) {
      const b = await col('bookings').findOne({ 'payment.orderId': orderId });
      if (b && b.status === 'pending_payment') {
        await logEvent('payment_failed', `Payment failed for ${b.customer?.name || 'a customer'} (${b.bookingId}): ${payment.error_description || 'declined'}`, { bookingId: b.bookingId });
      }
    }
    return sendJSON(res, 200, { ok: true }); // always 200 for valid events so Razorpay doesn't retry
  }

  // ===== Admin =====
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (!ADMIN_ENABLED) return sendJSON(res, 503, { error: 'Admin login is turned off. Set ADMIN_PASSWORD (10+ characters) in the .env file and restart the server.' });
    const body = await readBody(req);
    const key = `admin|${clientIp(req)}`;
    if (tooManyAttempts(key)) return sendJSON(res, 429, { error: 'Too many attempts. Please wait 15 minutes and try again.' });
    const ok = sameSecret(clip(body.username, 100), ADMIN_USERNAME) & sameSecret(String(body.password || '').slice(0, 200), ADMIN_PASSWORD);
    if (!ok) { recordFailure(key); return sendJSON(res, 401, { error: 'Incorrect username or password.' }); }
    failedLogins.delete(key);
    return sendJSON(res, 200, { ok: true },
      { 'Set-Cookie': cookie(req, ADMIN_COOKIE, makeToken('admin', ADMIN_HOURS * 3600e3, 'admin'), ADMIN_HOURS * 3600, 'Strict') });
  }
  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, ADMIN_COOKIE, '', 0, 'Strict') });
  }
  if (pathname === '/api/admin/me' && req.method === 'GET') {
    return sendJSON(res, 200, { admin: isAdmin(req), enabled: ADMIN_ENABLED, username: isAdmin(req) ? ADMIN_USERNAME : null });
  }

  if (pathname.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return sendJSON(res, 401, { error: 'Please log in as admin.' });

    // Real-time stream (Server-Sent Events)
    if (pathname === '/api/admin/stream' && req.method === 'GET') {
      if (liveClients.size >= 25) return sendJSON(res, 429, { error: 'Too many dashboards open.' });
      return openLiveStream(req, res);
    }

    if (pathname === '/api/admin/summary' && req.method === 'GET') {
      const { ymd, start } = istToday();
      const real = { status: { $ne: 'pending_payment' } };
      const [total, today, upcoming, requests, revenue, customers, subscribers, byStatus] = await Promise.all([
        col('bookings').countDocuments(real),
        col('bookings').countDocuments({ ...real, createdAt: { $gte: start } }),
        col('bookings').countDocuments({ 'customer.date': { $gte: ymd }, status: { $in: ['requested', 'payment_submitted', 'paid', 'confirmed'] } }),
        col('bookings').countDocuments({ status: { $in: ['requested', 'payment_submitted'] } }),
        col('bookings').aggregate([
          { $match: { 'payment.paymentId': { $exists: true }, status: { $in: ['paid', 'confirmed', 'completed'] } } },
          { $group: { _id: null, sum: { $sum: '$payment.paidOnline' } } },
        ]).toArray(),
        col('users').countDocuments(),
        col('subscribers').countDocuments(),
        col('bookings').aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
      ]);
      return sendJSON(res, 200, {
        total, today, upcoming, requests, revenue: revenue[0]?.sum || 0, customers, subscribers,
        byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
      });
    }

    if (pathname === '/api/admin/bookings' && req.method === 'GET') {
      const status = url.searchParams.get('status') || '';
      const q = clip(url.searchParams.get('q'), 60).trim();
      const filter = {};
      if (status === 'active') filter.status = { $in: ['requested', 'payment_submitted', 'paid', 'confirmed'] };
      else if (status) filter.status = status;
      else filter.status = { $ne: 'pending_payment' };
      if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ bookingId: rx }, { 'customer.name': rx }, { 'customer.mobile': rx }, { 'therapist.name': rx }, { 'customer.address': rx }];
      }
      const list = await col('bookings').find(filter).sort({ createdAt: -1 }).limit(300).toArray();
      return sendJSON(res, 200, { bookings: list.map(bookingForAdmin) });
    }

    // UPI payment screenshot for a booking (admin only)
    const proofMatch = pathname.match(/^\/api\/admin\/proofs\/([a-f0-9]{24})$/);
    if (proofMatch && req.method === 'GET') {
      const p = await col('proofs').findOne({ _id: toId(proofMatch[1]) });
      if (!p) return sendJSON(res, 404, { error: 'Screenshot not found.' });
      const buf = Buffer.from(p.data.buffer || p.data);
      res.writeHead(200, { 'Content-Type': p.type, 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
      return res.end(buf);
    }

    // Verify a UPI payment after checking the bank app: approve → Paid, reject → customer pays / submits again
    const verifyMatch = pathname.match(/^\/api\/admin\/bookings\/([A-Za-z0-9]{6,40})\/verify$/);
    if (verifyMatch && req.method === 'POST') {
      const body = await readBody(req);
      const b = await col('bookings').findOne({ bookingId: verifyMatch[1] });
      if (!b) return sendJSON(res, 404, { error: 'Booking not found.' });
      if (b.status !== 'payment_submitted') return sendJSON(res, 409, { error: 'This booking has no payment waiting for verification.' });
      if (body.action === 'approve') {
        const done = await col('bookings').findOneAndUpdate(
          { _id: b._id, status: 'payment_submitted' },
          { $set: { status: 'paid', paidAt: new Date(), updatedAt: new Date(), 'payment.paymentId': `UTR ${b.payment.utr}`, 'payment.confirmedVia': 'upi-verified' } },
          { returnDocument: 'after' });
        if (!done) return sendJSON(res, 409, { error: 'Already handled.' });
        await logEvent('payment_success', `Payment verified: ₹${b.payment.paidOnline} from ${b.customer?.name || 'customer'} (${b.bookingId}, UTR ${b.payment.utr})`, { bookingId: b.bookingId });
        return sendJSON(res, 200, { ok: true, booking: bookingForAdmin(done) });
      }
      if (body.action === 'reject') {
        const reason = clip(body.reason || 'Payment not received', 200).trim() || 'Payment not received';
        const done = await col('bookings').findOneAndUpdate(
          { _id: b._id, status: 'payment_submitted' },
          { $set: { status: 'pending_payment', updatedAt: new Date(), 'payment.rejected': reason },
            $unset: { 'payment.utr': '' }, $push: { 'payment.rejectedUtrs': b.payment.utr } },
          { returnDocument: 'after' });
        if (!done) return sendJSON(res, 409, { error: 'Already handled.' });
        await logEvent('payment_failed', `UPI payment rejected for ${b.customer?.name || 'a customer'} (${b.bookingId}, UTR ${b.payment.utr}): ${reason}`, { bookingId: b.bookingId });
        return sendJSON(res, 200, { ok: true, booking: bookingForAdmin(done) });
      }
      return sendJSON(res, 400, { error: 'Unknown action.' });
    }

    const statusMatch = pathname.match(/^\/api\/admin\/bookings\/([A-Za-z0-9]{6,40})$/);
    if (statusMatch && req.method === 'PATCH') {
      const body = await readBody(req);
      const status = String(body.status || '');
      if (!ADMIN_STATUSES.includes(status)) return sendJSON(res, 400, { error: 'Unknown status.' });
      const b = await col('bookings').findOneAndUpdate(
        { bookingId: statusMatch[1] },
        { $set: { status, updatedAt: new Date(), ...(typeof body.note === 'string' ? { adminNote: clip(body.note, 500) } : {}) } },
        { returnDocument: 'after' });
      if (!b) return sendJSON(res, 404, { error: 'Booking not found.' });
      await logEvent('status_change', `Booking ${b.bookingId} (${b.customer?.name || ''}) marked ${STATUS_LABEL[status]}`, { bookingId: b.bookingId, status });
      return sendJSON(res, 200, { ok: true, booking: bookingForAdmin(b) });
    }

    // Numbers for the Analytics tab (last 7 / 30 / 90 days, Indian time)
    if (pathname === '/api/admin/analytics' && req.method === 'GET') {
      const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
      const { start: todayStart } = istToday();
      const from = new Date(todayStart.getTime() - (days - 1) * 864e5);
      const list = await col('bookings')
        .find({ createdAt: { $gte: from }, status: { $ne: 'pending_payment' } },
          { projection: { status: 1, source: 1, createdAt: 1, therapist: 1, payment: 1, 'customer.time': 1, 'customer.mobile': 1 } })
        .toArray();

      const istDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
      const daily = [];
      for (let i = 0; i < days; i++) daily.push({ date: istDay(new Date(from.getTime() + i * 864e5 + 6 * 3600e3)), bookings: 0, revenue: 0 });
      const dayIndex = Object.fromEntries(daily.map((d, i) => [d.date, i]));
      const hours = Array.from({ length: 12 }, (_, i) => ({ hour: 10 + i, bookings: 0 })); // 10 AM – 9 PM slots
      const tally = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };
      const therapists = {}, statuses = {}, channels = {}, offers = {}, phones = {};
      let valueSum = 0, valueN = 0, discountSum = 0;

      for (const b of list) {
        const p = b.payment || {};
        const paidOnline = p.paymentId ? Number(p.paidOnline) || 0 : 0;
        const i = dayIndex[istDay(b.createdAt)];
        if (i !== undefined) { daily[i].bookings++; daily[i].revenue += paidOnline; }
        const m = String(b.customer?.time || '').match(/(\d+):\d+\s*(AM|PM)/i);
        if (m) { const h = (Number(m[1]) % 12) + (m[2].toUpperCase() === 'PM' ? 12 : 0); const slot = hours.find((x) => x.hour === h); if (slot) slot.bookings++; }
        if (b.therapist?.name) tally(therapists, b.therapist.name);
        tally(statuses, b.status);
        tally(channels, b.source === 'whatsapp' ? 'WhatsApp request' : p.method === 'cod' ? 'Cash on delivery' : 'Paid online');
        if (p.referral) { tally(offers, p.referral); discountSum += Number(p.discount) || 0; }
        if (b.customer?.mobile) tally(phones, b.customer.mobile);
        const value = Number(p.total ?? (Number(p.paidOnline || 0) + Number(p.cashOnService || 0))) || 0;
        if (value > 0 && b.status !== 'cancelled') { valueSum += value; valueN++; }
      }

      const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, value]) => ({ label, value }));
      const STATUS_ORDER = ['requested', 'paid', 'confirmed', 'completed', 'cancelled'];
      const customers = Object.values(phones);
      return sendJSON(res, 200, {
        days,
        total: list.length,
        daily, hours,
        therapists: top(therapists, 8),
        statuses: STATUS_ORDER.map((s) => ({ label: STATUS_LABEL[s], value: statuses[s] || 0 })),
        channels: ['WhatsApp request', 'Paid online', 'Cash on delivery'].map((c) => ({ label: c, value: channels[c] || 0 })),
        offers: top(offers, 8),
        tiles: {
          avgValue: valueN ? Math.round(valueSum / valueN) : 0,
          cancelRate: list.length ? Math.round(((statuses.cancelled || 0) / list.length) * 100) : 0,
          repeatCustomers: customers.filter((n) => n >= 2).length,
          uniqueCustomers: customers.length,
          offerShare: list.length ? Math.round((Object.values(offers).reduce((a, b) => a + b, 0) / list.length) * 100) : 0,
          discountSum,
          revenue: daily.reduce((a, d) => a + d.revenue, 0),
        },
      });
    }

    if (pathname === '/api/admin/customers' && req.method === 'GET') {
      const users = await col('users').find({}, { projection: { password: 0 } }).sort({ createdAt: -1 }).limit(500).toArray();
      const counts = await col('bookings').aggregate([
        { $match: { userId: { $ne: '' }, status: { $ne: 'pending_payment' } } },
        { $group: { _id: '$userId', n: { $sum: 1 } } },
      ]).toArray();
      const byUser = Object.fromEntries(counts.map((c) => [c._id, c.n]));
      return sendJSON(res, 200, {
        customers: users.map((u) => ({
          _id: String(u._id), name: u.name, email: u.email, mobile: u.mobile, city: u.city || '',
          createdAt: iso(u.createdAt), lastLoginAt: iso(u.lastLoginAt), bookings: byUser[String(u._id)] || 0,
        })),
      });
    }

    // Upload a therapist photo (the admin page shrinks it first). Body = the image bytes.
    if (pathname === '/api/admin/photos' && req.method === 'POST') {
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!PHOTO_TYPES[type]) return sendJSON(res, 400, { error: 'Please choose a JPG, PNG or WebP photo.' });
      if (Number(req.headers['content-length']) > PHOTO_MAX) {
        return sendJSON(res, 413, { error: 'Photo is too big (max 3 MB).' }, { Connection: 'close' });
      }
      let buf;
      try { buf = await readRawBody(req, PHOTO_MAX); } catch (e) { return sendJSON(res, 413, { error: 'Photo is too big (max 3 MB).' }); }
      if (!buf || !buf.length) return sendJSON(res, 400, { error: 'No photo received. Please try again.' });
      if (!PHOTO_TYPES[type](buf)) return sendJSON(res, 400, { error: "That file isn't a valid image." });
      const r = await col('photos').insertOne({ type, data: buf, size: buf.length, createdAt: new Date() });
      const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
      return sendJSON(res, 201, { url: `/api/photos/${r.insertedId}.${ext}` });
    }

    // Therapists & offers editor
    if (pathname === '/api/admin/catalog' && req.method === 'GET') {
      const c = await readCatalog();
      return sendJSON(res, 200, {
        therapists: Object.fromEntries(TYPES.map((ty) => [ty, (c.therapists?.[ty] || []).map((t, i) => ({ ...t, key: keyOf(t, i) }))])),
        offers: c.offers || [], contact: contactOf(c), version: new Date(c.updatedAt).toISOString(),
      });
    }
    if (pathname === '/api/admin/catalog' && req.method === 'PUT') {
      const body = await readBody(req);
      const current = await readCatalog();
      // Two admins editing at once: don't silently overwrite the other's changes
      if (body.version && body.version !== new Date(current.updatedAt).toISOString()) {
        return sendJSON(res, 409, { error: 'Someone else changed this list a moment ago. Reload the page and try again.' });
      }
      const $set = { updatedAt: new Date() };
      const what = [];
      if (body.therapists !== undefined) { $set.therapists = cleanTherapists(body.therapists); what.push('therapists'); }
      if (body.offers !== undefined) { $set.offers = cleanOffers(body.offers); what.push('offers'); }
      if (body.contact !== undefined) { $set.contact = cleanContact(body.contact); what.push('contact details'); }
      if (!what.length) return sendJSON(res, 400, { error: 'Nothing to save.' });
      await col('settings').updateOne({ _id: CATALOG_ID }, { $set });
      if ($set.therapists) {
        const used = Object.values($set.therapists).flat().map((t) => (String(t.photo).match(PHOTO_URL_RE) || [])[1]).filter(Boolean).map(toId);
        await col('photos').deleteMany({ _id: { $nin: used }, createdAt: { $lt: new Date(Date.now() - 864e5) } }).catch(() => {});
      }
      const note = body.note ? ` (${clip(body.note, 80)})` : '';
      await logEvent('catalog_update', `Admin updated the ${what.join(' and ')}${note} – live on the website`);
      return sendJSON(res, 200, { ok: true, version: $set.updatedAt.toISOString() });
    }

    if (pathname === '/api/admin/subscribers' && req.method === 'GET') {
      const subs = await col('subscribers').find().sort({ createdAt: -1 }).limit(1000).toArray();
      return sendJSON(res, 200, { subscribers: subs.map((s) => ({ email: s.email, createdAt: iso(s.createdAt) })) });
    }

    if (pathname === '/api/admin/events' && req.method === 'GET') {
      const events = await col('events').find().sort({ at: -1 }).limit(60).toArray();
      return sendJSON(res, 200, { events: events.map((e) => ({ ...e, _id: String(e._id), at: iso(e.at) })) });
    }

    return sendJSON(res, 404, { error: 'Not found' });
  }

  if (pathname.startsWith('/api/')) return sendJSON(res, 404, { error: 'Not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
}

// ---------- Connect to MongoDB once (reused by every request, and by warm Vercel functions) ----------
let readyPromise = null;
function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const db = await store.connect(MONGODB_URI);
      console.log(`MongoDB: connected (database "${db.databaseName}", live updates via ${store.supportsChangeStreams() ? 'change streams' : 'this server'})`);
      const imported = await store.importJsonFiles(DATA_DIR);
      if (imported.length) console.log(`MongoDB: imported ${imported.join(' and ')} from the old data/ JSON files`);
      return db;
    })();
    readyPromise.catch(() => { readyPromise = null; }); // try again on the next request
  }
  return readyPromise;
}

/** Handles one request. Used by `node backend/server.js` below, and by Vercel through api/index.js. */
async function requestHandler(req, res) {
  // Setup check: which settings this server can see (yes/no only) and whether the database connects
  if (req.url.split('?')[0] === '/api/health') {
    let database = 'connected';
    try { await ready(); } catch (e) { database = 'failed: ' + String(e.message).replace(/\/\/[^@/\s]*@/g, '//***@'); }
    const seen = (k) => Boolean(process.env[k]);
    return sendJSON(res, database === 'connected' ? 200 : 503, {
      ok: database === 'connected' && ADMIN_ENABLED,
      database,
      settings: {
        MONGODB_URI: seen('MONGODB_URI'), SESSION_SECRET: seen('SESSION_SECRET'),
        ADMIN_USERNAME: seen('ADMIN_USERNAME'), ADMIN_PASSWORD: seen('ADMIN_PASSWORD'),
        ADMIN_PASSWORD_long_enough: ADMIN_ENABLED, paymentGateway: 'UPI QR (business UPI ID in Admin → Contact)',
      },
      liveUpdates: database === 'connected' ? (store.supportsChangeStreams() ? 'change streams' : 'this server') : 'unknown',
    });
  }
  try {
    await ready();
  } catch (e) {
    console.error(`MongoDB connection failed: ${e.message}`);
    return sendJSON(res, 503, { error: 'The booking system is temporarily unavailable (database connection failed). Please try again in a minute.' });
  }
  return handle(req, res).catch((err) => {
    console.error(err.message);
    // Database / network hiccups: don't show customers the technical message
    const infra = /^Mongo/.test(String(err.name)) || /ECONN|ETIMEDOUT|EPIPE|socket|connection .* closed|timed out/i.test(String(err.message));
    if (!res.headersSent) {
      if (infra) sendJSON(res, 503, { error: 'Our system is busy for a moment. Please try again in a few seconds.' });
      else sendJSON(res, 400, { error: err.message || 'Something went wrong.' });
    }
    else res.end();
  });
}
module.exports = requestHandler;

// ---------- Start (only when run directly: node backend/server.js) ----------
if (require.main === module) (async () => {
  try {
    await ready();
  } catch (e) {
    console.error(`\n✖ Could not connect to MongoDB at ${MONGODB_URI.replace(/\/\/[^@/]*@/, '//***@')}\n  ${e.message}`);
    console.error('  Start MongoDB (Windows: the "MongoDB" service) or set MONGODB_URI in .env, then run npm start again.\n');
    process.exit(1);
  }
  const server = http.createServer(requestHandler);
  server.listen(PORT, () => {
    console.log(`AAPNA SPA running at http://localhost:${PORT}`);
    console.log(ADMIN_ENABLED
      ? `Admin dashboard: http://localhost:${PORT}/admin  (username "${ADMIN_USERNAME}")`
      : 'Admin dashboard: OFF – set ADMIN_PASSWORD (10+ characters) in .env to turn it on');
    console.log('Payments: UPI QR + screenshot/UTR (set the business UPI ID in Admin → Contact)');
  });
})();
