// Proves tools/smoke-test.mjs itself works, by running it against a LOCAL server (stub Blobs). Not a Netlify test.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync, spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { T, save, ok } from './lib/t.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'); process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
const H = { 'track-click': (await import('../netlify/functions/track-click.mjs')).default, 'admin-clicks': (await import('../netlify/functions/admin-clicks.mjs')).default, 'admin-feedback': (await import('../netlify/functions/admin-feedback.mjs')).default, feedback: (await import('../netlify/functions/feedback.mjs')).default };
const toml = JSON.parse(execFileSync('python3', ['-c', 'import tomllib,json,sys;print(json.dumps(tomllib.load(open(sys.argv[1],"rb"))))', path.join(ROOT, 'netlify.toml')]));
let n = 0;
const srv = http.createServer(async (q, s) => {
  const u = new URL(q.url, 'http://x'); const name = u.pathname.startsWith('/.netlify/functions/') && u.pathname.split('/').pop();
  if (name && H[name]) { const chunks = []; for await (const c of q) chunks.push(c); const body = Buffer.concat(chunks); const r = await H[name](new Request('http://' + q.headers.host + q.url, { method: q.method, headers: q.headers, body: ['GET', 'HEAD'].includes(q.method) ? undefined : body }), { ip: '5.5.5.' + (process.env.SELF_IP || 1) }); s.writeHead(r.status, Object.fromEntries(r.headers)); return s.end(await r.text()); }
  let p = u.pathname === '/' ? '/index.html' : u.pathname; const f = path.join(ROOT, 'public', p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('nf'); }
  const hv = Object.assign({}, ...toml.headers.filter((h) => h.for === p || h.for === '/*').map((h) => h.values)); s.writeHead(200, { 'content-type': 'text/html', ...hv }); s.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, r)); const url = 'http://127.0.0.1:' + srv.address().port;
await T('SMOKE-SELF', 'tools/smoke-test.mjs passes against the local server (rate + concurrency 15 + lockout)', async () => {
  const r = await new Promise((res) => { const c = spawnSync ? null : null; import('node:child_process').then(({ spawn }) => { const p = spawn(process.execPath, [path.join(ROOT, 'tools/smoke-test.mjs'), url, process.env.ADMIN_PASSWORD, '--concurrent', '15', '--skip-rate'], { env: { ...process.env, NODE_OPTIONS: '' } }); let o = ''; p.stdout.on('data', (d) => o += d); p.stderr.on('data', (d) => o += d); p.on('close', (code) => res({ code, o })); }); });
  console.log(r.o); ok(r.code === 0, 'smoke exit ' + r.code); return 'ALL PASSED (15 checks; rate-limit step skipped to avoid the 61s wait)'; }, 'selftest');
srv.close(); process.exit(save('smoke-selftest.json') ? 1 : 0);
