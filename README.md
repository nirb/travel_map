# instinct_travel

A shared world map of the cities we have visited - Hebrew, mobile-friendly,
hosted on Cloudflare Pages.

- Public read-only map for everyone.
- Editing (adding cities, marking who visited) requires Google sign-in.
- The owner (set in `OWNER_EMAIL`) manages editor Gmail addresses inside the
  page; roles live in the D1 database, so the owner can never be locked out.

## Stack
- `public/` - the page (MapLibre GL + VersaTiles vector map + Natural Earth political overlay, Hebrew RTL)
- `functions/` - Pages Functions: Google OIDC sign-in (`/auth/*`), public
  city list (`/api/list`), protected editing API (`/api/edit/*`)
- `migrations/0001_init.sql` - D1 schema (structure only)
- `wrangler.toml` - Pages project config, D1 binding, public env vars

Secrets (`SESSION_SECRET`, `GOOGLE_CLIENT_SECRET`, `OWNER_EMAIL`) are set as Pages
project secrets and never committed.

## Deploy
1. Apply the schema: `wrangler d1 execute instinct-travel-db --remote --file=migrations/0001_init.sql`
2. Deploy: `wrangler pages deploy public --project-name=instinct-travel --branch=main`
3. Set secrets with `wrangler pages secret put` (see names above).

The city data lives in D1 and is not part of this repository.
