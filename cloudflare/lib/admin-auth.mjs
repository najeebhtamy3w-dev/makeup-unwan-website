import {resolveAppDatabase} from './environment-db.mjs';
// Staging-only admin authentication. Never log credentials or raw IP.
import {checkRateLimit} from './atomic-rate-limit.mjs';
const bytes=s=>new TextEncoder().encode(s);
async function digest(secret,value){
 const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes(value)));
}
function equal(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}
export async function requireStagingAdmin(request,env){
 const fail=(status,error)=>Response.json({error},{status,headers:{'cache-control':'no-store'}});
 if(!resolveAppDatabase(env)||typeof env.ADMIN_PASSWORD!=='string'||env.ADMIN_PASSWORD.length<20)return fail(503,'لوحة الإدارة غير مهيأة');
 const ip=request.headers.get('cf-connecting-ip')||'unknown';
 const bucket=Array.from((await digest(env.RATE_LIMIT_SALT,ip)).slice(0,8),b=>b.toString(16).padStart(2,'0')).join('');
 const given=request.headers.get('x-admin-password')||'';
 // Limit attempts, including successful requests, to prevent brute force. Separate
 // from the Netlify policy that releases successful attempts.
 const attempt=await checkRateLimit(resolveAppDatabase(env),{scope:'admin-auth',bucket,limit:20,windowMs:900000});
 if(!attempt.allowed)return fail(429,'محاولات كثيرة. حاول لاحقًا');
 const expectedMac=await digest(env.RATE_LIMIT_SALT,env.ADMIN_PASSWORD);
 const givenMac=await digest(env.RATE_LIMIT_SALT,given.slice(0,1024));
 if(given.length>1024||!equal(expectedMac,givenMac))return fail(401,'كلمة مرور غير صحيحة');
 return null;
}
