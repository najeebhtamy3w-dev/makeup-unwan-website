import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const netlify=await readFile(new URL('../../netlify.toml',import.meta.url),'utf8');
const headers=await readFile(new URL('../../public/_headers',import.meta.url),'utf8');
const expected=[...netlify.matchAll(/Content-Security-Policy = "([^"]+)"/g)].map(m=>m[1]);
const actual=[...headers.matchAll(/^  Content-Security-Policy: (.+)$/gm)].map(m=>m[1]);
assert.equal(expected.length,4,'Expected four Netlify CSP entries');
assert.deepEqual(actual,expected,'Cloudflare CSP must match Netlify-generated hashes');
for(const path of ['/admin','/admin.html']){
 const section=headers.split('\n'+path+'\n')[1]?.split('\n\n')[0]||'';
 assert.match(section,/X-Robots-Tag: noindex, nofollow/);
 assert.match(section,/Cache-Control: no-store/);
}
console.log('PASS Cloudflare CSP parity and admin no-cache/noindex');
