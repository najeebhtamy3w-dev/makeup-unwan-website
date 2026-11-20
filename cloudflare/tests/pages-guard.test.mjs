import assert from 'node:assert/strict';
import {onRequest} from '../../functions/_middleware.js';
import {onRequestGet} from '../../functions/api/health.js';
const denied=await onRequest({request:new Request('https://staging.example/.netlify/functions/unported'),next:()=>new Response('static')});
assert.equal(denied.status,503);
assert.equal((await denied.json()).error,'Backend not available on this staging deployment');
for(const route of ['community','feedback','track-click','admin-feedback','admin-clicks']){
 const allowed=await onRequest({request:new Request('https://staging.example/.netlify/functions/'+route),next:()=>new Response('handler')});
 assert.equal(await allowed.text(),'handler',route+' should pass through');
}
const community=await onRequest({request:new Request('https://staging.example/.netlify/functions/community'),next:()=>new Response('community-handler')});
assert.equal(await community.text(),'community-handler');
const passthrough=await onRequest({request:new Request('https://staging.example/index.html'),next:()=>new Response('static')});
assert.equal(await passthrough.text(),'static');
const disabled=await onRequestGet({env:{DEPLOYMENT_ENV:'production'}});
assert.equal(disabled.status,503);
const missing=await onRequestGet({env:{DEPLOYMENT_ENV:'staging'}});
assert.equal(missing.status,503);
const healthy=await onRequestGet({env:{DEPLOYMENT_ENV:'staging',STAGING_DB:{prepare(){return {async first(){return {ok:1}}}}}}});
assert.equal(healthy.status,200);
console.log('PASS Pages route guard and health handler (mock)');
