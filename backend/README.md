# Backend (Node.js + MongoDB)

Everything that runs on the server lives in this folder. It serves both the **website** and the **admin dashboard**.

| File | What it does |
|---|---|
| `server.js` | The server: serves the built site (`dist/`) and every `/api/…` address listed below |
| `db.js` | Connects to MongoDB (Atlas or local), creates indexes, imports old JSON data once |

Run it from the project folder:

```
npm start            # same as: node backend/server.js  → http://localhost:5500  (admin: /admin)
```

Settings come from the `.env` file in the **project folder** (one level up). On Vercel they come from
Settings → Environment Variables, and `api/index.js` (Vercel needs it in that place) simply loads `backend/server.js`.

## Website API (used by `src/website/`)

| Address | What it does |
|---|---|
| `GET /api/config` | Whether UPI payment is set up (business UPI ID in Admin → Contact) |
| `GET /api/catalog` | Therapists, prices, offers and contact details to show (edited in the admin) |
| `GET /api/photos/:id` | Serves an uploaded therapist photo (cached for a year) |
| `GET /api/locate?lat=&lon=` | Turns the customer's location into a city name (OpenStreetMap; coordinates not stored) |
| `POST /api/signup`, `/api/login`, `/api/logout`, `GET /api/me` | Customer accounts (scrypt-hashed passwords, 30-day login cookie, 5 wrong tries = 15 min lock); saves the detected city |
| `POST /api/subscribe` | Newsletter sign-up |
| `POST /api/create-order` | **Pay button**: prices the booking on the server (Pay Online = treatment + ₹149 visiting charge), saves it as *Awaiting payment*, returns the UPI ID + amount for the QR |
| `POST /api/payment-proof?bookingId=&utr=&deviceId=` | Customer uploads the payment screenshot (body = image) + 12-digit UTR → *Payment to verify* (UTR usable once) |
| `POST /api/cashfree-verify`, `/api/cashfree-webhook` | Old Cashfree flow – only for bookings started before the switch to UPI |
| `GET /api/notifications` | Logged-in customer's *Payment pending* reminders |
| `POST /api/resume-payment` | *Pay now* from a reminder – shows the UPI QR again for the same booking |
| `POST /api/my-bookings` | My Bookings page (this device + this account) |
| `POST /api/booking-request` | Older WhatsApp-style request (no longer used by the Pay button) |
| `POST /api/verify-payment`, `/api/razorpay-webhook` | Old Razorpay flow (not used for new bookings) |
| `GET /api/health` | Shows which settings are present (yes/no only) and if the database is connected |

## Admin API (used by `src/admin/`) – all need the admin login

| Address | What it does |
|---|---|
| `POST /api/admin/login`, `/api/admin/logout`, `GET /api/admin/me` | Admin sign-in (12-hour cookie, rate-limited) |
| `GET /api/admin/stream` | **Live updates** (Server-Sent Events; MongoDB change streams on Atlas/Vercel) |
| `GET /api/admin/summary` | The stat tiles |
| `GET /api/admin/bookings` | Bookings list with filter/search |
| `PATCH /api/admin/bookings/:id` | Change a booking's status (customer sees it on My Bookings) |
| `POST /api/admin/bookings/:id/verify` | UPI payment checked: `approve` → Paid, `reject` (+ reason) → customer pays again |
| `GET /api/admin/proofs/:id` | A customer's UPI payment screenshot |
| `GET /api/admin/analytics?days=` | Data for the charts |
| `POST /api/admin/photos` | Upload a therapist photo (JPG/PNG/WebP, max 3 MB) – saved in MongoDB |
| `GET` / `PUT /api/admin/catalog` | Therapists, offers & contact details editor (Drive photo links converted, numbers/emails cleaned, everything validated) |
| `GET /api/admin/customers`, `/api/admin/subscribers`, `/api/admin/events` | Customers, newsletter list, activity feed |

## Where things are in `server.js`

Search for these headings in the file:

- `Catalog: therapists, offers & prices` – reading/saving the catalog, Drive photo links, validation
- `Cashfree API` / `Razorpay API` – payment gateway calls, `markPaid`, `confirmCashfree`
- `Live updates for the admin dashboard` – activity log + live stream
- `Routes` – every address above, website first, then `===== Admin =====`

## Database (MongoDB, database `apkaspa`)

`users`, `bookings`, `subscribers`, `photos` (uploaded therapist photos), `proofs` (UPI payment screenshots), `events` (activity, auto-deleted after 90 days), `settings` (document `catalog`).
