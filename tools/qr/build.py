# Regenerates production-qr-codes/ (SVG with viewBox + mm size, PNG >= 2000 px, links file).
#   pip install segno zxing-cpp pillow && python3 tools/qr/build.py && node tools/qr/print-a4.mjs
import os,sys,segno
# Final site origin, e.g. QR_BASE=https://example.com/ python3 tools/qr/build.py
BASE=os.environ.get('QR_BASE','https://makeup-unwan-prod.pages.dev/')
if not BASE.startswith('https://') or not BASE.endswith('/'): sys.exit('QR_BASE must be https://... ending with /')
CODES=[('makeup-unwan-main',BASE),('makeup-house',BASE+'#makeup'),('unwan-perfume',BASE+'#perfume')]
for name,url in CODES:
    q=segno.make(url,error='h',micro=False)  # level H: tolerant to print wear
    q.save(f'production-qr-codes/{name}.svg',kind='svg',scale=1.6,unit='mm',border=4,dark='#000000',light='#ffffff',xmldecl=True)
    total=q.symbol_size(scale=1,border=4)[0]
    q.save(f'production-qr-codes/{name}.png',scale=-(-2000//total),border=4,dark='#000000',light='#ffffff')
with open('production-qr-codes/qr-links.txt','w',encoding='utf-8') as f:
    f.write('روابط رموز QR الرسمية — ميك أب هاوس × عنوان العطر\nOfficial QR links (production)\n\n')
    for name,url in CODES: f.write(f'{name}: {url}\n')
    f.write('\nتغيير هذا النطاق مستقبلًا يتطلب إعادة طباعة هذه الرموز.\n')
