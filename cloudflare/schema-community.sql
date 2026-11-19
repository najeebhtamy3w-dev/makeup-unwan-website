-- Run only against the isolated Cloudflare staging D1 database.
-- No Netlify production data is imported.
CREATE TABLE IF NOT EXISTS community_events (
  kind TEXT NOT NULL CHECK(kind IN ('reaction','report','vote')),
  target_id TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  discriminator TEXT NOT NULL DEFAULT '',
  choice INTEGER CHECK(choice IS NULL OR choice IN (0,1)),
  CHECK ((kind = 'vote' AND choice IN (0,1) AND discriminator = '') OR
         (kind = 'reaction' AND choice IS NULL AND discriminator IN ('❤️','🌸','✨','👏','💡')) OR
         (kind = 'report' AND choice IS NULL AND discriminator = '')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(kind,target_id,owner_hash,discriminator)
);
CREATE INDEX IF NOT EXISTS idx_community_events_counts ON community_events(kind,target_id);
CREATE TABLE IF NOT EXISTS rate_windows (
  scope TEXT NOT NULL,
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL CHECK(hits >= 1),
  PRIMARY KEY(scope,bucket,window_start)
);
