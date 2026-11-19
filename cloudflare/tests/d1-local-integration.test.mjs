// Local Cloudflare D1 runtime integration test using Miniflare, not remote Cloudflare D1.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {insertCommunityEvent,communityEventCounts} from '../lib/community-atomic.mjs';
import {checkRateLimit} from '../lib/atomic-rate-limit.mjs';
import {createD1Store} from '../lib/d1-store.mjs';
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['STAGING_DB']});
try{
 const db=await mf.getD1Database('STAGING_DB');
 for(const name of ['schema.sql','schema-community.sql']){
  const sql=await readFile(new URL('../'+name,import.meta.url),'utf8');
  await db.exec(sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n'));
 }
 const store=createD1Store(db,'customer-feedback');
 await store.setJSON('abc',{message:'test'});
 assert.deepEqual(await store.get('abc',{type:'json'}),{message:'test'});
 assert.deepEqual((await db.prepare('SELECT value FROM app_records WHERE store=? AND key=?').bind('customer-feedback','abc').first()).value,'{"message":"test"}');
 const id='12345678-1234-1234-1234-123456789abc',owner='a'.repeat(32);
 const votes=await Promise.all(Array.from({length:20},(_,i)=>insertCommunityEvent(db,{type:'vote',id,owner,choice:i%2})));
 assert.equal(votes.filter(v=>v.inserted).length,1);
 assert.equal((await communityEventCounts(db,{type:'vote',id})).reduce((a,b)=>a+b,0),1);
 const reactions=await Promise.all(Array.from({length:20},()=>insertCommunityEvent(db,{type:'reaction',id,owner,emoji:'🌸'})));
 assert.equal(reactions.filter(v=>v.inserted).length,1);
 const limits=await Promise.all(Array.from({length:20},()=>checkRateLimit(db,{scope:'d1-test',bucket:'b'.repeat(16),limit:5,windowMs:60000,now:120000})));
 assert.equal(limits.filter(x=>x.allowed).length,5);
 const row=await db.prepare('SELECT hits FROM rate_windows WHERE scope=?').bind('d1-test').first();
 assert.equal(row.hits,5);
 console.log('PASS local Cloudflare D1 runtime: schema, records, concurrent vote/reaction uniqueness, atomic limiter');
}finally{await mf.dispose();}
