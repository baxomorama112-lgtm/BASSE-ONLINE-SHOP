/*
 * BASSE ONLINE SHOP — Active Users
 *
 * Frontend contract for the Admin Dashboard.
 * The dashboard can call GET /api/admin/active-users and render:
 *   total, website, android, ios, users[]
 *
 * A client heartbeat should be sent about every 30 seconds while the
 * marketplace/app is open. The server should expire sessions after
 * approximately 90 seconds without a heartbeat.
 *
 * This module is intentionally API-adapter based so it does not replace
 * the existing authentication/database implementation.
 */
export async function getActiveUsers(filter = "all") {
  const url = filter === "all"
    ? "/api/admin/active-users"
    : `/api/admin/active-users?platform=${encodeURIComponent(filter)}`;
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error("Unable to load active users");
  return res.json();
}

export function startPresenceHeartbeat({ userId, platform, page } = {}) {
  const send = () => {
    const payload = {
      userId: userId || null,
      platform: platform || detectPlatform(),
      page: page || location.pathname,
      timestamp: Date.now()
    };
    fetch("/api/presence/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {});
  };

  send();
  const id = setInterval(send, 30000);

  const stop = () => clearInterval(id);
  window.addEventListener("pagehide", stop, { once: true });
  return stop;
}

function detectPlatform() {
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "website";
}
