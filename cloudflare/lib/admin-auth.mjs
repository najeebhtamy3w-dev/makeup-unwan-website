import {resolveAppDatabase} from './environment-db.mjs';
// Staging/development admin authentication. Never log credentials or raw IP.
import {checkRateLimit} from './atomic-rate-limit.mjs';
const bytes=s=>new TextEncoder().encode(s);
async function digest(secret,value){
 const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes(value)));
}
function equal(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}
export const ADMIN_FAIL_LIMIT=10;
export const ADMIN_FAIL_WINDOW_MS=900000;
const FAIL_SCOPE='admin-auth-fail';
export function adminConfigProblem(env){
 if(!resolveAppDatabase(env))return 'database';
 if(typeof env.RATE_LIMIT_SALT!=='string'||env.RATE_LIMIT_SALT.length<32)return 'rate_limit_salt';
 if(typeof env.ADMIN_PASSWORD!=='string'||env.ADMIN_PASSWORD.length<15)return 'admin_password';
 return null;
}
async function failedAttempts(db,bucket,windowStart){
 const row=await db.prepare('SELECT hits FROM rate_windows WHERE scope=? AND bucket=? AND window_start=?')
  .bind(FAIL_SCOPE,bucket,windowStart).first();
 return Number(row?.hits)||0;
}
export async function requireStagingAdmin(request,env,{now=Date.now()}={}){
 const fail=(status,error,code,extra={},headers={})=>Response.json({error,code,...extra},{status,headers:{'cache-control':'no-store',...headers}});
 const problem=adminConfigProblem(env);
 if(problem)return fail(503,'لوحة الإدارة غير مهيأة على الخادم','ADMIN_NOT_CONFIGURED',{missing:problem});
 const db=resolveAppDatabase(env);
 const ip=request.headers.get('cf-connecting-ip')||'unknown';
 const bucket=Array.from((await digest(env.RATE_LIMIT_SALT,ip)).slice(0,8),b=>b.toString(16).padStart(2,'0')).join('');
 const given=request.headers.get('x-admin-password')||'';
 const windowStart=Math.floor(now/ADMIN_FAIL_WINDOW_MS)*ADMIN_FAIL_WINDOW_MS;
 const retryAfter=Math.max(1,Math.ceil((windowStart+ADMIN_FAIL_WINDOW_MS-now)/1000));
 if(await failedAttempts(db,bucket,windowStart)>=ADMIN_FAIL_LIMIT)
  return fail(429,'محاولات خاطئة كثيرة. انتظر ثم حاول مجددًا','ADMIN_LOCKED',{retryAfter},{'retry-after':String(retryAfter)});
 const expectedMac=await digest(env.RATE_LIMIT_SALT,env.ADMIN_PASSWORD);
 const givenMac=await digest(env.RATE_LIMIT_SALT,given.slice(0,1024));
 if(given.length>1024||!equal(expectedMac,givenMac)){
  await checkRateLimit(db,{scope:FAIL_SCOPE,bucket,limit:ADMIN_FAIL_LIMIT,windowMs:ADMIN_FAIL_WINDOW_MS,now});
  return fail(401,'كلمة مرور غير صحيحة','ADMIN_BAD_PASSWORD');
 }
 return null;
}
