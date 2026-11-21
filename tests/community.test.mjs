import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {reset,db} from './stub/blobs.mjs';
process.env.ADMIN_PASSWORD='correct-horse-battery-staple';
const handler=(await import('../netlify/functions/community.mjs')).default;
const base='https://site.example/.netlify/functions/community?action=';
const req=async(action,body,ip='10.0.0.1',admin=false)=>{
 const headers={'origin':'https://site.example','user-agent':'Acceptance-Test'};
 if(admin)headers['x-admin-password']=process.env.ADMIN_PASSWORD;
 const r=await handler(new Request(base+action,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),{ip});return [r.status,await r.json()];
};
reset();
let [code,result]=await req('create',{kind:'أفكار واقتراحات',text:'أقترح تنظيم ركن للهدايا المتنوعة للمناسبات',consent:true});assert.equal(code,201);
let id=[...db.get('community-v1').keys()][0].split('/')[1];
// Instant publish: the create response and the stored record agree, and the post is listed at once.
assert.equal(result.status,'approved');assert.equal(result.id,id);assert.equal(result.reference,id.slice(0,8));
assert.equal(JSON.parse(db.get('community-v1').get('posts/'+id)).status,'approved');
assert.deepEqual((await req('list'))[1].items.map(x=>x.id),[id],'read-after-write: new post is public immediately');
assert.equal((await req('admin-list',null,'10.0.0.2',true))[1].items[0].id,id,'visible in the admin list');
// Moderation still protected and still works both ways.
assert.equal((await req('moderate',{id,status:'rejected'}))[0],401);
assert.equal((await req('moderate',{id,status:'rejected'},'10.0.0.2',true))[0],200);
assert.equal((await req('list'))[1].items.length,0,'hidden post leaves the public list');
assert.equal((await req('moderate',{id,status:'approved'},'10.0.0.2',true))[0],200);
assert.equal((await req('list'))[1].items.length,1,'re-shown post is public again');
// One switchable reaction per person (approved policy, same as Cloudflare).
{let [c,r]=await req('react',{id,emoji:'🌸'});assert.equal(c,200);assert.equal(r.changed,true);assert.equal(r.myReaction,'🌸');assert.equal(r.reactions['🌸'],1);
 [c,r]=await req('react',{id,emoji:'🌸'});assert.equal(c,200,'same emoji again is not an error');assert.equal(r.changed,false);assert.equal(r.reactions['🌸'],1,'no double count');
 assert.equal((await req('react',{id,emoji:'🌸'},'10.0.0.3'))[0],200);
 let l=(await req('list'))[1].items[0];assert.equal(l.reactions['🌸'],2);assert.equal(l.myReaction,'🌸','myReaction survives a page refresh');
 [c,r]=await req('react',{id,emoji:'✨'});assert.equal(r.changed,true);assert.equal(r.myReaction,'✨');assert.equal(r.reactions['🌸'],1);assert.equal(r.reactions['✨'],1,'switch moves the vote, never adds a second one');
}
assert.equal((await req('report',{id}))[0],201);
assert.equal((await req('report',{id}))[0],409);
assert.equal((await req('admin-list',null,'10.0.0.2',true))[1].reports[id],1);
assert.equal((await req('create',{kind:'أفكار واقتراحات',text:'رابط خارجي https://bad.example/ لا يجوز نشره',consent:true},'10.0.0.4'))[0],400);
[code,result]=await req('poll-create',{question:'أي هدية أنسب للتخرج؟',choice1:'عطر',choice2:'طقم عناية'},'10.0.0.5');assert.equal(code,201);
const pollId=result.id;assert.equal(result.path,'/masahatak.html?poll='+pollId);
assert.deepEqual((await req('poll&id='+pollId))[1].counts,[0,0]);
assert.equal((await req('poll-vote',{id:pollId,choice:0},'10.0.0.6'))[0],200);
assert.equal((await req('poll-vote',{id:pollId,choice:1},'10.0.0.6'))[0],409);
assert.equal((await req('poll-vote',{id:pollId,choice:1},'10.0.0.7'))[0],200);
assert.deepEqual((await req('poll&id='+pollId))[1].counts,[1,1]);
// Admin password copied on a phone may carry surrounding spaces / NBSP: tolerated; anything else still rejected.
{const h=async pw=>(await handler(new Request(base+'admin-list',{headers:{origin:'https://site.example','x-admin-password':pw}}),{ip:'10.9.9.9'})).status;
 assert.equal(await h(' '+process.env.ADMIN_PASSWORD+'\u00a0'),200);assert.equal(await h(process.env.ADMIN_PASSWORD+'x'),401);}
// Legacy multi-emoji rows (old model) are kept and counted once per person: their latest emoji.
{const ev=db.get('community-events-v2');const legacyOwner='f'.repeat(32);
 ev.set('reaction/'+id+'/❤️/'+legacyOwner,'2026-11-01T00:00:00.000Z');ev.set('reaction/'+id+'/💡/'+legacyOwner,'2026-11-02T00:00:00.000Z');
 const r=(await req('list'))[1].items[0].reactions;assert.equal(r['💡'],1);assert.equal(r['❤️'],0,'a legacy owner counts once (latest)');
 assert.ok(ev.has('reaction/'+id+'/❤️/'+legacyOwner),'legacy rows are not deleted');}
console.log('PASS community acceptance: instant publish + read-after-write, moderation, privacy, reports, single switchable reaction + legacy, cross-client poll voting, input rejection, password trim');

// Regression: shared poll URL must forward its ID as a query parameter to the API.
const communityClient = readFileSync(new URL('../public/masahatak.js', import.meta.url), 'utf8');
assert.match(communityClient, /async function call\(action,body,query=''/);
assert.match(communityClient, /\(query\?'&'\+query:''\)/);
assert.match(communityClient, /call\('poll',null,'id='\+encodeURIComponent\(id\)\)/);
