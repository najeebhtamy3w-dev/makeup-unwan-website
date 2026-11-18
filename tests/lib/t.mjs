import { writeFileSync, mkdirSync } from 'node:fs';
const results = [];
export async function T(id, name, fn, kind = 'logic') {
  try { const ev = await fn(); results.push({ id, name, status: 'PASS', evidence: String(ev ?? ''), kind }); console.log(`PASS ${id} ${name} :: ${ev ?? ''}`); }
  catch (e) { results.push({ id, name, status: 'FAIL', evidence: String(e.message || e), kind }); console.log(`FAIL ${id} ${name} :: ${e.message || e}`); }
}
export const note = (id, name, status, evidence) => { results.push({ id, name, status, evidence, kind: 'note' }); console.log(`${status} ${id} ${name} :: ${evidence}`); };
export function save(file) { mkdirSync(new URL('../results/', import.meta.url), { recursive: true }); writeFileSync(new URL('../results/' + file, import.meta.url), JSON.stringify(results, null, 1)); const f = results.filter((r) => r.status === 'FAIL').length; console.log(`\n${file}: ${results.length} checks, ${f} FAIL`); return f; }
export function eq(a, b, msg = '') { if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
export function ok(c, msg = 'assertion failed') { if (!c) throw new Error(msg); }
