import {
  GOOGLE_TOKEN, verifyGoogleIdToken, roleFor, makeSession, sessionCookie, hmac, json,
} from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const err = url.searchParams.get("error");
  if (err) return json({ error: err }, 400);
  if (!code || !state.includes(".")) return json({ error: "bad callback" }, 400);
  const [rawState, sig] = state.split(".");
  if (sig !== await hmac(env.SESSION_SECRET, rawState)) {
    return json({ error: "bad state" }, 403);
  }
  const redirect = `${url.origin}/auth/callback`;
  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirect, grant_type: "authorization_code",
    }),
  });
  const token = await tokenRes.json();
  if (!token.id_token) return json({ error: "token exchange failed" }, 502);
  const claims = await verifyGoogleIdToken(token.id_token, env.GOOGLE_CLIENT_ID);
  if (!claims || !claims.email) return json({ error: "bad id token" }, 403);
  const email = claims.email.toLowerCase();
  const role = await roleFor(env, email);
  if (!role) return json({ error: "not authorized" }, 403);
  const session = await makeSession(email, env.SESSION_SECRET);
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": sessionCookie(session, 30 * 24 * 3600) },
  });
}
