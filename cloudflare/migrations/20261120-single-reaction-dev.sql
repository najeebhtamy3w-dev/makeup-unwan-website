-- D1 schema extension: one current emoji per anonymous fingerprint and post.
-- Run ONLY on makeup-unwan-dev-test after reviewing a backup. Do not run on staging or production.
-- Legacy rows are copied once; when an identity has several emoji rows, the
-- latest row (created_at, rowid) wins. Legacy events are retained untouched.
CREATE TABLE IF NOT EXISTS community_reaction_selections (
 target_id TEXT NOT NULL,
 owner_hash TEXT NOT NULL,
 emoji TEXT NOT NULL CHECK(emoji IN ('❤️','🌸','✨','👏','💡')),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(target_id,owner_hash)
);
INSERT OR IGNORE INTO community_reaction_selections(target_id,owner_hash,emoji,updated_at)
SELECT target_id,owner_hash,discriminator,created_at
FROM (
 SELECT target_id,owner_hash,discriminator,created_at,
 ROW_NUMBER() OVER(PARTITION BY target_id,owner_hash ORDER BY created_at DESC,rowid DESC) AS rn
 FROM community_events WHERE kind='reaction'
)
WHERE rn=1;
CREATE INDEX IF NOT EXISTS idx_reaction_selections_target ON community_reaction_selections(target_id,emoji);
