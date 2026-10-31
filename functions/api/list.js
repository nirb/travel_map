import { json, cityOut } from "../_lib.js";

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM cities ORDER BY added_at DESC"
  ).all();
  return json({ cities: results.map(cityOut) });
}
