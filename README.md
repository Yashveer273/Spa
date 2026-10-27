# AAPNA SPA – Spa Website

The website and the admin dashboard are built with **React + TypeScript** (bundled by **Vite**).
A small **Node.js** server (in the **`backend/`** folder) serves them, stores everything in **MongoDB**, and takes payments by **UPI QR** (customer uploads screenshot + UTR, admin verifies).

## Guides for each part

| Part | Folder | Guide |
|---|---|---|
| Website (frontend) | `src/website/` | [src/website/README.md](src/website/README.md) |
| Admin dashboard (frontend) | `src/admin/` | [src/admin/README.md](src/admin/README.md) |
| Backend for both (Node + MongoDB, all `/api` addresses) | `backend/` | [backend/README.md](backend/README.md) |

## Quick start

```
npm install          # once
npm run build        # builds the website + admin into dist/
npm start            # starts backend/server.js – open http://localhost:5500  (admin: http://localhost:5500/admin)
```

Run `npm run build` again after changing anything in `src/`, `shared/` or `public/`. The server reads `dist/`.

### While developing (live reload)
Run these in two terminals:
```
npm start            # backend: API + database on http://localhost:5500
npm run dev          # React with instant reload on http://localhost:5173  (admin: /admin/)
```
`npm run dev` forwards `/api` calls to the server, so logins, bookings and the live admin feed all work.
`npm run typecheck` checks all TypeScript without building.

## Project layout

```
spa/
├── index.html              ← entry page for the website
├── admin/index.html        ← entry page for the admin dashboard
├── src/
│   ├── website/            ← WEBSITE frontend (React + TypeScript) – see its README.md
│   │   ├── App.tsx         ← pages & addresses (routes)
│   │   ├── pages/          ← Home, BookNow, Checkout, Offers, Bookings, Auth (login + sign-up)
│   │   ├── components/     ← Header (menu, notifications, city), BottomNav, Footer, Photo, MapPicker…
│   │   └── lib/            ← server calls, login state, browser storage, helpers
│   ├── admin/              ← ADMIN frontend (React + TypeScript) – see its README.md
│   └── styles/             ← the stylesheets (same design as before)
├── shared/catalog.json     ← starting copy of therapists & offers (edit them in the admin)
├── public/assets/          ← your photos & video (copied into the build as /assets/…)
├── backend/                ← BACKEND: server.js (all /api routes, payments, admin API) + db.js (MongoDB)
├── api/index.js            ← tiny Vercel entry that loads backend/server.js (Vercel needs it here)
└── dist/                   ← the built site (created by npm run build – don't edit)
```

## Pages

| Address | Page |
|---|---|
| `/` | Home |
| `/book-now` (`#basic`, `#therapist`, `#premium` open a tab) | Choose booking type & therapist |
| `/therapist/basic/0` (type / position in the list, from 0) | Therapist details & checkout |
| `/offers` | Offers |
| `/bookings` | My Bookings |
| `/login`, `/signup` | Log in / Create account (`?next=/bookings` returns there after login) |
| `/payment-return` | Old Cashfree return page (only for bookings started before the switch to UPI) |
| `/admin` | Admin dashboard |


## Where to put your photos and video

Put files in `public/assets/` with **exactly these names**, then run `npm run build`. Until a file exists, the site shows a green placeholder with the expected path.

```
public/assets/
├── videos/hero.mp4                  ← hero background video (always silent)
└── images/
    ├── hero-poster.jpg              ← still shown while the video loads
    ├── logo.png                     ← optional photo logo; until it exists the built-in AAPNA SPA lotus logo is shown
    ├── avatar.jpg                   ← round picture, top-left of the header
    ├── home-service.webp, hotel-service.webp, therapist.webp   ← home page service banners ("Designed around your comfort")
    ├── full-body.webp, head-neck-shoulder.webp, foot-reflexology.webp  ← massage banners ("Our most loved massages")
    ├── login-bg.jpg                 ← photo behind the login page's left panel (desktop)
    ├── notice-banner.jpg            ← optional banner above the time slots (e.g. holiday closure)
    └── therapists/
        ├── basic-1.jpg … basic-14.jpg
        ├── therapist-1.jpg … therapist-5.jpg
        └── premium-1.jpg … premium-3.jpg
```

## Therapists, prices and offers (edit them in the admin)

Open **Admin → Therapists** or **Admin → Offers**. Changes are saved in MongoDB and show on the website straight away –
no rebuild or redeploy needed.

**Therapists:** add, edit (name, speciality, price, rating, reviews, experience, languages, about), move up/down,
**Hide** (taken off the website but kept for later) or **Delete**. Use the *Type* box to move someone between
Basic / Therapist / Premium.

**Therapist photo – choose one of two ways** in the edit form:

*Upload photo* (easiest): press **Choose photo** and pick a JPG, PNG or WebP from your phone or computer.
It is resized automatically (max 1000 px) and saved in **MongoDB** (collection `photos`), so it is never lost
when the server restarts or you redeploy on Vercel. (Files can't be saved into the `public` folder on the live
site – Vercel's disk is temporary and `public` is only read when the site is built.) Photos no longer used by any
therapist are removed automatically after a day.

*Google Drive link*:
1. Upload the photo to Google Drive.
2. Right-click it → **Share** → under *General access* choose **Anyone with the link** → **Copy link**.
3. Paste the link into the *Google Drive link* box. The preview shows the photo; if it says
   "Can't load", the photo isn't shared publicly yet. (A folder link won't work – it must be the photo's own link.)

The server turns the Drive link into a direct image address automatically. Any other `https://` image address also works,
and so does a file name in `public/assets/images/therapists/`.

**Offers:** add or edit the code, title, description, % or ₹ off and an optional maximum discount.
*Active* switches the code on/off at checkout; untick *Show on the Offers page* for a secret code that still works.

Every booking is priced by the server from these saved values, so nobody can change a price in their browser.
Each change is listed in the admin's Activity feed (🛠️).

`shared/catalog.json` is only the **starting copy**: it fills the database the first time the server runs, and the
website uses it for a moment until the live list arrives. After that, edit in the admin, not in the file.
The visiting charge (`visitCharge`) and WhatsApp number (`businessWhatsapp`) are also in this starting copy.

Other settings: time-slot hours at the top of `src/website/pages/Checkout.tsx`, menu links and cities in `src/website/components/Header.tsx`, the map's starting point in `src/website/components/MapPicker.tsx`.

## Customer's city (detected at login / sign-up)

When a customer opens the login or sign-up page, the browser asks to share their location. If they allow it,
the server looks up the city on OpenStreetMap (only the city name is kept – never the exact location) and shows
"Your city: Pune". The city is saved on their account, appears in the header's city pill and in Admin → Customers.
If they block location, they can still log in normally (a *Try again* button is shown). Browsers only allow
location on **https://** sites (and on localhost).

## Online payments (UPI QR + screenshot / UTR)

1. **Admin → Contact → Business UPI ID**: enter your own UPI ID (e.g. `yourname@okhdfcbank`) and the payee name.
   Until it is set, the Pay button says online payment isn't set up yet.
2. That's it – no keys or gateway account needed.

How it works:
- **Pay Online** = treatment (minus any offer) **+ ₹149 visiting / travel charge**; **Cash on Delivery** = ₹149 now, treatment in cash.
  The server calculates the amount itself – a customer can't change it.
- The customer sees an **animated QR** for your UPI ID with the exact amount and booking ID filled in (plus a *Pay with UPI app*
  button on phones and a 10-minute timer). The booking is saved as *Awaiting payment*.
- After paying they tap **I have paid**, upload the **payment screenshot** and type the **12-digit UTR** (UPI reference number).
  The booking becomes **Payment to verify** and appears in the admin straight away (with a ⏳ in the activity feed).
- In **Admin → Bookings → To verify** you see the screenshot, UTR and amount. Check your bank / UPI app, then press
  **✓ Payment received** (booking → Paid) or **Reject** with a reason (the customer is asked to pay and upload again).
- A UTR can only be used for one booking, screenshots are private (admin only), and only the customer's own device/account can submit.
- Logged-in customers who leave without paying get a *Payment pending* reminder under the bell with **Pay now**.

**Important:** a screenshot alone is not proof – always match the UTR and amount in your own bank app before approving.

Older Cashfree/Razorpay code (`/payment-return`, webhooks) is kept only so bookings started before the switch can still finish.

## Accounts

Customers can sign up and log in. Accounts are stored in MongoDB with passwords only as secure scrypt hashes; logins last 30 days (HttpOnly cookie); 5 wrong passwords lock that email for 15 minutes. Therapist/hotel "Log in here" links open WhatsApp for now. *Not built yet:* "Forgot password".

## Database (MongoDB) & admin dashboard

Everything is stored in the `apkaspa` database:

| Collection | What's in it |
|---|---|
| `users` | Customer accounts |
| `bookings` | Every booking: WhatsApp requests, online payments, cash on delivery |
| `subscribers` | Newsletter sign-ups |
| `settings` | Therapists, prices, offers and contact / UPI details (document `catalog`, edited in the admin) |
| `proofs` | UPI payment screenshots (admin only) |
| `events` | Activity log for the live feed (auto-deleted after 90 days) |

**Admin dashboard — `/admin`:** sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env` (10+ characters; session lasts 12 hours).
- **Live** updates with no refresh (green dot), optional sound for new bookings/payments.
- **Bookings:** filters, search, Call/WhatsApp/map links, change status (customers see it on My Bookings).
- **Therapists** and **Offers:** edit what the website shows (see above).
- **Contact:** WhatsApp, phone, Instagram, email, address and opening hours shown on the website (home contact cards, footer, booking pages, help links). Leave a box empty to hide it.
- **Customers** also shows each customer's **city**, detected from their location when they log in or sign up.
- **Analytics:** 7/30/90-day tiles and charts, each with a Table view.
- **Customers**, **Subscribers** (copy all emails) and **Activity**.

### MongoDB Atlas
1. Atlas → **Security → Network Access**: add your IP (and later your hosting server's).
2. In `.env`, set `MONGODB_URI` to your connection string with the password filled in (no `< >`), keeping `/apkaspa` after `.mongodb.net`.
3. `npm start` should say `MongoDB: connected (database "apkaspa")`.

If your network's DNS can't look up `mongodb+srv://` addresses (`querySrv ECONNREFUSED`), the server retries with public DNS (8.8.8.8 / 1.1.1.1) automatically; change them with `DNS_SERVERS` in `.env`.

## Deploying to Vercel

The project is ready for Vercel: the website and admin are served as static files from `dist/`, and every `/api/…`
request runs `api/index.js` (which loads `backend/server.js`) as a serverless function. Settings are in `vercel.json`;
`.vercelignore` keeps `.env` and `data/` from ever being uploaded.

1. **Atlas → Security → Network Access → Add IP Address → Allow access from anywhere (`0.0.0.0/0`).**
   Vercel has no fixed IP addresses. Your database is then protected only by its password, so use a long, unique one.
2. **Make a session secret** (keeps customers logged in):
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. **Deploy** with the Vercel CLI from this folder:
   ```
   npx vercel login
   npx vercel            # first time: creates the project (accept the detected settings)
   ```
   or push the folder to GitHub and use **Vercel → Add New → Project → Import**.
4. **Vercel → Project → Settings → Environment Variables** (Production): `MONGODB_URI`, `ADMIN_USERNAME`,
   `ADMIN_PASSWORD`, `SESSION_SECRET`, and for payments `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV`
   (plus `NODEJS_HELPERS=0` for the payment webhook).
5. Deploy to production: `npx vercel --prod` (or push to GitHub again).

How it behaves on Vercel:
- **Live admin updates** use MongoDB change streams (Atlas supports them). Each live connection lasts ~55 s, then the
  browser reconnects and reloads, so nothing is missed.
- **Login rate limits** (5 wrong passwords) are counted per server copy, so they're a little looser on Vercel.
- Vercel's free **Hobby** plan is for non-commercial use; a business site needs the **Pro** plan.

## Hosting it online (any Node.js host)
Use a host that runs Node.js (Render, Railway, a VPS) with HTTPS:
1. `npm install` → `npm run build` → `npm start` (runs `node backend/server.js`).
2. Set the values from `.env` as environment variables there, including a `SESSION_SECRET`.
3. Use MongoDB Atlas for the database, and back it up regularly.
#   S p a  
 