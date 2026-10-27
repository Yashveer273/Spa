# Admin dashboard – frontend (React + TypeScript)

The owner's dashboard at **`/admin`**: bookings, analytics, therapists & offers, customers, subscribers and a live
activity feed. It runs in the browser and talks to the backend's admin API (`/api/admin/…` in `backend/server.js`).

- **Entry page:** `admin/index.html` (project folder) → `src/admin/main.tsx` → `AdminApp.tsx`
- **Styles:** `src/styles/admin.css`
- **Sign in:** `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env` (on Vercel: Environment Variables). The session lasts 12 hours.

## Files

| File | What it does |
|---|---|
| `AdminApp.tsx` | Login screen, sidebar tabs, stat tiles, **live updates** (Server-Sent Events from `/api/admin/stream`), toasts and the optional sound |
| `api.ts` | Every admin call to the backend, plus the data types and ₹/date formatting |
| `components/Bookings.tsx` | **Bookings** tab: filters (incl. **To verify**), search, Call / WhatsApp / map links, status; UPI payments show the screenshot + UTR with **✓ Payment received / Reject** |
| `components/Analytics.tsx` + `Charts.tsx` | **Analytics** tab: 7/30/90-day tiles and charts, each with a table view |
| `components/Catalog.tsx` | **Therapists** tab (add, edit, hide, reorder, delete; photo by **upload** or Google Drive link), **Offers** tab (codes, % or ₹ off, on/off, secret codes) and **Contact** tab (WhatsApp, phone, Instagram, email, address, hours, **business UPI ID**) |
| `components/Panels.tsx` | **Customers**, **Subscribers** (copy all emails) and the **Activity** feed |

## Tabs at a glance

| Tab | Shows / does | Backend address |
|---|---|---|
| Bookings | Every booking, live; change status | `GET /api/admin/bookings`, `PATCH /api/admin/bookings/:id` |
| Analytics | Charts for the business | `GET /api/admin/analytics?days=30` |
| Therapists / Offers / Contact | Edit what the website shows – live, no redeploy | `GET` / `PUT /api/admin/catalog` |
| Customers | Accounts made on the website, with their detected city | `GET /api/admin/customers` |
| Subscribers | Newsletter sign-ups | `GET /api/admin/subscribers` |
| Activity | Everything happening, as it happens | `GET /api/admin/events` + `/api/admin/stream` |

The stat tiles at the top come from `GET /api/admin/summary`.

## Work on it

```
npm start        # backend on http://localhost:5500 – admin at http://localhost:5500/admin
npm run dev      # instant reload on http://localhost:5173/admin/
```
