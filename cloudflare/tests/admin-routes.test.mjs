import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequest as inbox} from '../../functions/.netlify/functions/admin-feedback.js';
import {onRequest as stats} from '../../functions/.netlify/functions/admin-clicks.js';
globalThis.crypto??=webcrypto;
const records=new Map();
const db={prepare(sql){return {bind(...args){return {
 async run(){if(sql.startsWith('INSERT INTO rate_windows'))return {meta:{changes:1}};throw Error('Unexpected write: '+sql);},
 async all(){
  if(sql.startsWith('SELECT key FROM app_records')){
   const [store,lo,hi,cursor]=args;
   return {results:[...records.keys()].filter(k=>k.startsWith(store+'|')).map(k=>k.slice(store.length+1))
    .filter(k=>k>=lo&&k<hi&&k>cursor).sort().slice(0,250).map(key=>({key}))};
  }
  throw Error('Unexpected list SQL: '+sql);
 },
 async first(){
  if(sql.startsWith('SELECT hits FROM rate_windows'))return null;  if(sql.startsWith('SELECT value FROM app_records')){const [store,key]=args;const value=records.get(store+'|'+key);return value===undefined?null:{value};}
  throw Error('Unexpected read SQL: '+sql);
 }
}}}}};
const env={DEPLOYMENT_ENV:'staging',STAGING_DB:db,RATE_LIMIT_SALT:'s'.repeat(64),ADMIN_PASSWORD:'staging-test-admin-password-123'};
async function call(fn,password=env.ADMIN_PASSWORD,query=''){
 const req=new Request('https://staging.example/.netlify/functions/admin'+query,{headers:{'cf-connecting-ip':'192.0.2.5','x-admin-password':password}});
 const res=await fn({request:req,env});return {status:res.status,data:await res.json()};
}
assert.equal((await call(inbox,'wrong')).status,401);
const originalPassword=env.ADMIN_PASSWORD;
env.ADMIN_PASSWORD='Abc123Def456Ghi'; // exactly 15 characters
assert.equal(env.ADMIN_PASSWORD.length,15);
assert.equal((await call(inbox,env.ADMIN_PASSWORD)).status,200);
assert.equal((await call(stats,env.ADMIN_PASSWORD,'?range=invalid')).status,400);
assert.equal((await call(inbox,'wrong')).status,401);
env.ADMIN_PASSWORD='Abc123Def456Gh'; // 14 characters: reject configuration
assert.equal((await call(inbox,env.ADMIN_PASSWORD)).status,503);
env.ADMIN_PASSWORD=originalPassword;
records.set('customer-feedback|msg1',JSON.stringify({id:'msg1',store:'makeup',kind:'اقتراح',message:'أريد مجموعة هدايا جديدة',createdAt:'2026-11-19T00:00:00Z'}));
const inboxResult=await call(inbox);
assert.equal(inboxResult.status,200);
assert.equal(inboxResult.data.total,1);
assert.equal(inboxResult.data.items[0].id,'msg1');
assert.equal((await call(stats,'wrong')).status,401);
assert.equal((await call(stats,env.ADMIN_PASSWORD,'?range=invalid')).status,400);
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Aden',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
records.set('contact-click-events|v2/'+day+'/perfume/whatsapp/test-id',JSON.stringify({store:'perfume',channel:'whatsapp'}));
const report=await call(stats,env.ADMIN_PASSWORD,'?range=today');
assert.equal(report.status,200);
assert.equal(report.data.total,1);
assert.equal(report.data.summary.today.perfume,1);
assert.equal(report.data.counts.perfume.whatsapp,1);
console.log('PASS staging admin inbox and click stats mock contracts');
