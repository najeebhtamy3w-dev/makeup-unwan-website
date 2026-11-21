// Real-browser proof (Chromium, Android profile) that a printed QR fragment (#makeup / #perfume)
// survives a server redirect from the old host to the new host, which is what a Netlify
// "/ -> https://new-host/ 302" rule or the QR gateway does. The fragment is never sent to the
// server, so only the browser can preserve it.  Run: node qr-gateway/test/fragment-browser.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium,devices} from 'playwright';
const serve=handler=>new Promise(r=>{const s=http.createServer(handler).listen(0,'127.0.0.1',()=>r(s))});
const target=await serve((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<html><body>new host</body></html>')});
const T=`http://localhost:${target.address().port}`;
const old=await serve((req,res)=>{
 // like a Netlify _redirects/netlify.toml rule: path and query kept, no fragment in Location
 if(req.url==='/'||req.url.startsWith('/?')||req.url.startsWith('/index.html')){res.writeHead(302,{location:T+req.url.replace('/index.html','/'),'cache-control':'no-store'});return res.end();}
 if(req.url.startsWith('/m'))return res.writeHead(302,{location:T+'/#makeup'}),res.end();   // gateway short path
 res.writeHead(404).end();
});
const O=`http://localhost:${old.address().port}`;
const browser=await chromium.launch();const page=await (await browser.newContext({...devices['Pixel 5']})).newPage();
const cases=[[O+'/#perfume',T+'/#perfume'],[O+'/#makeup',T+'/#makeup'],[O+'/?utm_source=qr#perfume',T+'/?utm_source=qr#perfume'],[O+'/index.html#makeup',T+'/#makeup'],[O+'/m',T+'/#makeup']];
for(const [from,to] of cases){await page.goto(from);assert.equal(page.url(),to,from);console.log('PASS',from.replace(O,'old'),'->',page.url().replace(T,'new'));}
await browser.close();old.close();target.close();
console.log('PASS store fragment preserved across 302 in Chromium (Android profile)');
