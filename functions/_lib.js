// Shared server code for instinct-travel Pages Functions.

const encoder = new TextEncoder();
export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";

// ---------- session (HMAC-signed cookie) ----------

export async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function makeSession(email, secret) {
  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  const payload = `${email}.${exp}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function readSession(request, secret) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)it_session=([^;]+)/);
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  const i = v.lastIndexOf(".");
  const j = v.lastIndexOf(".", i - 1);
  if (i < 0 || j < 0) return null;
  const email = v.slice(0, j), exp = v.slice(j + 1, i), sig = v.slice(i + 1);
  if (Number(exp) < Date.now()) return null;
  if (sig !== await hmac(secret, `${email}.${exp}`)) return null;
  return email.toLowerCase();
}

export function sessionCookie(value, maxAge) {
  return `it_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// ---------- authorization (D1 is the source of truth) ----------

export async function roleFor(env, email) {
  email = String(email || "").toLowerCase();
  if (!email) return null;
  if (email === String(env.OWNER_EMAIL).toLowerCase()) return "owner";
  const row = await env.DB.prepare("SELECT role FROM editors WHERE email = ?")
    .bind(email).first();
  return row ? row.role : null;
}

// ---------- Google ID token verification ----------

export function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

export async function verifyGoogleIdToken(idToken, clientId) {
  const [h, p, sig] = idToken.split(".");
  if (!h || !p || !sig) return null;
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  if (claims.aud !== clientId) return null;
  if (!["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)) return null;
  if (Number(claims.exp) * 1000 < Date.now()) return null;
  const jwks = await (await fetch(GOOGLE_JWKS)).json();
  const jwk = jwks.keys.find(k => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlDecode(sig), encoder.encode(`${h}.${p}`));
  return ok ? claims : null;
}

export function randomState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---------- helpers ----------

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function cityOut(c) {
  return {
    id: c.id, name: c.name, country: c.country, lat: c.lat, lng: c.lng,
    visited_nir: !!c.visited_nir, visited_einav: !!c.visited_einav,
    wishlist: !!c.wishlist,
  };
}

export function validCity(body) {
  const name = String(body.name || "").trim();
  const country = String(body.country || "").trim();
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!name) return { error: "name required" };
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return { error: "bad lat" };
  if (!Number.isFinite(lng) || Math.abs(lng) > 180) return { error: "bad lng" };
  const wish = body.wishlist ? 1 : 0;
  return { name, country, lat, lng,
    vn: wish ? 0 : (body.visited_nir ? 1 : 0),
    ve: wish ? 0 : (body.visited_einav ? 1 : 0),
    wish };
}
