import { GOOGLE_AUTH, randomState, hmac } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const state = randomState();
  const signedState = `${state}.${await hmac(env.SESSION_SECRET, state)}`;
  const redirect = `${url.origin}/auth/callback`;
  const auth = new URL(GOOGLE_AUTH);
  auth.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  auth.searchParams.set("redirect_uri", redirect);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("state", signedState);
  return Response.redirect(auth.toString(), 302);
}
