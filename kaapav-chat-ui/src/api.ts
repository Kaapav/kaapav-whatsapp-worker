// api.ts — safe fetch helpers (never assume arrays)
import { ADMIN_TOKEN, API_BASE } from "./socket";

async function jsonGET(path: string) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  // backend always returns JSON on /api/*; if it doesn’t, guard it:
  if (!r.ok) return null;
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  return r.json();
}

export async function fetchStatus() {
  return jsonGET("/status"); // { ok, phoneNumber, phoneNumberId, uptime }
}

export async function fetchChats() {
  const data = await jsonGET("/messages/history?user=me");
  return Array.isArray(data) ? data : []; // hard guard for UI
}
