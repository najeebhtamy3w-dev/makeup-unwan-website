// Local Netlify-like server for end-to-end tests of the NETLIFY functions (in-memory Blobs stub):
// serves public/ with the headers from public/_headers and routes /.netlify/functions/<name>
// to netlify/functions/<name>.mjs.
//   ADMIN_PASSWORD=... RATE_LIMIT_SALT=... node --import ./tests/stub/register.mjs tools/netlify-local-server.mjs 8899
import http from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {join,extname} from 'node:path';
const ROOT=new URL('..',import.meta.url).pathname,PUB=join(ROOT,'public'),PORT=Number(process.argv[2]||8899);
const names=['feedback','track-click','admin-feedback','admin-clicks','admin-session','community'];
const handlers=Object.fromEntries(await Promise.all(names.map(async n=>[n,(await import(join(ROOT,'netlify/functions',n+'.mjs'))).default])));
// Netlify _headers format: "path" line, then indented "Name: value" lines.
const rules=[];let cur=null;
for(const line of readFileSync(join(PUB,'_headers'),'utf8').split('\n')){
 if(!line.trim()||line.trim().startsWith('#'))continue;
 if(!/^\s/.test(line)){cur={path:line.trim(),headers:{}};rules.push(cur);}
 else if(cur){const i=line.indexOf(':');cur.headers[line.slice(0,i).trim().toLowerCase()]=line.slice(i+1).trim();}
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'};
http.createServer(async(q,s)=>{
 const url=new URL(q.url,`http://${q.headers.host}`);
 if(url.pathname.startsWith('/.netlify/functions/')){
  const h=handlers[url.pathname.split('/').pop()];if(!h){s.writeHead(404);return s.end('nf');}
  const chunks=[];for await(const c of q)chunks.push(c);
  const req=new Request(url,{method:q.method,headers:q.headers,body:['GET','HEAD'].includes(q.method)?undefined:Buffer.concat(chunks)});
  const r=await h(req,{ip:'127.0.0.1'});s.writeHead(r.status,Object.fromEntries(r.headers));return s.end(Buffer.from(await r.arrayBuffer()));
 }
 let p=url.pathname==='/'?'/index.html':url.pathname;const f=join(PUB,p);
 if(!f.startsWith(PUB)||!existsSync(f)||!statSync(f).isFile()||p==='/_headers'){s.writeHead(404);return s.end('nf');}
 const hdr={'content-type':types[extname(f)]||'application/octet-stream'};
 for(const r of rules)if(r.path===url.pathname||(r.path==='/'&&url.pathname==='/'))Object.assign(hdr,r.headers);
 s.writeHead(200,hdr);s.end(readFileSync(f));
}).listen(PORT,'127.0.0.1',()=>console.log('netlify-local on',PORT));
