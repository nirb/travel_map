import { json, readSession, roleFor, cityOut, validCity } from "../../_lib.js";

async function requireRole(request, env) {
  const email = await readSession(request, env.SESSION_SECRET);
  if (!email) return { error: json({ error: "unauthorized" }, 401) };
  const role = await roleFor(env, email);
  if (!role) return { error: json({ error: "forbidden" }, 403) };
  return { email, role };
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const segs = params.path || [];
  const method = request.method;
  const url = new URL(request.url);

  const auth = await requireRole(request, env);
  if (auth.error) return auth.error;
  const { role } = auth;

  // /api/edit/me
  if (segs[0] === "me" && method === "GET") {
    return json({ email: auth.email, role: auth.role, owner: env.OWNER_EMAIL });
  }

  // /api/edit/editors (owner only)
  if (segs[0] === "editors") {
    if (method === "GET") {
      if (role !== "owner") return json({ error: "owner only" }, 403);
      const { results } = await env.DB.prepare("SELECT email, role FROM editors ORDER BY email").all();
      return json({ owner: env.OWNER_EMAIL, editors: results });
    }
    if (method === "POST") {
      if (role !== "owner") return json({ error: "owner only" }, 403);
      const body = await request.json().catch(() => ({}));
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) return json({ error: "bad email" }, 400);
      if (email === String(env.OWNER_EMAIL).toLowerCase()) return json({ error: "owner already" }, 400);
      await env.DB.prepare("INSERT INTO editors (email, role) VALUES (?, 'editor') ON CONFLICT(email) DO NOTHING")
        .bind(email).run();
      return json({ ok: true });
    }
    if (method === "DELETE" && segs[1]) {
      if (role !== "owner") return json({ error: "owner only" }, 403);
      const email = decodeURIComponent(segs[1]).toLowerCase();
      if (email === String(env.OWNER_EMAIL).toLowerCase()) return json({ error: "cannot remove owner" }, 400);
      await env.DB.prepare("DELETE FROM editors WHERE email = ?").bind(email).run();
      return json({ ok: true });
    }
    return json({ error: "not found" }, 404);
  }

  // /api/edit/cities[...]  (owner + editor)
  if (segs[0] === "cities") {
    if (method === "POST" && segs.length === 1) {
      const body = await request.json().catch(() => ({}));
      const v = validCity(body);
      if (v.error) return json(v, 400);
      const r = await env.DB.prepare(
        "INSERT INTO cities (name, country, lat, lng, visited_nir, visited_einav, wishlist) VALUES (?,?,?,?,?,?,?)"
      ).bind(v.name, v.country, v.lat, v.lng, v.vn, v.ve, v.wish).run();
      return json({ id: r.meta.last_row_id });
    }
    const id = Number(segs[1]);
    if (!id) return json({ error: "not found" }, 404);
    if (method === "PUT") {
      const body = await request.json().catch(() => ({}));
      const v = validCity(body);
      if (v.error) return json(v, 400);
      await env.DB.prepare(
        "UPDATE cities SET name=?, country=?, lat=?, lng=?, visited_nir=?, visited_einav=?, wishlist=? WHERE id=?"
      ).bind(v.name, v.country, v.lat, v.lng, v.vn, v.ve, v.wish, id).run();
      return json({ ok: true });
    }
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM cities WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
  }

  return json({ error: "not found" }, 404);
}
