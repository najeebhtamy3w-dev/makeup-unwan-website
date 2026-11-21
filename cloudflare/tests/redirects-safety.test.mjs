// public/_redirects is read by BOTH Netlify and Cloudflare Pages. An absolute cross-host redirect
// there (e.g. "/ https://<project>.pages.dev/ 302!") would make the Cloudflare site redirect to
// itself or to another environment. Host-specific redirects belong in netlify.toml only.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const file=new URL('../../public/_redirects',import.meta.url);
if(existsSync(file)){
 const rules=readFileSync(file,'utf8').split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));
 for(const r of rules){const [,to]=r.split(/\s+/);assert.ok(to&&!/^https?:\/\//i.test(to),'absolute redirect in shared public/_redirects: '+r);}
}
const toml=readFileSync(new URL('../../netlify.toml',import.meta.url),'utf8');
assert.ok(!/to\s*=\s*"https?:\/\/[^"]*\.pages\.dev/i.test(toml),'netlify.toml must not redirect customers to a *.pages.dev host');
console.log('PASS redirect safety: no cross-host rules in shared _redirects, no pages.dev targets');
