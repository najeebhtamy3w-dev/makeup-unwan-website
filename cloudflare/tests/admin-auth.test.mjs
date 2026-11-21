import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequest as session} from '../../functions/.netlify/functions/admin-session.js';
import {onRequest as feedback} from '../../functions/.netlify/functions/admin-feedback.js';
import {onRequest as clicks} from '../../functions/.netlify/functions/admin-clicks.js';
import {onRequest as community} from '../../functions/.netlify/functions/community.js';
import {ADMIN_FAIL_LIMIT} from '../lib/admin-auth.mjs';
globalThis.crypto??=webcrypto;

// In-memory D1 double with a real fixed-window counter, so lockout semantics are exercised.
function makeDb({broken=new Set()}={}){
 const windows=new Map(),records=new Map();
 const db={windows,records,prepare(sql){return{bind(...a){return{
  async first(){
   if(broken.has('auth'))throw Error('D1 unavailable');
   if(sql.startsWith('SELECT hits FROM rate_windows')){const h=windows.get(a.join('|'));return h===undefined?null:{hits:h};}
   if(sql.startsWith('SELECT value FROM app_records')){if(broken.has('records'))throw Error('records down');const v=records.get(a[0]+'|'+a[1]);return v===undefined?null:{value:v};}
   throw Error('Unexpected read '+sql);
  },
  async run(){
   if(sql.startsWith('INSERT INTO rate_windows')){const [scope,bucket,ws,limit]=a,k=[scope,bucket,ws].join('|'),h=windows.get(k)||0;if(h>=limit)return{meta:{changes:0}};windows.set(k,h+1);return{meta:{changes:1}};}
   throw Error('Unexpected write '+sql);
  },
  async all(){
   if(sql.startsWith('SELECT key FROM app_records')){if(broken.has('records'))throw Error('records down');const [store,lo,hi,cursor]=a;return{results:[...records.keys()].filter(k=>k.startsWith(store+'|')).map(k=>k.slice(store.length+1)).filter(k=>k>=lo&&k<hi&&k>cursor).sort().slice(0,250).map(key=>({key}))};}
   if(sql.startsWith('SELECT discriminator,choice,COUNT(*)'))return{results:[]};
   throw Error('Unexpected list '+sql);
  }}}}}};
 return db;
}
const PASSWORD='Abc123Def456Ghi'; // the owner's real password is 15 characters; this is a test value
const envFor=db=>({DEPLOYMENT_ENV:'development',DEV_DB:db,RATE_LIMIT_SALT:'s'.repeat(64),ADMIN_PASSWORD:PASSWORD});
async function call(fn,env,{password=PASSWORD,ip='192.0.2.10',path='/.netlify/functions/admin-session'}={}){
 const res=await fn({request:new Request('https://dev.example'+path,{headers:{'cf-connecting-ip':ip,'x-admin-password':password}}),env});
 return {status:res.status,body:await res.json(),headers:res.headers};
}

// 1. Correct password succeeds; many successful requests never lock the owner out.
{
 const db=makeDb(),env=envFor(db);
 for(let i=0;i<60;i++){
  const r=await call(session,env);assert.equal(r.status,200,'successful request #'+i+' must not be throttled');
  assert.deepEqual(r.body,{ok:true,role:'admin'});
 }
 assert.equal((await call(feedback,env,{path:'/.netlify/functions/admin-feedback'})).status,200);
 assert.equal((await call(clicks,env,{path:'/.netlify/functions/admin-clicks?range=30'})).status,200);
 assert.equal((await call(community,env,{path:'/.netlify/functions/community?action=admin-list'})).status,200);
}
// 2. Wrong password -> 401 with distinct code; case matters.
{
 const env=envFor(makeDb());
 const r=await call(session,env,{password:'wrong-password-x'});
 assert.equal(r.status,401);assert.equal(r.body.code,'ADMIN_BAD_PASSWORD');
 assert.equal((await call(session,env,{password:PASSWORD+' '})).status,200,'Fetch trims header whitespace: an accidental trailing space from a phone keyboard is tolerated');
 assert.equal((await call(session,env,{password:PASSWORD.toLowerCase()})).status,401,'case-sensitive');
 assert.equal((await call(session,env,{password:'\u00a0'+PASSWORD+'\u00a0'})).status,200,'NBSP around a pasted password is tolerated');
 assert.ok(!JSON.stringify(r.body).includes(PASSWORD),'response must not leak the password');
}
// 3. Temporary lockout after repeated failures -> 429 with Retry-After, even for the correct password;
//    other IPs are unaffected.
{
 const env=envFor(makeDb());
 for(let i=0;i<ADMIN_FAIL_LIMIT;i++)assert.equal((await call(session,env,{password:'bad-'+i})).status,401);
 const locked=await call(session,env);
 assert.equal(locked.status,429);assert.equal(locked.body.code,'ADMIN_LOCKED');
 assert.ok(Number(locked.headers.get('retry-after'))>0);
 assert.equal((await call(session,env,{ip:'198.51.100.7'})).status,200,'lockout is per client');
}
// 4. Misconfiguration -> 503 naming the missing setting, never its value.
{
 const db=makeDb();
 const missing=async env=>(await call(session,env)).body;
 assert.equal((await missing({DEPLOYMENT_ENV:'development',RATE_LIMIT_SALT:'s'.repeat(64),ADMIN_PASSWORD:PASSWORD})).missing,'database');
 const noDevDb=await missing({DEPLOYMENT_ENV:'development',STAGING_DB:db,RATE_LIMIT_SALT:'s'.repeat(64),ADMIN_PASSWORD:PASSWORD});
 assert.equal(noDevDb.missing,'database');assert.equal(noDevDb.database.reason,'dev_db_not_bound','dev never falls back to STAGING_DB');
 assert.deepEqual(noDevDb.database.present,{ASSETS:false,DEPLOYMENT_ENV:true,DEV_DB:false,STAGING_DB:true,PROD_DB:false,ADMIN_PASSWORD:true,RATE_LIMIT_SALT:true});
 assert.ok(!JSON.stringify(noDevDb).includes(PASSWORD),'diagnosis must not leak the password');
 assert.equal((await call(session,{...envFor(db),DEPLOYMENT_ENV:'development '})).status,200,'trailing space in DEPLOYMENT_ENV tolerated');
 assert.equal((await missing({...envFor(db),RATE_LIMIT_SALT:'short'})).missing,'rate_limit_salt');
 const shortPw=await call(session,{...envFor(db),ADMIN_PASSWORD:'short'});
 assert.equal(shortPw.status,503);assert.equal(shortPw.body.code,'ADMIN_NOT_CONFIGURED');assert.equal(shortPw.body.missing,'admin_password');
 assert.equal((await missing({...envFor(db),DEPLOYMENT_ENV:'production'})).missing,'database','unknown environments never fall back to another DB');
}
// 5. Server/database error during the check -> 503 ADMIN_CHECK_FAILED (not 401).
{
 const r=await call(session,envFor(makeDb({broken:new Set(['auth'])})));
 assert.equal(r.status,503);assert.equal(r.body.code,'ADMIN_CHECK_FAILED');
}
// 6. Messages/statistics storage down: login still succeeds; only those sections fail with 503.
{
 const env=envFor(makeDb({broken:new Set(['records'])}));
 assert.equal((await call(session,env)).status,200,'login must not depend on feedback/clicks');
 assert.equal((await call(feedback,env,{path:'/.netlify/functions/admin-feedback'})).status,503);
 assert.equal((await call(clicks,env,{path:'/.netlify/functions/admin-clicks?range=30'})).status,503);
}
// 7. Moderation stays server-protected without a valid password.
{
 const env=envFor(makeDb());
 const req=new Request('https://dev.example/.netlify/functions/community?action=moderate',{method:'POST',headers:{origin:'https://dev.example','cf-connecting-ip':'192.0.2.99','x-admin-password':'nope-nope-nope','content-type':'application/json'},body:JSON.stringify({id:'12345678-1234-1234-1234-123456789abc',status:'rejected'})});
 assert.equal((await community({request:req,env})).status,401);
}
console.log('PASS admin auth: success not throttled, 401/429/503 distinct, login independent of inbox/stats');
