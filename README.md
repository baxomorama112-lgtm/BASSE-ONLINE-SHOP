# BASSE ONLINE SHOP — PAYMENT + ADMIN BUILD

## Customer flow
1. Customer taps **BUY NOW**.
2. Enters quantity, full name, WhatsApp number and location.
3. Taps **PAY WITH WAYCHIT**.
4. The server creates a Waychit Payment Request for the exact order total and redirects to Waychit's hosted checkout.
5. Waychit sends the signed completion webhook to the server.
6. Customer returns to BASSE ONLINE SHOP and the order is checked for **PAID** status.
7. Customer can open WhatsApp to the shop with a pre-filled order/receipt message.

If the live API request is unavailable, the site uses the configured Waychit static merchant payment link as a visible fallback instead of leaving the payment button dead. A static payment link cannot carry the dynamic order amount or guarantee an automatic success redirect, so the live API + webhook should remain the primary path.

## Admin
- Add/edit/delete products with image upload or URL
- Product changes appear immediately on the marketplace
- Searchable marketplace with suggestions
- Pending, Paid, Cancelled and Refunded payment states
- Confirm payment, cancel unpaid order, mark refund, reopen order
- NEW / PROCESSING / READY / DELIVERED order workflow
- Daily sales and dashboard counters
- Mobile-friendly controls and interactive feedback

## Waychit setup
Set these environment variables in Render:
- `WAYCHIT_API_KEY` — private live/test API key
- `WAYCHIT_WEBHOOK_SECRET` — webhook signing secret
- `PUBLIC_BASE_URL` — `https://basse-online-shop.onrender.com`
- `WAYCHIT_STATIC_URL` — optional static merchant payment fallback
- `WHATSAPP_SUPPORT` — shop WhatsApp number in international digits
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `DATA_DIR=/opt/render/project/src/server/data`

Webhook URL:
`https://basse-online-shop.onrender.com/api/waychit/webhook`

Keep the API key and webhook secret only in Render Environment Variables. Never place them in marketplace HTML/JavaScript.

Waychit API reference: https://waychit.com/developers


## Live updates
The marketplace, admin dashboard, and vendor dashboard use a server-sent event stream at `/api/live` for near-instant updates, with a 5-second polling fallback. Product edits, approvals, vendor changes, orders, and payment status changes broadcast refresh events automatically.

## BASSE MARKET WhatsApp
The customer-facing confirmation/support destination defaults to +220 6963349 via `BASSE_MARKET_WHATSAPP`.

## Data persistence

The live app stores its SQLite database and uploaded product images under `DATA_DIR`. The included `render.yaml` mounts a 1 GB Render persistent disk at `/opt/render/project/src/server/data`. Keep that disk attached to the `basse-online-shop` service; do not point `DATA_DIR` at an ephemeral location. Vendor product submissions use an idempotency key so a retry after a dropped network does not create duplicate products.

## BASSE Auto-Save & Render Persistence

The Admin Dashboard now includes **Backup & Settings → Automatic Shop Save**.

- Automatic saving runs on important shop changes (products, vendor applications/approval, orders/payments, PIN changes, etc.).
- **SAVE SHOP NOW** creates an immediate full shop snapshot.
- The snapshot contains products, orders, vendors, vendor products, customer accounts, payout requests, and vendor submission keys.
- If the SQLite database starts completely empty and a saved snapshot exists, the server automatically restores the shop data at startup.
- Admin and vendor authentication sessions are now stored in SQLite instead of only server memory, so the existing login token can survive a normal Render restart when persistent storage is enabled.

### Important Render requirement

This feature protects data across Render sleep/restart **only when the service has persistent storage**. The current `render.yaml` configures a 1 GB Render Persistent Disk mounted at:

`/opt/render/project/src/server/data`

and sets:

`DATA_DIR=/opt/render/project/src/server/data`

Do not delete the existing Render disk when deploying. On the Free Render instance, filesystem data is still ephemeral; upgrade/attach the persistent disk before relying on the automatic restore.


### Image-safe backups
Full backups now include the actual uploaded files from `server/data/uploads` as base64 data, and restore writes those files back before products are served. Cloud snapshots use the same file bundle. This is designed to prevent products from returning without their pictures after a Render restart.

## Customer access update
- Customer login is optional.
- Customers can browse and place orders as guests without creating/logging into an account.
- Customer accounts can be created with a password and can log in later.
- Logged-in customer details are prefilled at checkout.
- Admin can still manage customer accounts and blocked accounts cannot place orders.


## V6 Marketplace + Live Delivery
- Stores directory and vendor storefronts
- Optional guest shopping remains enabled
- Admin Delivery Control Center and driver management
- Driver mobile portal at `/driver/`
- Live GPS sharing only during active deliveries
- Customer order tracking at `/api/order/:id/tracking` and Track Order UI
- Uses browser GPS + OpenStreetMap; no Google Maps API required
