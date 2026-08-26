BASSE ONLINE SHOP — LIVE ACTIVE USERS
========================================

Admin Dashboard section:
  LIVE ACTIVITY
    Total Active
    Website
    Android App
    iPhone

Suggested table:
  User | Platform | Current Page | Last Active

Filters:
  All | Website | Android | iPhone

Presence:
  - Client heartbeat every ~30 seconds.
  - Server considers a session active for ~90 seconds after the last heartbeat.
  - Do not expose passwords, payment secrets, or unnecessary personal data.

API contract:
  GET  /api/admin/active-users
  GET  /api/admin/active-users?platform=website|android|ios
  POST /api/presence/heartbeat

The existing authentication/database layer should enforce that only authorized
admins can read /api/admin/active-users.
