-- PebbleX usage store (Cloudflare D1)
--
-- WHY THIS IS NOT IN SUPABASE
--   app_usage is the only table that grows without bound: one row per app per
--   site per day per user. A typical user touches ~40 apps and sites a day.
--   At ~275 bytes a row, Supabase's free 500 MB Postgres holds ~1.9M rows,
--   which is only ~47,000 user-days — about 47 days at 1,000 daily users.
--   Past 500 MB a Supabase free project goes READ-ONLY for everyone.
--   D1 gives 5 GB (~18M rows) and 100k rows written/day, and the writer
--   aggregates per day so a 2-second poll does not become a row.
--
-- Apply with:
--   wrangler d1 execute pebble-usage --file=./schema.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usage_daily (
  owner_id   TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  day        TEXT NOT NULL,            -- YYYY-MM-DD, matches the UI's day key
  app_key    TEXT NOT NULL,            -- lowercased name or host
  app_name   TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'Other',
  color      TEXT NOT NULL DEFAULT '#7eaf6a',
  is_site    INTEGER NOT NULL DEFAULT 0,
  seconds    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, device_id, day, app_key)
);

-- The dashboard reads one user's recent days.
CREATE INDEX IF NOT EXISTS usage_owner_day ON usage_daily (owner_id, day DESC);

-- Category rollups for the balance donut and the hourly heatmap.
CREATE INDEX IF NOT EXISTS usage_owner_cat ON usage_daily (owner_id, category);

-- Per-day totals without scanning every app row.
CREATE TABLE IF NOT EXISTS usage_day_totals (
  owner_id   TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  day        TEXT NOT NULL,
  seconds    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, device_id, day)
);

-- Which apps/sites the user has banned. Kept next to the usage data because
-- it is only ever read alongside it.
CREATE TABLE IF NOT EXISTS usage_bans (
  owner_id  TEXT NOT NULL,
  app_key   TEXT NOT NULL,
  label     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, app_key)
);