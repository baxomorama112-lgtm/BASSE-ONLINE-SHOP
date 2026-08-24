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


## Stability/authentication update
- Vendor authentication is persisted in SQLite for 30 days and cleared by explicit logout or expiry.
- Vendor login accepts both `whatsapp` and `phone` payload names; the duplicate login handler that prevented the correct token from being saved was removed.
- Vendor dashboard no longer polls every 10 seconds; live events refresh it only when data changes.
- Customer accounts now use server-side authentication sessions and remain signed in after closing/reopening the browser until logout/expiry.
- Mobile viewport/touch handling was tightened to reduce accidental double-tap zoom and horizontal page movement.
- Marketplace polling fallback is 30 seconds and only runs when the live event stream is disconnected.


## Vendor email verification + PIN
- Vendor applications require an email address and a 6-digit OTP before Admin approval.
- OTPs expire after 10 minutes and can be resent.
- Vendor PINs are hashed and saved in SQLite; login normalizes the Gambia +220 phone format.
- Existing vendors without email remain compatible.
- If an older vendor PIN is broken, Admin can use **RESET PIN**; the new PIN is hashed and saved immediately.
- Gmail OTP uses `smtp.gmail.com`. Set `GMAIL_USER` (defaults to `ADMIN_EMAIL`), `GMAIL_APP_PASSWORD`, and optional `EMAIL_FROM` in Render. Use a Google App Password, never the normal Gmail password.
- The current default sender is the same admin email shown in `.env.example`: `Baxomorama112@gmail.com`. Change it only if you want a different sender.
- Keep the existing Waychit payment and WhatsApp confirmation flow unchanged.


## Vendor login fix checklist
- Vendor PINs are hashed and saved in the persistent SQLite database.
- Vendor login accepts local Gambian numbers and numbers stored with the +220 country code.
- Admin approval changes the vendor status to APPROVED; email verification no longer blocks login.
- Vendor sessions are persisted server-side and kept for a long period; logout explicitly removes the session.
- Vendor applications still open WhatsApp after submission.
- For Gmail OTP, set GMAIL_USER, GMAIL_APP_PASSWORD and EMAIL_FROM in Render.

### Test after deployment
1. Submit a new vendor application with a NEW WhatsApp number and a 4–5 digit PIN.
2. Confirm the application appears in Admin → Vendors as PENDING.
3. Press APPROVE.
4. Log in at /vendor/ using the exact WhatsApp number and the PIN created during application.
5. Close/reopen the browser without logging out. The vendor should remain signed in.
6. Press Logout and confirm the login screen returns.
