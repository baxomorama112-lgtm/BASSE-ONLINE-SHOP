# BASSE ONLINE SHOP — GitHub + Render setup

GitHub is the source-code home. The live application needs a Node web service because it has a backend, database, uploads and Waychit server-side API calls. GitHub Pages alone cannot run this backend.

## Recommended flow

GitHub repository
  -> Render Web Service
  -> BASSE marketplace + admin
  -> Waychit API

Render can connect directly to GitHub and redeploy on pushes.

## Render settings

The repository already contains `render.yaml`. If you use Render Blueprint, it can read the web-service configuration.

Manual Web Service values:
- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Node
- Add a persistent disk at `/opt/render/project/src/server/data` (the included Blueprint requests 1 GB)
- Set the environment variables listed below.

## Required secrets

ADMIN_EMAIL=your-admin-email
ADMIN_PASSWORD=your-new-admin-password
WAYCHIT_API_KEY=your-waychit-api-key
WAYCHIT_WEBHOOK_SECRET=your-waychit-webhook-secret
PUBLIC_BASE_URL=https://shop.yourdomain.com
DATA_DIR=/opt/render/project/src/server/data

Never commit the values of these variables to GitHub.

## Domains

The same Render web service can have multiple custom domains. Add:
- shop.yourdomain.com
- admin.yourdomain.com

The application can then be routed to show the customer marketplace and private admin interface separately. For a stricter production architecture, the marketplace and backend/admin can later be split into separate services.

## Important production note

The included app uses SQLite and local uploaded files. A persistent disk is therefore required to keep orders/products/uploads across deploys and restarts. Render says persistent disks are available on paid web services; free web services have ephemeral filesystems.

## Waychit webhook

After deployment, use:
https://YOUR-SERVER-DOMAIN/api/waychit/webhook

Configure this in Waychit and keep the webhook signing secret in Render Environment Variables.

## BASSE Auto-Save update

The latest build adds a full-shop automatic save/restore layer in **Admin → Backup & Settings**. It saves product/vendor/order/customer data to `server/data/catalog-backup.json` after important changes and can restore it automatically when the database is empty.

For this to survive Render restarts, the Render service must use the Persistent Disk configured in `render.yaml`:

- plan: `starter` (or another plan that supports the disk)
- mount path: `/opt/render/project/src/server/data`
- size: `1 GB`
- `DATA_DIR=/opt/render/project/src/server/data`

Do not delete the disk during deployment.
