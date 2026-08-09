-- social-hub canonical schema (Postgres)

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  handle_or_url TEXT NOT NULL,
  title TEXT,
  config JSONB,
  enabled BOOLEAN DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS items (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
  canonical_url TEXT,
  title TEXT,
  excerpt TEXT,
  content_html TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  content_hash TEXT UNIQUE,
  media_refs JSONB,
  platform_meta JSONB,
  is_duplicated BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_items_published_at ON items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_source_id ON items(source_id);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
  status TEXT,
  last_error TEXT,
  run_duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
