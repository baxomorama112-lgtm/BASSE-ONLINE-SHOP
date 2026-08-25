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
