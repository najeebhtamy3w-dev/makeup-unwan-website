import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {onRequest} from '../../functions/.netlify/functions/community.js';
globalThis.crypto ??= webcrypto;
const records=new Map();
const db={prepare(sql){return {bind(...args){return {
 async first(){
  if(sql.startsWith('SELECT value FROM app_records')) {
   const [store,key]=args;const value=records.get(store+'|'+key);
   return value===undefined?null:{value};
  }
  return null;
 },
 async run(){
  if(sql.startsWith('INSERT INTO app_records')) {
   const [store,key,value]=args;records.set(store+'|'+key,value);
   return {meta:{changes:1}};
  }
  if(sql.startsWith('INSERT INTO rate_windows'))return {meta:{changes:1}};
  if(sql.startsWith('UPDATE app_records')){const [value,store,key,previous]=args;const k=store+'|'+key;if(records.get(k)!==previous)return {meta:{changes:0}};records.set(k,value);return {meta:{changes:1}};}
  throw Error('Unexpected SQL '+sql);
 },
 async all(){
  if(sql.startsWith('SELECT key FROM app_records')) {
   const [store,lo,hi,cursor]=args;
   return {results:[...records.keys()].filter(k=>k.startsWith(store+'|')).map(k=>k.slice(store.length+1))
    .filter(k=>k>=lo&&k<hi&&k>cursor).sort().slice(0,250).map(key=>({key}))};
  }
  if(sql.startsWith('SELECT discriminator,choice,COUNT(*)'))return {results:[]};
  throw Error('Unexpected SQL '+sql);
 }
}}}}};
const env={DEPLOYMENT_ENV:'staging',STAGING_DB:db,RATE_LIMIT_SALT:'a'.repeat(64),ADMIN_PASSWORD:'safe-staging-admin-password-for-tests'};
async function call(action,method='GET',body,origin='https://staging.example',password) {
 const request=new Request('https://staging.example/.netlify/functions/community?action='+action,{
  method,headers:{origin,'cf-connecting-ip':'192.0.2.1','user-agent':'Staging-Test',...(password?{'x-admin-password':password}:{})},
  body:body===undefined?undefined:JSON.stringify(body)
 });
 const res=await onRequest({request,env});
 return {status:res.status,body:await res.json()};
}
assert.equal((await call('list')).status,200);
const created=await call('create','POST',{kind:'أفكار واقتراحات',text:'أقترح إضافة ركن جديد للهدايا الموسمية',consent:true});
assert.equal(created.status,201);
assert.equal(created.body.status,'approved');
assert.equal((await call('list')).body.items.length,1,'New validated posts must publish immediately');
assert.equal((await call('create','POST',{kind:'أفكار واقتراحات',text:'https://bad.example',consent:true})).status,400);
assert.equal((await call('create','POST',{kind:'أفكار واقتراحات',text:'أقترح إضافة ركن جديد للهدايا الموسمية',consent:true},'https://evil.example')).status,403);
const poll=await call('poll-create','POST',{question:'أي هدية تناسب التخرج؟',choice1:'عطر',choice2:'طقم عناية'});
assert.equal(poll.status,201);
assert.match(poll.body.id,/^[a-f0-9-]{36}$/);
const loaded=await call('poll&id='+poll.body.id);
assert.equal(loaded.status,200);
assert.deepEqual(loaded.body.counts,[0,0]);
assert.equal((await call('admin-list')).status,401);
assert.equal((await call('admin-list','GET',undefined,'https://staging.example','wrong-password')).status,401);
const adminPassword=env.ADMIN_PASSWORD;
const admin=await call('admin-list','GET',undefined,'https://staging.example',adminPassword);
assert.equal(admin.status,200);
assert.equal(admin.body.items.length,1);
const postId=admin.body.items[0].id;
assert.equal((await call('moderate','POST',{id:postId,status:'approved'},'https://staging.example',adminPassword)).status,200);
assert.equal((await call('list')).body.items.length,1);
assert.equal((await call('moderate','POST',{id:postId,status:'rejected'},'https://staging.example',adminPassword)).status,200);
assert.equal((await call('list')).body.items.length,0,'Hidden posts must be excluded from public list');
assert.equal((await call('moderate','POST',{id:postId,status:'approved'},'https://staging.example',adminPassword)).status,200);
assert.equal((await call('list')).body.items.length,1);
assert.equal((await call('moderate','POST',{id:postId,status:'invalid'},'https://staging.example',adminPassword)).status,400);
assert.equal((await call('moderate','POST',{id:poll.body.id,status:'approved'},'https://staging.example',adminPassword)).status,404);
console.log('PASS Cloudflare community staging handler mock: immediate publishing/hide/restore/poll/validation/origin');
