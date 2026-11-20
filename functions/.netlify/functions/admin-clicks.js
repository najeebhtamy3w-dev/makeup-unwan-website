// Cloudflare staging admin click statistics, compatible response shape.
// Counts v2 keys only. Legacy click/ records are not migrated to isolated staging.
import {requireStagingAdmin} from '../../../cloudflare/lib/admin-auth.mjs';
import {createD1Store} from '../../../cloudflare/lib/d1-store.mjs';
const STORES=['makeup','perfume'],CHANNELS=['whatsapp','instagram','facebook','phone','maps','whatsapp_channel','whatsapp_group'];
const RANGES={today:1,'1':1,'7':7,'30':30,'90':90};
const TZ='Asia/Aden';
const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const addDays=(day,n)=>{const [y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);};
function days(from,to){const out=[];for(let d=from;d<=to;d=addDays(d,1))out.push(d);return out;}
export async function onRequest({request,env}){
 if(env.DEPLOYMENT_ENV!=='staging'||!env.STAGING_DB?.prepare||typeof env.RATE_LIMIT_SALT!=='string'||env.RATE_LIMIT_SALT.length<32)return reply(503,{error:'لوحة الإدارة غير مهيأة'});
 if(request.method!=='GET')return reply(405,{error:'Method not allowed'});
 try{
  const denied=await requireStagingAdmin(request,env);if(denied)return denied;
  const q=new URL(request.url).searchParams;
  const param=String(q.get('range')??q.get('days')??'30');
  if(!Object.hasOwn(RANGES,param))return reply(400,{error:'Invalid period'});
  const count=RANGES[param],range=count===1?'today':String(count);
  const started=Date.now(),today=fmt.format(new Date(started));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw Error('Invalid Aden day');
  const first=addDays(today,-(Math.max(count,30)-1));
  const daily={},store=createD1Store(env.STAGING_DB,'contact-click-events');
  let complete=true;
  for(const day of days(first,today)){
   if(Date.now()-started>8000){complete=false;break;}
   for await(const page of store.list({prefix:'v2/'+day+'/',paginate:true})){
    for(const entry of page.blobs){
     const parts=entry.key.split('/');
     if(parts.length!==5||parts[1]!==day||!STORES.includes(parts[2])||!CHANNELS.includes(parts[3]))continue;
     const s=parts[2],c=parts[3];
     daily[day]??={};daily[day][s]??={};daily[day][s][c]=(daily[day][s][c]||0)+1;
    }
    if(Date.now()-started>8000){complete=false;break;}
   }
   if(!complete)break;
  }
  const aggregate=from=>{
   const out={makeup:0,perfume:0,total:0,counts:{makeup:{},perfume:{}},daily:{}};
   for(const d of days(from,today)){
    const row=daily[d];if(!row)continue;
    for(const s of STORES)for(const [c,n] of Object.entries(row[s]||{})){
     out[s]+=n;out.total+=n;out.counts[s][c]=(out.counts[s][c]||0)+n;
     out.daily[d]??={makeup:0,perfume:0};out.daily[d][s]+=n;
    }
   }
   return out;
  };
  const pick=r=>({makeup:r.makeup,perfume:r.perfume,total:r.total});
  const main=aggregate(addDays(today,-(count-1)));
  return reply(200,{range,days:count,from:addDays(today,-(count-1)),to:today,total:main.total,
   counts:main.counts,daily:main.daily,summary:{today:pick(aggregate(today)),last7:pick(aggregate(addDays(today,-6))),last30:pick(aggregate(addDays(today,-29)))},
   complete,legacy:{counted:0,truncated:false},generatedAt:new Date().toISOString(),timezone:TZ,
   storageTime:'UTC',metric:'outbound_clicks',passwordWeak:env.ADMIN_PASSWORD.length<20});
 }catch(e){console.error('CF_ADMIN_CLICKS_ERROR',e?.message);return reply(503,{error:'تعذر قراءة إحصاءات النقرات'});}
}
