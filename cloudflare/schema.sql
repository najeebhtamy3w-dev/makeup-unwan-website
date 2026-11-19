-- Isolated Cloudflare staging database. Never point this binding at production data.
-- Store names are allowlisted in the application adapter.
CREATE TABLE IF NOT EXISTS app_records (
  store TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store, key)
);
CREATE INDEX IF NOT EXISTS idx_app_records_store_key ON app_records(store, key);
