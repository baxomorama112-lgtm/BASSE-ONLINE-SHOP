# BASSE ONLINE SHOP — Free Render Cloud Backup

This version keeps the existing local SQLite backup and adds a **private GitHub cloud backup** so Render Free can recover after a sleep/restart.

## One-time setup

1. Create a **separate private GitHub repository** for backups, for example:
   `basse-shop-backups`
   Do NOT use the repository that Render deploys from, otherwise every backup commit could trigger a deployment.

2. Create a GitHub fine-grained Personal Access Token with access to that backup repository and permission:
   **Contents: Read and write**.

3. In Render → BASSE ONLINE SHOP → Environment, add:

   - `GITHUB_BACKUP_TOKEN` = your token (keep it secret)
   - `GITHUB_BACKUP_REPO` = `YOUR_USERNAME/basse-shop-backups`
   - `GITHUB_BACKUP_PATH` = `backups/basse-shop-backup.json`
   - `GITHUB_BACKUP_BRANCH` = `main`

4. Redeploy BASSE.

## How it works

- Product/vendor/order changes create a local backup immediately.
- A cloud backup is queued and written to GitHub a few seconds later.
- Uploaded product images are included in the cloud snapshot.
- If Render Free wakes up with an empty local database, BASSE downloads the latest cloud snapshot and restores the database and images before starting the web server.
- The existing Download/Restore backup buttons remain available.

## Security

- Keep the backup repository **private**.
- Never put the GitHub token in `server.js`, HTML, JavaScript, or GitHub source code.
- Store the token only as a Render environment variable.
- The backup contains vendor/customer account data, so the repository must remain private.
