// Real-browser check of the unified admin dashboard (Chromium via Playwright) with mocked APIs.
// Run: node cloudflare/tests/admin-ui-browser.test.mjs   (needs the playwright package + Chromium)
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const html=readFileSync(new URL('../../public/admin.html',import.meta.url),'utf8');
// Serve admin.html with the exact CSP Cloudflare Pages will send, so a stale script hash
// (which silently disables the login button in production) fails this test.
const headersFile=readFileSync(new URL('../../public/_headers',import.meta.url),'utf8');
const adminCsp=headersFile.split('\n/admin.html\n')[1].match(/Content-Security-Policy: (.+)/)[1];
const PASSWORD='Abc123Def456Ghi';
const POST='12345678-1234-1234-1234-123456789abc';

async function scenario(name,{sessionStatus=200,sessionBody,feedbackDown=false,clicksDown=false},check){
 const browser=await chromium.launch();
 const page=await browser.newPage();
 const calls=[];let post={id:POST,kind:'تجاربي',text:'مشاركة اختبارية',status:'approved',createdAt:'2026-11-20T00:00:00Z'};
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),h=route.request().headers();
  const json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname==='/admin.html')return route.fulfill({status:200,contentType:'text/html',headers:{'content-security-policy':adminCsp},body:html});
  if(!url.pathname.startsWith('/.netlify/functions/'))return route.fulfill({status:404,body:''});
  const fn=url.pathname.split('/').pop(),action=url.searchParams.get('action');
  calls.push(fn+(action?':'+action:''));
  const authed=h['x-admin-password']===PASSWORD;
  if(fn==='admin-session')return json(sessionStatus,sessionBody??(authed?{ok:true,role:'admin'}:{error:'كلمة مرور غير صحيحة',code:'ADMIN_BAD_PASSWORD'}));
  if(!authed)return json(401,{error:'كلمة مرور غير صحيحة'});
  if(fn==='admin-feedback')return feedbackDown?json(503,{error:'تعذر قراءة الرسائل'}):json(200,{items:[{id:'m1',store:'makeup',kind:'اقتراح',message:'رسالة اختبار',createdAt:'2026-11-20T00:00:00Z'}],total:1,complete:true});
  if(fn==='admin-clicks')return clicksDown?json(503,{error:'تعذر قراءة إحصاءات النقرات'}):json(200,{range:'30',days:30,total:0,counts:{makeup:{},perfume:{}},daily:{},summary:{today:{makeup:0,perfume:0,total:0},last7:{makeup:0,perfume:0,total:0},last30:{makeup:0,perfume:0,total:0}},complete:true,legacy:{counted:0}});
  if(fn==='community'&&action==='admin-list')return json(200,{items:[post],reports:{[POST]:2}});
  if(fn==='community'&&action==='moderate'){const b=JSON.parse(route.request().postData());post={...post,status:b.status};return json(200,{ok:true});}
  return json(404,{error:'unexpected'});
 });
 page.on('dialog',d=>d.accept());
 await page.goto('https://dev.test/admin.html');
 await page.fill('#demoPass',PASSWORD);
 await page.click('#enter');
 await check(page,calls);
 assert.deepEqual(pageErrors,[],name+': no uncaught page errors');
 await browser.close();
 console.log('PASS browser:',name);
}
const loginHidden=page=>page.waitForFunction(()=>document.getElementById('login').classList.contains('hide'),null,{timeout:5000});

await scenario('login succeeds even when messages and statistics are down',{feedbackDown:true,clicksDown:true},async(page,calls)=>{
 await loginHidden(page);
 await page.waitForFunction(()=>/تعذر/.test(document.getElementById('clicksStatus').textContent),null,{timeout:5000});
 assert.equal(calls[0],'admin-session','login checks credentials first, independently');
});
await scenario('wrong-password 401 message',{sessionStatus:401,sessionBody:{error:'x',code:'ADMIN_BAD_PASSWORD'}},async page=>{
 await page.waitForFunction(()=>document.getElementById('loginError').textContent.includes('غير صحيحة'),null,{timeout:5000});
 assert.ok(!(await page.$eval('#login',e=>e.classList.contains('hide'))));
});
await scenario('lockout 429 shows wait time, not "wrong password"',{sessionStatus:429,sessionBody:{error:'x',code:'ADMIN_LOCKED',retryAfter:600}},async page=>{
 await page.waitForFunction(()=>document.getElementById('loginError').textContent.includes('مؤقتًا'),null,{timeout:5000});
 assert.ok((await page.textContent('#loginError')).includes('10 دقيقة'));
});
await scenario('server not configured 503 says it is not the password',{sessionStatus:503,sessionBody:{error:'x',code:'ADMIN_NOT_CONFIGURED',missing:'admin_password'}},async page=>{
 await page.waitForFunction(()=>document.getElementById('loginError').textContent.includes('ليست مشكلة في كلمة المرور'),null,{timeout:5000});
});
await scenario('community moderation inside the dashboard, no second login',{},async(page,calls)=>{
 await loginHidden(page);
 await page.click('[data-page="community"]');
 await page.waitForFunction(()=>document.getElementById('communityItems').textContent.includes('مشاركة اختبارية'),null,{timeout:5000});
 assert.ok((await page.textContent('#communityItems')).includes('بلاغات: 2'),'reports shown');
 assert.equal(await page.$$eval('input[type=password]:not(#demoPass)',x=>x.length),0,'no extra password field');
 await page.click('#communityItems button:has-text("إخفاء المشاركة")');
 await page.waitForFunction(()=>document.getElementById('communityItems').textContent.includes('مخفية'),null,{timeout:5000});
 await page.click('#communityItems button:has-text("إعادة الإظهار")');
 await page.waitForFunction(()=>document.getElementById('communityItems').textContent.includes('منشورة'),null,{timeout:5000});
 await page.click('#communityRefresh');
 assert.ok(calls.filter(c=>c==='community:moderate').length===2);
});
