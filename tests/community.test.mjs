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
assert.equal((await req('list'))[1].items.length,1);
assert.equal(result.status,'approved');
assert.equal((await req('moderate',{id,status:'approved'}))[0],401);
assert.equal((await req('moderate',{id,status:'approved'},'10.0.0.2',true))[0],200);
assert.equal((await req('list'))[1].items.length,1);
assert.equal((await req('react',{id,emoji:'🌸'}))[0],200);
assert.equal((await req('react',{id,emoji:'🌸'}))[0],409);
assert.equal((await req('react',{id,emoji:'🌸'},'10.0.0.3'))[0],200);
assert.equal((await req('list'))[1].items[0].reactions['🌸'],2);
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
// Published content can be hidden by the authenticated administrator and restored.
assert.equal((await req('moderate',{id,status:'rejected'},'10.0.0.2',true))[0],200);
assert.equal((await req('list'))[1].items.length,0);
assert.equal((await req('moderate',{id,status:'approved'},'10.0.0.2',true))[0],200);
assert.equal((await req('list'))[1].items.length,1);
for(const [index,sample] of ['www.example.com','example.xyz','https://example.com','example . com','https:\\/\\/example.com'].entries()){
 assert.equal((await req('create',{kind:'أفكار واقتراحات',text:'مشاركة تجريبية تحتوي على رابط '+sample,consent:true},'10.0.0.'+(20+index)))[0],400);
}
console.log('PASS community acceptance: moderation, privacy, reports, reactions, cross-client poll voting, input rejection (18 checks)');

// Regression: shared poll URL must forward its ID as a query parameter to the API.
const communityClient = readFileSync(new URL('../public/masahatak.js', import.meta.url), 'utf8');
assert.match(communityClient, /async function call\(action,body,query=''/);
assert.match(communityClient, /\(query\?'&'\+query:''\)/);
assert.match(communityClient, /call\('poll',null,'id='\+encodeURIComponent\(id\)\)/);
