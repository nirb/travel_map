-- instinct_travel pilot schema: visited-cities world map
-- Structure only. Real visited-city data comes from Nir/Einav after sharing
-- authority is resolved. No rows are seeded from other lists.
CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,          -- display name, e.g. " Lisbon"
  country TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  visited_nir INTEGER NOT NULL DEFAULT 0,
  visited_einav INTEGER NOT NULL DEFAULT 0,
  added_by TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (name, country)
);

-- Authorized Google identities. The owner email from wrangler vars (OWNER_EMAIL)
-- always has owner rights even without a row here, so the owner can never be
-- locked out. Additional editors are added only by the owner, in the page.
CREATE TABLE IF NOT EXISTS editors (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner','editor')),
  added_by TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
