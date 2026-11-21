// End-to-end acceptance test against a REAL Cloudflare Pages runtime (wrangler pages dev / workerd,
// or a deployed preview), with a real D1 binding. Exercises UI + API + storage + read-back.
//   BASE_URL=http://127.0.0.1:8788 ADMIN_PASSWORD=<test password> node cloudflare/tests/e2e-pages-runtime.mjs
// Never run it against production: it creates test messages, clicks and a community post.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium,devices} from 'playwright';
const BASE=process.env.BASE_URL,PASS=process.env.ADMIN_PASSWORD;
assert.ok(BASE&&PASS,'BASE_URL and ADMIN_PASSWORD are required');
assert.ok(!/makeup-unwan\.pages\.dev|netlify\.app/.test(BASE),'refusing to run against an official host');
const official=readFileSync(new URL('../../tests/fixtures/official-contact-links.txt',import.meta.url),'utf8').trim().split('\n');
const stamp='اختبار-آلي-'+Date.now().toString(36);
const results=[];const ok=(name,detail='')=>{results.push(name);console.log('PASS',name,detail)};

const browser=await chromium.launch();
const ctx=await browser.newContext({...devices['Pixel 5']});
const csp=[],pageErrors=[];
ctx.on('page',p=>{});
async function open(path){
 const page=await ctx.newPage();
 page.on('pageerror',e=>pageErrors.push(path+': '+e.message));
 page.on('console',m=>{if(/Content Security Policy|Refused to/i.test(m.text()))csp.push(path+': '+m.text())});
 // Never leave the test site (WhatsApp, maps, social links are only checked, not opened).
 await page.route(u=>!u.href.startsWith(BASE),r=>r.abort());
 await page.goto(BASE+path,{waitUntil:'load'});return page;
}

// 1. Health: dev database bound and schema complete.
if(process.env.SKIP_HEALTH!=='1'){const r=await fetch(BASE+'/api/health');const j=await r.json();assert.deepEqual(j,{ok:true,service:process.env.EXPECT_SERVICE||'makeup-unwan-development'});ok('health','D1 + schema');}

// 2. Landing page, both stores, about sections, all official contact links present.
const home=await open('/');
{
 const hrefs=new Set(await home.$$eval('a[href]',as=>as.map(a=>a.getAttribute('href').replace(/&amp;/g,'&'))));
 const missing=official.filter(h=>!hrefs.has(h));
 assert.deepEqual(missing,[],'official contact links missing on Cloudflare');
 for(const id of ['makeup','perfume','makeup-about','perfume-about'])assert.ok(await home.$('#'+id),'#'+id);
 ok('landing+contacts',official.length+' official links present');
}
for(const store of ['makeup','perfume']){
 const p=await open('/#'+store);
 await p.waitForFunction(s=>document.getElementById(s).classList.contains('active'),store,{timeout:5000});
 const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 assert.ok(overflow<=1,store+' overflows on phone by '+overflow+'px');
 await p.close();ok('direct open #'+store,'store section active, fits phone');
}

// 3. Contact click is tracked (beacon -> track-click -> D1).
{
 const p=await open('/#makeup');await p.waitForFunction(()=>document.getElementById('makeup').classList.contains('active'));
 const beacon=p.waitForRequest(r=>r.url().includes('/.netlify/functions/track-click'),{timeout:5000});
 await p.click('#makeup a[href="https://wa.me/967737099784"]',{noWaitAfter:true}).catch(()=>{});
 const req=await beacon;assert.equal(req.method(),'POST');
 await p.waitForTimeout(800);await p.close();ok('click tracking','beacon sent');
}

// 4. Customer message through the real form.
{
 const p=await open('/#perfume');await p.waitForFunction(()=>document.getElementById('perfume').classList.contains('active'));
 await p.click('[data-voc-open="perfume-feedback"]');
 await p.selectOption('#kind-perfume','اقتراح');
 await p.fill('#message-perfume','رسالة '+stamp+' للتحقق من حفظ الرسائل');
 const resp=p.waitForResponse(r=>r.url().endsWith('/.netlify/functions/feedback'));
 await p.click('form.voc-form[data-store="perfume"] button[type="submit"]');
 const r=await resp;assert.equal(r.status(),201,'feedback stored');
 await p.close();ok('customer message','201 stored');
}

// 5. «مساحتك معنا» community post through the real UI, then react + report via the page's API.
let postId;
{
 const p=await open('/masahatak.html');
 await p.click('[data-tab="community"]');
 await p.waitForFunction(()=>document.getElementById('community').classList.contains('active'),null,{timeout:5000});
 await p.selectOption('#kind',{index:0});
 await p.fill('#post-text','مشاركة '+stamp+' لاختبار مجتمعنا على كلاودفلير');
 await p.check('#consent');
 const resp=p.waitForResponse(r=>r.url().includes('action=create'));
 await p.click('#send-post');const r=await resp;assert.equal(r.status(),201,'post created');
 postId=(await r.json()).id;
 const list=await p.evaluate(async()=>{const r=await fetch('/.netlify/functions/community?action=list');return r.json()});
 assert.ok(list.items.some(i=>i.id===postId),'new post listed publicly');
 const react=await p.evaluate(async id=>{const r=await fetch('/.netlify/functions/community?action=react',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,emoji:'✨'})});return {s:r.status,b:await r.json()}},postId);
 assert.equal(react.s,200);assert.equal(react.b.reactions['✨'],1);
 const report=await p.evaluate(async id=>(await fetch('/.netlify/functions/community?action=report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})})).status,postId);
 assert.equal(report,201);
 await p.close();ok('community','post + reaction + report stored and read back');
}

// 5b. «بيننا» (comparison poll stored in D1 + vote), «عالمي» (device-local wishes), «اكتشف» (tab opens).
{
 const p=await open('/masahatak.html');
 await p.click('[data-tab="baynana"]');await p.waitForFunction(()=>document.getElementById('baynana').classList.contains('active'));
 await p.fill('#question','أي هدية أجمل؟ '+stamp.slice(-6));await p.fill('#choice1','باقة عطر');await p.fill('#choice2','طقم عناية');
 const resp=p.waitForResponse(r=>r.url().includes('action=poll-create'));await p.click('#make-compare');
 const r=await resp;assert.equal(r.status(),201,'poll created');const poll=await r.json();
 const pid=poll.id||new URL(String(poll.url||poll.link||''),BASE).searchParams.get('poll');assert.ok(pid,'poll id returned: '+JSON.stringify(poll));
 const vote=await p.evaluate(async id=>(await fetch('/.netlify/functions/community?action=poll-vote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,choice:0})})).status,pid);
 assert.ok([200,201].includes(vote),'vote stored: '+vote);
 const counts=await p.evaluate(async id=>(await (await fetch('/.netlify/functions/community?action=poll&id='+id)).json()).counts,pid);
 assert.ok(JSON.stringify(counts).includes('1'),'vote read back: '+JSON.stringify(counts));
 await p.click('[data-tab="alami"]');await p.waitForFunction(()=>document.getElementById('alami').classList.contains('active'));
 await p.fill('#wish','أمنية '+stamp);await p.click('#add-wish');
 await p.waitForFunction(s=>document.getElementById('wish-list').textContent.includes(s),stamp,{timeout:5000});
 await p.click('[data-tab="discover"]');await p.waitForFunction(()=>document.getElementById('discover').classList.contains('active'));
 await p.close();ok('baynana/alami/discover','poll stored + vote read back; wish saved locally; discover opens');
}

// 6. Admin center: wrong password, login, message + click visible, community moderation round-trip.
{
 const p=await open('/admin.html');
 await p.fill('#demoPass','definitely-wrong-password');await p.click('#enter');
 await p.waitForFunction(()=>document.getElementById('loginError').textContent.includes('غير صحيحة'),null,{timeout:5000});
 await p.fill('#demoPass',PASS);await p.click('#enter');
 await p.waitForFunction(()=>document.getElementById('login').classList.contains('hide'),null,{timeout:8000});
 await p.click('[data-page="feedback"]');
 await p.waitForFunction(s=>document.getElementById('feedbackRows').textContent.includes(s),stamp,{timeout:8000});
 const kpi=await p.$$eval('#kpis .number',els=>els.map(e=>e.textContent.trim()));
 assert.ok(kpi[0]!=='—'&&/[1-9١-٩]/.test(kpi[0]),'click total shown: '+kpi[0]);
 await p.click('[data-page="community"]');
 await p.waitForFunction(s=>document.getElementById('communityItems').textContent.includes(s),stamp,{timeout:8000});
 const card=p.locator('#communityItems article',{hasText:stamp});
 assert.ok((await card.textContent()).includes('بلاغات: 1'));
 p.once('dialog',d=>d.accept());await card.getByText('إخفاء المشاركة').click();
 await p.waitForFunction(s=>[...document.querySelectorAll('#communityItems article')].some(a=>a.textContent.includes(s)&&a.textContent.includes('مخفية')),stamp,{timeout:8000});
 const hidden=await p.evaluate(async id=>(await (await fetch('/.netlify/functions/community?action=list')).json()).items.some(i=>i.id===id),postId);
 assert.equal(hidden,false,'hidden post not public');
 await p.locator('#communityItems article',{hasText:stamp}).getByText('إعادة الإظهار').click();
 await p.waitForFunction(s=>[...document.querySelectorAll('#communityItems article')].some(a=>a.textContent.includes(s)&&a.textContent.includes('منشورة')),stamp,{timeout:8000});
 await p.close();ok('admin center','401 message, login, inbox, click KPI, hide/unhide with public effect');
}

assert.deepEqual(csp,[],'no CSP violations');assert.deepEqual(pageErrors,[],'no page errors');ok('CSP + page errors','none');
const secrets=await (await fetch(BASE+'/admin.html')).text();assert.ok(!secrets.includes(PASS),'password never served');
await browser.close();
console.log(`\nE2E OK: ${results.length} checks against ${BASE}`);
