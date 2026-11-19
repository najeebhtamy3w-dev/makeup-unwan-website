"""SQLite-level schema and concurrent uniqueness tests (not a substitute for real D1 integration)."""
import concurrent.futures
import pathlib
import sqlite3
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    dbfile = pathlib.Path(tmp) / "staging.db"
    con = sqlite3.connect(dbfile)
    con.executescript((ROOT / "schema.sql").read_text())
    con.executescript((ROOT / "schema-community.sql").read_text())
    con.close()

    def event(kind, owner, discriminator="", choice=None):
        connection = sqlite3.connect(dbfile, timeout=20)
        try:
            cursor = connection.execute(
                "INSERT OR IGNORE INTO community_events(kind,target_id,owner_hash,discriminator,choice) VALUES (?,?,?,?,?)",
                (kind, "12345678-1234-1234-1234-123456789abc", owner, discriminator, choice),
            )
            connection.commit()
            return cursor.rowcount
        finally:
            connection.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        votes = list(pool.map(lambda n: event("vote", "a" * 32, choice=n % 2), range(50)))
    assert sum(votes) == 1, f"Expected exactly one accepted vote, got {sum(votes)}"
    assert event("vote", "b" * 32, choice=1) == 1
    assert event("reaction", "a" * 32, discriminator="🌸") == 1
    assert event("reaction", "a" * 32, discriminator="🌸") == 0
    assert event("reaction", "a" * 32, discriminator="✨") == 1
    assert event("report", "a" * 32) == 1
    assert event("report", "a" * 32) == 0

    def limiter():
        connection = sqlite3.connect(dbfile, timeout=20)
        try:
            cursor = connection.execute(
                """INSERT INTO rate_windows(scope,bucket,window_start,hits) VALUES (?,?,?,1)
                   ON CONFLICT(scope,bucket,window_start) DO UPDATE SET hits=hits+1 WHERE hits < ?""",
                ("community-react", "b" * 16, 120000, 5),
            )
            connection.commit()
            return cursor.rowcount
        finally:
            connection.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        allowed = list(pool.map(lambda _: limiter(), range(30)))
    assert sum(allowed) == 5, f"Limiter allowed {sum(allowed)} rather than 5"
    con = sqlite3.connect(dbfile)
    assert con.execute("SELECT hits FROM rate_windows").fetchone()[0] == 5
    assert con.execute("SELECT COUNT(*) FROM community_events WHERE kind='vote'").fetchone()[0] == 2
    con.close()
print("PASS SQLite schema: 50 concurrent votes => 1 per owner; 30 concurrent limiter hits => 5 allowed")
