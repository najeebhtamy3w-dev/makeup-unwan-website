// node qr-gateway/test/gateway.test.mjs
import assert from 'node:assert/strict';
import worker,{_resetHealthCache,parseOrigins} from '../src/worker.mjs';
const P='https://primary.example',S='https://secondary.example',GW='https://go.example';
let state={};           // origin -> 'up' | 'down' | 'redirect' | 'hang' | 'json'
let probes=0;
const keepAlive=setInterval(()=>{},1000); // Node's AbortSignal.timeout timer is unref'd
const fetchImpl=async(url,{signal}={})=>{
 probes++;const o=new URL(url).origin;
 switch(state[o]){
  case 'up':return new Response('<html>ok</html>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
  case 'redirect':return new Response(null,{status:302,headers:{location:GW+'/'}});
  case 'json':return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
  case 'hang':return new Promise((_,rej)=>signal.addEventListener('abort',()=>rej(signal.reason)));
  default:throw new TypeError('fetch failed');
 }
};
const env={ORIGINS:`${P},${S}`,PROBE_TIMEOUT_MS:'200',HEALTH_TTL_S:'30'};
async function scan(path,e=env){const r=await worker.fetch(new Request(GW+path),e,{}, {fetchImpl});return {status:r.status,loc:r.headers.get('location'),cc:r.headers.get('cache-control'),body:r.status===503?await r.text():''};}
const reset=s=>{_resetHealthCache();state=s;probes=0;};

// 1. Both up: primary wins; store shortcuts map to the right section; path + query preserved.
reset({[P]:'up',[S]:'up'});
assert.deepEqual(await scan('/m'),{status:302,loc:P+'/#makeup',cc:'no-store',body:''});
assert.equal((await scan('/u')).loc,P+'/#perfume');
assert.equal((await scan('/perfume/')).loc,P+'/#perfume');
assert.equal((await scan('/?utm_source=qr&card=7')).loc,P+'/?utm_source=qr&card=7');
assert.equal((await scan('/masahatak.html?x=1')).loc,P+'/masahatak.html?x=1');
assert.equal((await scan('/m?utm_source=card')).loc,P+'/?utm_source=card#makeup','query kept with store shortcut');
assert.equal(probes,1,'health result cached within TTL');
// 2. Primary down -> secondary.  3. Secondary down -> primary.
reset({[P]:'down',[S]:'up'});assert.equal((await scan('/m')).loc,S+'/#makeup');
reset({[P]:'up',[S]:'down'});assert.equal((await scan('/u')).loc,P+'/#perfume');
// 4. Probe timeout counts as down (does not hang the visitor beyond the timeout).
reset({[P]:'hang',[S]:'up'});const t0=Date.now();assert.equal((await scan('/m')).loc,S+'/#makeup');assert.ok(Date.now()-t0<1500);
// 5. An origin that only redirects (e.g. a legacy host forwarding elsewhere) or serves non-HTML is NOT healthy.
reset({[P]:'redirect',[S]:'up'});assert.equal((await scan('/')).loc,S+'/');
reset({[P]:'json',[S]:'up'});assert.equal((await scan('/')).loc,S+'/');
// 6. Both down -> static contact page for the scanned store first, no scripts, not cached.
reset({[P]:'down',[S]:'down'});
const fb=await scan('/u');assert.equal(fb.status,503);assert.equal(fb.cc,'no-store');
assert.ok(fb.body.indexOf('id="perfume"')>0&&fb.body.indexOf('id="perfume"')<fb.body.indexOf('id="makeup"'),'scanned store listed first');
assert.ok(fb.body.includes('https://wa.me/967770417846')&&fb.body.includes('tel:+967737099784'));
assert.ok(!/<script/i.test(fb.body));
// 7. Failback: after the TTL the recovered primary is used again (302 is never cached by browsers).
reset({[P]:'down',[S]:'up'});assert.equal((await scan('/m')).loc,S+'/#makeup');
state[P]='up';_resetHealthCache();assert.equal((await scan('/m')).loc,P+'/#makeup');
// 8. Loop and safety guards.
assert.deepEqual(parseOrigins({ORIGINS:`${GW},http://plain.example,not a url,${P},${P}`},'go.example'),[P],'self, http, invalid and duplicates dropped');
reset({[P]:'up'});
for(const p of ['/admin.html','/admin','/api/health','/.netlify/functions/admin-feedback','/community-admin.html'])assert.equal((await scan(p)).status,404,p+' must never be forwarded from a QR');
assert.equal((await worker.fetch(new Request(GW+'/',{method:'POST'}),env,{},{fetchImpl})).status,405);
assert.deepEqual(parseOrigins({ORIGINS:'http://127.0.0.1:9101,http://evil.example'},'go.example'),[],'http never allowed without LOCAL_TEST');
assert.deepEqual(parseOrigins({LOCAL_TEST:'1',ORIGINS:'http://127.0.0.1:9101,http://evil.example'},'go.example'),['http://127.0.0.1:9101'],'LOCAL_TEST only unlocks localhost');
clearInterval(keepAlive);
console.log('PASS qr-gateway: store routing, path/query/fragment, failover both ways, timeout, failback, fallback page, loop and admin guards');
