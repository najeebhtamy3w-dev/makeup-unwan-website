// LOCAL STAND-IN for @netlify/blobs (in-memory). It models: set/setJSON/get/delete/list with
// prefix + paginate (configurable page size) + latency + failure injection + call counters.
// It is NOT Netlify Blobs: results obtained with it prove program logic only.
export const db = new Map();
export const cfg = { pageSize: 1000, latencyMs: 1, failWrites: false, failReads: false, failListPrefix: null };
export const calls = { get: 0, list: 0, set: 0, delete: 0, optionsSeen: [] };
export const reset = () => { db.clear(); Object.assign(cfg, { pageSize: 1000, latencyMs: 1, failWrites: false, failReads: false, failListPrefix: null }); for (const k of ['get','list','set','delete']) calls[k] = 0; calls.optionsSeen = []; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function getStore(arg) {
  const name = typeof arg === 'string' ? arg : arg.name;
  calls.optionsSeen.push(typeof arg === 'string' ? { name } : { ...arg });
  if (!db.has(name)) db.set(name, new Map());
  const m = db.get(name);
  const store = {
    async set(k, v) { calls.set++; await sleep(cfg.latencyMs); if (cfg.failWrites) throw new Error('stub: write failed'); m.set(k, String(v)); return { modified: true }; },
    async setJSON(k, v) { return store.set(k, JSON.stringify(v)); },
    async get(k, o) { calls.get++; await sleep(cfg.latencyMs); if (cfg.failReads) throw new Error('stub: read failed'); const v = m.get(k); if (v === undefined) return null; return o && o.type === 'json' ? JSON.parse(v) : v; },
    async delete(k) { calls.delete++; await sleep(cfg.latencyMs); m.delete(k); },
    list(o = {}) {
      calls.list++;
      const keys = () => [...m.keys()].filter((k) => !o.prefix || k.startsWith(o.prefix)).sort();
      if (cfg.failListPrefix && o.prefix && o.prefix.startsWith(cfg.failListPrefix)) throw new Error('stub: list failed');
      if (o.paginate) {
        return (async function* () {
          const all = keys();
          for (let i = 0; i < Math.max(all.length, 1); i += cfg.pageSize) { await sleep(cfg.latencyMs); yield { blobs: all.slice(i, i + cfg.pageSize).map((key) => ({ key, etag: 'x' })), directories: [] }; }
        })();
      }
      return (async () => ({ blobs: keys().slice(0, cfg.pageSize).map((key) => ({ key, etag: 'x' })), directories: [] }))();
    }
  };
  return store;
}
