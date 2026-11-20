// V1.3.1 Discover: local-only, accessible interactive planning templates.
(() => {
  'use strict';
  const definitions = {
    gift: {title:'🎁 هدية لها معنى', fields:[['occasion','المناسبة','مثال: تخرج'],['taste','الذوق المفضل','مثال: عطور هادئة'],['idea','فكرة الهدية','مثال: مجموعة عناية']]},
    beauty: {title:'🌷 لمسة جمال', fields:[['occasion','المناسبة','مثال: زفاف'],['needs','قائمة الاحتياجات','مثال: مكياج، أدوات شعر'],['notes','ملاحظات','ما الذي تريدين تذكّره؟']]},
    perfume: {title:'✨ عالم العطور', fields:[['family','العائلة العطرية','مثال: زهري أو شرقي'],['notes','الروائح المفضلة','مثال: ورد، مسك'],['occasion','متى تستخدمينه؟','مثال: المناسبات']]},
    shared: {title:'💌 اختيارات مشتركة', fields:[['first','الخيار الأول','مثال: عطر زهري'],['second','الخيار الثاني','مثال: عطر شرقي'],['criteria','معايير المفاضلة','مثال: الرائحة والثبات']]}
  };
  const editor=document.getElementById('discover-editor');
  const heading=document.getElementById('discover-heading');
  const fields=document.getElementById('discover-fields');
  const status=document.getElementById('discover-status');
  if(!editor||!heading||!fields||!status) return;
  let selected=null;
  const storageKey=id=>'makeup-unwan-discover-v1-'+id;
  const read=id=>{try{const obj=JSON.parse(localStorage.getItem(storageKey(id))||'{}');return obj&&typeof obj==='object'&&!Array.isArray(obj)?obj:{}}catch{return {}}};
  const values=()=>Object.fromEntries([...fields.querySelectorAll('input')].map(el=>[el.dataset.key,el.value.trim()]));
  const summary=()=>{const def=definitions[selected];const v=values();return [def.title,...def.fields.map(([key,label])=>label+': '+(v[key]||'—'))].join('\n')};
  function open(id){
    const def=definitions[id];if(!def)return;
    selected=id;status.textContent='';editor.classList.remove('hide');heading.textContent=def.title;fields.replaceChildren();
    const saved=read(id);
    for(const [key,label,placeholder] of def.fields){
      const wrap=document.createElement('div'),caption=document.createElement('label'),input=document.createElement('input');
      const inputId='discover-'+id+'-'+key;
      caption.className='field';caption.htmlFor=inputId;caption.textContent=label;
      input.id=inputId;input.dataset.key=key;input.maxLength=160;input.placeholder=placeholder;input.value=typeof saved[key]==='string'?saved[key].slice(0,160):'';
      wrap.append(caption,input);fields.append(wrap);
    }
    document.querySelectorAll('[data-discover]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.discover===id)));
    fields.querySelector('input')?.focus();
  }
  document.querySelectorAll('[data-discover]').forEach(b=>b.addEventListener('click',()=>open(b.dataset.discover)));
  document.getElementById('discover-save')?.addEventListener('click',()=>{
    if(!selected)return;
    try{localStorage.setItem(storageKey(selected),JSON.stringify(values()));status.textContent='تم حفظ القالب على هذا الجهاز.'}
    catch{status.textContent='تعذّر الحفظ في هذا المتصفح. يمكنك نسخ الملخص بدلًا من ذلك.'}
  });
  document.getElementById('discover-clear')?.addEventListener('click',()=>{
    if(!selected)return;fields.querySelectorAll('input').forEach(el=>el.value='');
    try{localStorage.removeItem(storageKey(selected))}catch{}
    status.textContent='تم مسح بيانات هذا القالب من الجهاز.';
  });
  document.getElementById('discover-copy')?.addEventListener('click',async()=>{
    if(!selected)return;
    try{if(!navigator.clipboard?.writeText)throw Error('unsupported');await navigator.clipboard.writeText(summary());status.textContent='تم نسخ الملخص.'}
    catch{status.textContent='النسخ غير متاح هنا. يمكنك تحديد المدخلات ونسخها يدويًا.'}
  });
})();
