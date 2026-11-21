// Android phone acceptance test for the unified admin center (Chromium, Pixel 5 profile, real CSP).
// Checks RTL, no horizontal overflow in every section, navigation without re-login, and that a
// failing inbox/statistics service shows an error instead of misleading numbers.
// Run: node cloudflare/tests/admin-ui-mobile.test.mjs   (needs the playwright package + Chromium)
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium,devices} from 'playwright';
const html=readFileSync(new URL('../../public/admin.html',import.meta.url),'utf8');
const headersFile=readFileSync(new URL('../../public/_headers',import.meta.url),'utf8');
const adminCsp=headersFile.split('\n/admin.html\n')[1].match(/Content-Security-Policy: (.+)/)[1];
const PASSWORD='Abc123Def456Ghi';
const POST='12345678-1234-1234-1234-123456789abc';
const PAGES=['overview','visitors','contacts','feedback','community','reports','settings'];

async function run(name,{statsDown=false}={},check){
 const browser=await chromium.launch();
 const context=await browser.newContext({...devices['Pixel 5']});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),h=route.request().headers();
  const json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname==='/admin.html')return route.fulfill({status:200,contentType:'text/html',headers:{'content-security-policy':adminCsp},body:html});
  if(!url.pathname.startsWith('/.netlify/functions/'))return route.fulfill({status:404,body:''});
  const fn=url.pathname.split('/').pop(),action=url.searchParams.get('action');
  calls.push({fn,action,pw:h['x-admin-password']===PASSWORD});
  if(h['x-admin-password']!==PASSWORD)return json(401,{error:'كلمة مرور غير صحيحة'});
  if(fn==='admin-session')return json(200,{ok:true,role:'admin'});
  if(fn==='admin-feedback')return statsDown?json(503,{error:'تعذر قراءة الرسائل'}):json(200,{items:[{id:'m1',store:'perfume',kind:'اقتراح',message:'رسالة طويلة جدًا '.repeat(20)+'نهاية',createdAt:'2026-11-20T21:30:00Z'}],total:1,complete:true});
  if(fn==='admin-clicks')return statsDown?json(503,{error:'تعذر قراءة إحصاءات النقرات'}):json(200,{range:'30',days:30,total:3,counts:{makeup:{whatsapp:2},perfume:{instagram:1}},daily:{'2026-11-21':{makeup:2,perfume:1}},summary:{today:{makeup:2,perfume:1,total:3},last7:{makeup:2,perfume:1,total:3},last30:{makeup:2,perfume:1,total:3}},complete:true,legacy:{counted:0},timezone:'Asia/Aden'});
  if(fn==='community'&&action==='admin-list')return json(200,{items:[{id:POST,kind:'تجاربي',text:'نص مشاركة طويل '.repeat(25),status:'approved',createdAt:'2026-11-20T00:00:00Z'}],reports:{[POST]:1}});
  return json(404,{error:'unexpected'});
 });
 await page.goto('https://dev.test/admin.html');
 await page.fill('#demoPass',PASSWORD);await page.click('#enter');
 await page.waitForFunction(()=>document.getElementById('login').classList.contains('hide'),null,{timeout:5000});
 await check(page,calls);
 assert.deepEqual(errors,[],name+': no uncaught page errors');
 await browser.close();console.log('PASS mobile:',name);
}

await run('Android: RTL, every section fits the screen, no re-login while navigating',{},async(page,calls)=>{
 assert.equal(await page.evaluate(()=>document.documentElement.dir),'rtl');
 const width=await page.evaluate(()=>window.innerWidth);assert.ok(width<=400,'phone viewport, got '+width);
 const sessionsBefore=calls.filter(c=>c.fn==='admin-session').length;
 for(const p of PAGES){
  const nav=await page.$(`[data-page="${p}"]`);assert.ok(nav,'nav item for '+p);
  await nav.scrollIntoViewIfNeeded();await nav.click();
  await page.waitForFunction(id=>document.getElementById(id).classList.contains('active'),p,{timeout:5000});
  if(p==='community')await page.waitForFunction(()=>document.getElementById('communityItems').textContent.includes('بلاغات: 1'),null,{timeout:5000});
  const overflow=await page.evaluate(()=>{
   const vw=document.documentElement.clientWidth,bad=[];
   if(document.documentElement.scrollWidth>vw+1)bad.push('page scrollWidth '+document.documentElement.scrollWidth+'>'+vw);
   const sec=document.querySelector('.section.active');
   for(const el of sec.querySelectorAll('button,a,h1,h2,h3,p,label,select,input')){
    const r=el.getBoundingClientRect();if(!r.width||getComputedStyle(el).display==='none')continue;
    if(el.closest('table,.tablewrap,[style*="overflow"]'))continue; // horizontally scrollable data tables are allowed
    if(r.left<-1||r.right>vw+1)bad.push(el.tagName+':'+(el.id||el.textContent.trim().slice(0,20))+' '+Math.round(r.left)+'..'+Math.round(r.right));
   }
   return bad;
  });
  assert.deepEqual(overflow,[],'section '+p+' overflows the phone screen');
 }
 assert.equal(calls.filter(c=>c.fn==='admin-session').length,sessionsBefore,'navigation must not re-authenticate');
 assert.ok(calls.filter(c=>c.fn!=='admin-session').every(c=>c.pw),'every data call carries the same session credential');
});

await run('Android: inbox and statistics down -> clear errors, no misleading numbers, rest usable',{statsDown:true},async page=>{
 await page.waitForFunction(()=>/تعذر/.test(document.getElementById('clicksStatus').textContent),null,{timeout:5000});
 const values=await page.$$eval('#kpis .number',els=>els.map(e=>e.textContent.trim()));
 const clickValues=values.slice(0,3);  // click totals, WhatsApp clicks, customer messages
 assert.ok(clickValues.length===3&&clickValues.every(v=>v==='—'),'failed services must show placeholders, not numbers: '+JSON.stringify(values));
 await page.click('[data-page="community"]');
 await page.waitForFunction(()=>document.getElementById('communityItems').textContent.includes('بلاغات'),null,{timeout:5000});
});
