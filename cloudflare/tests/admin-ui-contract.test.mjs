import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {onRequest as session} from '../../functions/.netlify/functions/admin-session.js';
import {onRequest as feedback} from '../../functions/.netlify/functions/admin-feedback.js';
import {onRequest as community} from '../../functions/.netlify/functions/community.js';
globalThis.crypto??=webcrypto;
const html=readFileSync(new URL('../../public/admin.html',import.meta.url),'utf8');
for(const marker of ["async function verifyAdminPassword(pass)","await verifyAdminPassword(pass)","Promise.allSettled([resetFeedback(),refreshClicks()])",'data-page="community"','id="community"','id="communityItems"','id="communityRefresh"','function loadCommunity()','communityRequest(\'admin-list\')','communityRequest(\'moderate\'','headers:{\'x-admin-password\':adminPassword}'])
 assert.ok(html.includes(marker),'Missing unified admin feature: '+marker);
assert.ok(html.includes('كلمة مرور واحدة لجميع أقسام الإدارة'),'Login should explain single-password behavior');
assert.ok(!html.includes('استخدم كلمة مرور الإدارة المضبوطة في Netlify'),'Obsolete hosting instruction must not appear');
assert.ok(!html.includes('iframe src="/community-admin.html"'),'Must not embed second login page');
const records=new Map();
const db={prepare(sql){return{bind(...args){return{
 async run(){if(sql.startsWith('INSERT INTO rate_windows'))return {meta:{changes:1}};throw Error('Unexpected SQL write '+sql);},
 async all(){if(sql.startsWith('SELECT key FROM app_records')){const [store,lo,hi,cursor]=args;return{results:[...records.keys()].filter(k=>k.startsWith(store+'|')).map(k=>k.slice(store.length+1)).filter(k=>k>=lo&&k<hi&&k>cursor).sort().slice(0,250).map(key=>({key}))};}if(sql.startsWith('SELECT discriminator,choice,COUNT(*)'))return {results:[]};throw Error('Unexpected SQL list '+sql);},
 async first(){if(sql.startsWith('SELECT hits FROM rate_windows'))return null;if(sql.startsWith('SELECT value FROM app_records')){const [store,key]=args;const value=records.get(store+'|'+key);return value===undefined?null:{value};}throw Error('Unexpected SQL read '+sql);}
}}}}};
const env={DEPLOYMENT_ENV:'development',DEV_DB:db,RATE_LIMIT_SALT:'s'.repeat(64),ADMIN_PASSWORD:'unified-test-password-long-enough'};
records.set('customer-feedback|msg1',JSON.stringify({id:'msg1',store:'makeup',kind:'اقتراح',message:'تجربة',createdAt:'2026-11-20T00:00:00Z'}));
records.set('community-v1|posts/12345678-1234-1234-1234-123456789abc',JSON.stringify({id:'12345678-1234-1234-1234-123456789abc',kind:'تجاربي',text:'مشاركة اختبارية',status:'approved',createdAt:'2026-11-20T00:00:00Z'}));
async function request(fn,path,password){const req=new Request('https://dev.example'+path,{headers:{'cf-connecting-ip':'192.0.2.2','x-admin-password':password}});const res=await fn({request:req,env});return {status:res.status,body:await res.json()};}
for(const pass of ['wrong',env.ADMIN_PASSWORD]){
 const login=await request(session,'/.netlify/functions/admin-session',pass);
 assert.equal(login.status,pass==='wrong'?401:200);
 const inbox=await request(feedback,'/.netlify/functions/admin-feedback',pass);
 const communityList=await request(community,'/.netlify/functions/community?action=admin-list',pass);
 assert.equal(inbox.status,pass==='wrong'?401:200);
 assert.equal(communityList.status,pass==='wrong'?401:200);
 if(pass===env.ADMIN_PASSWORD){assert.equal(login.body.ok,true);assert.equal(inbox.body.items.length,1);assert.equal(communityList.body.items.length,1);}
}
console.log('PASS unified admin dashboard contract and shared server-side credentials');
