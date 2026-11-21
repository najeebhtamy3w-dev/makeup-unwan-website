import {readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const dir='production-qr-codes/';
const items=[['makeup-unwan-main','الموقع الرسمي','ميك أب هاوس × عنوان العطر','https://makeup-unwan-prod.pages.dev/'],
 ['makeup-house','ميك أب هاوس','امسح للوصول مباشرة إلى صفحة المحل','https://makeup-unwan-prod.pages.dev/#makeup'],
 ['unwan-perfume','عنوان العطر','امسح للوصول مباشرة إلى صفحة المحل','https://makeup-unwan-prod.pages.dev/#perfume']];
const svg=n=>readFileSync(dir+n+'.svg','utf8').replace(/<\?xml[^>]*>/,'').replace('class="segno"','class="qr"');
const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:'Noto Naskh Arabic','Noto Sans Arabic','DejaVu Sans',sans-serif;margin:0;color:#000;background:#fff}
h1{text-align:center;font-size:20pt;margin:0 0 6mm}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8mm;width:calc(100% - 4mm);margin:0 auto}
.card{border:0.4mm solid #000;border-radius:4mm;padding:6mm;text-align:center;break-inside:avoid}
.card.main{grid-column:1/3}.qr{width:62mm;height:62mm;display:block;margin:0 auto}
h2{margin:3mm 0 1mm;font-size:16pt}p{margin:0;font-size:10pt}code{overflow-wrap:anywhere;direction:ltr;unicode-bidi:embed;display:block;font-size:8.5pt;margin-top:2mm}
.note{font-size:8pt;text-align:center;margin-top:6mm;color:#333}</style></head><body>
<h1>رموز QR الرسمية</h1><div class="grid">
${items.map(([n,t,s,u],i)=>`<div class="card ${i===0?'main':''}">${svg(n)}<h2>${t}</h2><p>${s}</p><code>${u}</code></div>`).join('')}
</div><p class="note">اطبع بنسبة 100% دون تصغير. اترك الهامش الأبيض حول كل رمز. اختبر المسح بالهاتف قبل الطباعة الكمية.</p></body></html>`;
writeFileSync('/tmp/qr-print.html',html);
const b=await chromium.launch();const p=await b.newPage();await p.setContent(html,{waitUntil:'load'});
await p.pdf({path:dir+'qr-print-a4.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});
await p.setViewportSize({width:1240,height:1754});await p.screenshot({path:'/tmp/qr-print-preview.png',fullPage:true});
await b.close();console.log('pdf ok');
