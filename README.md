# D Mojo Stage — local deployment

Ticket pre-booking site for D Mojo Art (TanStack Start + React). It now runs fully on your own machine:

| Was (Supabase) | Now (local) |
| --- | --- |
| Supabase Postgres + RLS | MySQL 8 / MariaDB 10.5+ — access rules enforced in `src/lib/*.functions.ts` |
| Supabase Auth | Built-in email/password login, hashed (scrypt), HttpOnly cookie sessions in the `sessions` table |
| Supabase Storage (`event-media`) | Files on disk in `STORAGE_DIR`, served at `/media/*`, uploaded via `/api/upload` |
| Lovable asset CDN (`/__l5e/...`) | Plain files in `public/assets/` |

## Quick start

Requires Node 22+ and Docker (or any MySQL 8 / MariaDB 10.5+ server — create an empty database and user, then edit `DATABASE_URL` in `.env`).

```sh
npm install
npm run db:up          # starts MySQL in Docker (skip if you use your own MySQL/MariaDB)
npm run db:setup       # creates tables + loads starter events/halls/prices
npm run dev            # http://localhost:3000
```

Open <http://localhost:3000/auth>. While no account exists, that page creates the **first administrator**.
(Or from a terminal: `npm run create-admin -- you@example.com 'a-strong-password'`.)
More staff (editor, booking manager, executive) are added from **Admin → Users & roles**.

### Images you must copy over
The logo/poster/cast images were hosted on Lovable and are not in the zip. Download them from your Lovable
project and save them as:

```
public/assets/premxl-poster.jpg   public/assets/premxl-logo.jpg
public/assets/premxl-cast.png     public/assets/premxl-title.png
```

## Payments — NTT DATA Payment Services (Atom)

Pre-booking payments go through NTT DATA's hosted checkout (UPI, cards, net banking, wallets). It is
configured by the `ATOM_*` values in `.env` (currently the **UAT test** credentials).

If you already set the database up before this update, run `npm run db:migrate` once (adds `payment_attempts`).

Flow: *Pay* → server asks Atom for a token (AES-256 encrypted request) → Atom's checkout opens →
Atom POSTs the encrypted result to `PUBLIC_BASE_URL/api/payment/return` → the server decrypts it,
verifies the HMAC-SHA512 signature and the amount, then marks the booking paid and issues the ticket.
If a customer pays but never returns to the site, reopening their booking asks Atom's Transaction
Status API and settles it. Every try is logged in the `payment_attempts` table.

- Test it with the gateway's UAT test cards / UPI / net-banking simulators.
- `PUBLIC_BASE_URL` must be the address the customer's browser uses (e.g. `https://tickets.example.com` in production).
- For **production**: set `ATOM_ENV=prod` and replace every `ATOM_*` value with the production ones
  (merchant ID, passwords, keys, and the production API/JS URLs from NTT DATA). Keep `.env` private.
- `PAYMENT_PROVIDER=simulated` bypasses the gateway for offline demos; never use it live.
- Refunds are not wired into the dashboard yet (the Refund API needs `atom_txn_id`, which is stored on each attempt).

## Production-style run on one machine

```sh
npm run build
npm start              # node .output/server/index.mjs, reads .env, listens on PORT (default 3000)
```
Set `COOKIE_SECURE=true` when serving over https, change the database password, and back up both the
MySQL data (`mysqldump`) and `STORAGE_DIR` (uploaded posters/images).

## Moving existing data
Accounts (passwords) do not carry over — create a new admin with `npm run create-admin` and re-add staff.
If you have data in the earlier PostgreSQL version or in Supabase, export each table (`events`, `halls`,
`hall_categories`, `executives`, `bookings`, `site_content`, `page_blocks`) as CSV and import it into the
matching MySQL table (IDs are the same UUID strings). Note `site_content` columns are `content_key` /
`content_value`. Copy the `event-media` files into `STORAGE_DIR` keeping the same paths.

## Hosting on cPanel (GoDaddy etc.)
cPanel's **MySQL Databases** wizard creates the database and user (names get a account prefix, e.g.
`cpuser_dmojo`). Put them in `DATABASE_URL=mysql://cpuser_dmojo:PASSWORD@localhost:3306/cpuser_dmojo`.
The app still needs Node.js 22 — use cPanel's **Setup Node.js App** if your plan has it; otherwise use a VPS.
Run the SQL in `db/migrations/` through phpMyAdmin if you can't run `npm run db:migrate` remotely.

## Layout
- `db/migrations/001_schema.sql`, `db/seed.sql`, `scripts/` — database setup
- `src/server/*.server.ts` — database pool, auth/sessions, file storage (server only)
- `src/lib/*.functions.ts` — server functions (all data access + role checks)
- Roles: `admin` (all) · `editor` (events, page content) · `booking_manager` (all bookings) · `executive` (own bookings)

## GST, service charge and tax invoices (stage 6)

- **Settings:** Admin → *Pricing & GST* (admin only). GST rate, inclusive/exclusive prices, service charge (percent or flat per ticket), CGST+SGST or IGST display, and the seller details printed on invoices. Defaults are off, so nothing changes until you save settings.
- **Pricing:** computed on the server in `src/lib/pricing.ts` when a booking is created. `bookings.total_price` is the whole-rupee amount charged and sent to the payment gateway; the build-up (ticket value, GST, service charge, round-off) is stored in `bookings.price_breakup` (JSON). Bookings made earlier have no breakup and keep their total.
- **Invoice:** `GET /api/invoice/<booking id>` returns a PDF for a paid booking (customer: "Download tax invoice" next to the ticket; staff: *Invoice* in the bookings table). The invoice is numbered per financial year (`INV/2026-27/000001`) the first time it is requested, and the seller details are saved with it. It shows Booking ID, Merchant Transaction ID and ticket code.
- **Reconciliation:** Admin / booking manager → bookings → *Reconcile*. Check with the gateway, or set the status by hand: pending/failed → paid (needs a payment reference), pending → failed, paid → refunded (cancels the booking and frees the seats). Every change is written to the activity log.
- **Database:** migration `007_gst_invoices.sql` adds `bookings.price_breakup`, `invoices` and `invoice_counter`. Run `npm run db:migrate` before deploying this code.
- A refund does not yet produce a credit note; invoices already issued are not altered.
