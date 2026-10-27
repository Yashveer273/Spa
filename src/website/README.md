# Website – frontend (React + TypeScript)

The customer website: home page, booking, checkout and payment, offers, my bookings, login / sign-up.
It runs in the browser and talks to the backend (`backend/server.js`) through `/api/…` addresses.

- **Entry page:** `index.html` (project folder) → `src/website/main.tsx` → `App.tsx`
- **Styles:** `src/styles/` (`style.css` + `header.css` for every page, plus one file per page)
- **Photos & video:** `public/assets/` (see the main README for the exact file names)

## Pages (`pages/`)

| Address | File | What it does |
|---|---|---|
| `/` | `Home.tsx` | Hero video, services, why us, contact |
| `/book-now` | `BookNow.tsx` | Choose Basic / Therapist / Premium and a therapist (list comes live from the admin) |
| `/therapist/:type/:id` | `Checkout.tsx` | Therapist details, date & time, address + map pin, offer code, **Pay Online** (treatment + ₹149 visiting charge) / **Pay Visiting Charge** → UPI QR + screenshot/UTR |
| `/payment-return` | `PaymentReturn.tsx` | Old Cashfree return page (bookings started before the switch to UPI) |
| `/offers` | `Offers.tsx` | Offer codes (managed in the admin) |
| `/bookings` | `Bookings.tsx` | My bookings – upcoming and past, with status |
| `/login`, `/signup` | `Auth.tsx` | Customer accounts – asks for location and shows the detected city |

Routes are listed in `App.tsx`.

## Parts used on many pages (`components/`)

| File | What it is |
|---|---|
| `Header.tsx` | Top bar: menu drawer, **notifications** (payment-pending reminders with *Pay now*), city picker. Menu links and cities are at the top of this file. |
| `BottomNav.tsx` | Phone-style bottom navigation |
| `Footer.tsx` | Footer with newsletter sign-up |
| `MapPicker.tsx` | Leaflet map to drop a pin for the address (starting point set here) |
| `Photo.tsx` | An image with a green placeholder until the photo exists |
| `Icon.tsx` | All the line icons |
| `Toast.tsx` | Small pop-up messages |
| `UpiPay.tsx` | UPI checkout: animated QR → upload screenshot + UTR → submitted (used by the checkout and the bell's *Pay now*) |

## Helpers (`lib/`)

| File | What it does |
|---|---|
| `api.ts` | Every call to the backend (`api.createOrder`, `api.notifications`, …) |
| `catalog.tsx` | Live therapists, prices, offers and **contact details** (WhatsApp, phone, Instagram, email…) from `/api/catalog` (falls back to `shared/catalog.json`) |
| `location.ts` | Asks the browser for the location and gets the city name from the backend |
| `auth.tsx` | Knows whether a customer is logged in |
| `image.ts` | Shrinks photos/screenshots in the browser before uploading |
| `storage.ts` | Things kept in this browser: device id, saved offer, city, favourites |
| `format.ts`, `hooks.ts`, `types.ts` | Money/date formatting, small React helpers, shared types |

Shared with the backend: `shared/catalog.ts` (price and discount rules) and `shared/catalog.json` (starting copy of therapists & offers).

## Work on it

```
npm start        # backend on http://localhost:5500 (needed for logins, bookings, payments)
npm run dev      # website with instant reload on http://localhost:5173
npm run build    # build for the real site (into dist/)
```

Things you may want to change: time-slot hours at the top of `pages/Checkout.tsx`, menu links and cities in
`components/Header.tsx`. Therapists, prices, photos, offers and contact details are edited in the **admin**, not here.
