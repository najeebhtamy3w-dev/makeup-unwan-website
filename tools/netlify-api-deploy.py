import hashlib,json,os,subprocess,sys,time,urllib.parse
import sys
# usage: python3 tools/netlify-api-deploy.py <site_id> <draft|production> <title>
SITE=sys.argv[1];DRAFT=(sys.argv[2]!='production');TITLE=sys.argv[3] if len(sys.argv)>3 else 'release';API='https://api.netlify.com/api/v1'
def curl(method,url,data=None,ctype='application/json',datafile=None):
    cmd=['curl','-s','-w','\n%{http_code}','-X',method,url,'-H','Authorization: Bearer '+os.environ.get('NETLIFY_AUTH_TOKEN','proxy-injected'),'-H','content-type: '+ctype]
    if datafile: cmd+=['--data-binary','@'+datafile]
    elif data is not None: cmd+=['--data-binary','@-']
    out=subprocess.run(cmd,input=(data.encode() if isinstance(data,str) else data),capture_output=True).stdout.decode(errors='replace')
    body,code=out.rsplit('\n',1);return int(code),body
files={}
for root,_,names in os.walk('public'):
    for n in names:
        p=os.path.join(root,n);files['/'+os.path.relpath(p,'public').replace(os.sep,'/')]=hashlib.sha1(open(p,'rb').read()).hexdigest()
man=json.load(open(os.environ.get('NETLIFY_FN_MANIFEST','/tmp/zisi/manifest.json')))  # output of netlify-bundle-functions.mjs
fns={f['name']:hashlib.sha256(open(f['path'],'rb').read()).hexdigest() for f in man}
cfg={f['name']:{'build_data':{'runtimeAPIVersion':2}} for f in man}
code,body=curl('POST',f'{API}/sites/{SITE}/deploys',json.dumps({'files':files,'functions':fns,'functions_config':cfg,'draft':DRAFT,'title':TITLE or 'release/production 58462de (test site) 06b2c5f pw-verified'}))
print('create',code,body[:200] if code>=300 else '');d=json.loads(body);DID=d['id']
print('deploy',DID,'required files',len(d.get('required') or []),'required functions',len(d.get('required_functions') or []))
inv={v:k for k,v in files.items()}
for sha in d.get('required') or []:
    path=inv[sha];c,b=curl('PUT',f"{API}/deploys/{DID}/files{urllib.parse.quote(path)}",ctype='application/octet-stream',datafile='public'+path);print(' file',path,c)
for f in man:
    if fns[f['name']] in (d.get('required_functions') or []):
        c,b=curl('PUT',f"{API}/deploys/{DID}/functions/{f['name']}?runtime=js&invocation_mode=stream",ctype='application/octet-stream',datafile=f['path']);print(' fn',f['name'],c,b[:120] if c>=300 else '')
for i in range(60):
    c,b=curl('GET',f'{API}/deploys/{DID}');s=json.loads(b);
    if s['state'] in('ready','error'):break
    time.sleep(5)
print('state',s['state'],s.get('error_message'),'| url',s.get('ssl_url'),'| functions',[x.get('n') for x in s.get('available_functions') or []])
print('summary',[m.get('title') for m in (s.get('summary') or {}).get('messages',[])])
