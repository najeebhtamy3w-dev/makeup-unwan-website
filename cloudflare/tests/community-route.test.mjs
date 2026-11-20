import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {onRequest} from '../../functions/.netlify/functions/community.js';
globalThis.crypto ??= webcrypto;
const records=new Map();
const selections=new Map();
const events=new Map();
const db={prepare(sql){return {bind(...args){return {
 async first(){
  if(sql.startsWith('SELECT value FROM app_records')) {
   const [store,key]=args;const value=records.get(store+'|'+key);
   return value===undefined?null:{value};
  }
  if(sql.startsWith('SELECT emoji FROM community_reaction_selections')){const [id,owner]=args;const emoji=selections.get(id+'|'+owner);return emoji?{emoji}:null;}
  return null;
 },
 async run(){
  if(sql.startsWith('INSERT INTO app_records')) {
   const [store,key,value]=args;records.set(store+'|'+key,value);
   return {meta:{changes:1}};
  }
  if(sql.startsWith('INSERT INTO community_reaction_selections')){const [id,owner,emoji]=args,k=id+'|'+owner,changed=selections.get(k)!==emoji;selections.set(k,emoji);return {meta:{changes:changed?1:0}};}
  if(sql.startsWith('INSERT OR IGNORE INTO community_events')){const [kind,id,owner,discriminator,choice]=args;const k=[kind,id,owner,discriminator].join('|');if(events.has(k))return {meta:{changes:0}};events.set(k,{kind,id,owner,discriminator,choice});return {meta:{changes:1}};}
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
  if(sql.startsWith('SELECT emoji,COUNT(*) AS count FROM community_reaction_selections')){const [id]=args;const counts=new Map();for(const [key,emoji] of selections)if(key.startsWith(id+'|'))counts.set(emoji,(counts.get(emoji)||0)+1);return {results:[...counts].map(([emoji,count])=>({emoji,count}))};}
  if(sql.startsWith('SELECT discriminator,choice,COUNT(*)')){const [kind,id]=args;const counts=new Map();for(const e of events.values())if(e.kind===kind&&e.id===id){const k=e.discriminator+'|'+e.choice;const x=counts.get(k)||{discriminator:e.discriminator,choice:e.choice,count:0};x.count++;counts.set(k,x);}return {results:[...counts.values()]};}
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
assert.equal((await call('list')).body.items.length,1,'Approved posts are published immediately');
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
const firstReaction=await call('react','POST',{id:postId,emoji:'❤️'});
assert.equal(firstReaction.status,200);
assert.equal(firstReaction.body.changed,true);
assert.equal(firstReaction.body.reactions['❤️'],1);
const duplicateReaction=await call('react','POST',{id:postId,emoji:'❤️'});
assert.equal(duplicateReaction.status,200);
assert.equal(duplicateReaction.body.changed,false);
const switchedReaction=await call('react','POST',{id:postId,emoji:'🌸'});
assert.equal(switchedReaction.status,200);
assert.equal(switchedReaction.body.changed,true);
assert.equal(switchedReaction.body.reactions['❤️'],0);
assert.equal(switchedReaction.body.reactions['🌸'],1);
const refreshed=(await call('list')).body.items[0];
assert.equal(refreshed.myReaction,'🌸');
assert.equal(refreshed.reactions['🌸'],1);
// Reporting: first accepted, second rejected; admin sees exactly one report.
assert.equal((await call('report','POST',{id:postId})).status,201);
assert.equal((await call('report','POST',{id:postId})).status,409);
const reported=await call('admin-list','GET',undefined,'https://staging.example',adminPassword);
assert.equal(reported.status,200);
assert.equal(reported.body.reports[postId],1);
assert.equal((await call('admin-list','GET',undefined,'https://staging.example','wrong-password')).status,401);
// Moderation: hide removes public listing and blocks new reports; restore makes it visible.
assert.equal((await call('moderate','POST',{id:postId,status:'rejected'},'https://staging.example',adminPassword)).status,200);
assert.equal((await call('list')).body.items.length,0);
assert.equal((await call('report','POST',{id:postId})).status,404);
assert.equal((await call('moderate','POST',{id:postId,status:'approved'},'https://staging.example',adminPassword)).status,200);
assert.equal((await call('list')).body.items.length,1);
// Poll: one vote per fingerprint and poll, count persists on GET.
assert.equal((await call('poll-vote','POST',{id:poll.body.id,choice:0})).status,200);
assert.equal((await call('poll-vote','POST',{id:poll.body.id,choice:1})).status,409);
assert.deepEqual((await call('poll&id='+poll.body.id)).body.counts,[1,0]);
assert.equal((await call('poll-vote','POST',{id:poll.body.id,choice:2})).status,400);
assert.equal((await call('moderate','POST',{id:postId,status:'invalid'},'https://staging.example',adminPassword)).status,400);
assert.equal((await call('moderate','POST',{id:poll.body.id,status:'approved'},'https://staging.example',adminPassword)).status,404);
console.log('PASS Cloudflare community immediate-publish handler mock: create/list/poll/validation/origin/fail-closed');
