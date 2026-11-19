// Cloudflare D1 storage adapter. Not wired into production or deployed.
// Uses D1's SQL interface rather than eventually consistent KV.
const ALLOWED = new Set([
  'customer-feedback', 'contact-click-events', 'rate-guard', 'community-v1', 'community-polls-v1', 'community-events-v2'
]);
function validateStore(name) {
  if (!ALLOWED.has(name)) throw new TypeError('Unknown storage namespace');
  return name;
}
function validateKey(key) {
  if (typeof key !== 'string' || !key || key.length > 512) throw new TypeError('Invalid storage key');
  return key;
}
export function createD1Store(db, name) {
  validateStore(name);
  if (!db || typeof db.prepare !== 'function') throw new TypeError('D1 binding is required');
  const read = (key) => db.prepare('SELECT value FROM app_records WHERE store = ? AND key = ?').bind(name, validateKey(key)).first();
  return Object.freeze({
    async set(key, value) {
      if (typeof value !== 'string') throw new TypeError('String value required');
      if (value.length > 100000) throw new RangeError('Storage value too large');
      await db.prepare('INSERT INTO app_records (store,key,value) VALUES (?,?,?) ON CONFLICT(store,key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP').bind(name,validateKey(key),value).run();
    },
    async setJSON(key, value) {
      return this.set(key, JSON.stringify(value));
    },
    async get(key, options = {}) {
      const row = await read(key);
      if (!row) return null;
      return options.type === 'json' ? JSON.parse(row.value) : row.value;
    },
    async delete(key) {
      await db.prepare('DELETE FROM app_records WHERE store = ? AND key = ?').bind(name,validateKey(key)).run();
    },
    async *list({prefix = '', paginate = false} = {}) {
      if (typeof prefix !== 'string' || prefix.length > 512) throw new TypeError('Invalid prefix');
      // Keyset pagination avoids offset instability; range excludes non-prefix keys.
      const upper = prefix + '\uffff';
      let cursor = '';
      do {
        const result = await db.prepare('SELECT key FROM app_records WHERE store = ? AND key >= ? AND key < ? AND key > ? ORDER BY key LIMIT 250').bind(name,prefix,upper,cursor).all();
        const blobs = (result.results || []).map(({key}) => ({key}));
        if (!blobs.length) break;
        yield {blobs};
        cursor = blobs[blobs.length - 1].key;
        if (!paginate || blobs.length < 250) break;
      } while (true);
    }
  });
}
