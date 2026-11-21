import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequest as feedback} from '../../functions/.netlify/functions/feedback.js';
import {onRequest as click} from '../../functions/.netlify/functions/track-click.js';
globalThis.crypto??=webcrypto;
const records=new Map();
const db={prepare(sql){return {bind(...args){return {
 async run(){if(sql.startsWith('INSERT INTO rate_windows'))return {meta:{changes:1}};
 if(sql.startsWith('INSERT INTO app_records')){const [store,key,value]=args;records.set(store+'|'+key,value);return {meta:{changes:1}};}
 throw Error('Unexpected SQL: '+sql)}
}}}}};
const env={DEPLOYMENT_ENV:'staging',STAGING_DB:db,RATE_LIMIT_SALT:'z'.repeat(64),ADMIN_PASSWORD:'staging-test-admin-password-123'};
async function send(handler,body,origin='https://staging.example'){
 const request=new Request('https://staging.example/.netlify/functions/test',{method:'POST',headers:{origin,'cf-connecting-ip':'192.0.2.2'},body:JSON.stringify(body)});
 const response=await handler({request,env});return {status:response.status,body:await response.json()};
}
assert.equal((await send(feedback,{store:'makeup',kind:'اقتراح',message:'أرجو توفير المزيد من الهدايا الجميلة'})).status,201);
assert.equal([...records.keys()].filter(k=>k.startsWith('customer-feedback|')).length,1);
assert.equal((await send(feedback,{store:'perfume',kind:'اقتراح',message:'قصير'})).status,400);
assert.equal((await send(feedback,{store:'makeup',kind:'اقتراح',message:'أرجو توفير المزيد من الهدايا الجميلة'},'https://evil.example')).status,403);
assert.equal((await send(feedback,{website:'bot'})).status,200);
// The owner's admin password is 15 characters (PR #11): the public feedback form must accept
// that configuration instead of failing closed with 503; shorter or missing stays closed.
{const saved=env.ADMIN_PASSWORD;
 env.ADMIN_PASSWORD='Abc123Def456Ghi';assert.equal(env.ADMIN_PASSWORD.length,15);
 assert.equal((await send(feedback,{store:'perfume',kind:'اقتراح',message:'رسالة اختبار بطول مناسب للتحقق'})).status,201,'15-char admin password must not disable customer feedback');
 env.ADMIN_PASSWORD='short-password';assert.equal((await send(feedback,{store:'perfume',kind:'اقتراح',message:'رسالة اختبار بطول مناسب للتحقق'})).status,503);
 delete env.ADMIN_PASSWORD;assert.equal((await send(feedback,{store:'perfume',kind:'اقتراح',message:'رسالة اختبار بطول مناسب للتحقق'})).status,503);
 env.ADMIN_PASSWORD=saved;}
assert.equal((await send(click,{store:'perfume',channel:'whatsapp'})).status,201);
assert.equal([...records.keys()].filter(k=>k.startsWith('contact-click-events|v2/')).length,1);
assert.equal((await send(click,{store:'invalid',channel:'whatsapp'})).status,400);
assert.equal((await send(click,{store:'perfume',channel:'whatsapp'},'https://evil.example')).status,403);
console.log('PASS staging feedback and tracking route contract (mock only)');
