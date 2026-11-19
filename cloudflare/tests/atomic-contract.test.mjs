import assert from 'node:assert/strict';
import {insertCommunityEvent,communityEventCounts} from '../lib/community-atomic.mjs';
import {checkRateLimit} from '../lib/atomic-rate-limit.mjs';
const id='12345678-1234-1234-1234-123456789abc',owner='a'.repeat(32);
const seen=new Map();
const db={prepare(sql){return {bind(...params){return {
 async run(){
  if(sql.includes('community_events')) {
   const [kind,target,who,discriminator]=params;
   const key=[kind,target,who,discriminator].join('|');
   if(seen.has(key))return {meta:{changes:0}};
   seen.set(key,params);return {meta:{changes:1}};
  }
  return {meta:{changes:1}};
 },
 async all(){return {results:[]}};
}}}}};
assert.equal((await insertCommunityEvent(db,{type:'vote',id,owner,choice:0})).inserted,true);
assert.equal((await insertCommunityEvent(db,{type:'vote',id,owner,choice:1})).inserted,false);
assert.equal((await insertCommunityEvent(db,{type:'reaction',id,owner,emoji:'🌸'})).inserted,true);
assert.equal((await insertCommunityEvent(db,{type:'reaction',id,owner,emoji:'🌸'})).inserted,false);
await assert.rejects(insertCommunityEvent(db,{type:'vote',id,owner,choice:3}),TypeError);
assert.deepEqual(await communityEventCounts(db,{type:'vote',id}),[0,0]);
const limit=await checkRateLimit(db,{scope:'community-react',bucket:'b'.repeat(16),limit:5,windowMs:60000,now:120000});
assert.equal(limit.allowed,true);
console.log('PASS: atomic contract unit smoke (mock only; D1 integration and concurrency still required)');
