import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(':memory:')
db.executescript((root / 'schema-community.sql').read_text())
target = '12345678-1234-1234-1234-123456789abc'
owner = 'a' * 32
db.execute("INSERT INTO community_events(kind,target_id,owner_hash,discriminator) VALUES('reaction',?,?,?)", (target,owner,'❤️'))
db.execute("INSERT INTO community_events(kind,target_id,owner_hash,discriminator) VALUES('reaction',?,?,?)", (target,owner,'🌸'))
migration=(root / 'migrations/20261120-single-reaction-dev.sql').read_text()
db.executescript(migration)
assert db.execute("SELECT COUNT(*) FROM community_reaction_selections WHERE target_id=?", (target,)).fetchone()[0] == 1
db.execute("""INSERT INTO community_reaction_selections(target_id,owner_hash,emoji) VALUES(?,?,?)
 ON CONFLICT(target_id,owner_hash) DO UPDATE SET emoji=excluded.emoji,updated_at=CURRENT_TIMESTAMP WHERE emoji<>excluded.emoji""", (target,owner,'✨'))
assert db.execute("SELECT emoji FROM community_reaction_selections WHERE target_id=? AND owner_hash=?", (target,owner)).fetchone()[0] == '✨'
assert db.execute("SELECT COUNT(*) FROM community_reaction_selections WHERE target_id=?", (target,)).fetchone()[0] == 1
db.executescript(migration)
assert db.execute("SELECT emoji FROM community_reaction_selections WHERE target_id=? AND owner_hash=?", (target,owner)).fetchone()[0] == '✨', 'Migration must not overwrite changed selection'
assert db.execute("SELECT COUNT(*) FROM community_events WHERE kind='reaction'").fetchone()[0] == 2, 'Legacy rows remain intact'
print('PASS additive reaction migration, single-selection upsert, idempotent rerun')
