# BASSE ONLINE SHOP — READY BUILD

## Two completely separate pages, one connected system

Customer marketplace:
- `https://YOUR-MARKETPLACE-DOMAIN/`

Private admin:
- `https://YOUR-ADMIN-DOMAIN/`

Both connect to the same Node backend/database. Customers never see admin controls.

## Included
- Mobile-first marketplace + desktop responsive layout
- Categories, search, product cards
- Product detail/buy flow
- Customer details: name, WhatsApp, location, quantity
- Waychit Payment Request API prepared server-side
- Success/failure return to marketplace
- WhatsApp order handoff to +220 8780003
- Admin product add/edit/delete/upload
- Automatic marketplace product updates
- Admin orders and manual payment confirmation
- Optional signed Waychit webhook endpoint
- Sample products
- Responsive admin dashboard

## Deploy
1. Put the `server/server.js`, `marketplace/`, `admin/`, and `uploads/` on a Node-capable server.
2. Set environment variables:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `WAYCHIT_API_KEY`
   - `WAYCHIT_WEBHOOK_SECRET` (only if using webhook)
   - `PUBLIC_BASE_URL`
3. Keep API secrets off GitHub client files.
4. Point your customer domain to the marketplace and your admin domain to the admin interface, or route both through the same backend.
5. Waychit success URL returns to `/?payment=success&order=...`.
6. Waychit webhook URL: `https://YOUR-SERVER/api/waychit/webhook`

The API key is never put into browser HTML/JS.
