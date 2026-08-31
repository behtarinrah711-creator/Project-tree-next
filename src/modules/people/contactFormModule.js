import { projectContext } from '../../core/projectContext.js';
import { contactApi } from '../../domain/contactApi.js';
import { localStorageAdapter } from '../../data/storageAdapter.js';
import { STORAGE_KEYS } from '../../config/deploymentConfig.js';
import { enterContactFormShell, leaveContactFormShell } from './contactFormBridge.js';

const CONTACT_DRAFT_KEY=STORAGE_KEYS.contactDraft;
const runtime=new Proxy({}, { get(_target,key){ return window.KarhaApp?.getContactFormRuntime?.()?.[key]; } });
function getProjectId(){ return projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || runtime.getCurrentProject?.()?.id || null; }
function getActivities(projectId){ return runtime.getActivities?.(projectId) || []; }
function findActivity(id){ return getActivities(getProjectId()).find(a=>String(a.id)===String(id)) || null; }
function toEnglishDigits(value){ return String(value).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); }
function openSearchTemplate(options){ return window.KarhaSearchTemplate?.open(options); }
function readContactDraft(){ try{return JSON.parse(localStorageAdapter.getItem(CONTACT_DRAFT_KEY)||'null');}catch{return null;} }
function writeContactDraft(draft){ try{localStorageAdapter.setItem(CONTACT_DRAFT_KEY,JSON.stringify(draft));}catch{} }
function clearContactDraft(id){ const draft=readContactDraft(); if(!draft||!id||draft.id===id){try{localStorageAdapter.removeItem(CONTACT_DRAFT_KEY);}catch{}} }

export function openContactForm(contact=null,{activityId=null}={}){
  const projectId=getProjectId();
  if(!projectId) return false;
  const storedContact=contact?.id ? contactApi.get(projectId, contact.id) : null;
  contact=storedContact || contact;
  const isEdit=!!contact;
  const c=contact||{
    id:runtime.uid(), nationalityType:'ایرانی', nationality:'', foreignId:'', foreignIdImages:[],
    iranianDocumentImages:[], firstName:'', lastName:'', fatherName:'', nationalId:'', address:'', postalCode:'',
    phones:[], type:'', activities:[], bankAccounts:[], pending:true
  };
  if(!contact){
    const existingDraft=contactApi.listPage(projectId,{ limit:200 }).items.find(x=>x.pending===true);
    if(existingDraft) Object.assign(c,existingDraft);
  }
  if(!contact && activityId) c.activities=[String(activityId)];
  if(!Array.isArray(c.phones)) c.phones=c.phone?[c.phone]:[];
  if(!Array.isArray(c.bankAccounts)){
    const oldCards=Array.isArray(c.cards)?c.cards.filter(Boolean):[];
    const oldAccounts=Array.isArray(c.accounts)?c.accounts.filter(Boolean):[];
    const oldIbans=Array.isArray(c.ibans)?c.ibans.filter(Boolean):[];
    const n=Math.max(oldCards.length,oldAccounts.length,oldIbans.length);
    c.bankAccounts=[];
    for(let i=0;i<n;i++) c.bankAccounts.push({bankName:'',ownerName:(c.name||'').trim(),card:oldCards[i]||'',iban:oldIbans[i]||'',account:oldAccounts[i]||''});
  }
  if(!Array.isArray(c.activities)) c.activities=[];
  if(!Array.isArray(c.foreignIdImages)) c.foreignIdImages=c.foreignIdImage?[c.foreignIdImage]:[];
  if(!Array.isArray(c.iranianDocumentImages)) c.iranianDocumentImages=[];
  if(!c.firstName && c.name){ const parts=String(c.name).trim().split(/\s+/); c.firstName=parts.shift()||''; c.lastName=parts.join(' '); }
  if(!c.nationalityType) c.nationalityType='ایرانی';

  const page=document.getElementById('contactsPage');
  const body=document.getElementById('contactsPageBody');
  const header=page?.querySelector('.inner-section-bar');
  const h2=header?.querySelector('h2');
  const addBtn=document.getElementById('contactAddBtn');
  if(!enterContactFormShell({page,body,title:h2,addButton:addBtn,isEdit,setFormMode:runtime.setInternalFormMode})) return;

  const wrap=document.createElement('div'); wrap.className='contacts-page-form form-template';

  // اطلاعات فرم فقط با «پیش‌نویس» ذخیره می‌شود؛ تایپ کردن، رکوردی ایجاد یا به‌روزرسانی نمی‌کند.
  let draftTimer=null;
  const writeCurrentContactDraft=()=>{
    try{
      const first=String(wrap.querySelector('[data-key="firstName"]')?.value||'').trim();
      const last=String(wrap.querySelector('[data-key="lastName"]')?.value||'').trim();
      if(!first && !last) return false;
      const getDraftValue=k=>wrap.querySelector(`[data-key="${k}"]`)?.value||'';
      const phones=Array.from(wrap.querySelectorAll('.contact-phone-input')).map(i=>toEnglishDigits(i.value.trim())).filter(Boolean);
      const bankEntries=Array.from(wrap.querySelectorAll('.bank-entry')).map(entry=>{
        const g=k=>entry.querySelector(`[data-key="${k}"]`)?.value.trim()||'';
        return {ownerName:g('ownerName'),bankName:g('bankName'),card:toEnglishDigits(g('card')),iban:toEnglishDigits(g('iban')),account:toEnglishDigits(g('account'))};
      });
      const nat=natRow?.querySelector('input:checked')?.value||c.nationalityType||'ایرانی';
      const draft={
        ...c, pending:true, draftUpdatedAt:Date.now(),
        nationalityType:nat, nationality:getDraftValue('nationality'), foreignId:toEnglishDigits(getDraftValue('foreignId')),
        firstName:getDraftValue('firstName'), lastName:getDraftValue('lastName'), fatherName:getDraftValue('fatherName'),
        nationalId:toEnglishDigits(getDraftValue('nationalId')), address:getDraftValue('address'), postalCode:toEnglishDigits(getDraftValue('postalCode')),
        phones, phone:phones[0]||'', type:getDraftValue('type'), activities:Array.from(selected||[]), bankAccounts:bankEntries,
        foreignIdImages:c.foreignIdImages||[], iranianDocumentImages:c.iranianDocumentImages||[]
      };
      draft.name=[draft.firstName,draft.lastName].filter(Boolean).join(' ');
      draft.cards=bankEntries.map(x=>x.card).filter(Boolean); draft.ibans=bankEntries.map(x=>x.iban).filter(Boolean); draft.accounts=bankEntries.map(x=>x.account).filter(Boolean);
      if(!contactApi.save(projectId, draft).ok) return false;
      writeContactDraft(draft);
      return true;
    }catch(e){ return false; }
  };
  const commitDraftNow=()=>{ clearTimeout(draftTimer); writeCurrentContactDraft(); };
  window.__commitContactDraft=commitDraftNow;

  const saveContactDraft=()=>{ formIsDirty=true; };

  const makeInput=(label,value,key,opts={})=>{
    const d=document.createElement('div'); d.className='contact-field';
    const l=document.createElement('label'); l.textContent=label;
    const i=document.createElement('input'); i.className='contact-input'+(opts.numeric?' numeric-field':''); i.type=opts.type||'text'; i.value=value||''; i.placeholder=opts.placeholder||''; i.dataset.key=key; i.autocomplete='off';
    if(opts.numeric){ i.readOnly=true; i.inputMode='none'; i.addEventListener('click',()=>runtime.openNumpadGeneric(i.value,(v)=>{i.value=v;saveContactDraft();},{suffix:'',prefix:'',maxLen:opts.maxLen||32,group:false})); }
    d.append(l,i); return d;
  };
  const makeSelect=(label,value,key,options)=>{
    const d=document.createElement('div'); d.className='contact-field contact-custom-select-field';
    const l=document.createElement('label'); l.textContent=label; d.appendChild(l);
    const hidden=document.createElement('input'); hidden.type='hidden'; hidden.dataset.key=key; hidden.value=value||'انتخاب کنید';
    const picker=document.createElement('div'); picker.className='contact-custom-select';
    const trigger=document.createElement('button'); trigger.type='button'; trigger.className='contact-custom-select-trigger';
    const text=document.createElement('span'); text.textContent=hidden.value;
    const arrow=document.createElement('span'); arrow.className='contact-custom-select-arrow'; arrow.textContent='⌄';
    trigger.append(text,arrow);
    const menu=document.createElement('div'); menu.className='contact-custom-select-menu';
    const closeMenu=()=>{menu.classList.remove('open');trigger.classList.remove('open');};
    options.forEach(opt=>{
      const row=document.createElement('button'); row.type='button'; row.className='contact-custom-select-option';
      row.textContent=opt;
      row.onclick=()=>{hidden.value=opt;text.textContent=opt;closeMenu();};
      menu.appendChild(row);
    });
    trigger.onclick=()=>{ const willOpen=!menu.classList.contains('open'); document.querySelectorAll('.contact-custom-select-menu.open').forEach(m=>m.classList.remove('open')); document.querySelectorAll('.contact-custom-select-trigger.open').forEach(t=>t.classList.remove('open')); menu.classList.toggle('open',willOpen); trigger.classList.toggle('open',willOpen); };
    picker.append(trigger,menu); d.append(picker,hidden);
    const outside=e=>{if(!picker.contains(e.target)) closeMenu();};
    document.addEventListener('pointerdown',outside,true);
    d._cleanupSelect=()=>document.removeEventListener('pointerdown',outside,true);
    return d;
  };

  const natSection=document.createElement('div'); natSection.className='contact-section';
  const natTitle=document.createElement('div'); natTitle.className='contact-section-title'; natTitle.textContent='تابعیت'; natSection.appendChild(natTitle);
  const natRow=document.createElement('div'); natRow.className='contact-radio-row';
  ['ایرانی','غیر ایرانی'].forEach(v=>{const lab=document.createElement('label');lab.className='contact-radio';const r=document.createElement('input');r.type='radio';r.name='contactNationality';r.value=v;r.checked=c.nationalityType===v;const sp=document.createElement('span');sp.textContent=v;lab.append(r,sp);natRow.appendChild(lab);});
  natSection.appendChild(natRow); wrap.appendChild(natSection);

  const foreignBox=document.createElement('div'); foreignBox.className='contact-section contact-foreign-fields hidden';
  foreignBox.append(makeInput('تابعیت',c.nationality,'nationality'));
  foreignBox.append(makeInput('شماره اتباع',c.foreignId,'foreignId',{numeric:true,maxLen:20}));
  const foreignUpload=document.createElement('div'); foreignUpload.className='contact-upload';
  const foreignLabel=document.createElement('label'); foreignLabel.className='contact-upload-btn'; foreignLabel.textContent='افزودن تصاویر مدارک اتباع +';
  const foreignFile=document.createElement('input'); foreignFile.type='file'; foreignFile.accept='image/*'; foreignFile.multiple=true;
  const foreignGrid=document.createElement('div'); foreignGrid.className='contact-image-grid'; foreignUpload.append(foreignLabel,foreignGrid); foreignLabel.appendChild(foreignFile); foreignBox.appendChild(foreignUpload); wrap.appendChild(foreignBox);

  const iranianDocs=document.createElement('div'); iranianDocs.className='contact-section';
  const iranTitle=document.createElement('div'); iranTitle.className='contact-section-title'; iranTitle.textContent='مدارک هویتی ایرانی'; iranianDocs.appendChild(iranTitle);
  const iranUpload=document.createElement('div'); iranUpload.className='contact-upload';
  const iranLabel=document.createElement('label'); iranLabel.className='contact-upload-btn'; iranLabel.textContent='افزودن تصاویر مدارک +';
  const iranFile=document.createElement('input'); iranFile.type='file'; iranFile.accept='image/*'; iranFile.multiple=true;
  const iranGrid=document.createElement('div'); iranGrid.className='contact-image-grid'; iranUpload.append(iranLabel,iranGrid); iranLabel.appendChild(iranFile); iranianDocs.appendChild(iranUpload); wrap.appendChild(iranianDocs);

  wrap.append(makeInput('نام',c.firstName,'firstName'));
  wrap.append(makeInput('نام خانوادگی',c.lastName,'lastName'));
  wrap.append(makeInput('نام پدر',c.fatherName,'fatherName'));
  const nationalField=makeInput('کد ملی',c.nationalId,'nationalId',{numeric:true,maxLen:10}); wrap.append(nationalField);
  wrap.append(makeInput('آدرس محل سکونت',c.address,'address'));
  wrap.append(makeInput('کد پستی',c.postalCode,'postalCode',{numeric:true,maxLen:10}));

  const phoneSec=document.createElement('div'); phoneSec.className='contact-section repeat-section';
  const phoneHead=document.createElement('div'); phoneHead.className='repeat-head'; const phoneTitle=document.createElement('div'); phoneTitle.className='repeat-title'; phoneTitle.textContent='شماره تماس'; const phoneAdd=document.createElement('button'); phoneAdd.type='button'; phoneAdd.className='repeat-add'; phoneAdd.textContent='+'; phoneHead.append(phoneTitle,phoneAdd); phoneSec.appendChild(phoneHead);
  const phoneRows=document.createElement('div'); phoneRows.className='contact-repeat-rows'; phoneSec.appendChild(phoneRows); wrap.appendChild(phoneSec);
  const addPhone=(value='')=>{const r=document.createElement('div');r.className='repeat-row';const i=document.createElement('input');i.className='contact-input numeric-field contact-phone-input';i.readOnly=true;i.inputMode='none';i.value=value;i.placeholder='شماره موبایل';i.addEventListener('click',()=>runtime.openNumpadGeneric(i.value,v=>{i.value=v;saveContactDraft();},{suffix:'',prefix:'',maxLen:15,group:false}));const rm=document.createElement('button');rm.type='button';rm.className='repeat-remove';rm.textContent='حذف';rm.onclick=()=>{r.remove();saveContactDraft();};r.append(i,rm);phoneRows.appendChild(r);};
  (c.phones||[]).filter(Boolean).forEach(addPhone); if(!phoneRows.children.length) addPhone(''); phoneAdd.onclick=()=>{addPhone('');saveContactDraft();};
  wrap.append(makeSelect('نوع مخاطب',c.type,'type',['کارفرما','کارگر','راننده','فروشنده','پیمانکار','مهندس','ناظر']));

  // فعالیت: فقط یک مورد — تمپلیت جستجو (چندانتخابی حذف شد)
  let selectedActivityId = Array.isArray(c.activities) && c.activities.length ? String(c.activities[0]) : '';
  const actSec=document.createElement('div');
  actSec.className='contact-section contact-field ft-row ft-tap';
  const actLab=document.createElement('div');
  actLab.className='ft-label';
  actLab.textContent='فعالیت:';
  const actVal=document.createElement('div');
  actVal.className='ft-value';
  const syncActVal=()=>{
    const a=selectedActivityId?findActivity(selectedActivityId):null;
    actVal.textContent=a?(a.name||a.title||'—'):'انتخاب';
    actVal.classList.toggle('ft-placeholder', !a);
  };
  syncActVal();
  actSec.append(actLab, actVal);
  actSec.onclick=()=>{
    const acts=getActivities(projectId).filter(a=>a&&!a.trashed);
    openSearchTemplate({
      title:'انتخاب فعالیت',
      listTitle:'فعالیت‌ها',
      selectedTitle:'فعالیت منتخب',
      contextKey:'contactActivity',
      items:acts.map(a=>({id:a.id, name:a.name||a.title||'فعالیت'})),
      showStar:true,
      showAdd:false,
      onSelect:(item)=>{
        selectedActivityId=String(item.id);
        c.activities=selectedActivityId?[selectedActivityId]:[];
        syncActVal();
        try{ saveContactDraft(); }catch(e){}
        try{ formIsDirty=true; }catch(e){}
      }
    });
  };
  wrap.appendChild(actSec);
  // سازگاری با اعتبارسنجی/ذخیره قبلی که selected را Set فرض می‌کرد
  const selected={
    get size(){ return selectedActivityId?1:0; },
    has(id){ return !!(selectedActivityId && String(id)===String(selectedActivityId)); },
    add(id){ selectedActivityId=String(id); c.activities=[selectedActivityId]; syncActVal(); },
    delete(id){ if(String(id)===String(selectedActivityId)){ selectedActivityId=''; c.activities=[]; syncActVal(); } },
    clear(){ selectedActivityId=''; c.activities=[]; syncActVal(); },
    [Symbol.iterator]: function*(){ if(selectedActivityId) yield selectedActivityId; }
  };
  const renderSelected=()=>syncActVal();


  const bankSec=document.createElement('div'); bankSec.className='contact-section'; const bankHead=document.createElement('div'); bankHead.className='repeat-head'; const bankTitle=document.createElement('div'); bankTitle.className='contact-section-title contact-section-title-inline'; bankTitle.textContent='اطلاعات حساب'; const bankAdd=document.createElement('button'); bankAdd.type='button'; bankAdd.className='repeat-add'; bankAdd.textContent='+'; bankHead.append(bankTitle,bankAdd); bankSec.appendChild(bankHead); const bankList=document.createElement('div'); bankList.className='bank-list'; bankSec.appendChild(bankList); wrap.appendChild(bankSec);
  const addBank=(b={})=>{const entry=document.createElement('div');entry.className='bank-entry';const entryHead=document.createElement('div');entryHead.className='bank-entry-head';const entryTitle=document.createElement('div');entryTitle.className='bank-entry-title';entryTitle.textContent='اطلاعات حساب جدید';const rm=document.createElement('button');rm.type='button';rm.className='bank-remove';rm.textContent='حذف';rm.onclick=()=>{entry.remove();saveContactDraft();};entryHead.append(entryTitle,rm);entry.appendChild(entryHead);entry.appendChild(makeInput('به نام',b.ownerName||[c.firstName,c.lastName].filter(Boolean).join(' '),'ownerName'));entry.appendChild(makeInput('بانک',b.bankName,'bankName'));entry.appendChild(makeInput('شماره کارت',b.card,'card',{numeric:true,maxLen:19}));entry.appendChild(makeInput('شماره شبا',b.iban,'iban',{numeric:true,maxLen:26}));entry.appendChild(makeInput('شماره حساب',b.account,'account',{numeric:true,maxLen:24}));bankList.appendChild(entry);};
  (c.bankAccounts||[]).forEach(addBank); if(!bankList.children.length) addBank({ownerName:[c.firstName,c.lastName].filter(Boolean).join(' ')}); bankAdd.onclick=()=>{addBank({ownerName:[c.firstName,c.lastName].filter(Boolean).join(' ')});saveContactDraft();};

  const bar=document.createElement('div'); bar.className='contact-savebar'; const save=document.createElement('button'); save.className='mini-btn primary'; save.textContent='ذخیره'; const draftBtn=document.createElement('button'); draftBtn.className='mini-btn'; draftBtn.textContent='پیش‌نویس'; const cancel=document.createElement('button'); cancel.className='mini-btn ghost'; cancel.textContent='انصراف'; bar.append(save,draftBtn,cancel); wrap.appendChild(bar); body.appendChild(wrap);

  const renderImages=(grid,images)=>{grid.innerHTML='';images.forEach((src,idx)=>{const card=document.createElement('div');card.className='contact-image-card';const img=document.createElement('img');img.src=src;const rm=document.createElement('button');rm.type='button';rm.className='contact-image-remove';rm.textContent='×';rm.onclick=()=>{images.splice(idx,1);renderImages(grid,images);saveContactDraft();};card.append(img,rm);grid.appendChild(card);});};
  renderImages(foreignGrid,c.foreignIdImages); renderImages(iranGrid,c.iranianDocumentImages);
  const readImages=(input,target,grid)=>{Array.from(input.files||[]).forEach(f=>{const reader=new FileReader();reader.onload=()=>{target.push(reader.result);renderImages(grid,target);saveContactDraft();};reader.readAsDataURL(f);});input.value='';};
  foreignFile.addEventListener('change',()=>readImages(foreignFile,c.foreignIdImages,foreignGrid)); iranFile.addEventListener('change',()=>readImages(iranFile,c.iranianDocumentImages,iranGrid));

  const toggleNationality=()=>{const iranian=(natRow.querySelector('input:checked')?.value||'ایرانی')==='ایرانی';foreignBox.classList.toggle('hidden',iranian);nationalField.classList.toggle('hidden',!iranian);iranianDocs.classList.toggle('hidden',!iranian);};
  natRow.querySelectorAll('input').forEach(r=>r.addEventListener('change',toggleNationality)); toggleNationality();
  const cleanupContactForm=()=>{
    clearTimeout(draftTimer);
    window.removeEventListener('beforeunload',contactBeforeUnload);
    if(window.__commitContactDraft===commitDraftNow) window.__commitContactDraft=null; if(window.__contactBackGuard===backToList) window.__contactBackGuard=null;
    cleanupContactActivityPicker();
    leaveContactFormShell({page,title:h2,addButton:addBtn,setFormMode:runtime.setInternalFormMode});
  };
  const contactBeforeUnload=(e)=>{
    // هنگام Refresh نمی‌توانیم پنجره سه‌گزینه‌ای سفارشی مرورگر بسازیم؛ فقط هشدار می‌دهیم که اطلاعات ذخیره نشده است.
    if(!contactSavedSuccessfully && formIsDirty){ e.preventDefault(); e.returnValue=''; }
  };
  let formIsDirty=false;
  let exitGuardOpen=false;
  const markFormDirty=()=>{formIsDirty=true;};
  wrap.querySelectorAll('input,textarea,select').forEach(el=>{el.addEventListener('input',markFormDirty);el.addEventListener('change',markFormDirty);});
  const closeContactsToSettings=()=>{ cleanupContactForm(); runtime.closeContactsToSettings(); };
  let contactActivityPickerCleaned=false;
  const cleanupContactActivityPicker=()=>{
    if(contactActivityPickerCleaned) return;
    contactActivityPickerCleaned=true;
  };
  let contactSavedSuccessfully=false;
  const discardAndBack=()=>{
    cleanupContactForm();
    runtime.renderContacts(projectId);
    if(header) header.querySelector('.inner-section-back').onclick=closeContactsToSettings;
  };
  const showExitChoice=()=>{
    if(exitGuardOpen) return;
    exitGuardOpen=true;
    const overlay=document.createElement('div');
    overlay.className='contact-exit-choice';
    overlay.innerHTML=`<div class="contact-exit-card"><div class="contact-exit-title">اطلاعات ذخیره نشده است</div><div class="contact-exit-text">می‌خواهید اطلاعات فعلی به‌صورت پیش‌نویس ذخیره شود؟</div><div class="contact-exit-actions"><button type="button" class="mini-btn ghost" data-exit="stay">ادامه ثبت</button><button type="button" class="mini-btn ghost" data-exit="discard">خروج بدون ذخیره</button><button type="button" class="mini-btn primary" data-exit="draft">ذخیره پیش‌نویس</button></div></div>`;
    document.body.appendChild(overlay);
    const close=()=>{exitGuardOpen=false;overlay.remove();};
    overlay.querySelector('[data-exit="stay"]').onclick=close;
    overlay.querySelector('[data-exit="discard"]').onclick=()=>{close();discardAndBack();};
    overlay.querySelector('[data-exit="draft"]').onclick=()=>{commitDraftNow();formIsDirty=false;close();discardAndBack();};
    overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)close();});
  };
  const contactRequiredComplete=()=>{
    const get=k=>wrap.querySelector(`[data-key="${k}"]`)?.value.trim()||'';
    const nat=natRow.querySelector('input:checked')?.value||'ایرانی';
    const phones=Array.from(phoneRows.querySelectorAll('input')).map(i=>toEnglishDigits(i.value.trim())).filter(Boolean);
    const banks=Array.from(bankList.querySelectorAll('.bank-entry'));
    const bankOk=banks.some(entry=>{const g=k=>entry.querySelector(`[data-key="${k}"]`)?.value.trim()||'';return !!(g('ownerName')&&g('bankName')&&g('card'));});
    return !!(get('firstName')&&get('lastName')&&(nat!=='ایرانی'||get('nationalId'))&&phones.length&&get('type')&&get('type')!=='انتخاب کنید'&&selected.size&&bankOk);
  };
  // پیش‌نویس مخاطب فقط وقتی معتبر است که حداقل نام یا نام خانوادگی وارد شده باشد.
  const contactHasDraftIdentity=()=>{
    const first=String(wrap.querySelector('[data-key="firstName"]')?.value||'').trim();
    const last=String(wrap.querySelector('[data-key="lastName"]')?.value||'').trim();
    return !!(first||last);
  };
  const backToList=()=>{
    if(contactSavedSuccessfully){ discardAndBack(); return; }
    // پیشنهاد پیش‌نویس فقط وقتی مجاز است که حداقل نام یا نام خانوادگی وارد شده باشد.
    const hasDraftIdentity = contactHasDraftIdentity();
    if(hasDraftIdentity && !contactRequiredComplete()){
      runtime.showIncompleteFormExitChoice({
        onYes:()=>{commitDraftNow();formIsDirty=false;discardAndBack();},
        onNo:()=>{discardAndBack();}
      });
      return;
    }
    discardAndBack();
  };
  window.__contactBackGuard=backToList;
  cancel.onclick=()=>discardAndBack();
  if(header) header.querySelector('.inner-section-back').onclick=backToList;
  window.addEventListener('beforeunload',contactBeforeUnload);
  draftBtn.onclick=()=>{
    if(!contactHasDraftIdentity()){
      runtime.showToast('برای ذخیره پیش‌نویس حداقل نام یا نام خانوادگی را وارد کنید');
      return;
    }
    commitDraftNow(); formIsDirty=false; discardAndBack();
  };

  const clearInvalid=el=>{if(el) el.classList.remove('contact-invalid');};
  const markInvalid=el=>{if(el) el.classList.add('contact-invalid');};
  [ 'firstName','lastName','nationalId','type' ].forEach(k=>{const el=wrap.querySelector(`[data-key="${k}"]`)?.closest('.contact-field'); if(el){const input=wrap.querySelector(`[data-key="${k}"]`); input?.addEventListener('input',()=>clearInvalid(el)); input?.addEventListener('change',()=>clearInvalid(el));}});
  save.onclick=()=>{
    const get=k=>wrap.querySelector(`[data-key="${k}"]`)?.value.trim()||'';
    const nat=natRow.querySelector('input:checked')?.value||'ایرانی';
    const firstName=get('firstName'),lastName=get('lastName'),nationalId=get('nationalId');
    const phoneVals=Array.from(phoneRows.querySelectorAll('input')).map(i=>toEnglishDigits(i.value.trim())).filter(Boolean);
    const typeVal=get('type');
    const bankEntries=Array.from(bankList.querySelectorAll('.bank-entry'));
    const requiredBank=bankEntries.find(entry=>{
      const getE=k=>entry.querySelector(`[data-key="${k}"]`)?.value.trim()||'';
      return getE('ownerName')&&getE('bankName')&&getE('card');
    });
    const invalid=[];
    const firstField=wrap.querySelector('[data-key="firstName"]')?.closest('.contact-field');
    const lastField=wrap.querySelector('[data-key="lastName"]')?.closest('.contact-field');
    const nationalFieldEl=wrap.querySelector('[data-key="nationalId"]')?.closest('.contact-field');
    const typeField=wrap.querySelector('[data-key="type"]')?.closest('.contact-field');
    const activityField=actSec;
    const phoneField=phoneSec;
    const bankField=bankSec;
    [firstField,lastField,nationalFieldEl,typeField,activityField,phoneField,bankField].forEach(clearInvalid);
    bankEntries.forEach(e=>{
      e.classList.remove('contact-invalid');
      ['ownerName','bankName','card'].forEach(k=>{
        const f=e.querySelector(`[data-key="${k}"]`)?.closest('.contact-field');
        clearInvalid(f);
      });
    });
    if(!firstName){markInvalid(firstField);invalid.push(firstField);}
    if(!lastName){markInvalid(lastField);invalid.push(lastField);}
    if(nat==='ایرانی'&&!nationalId){markInvalid(nationalFieldEl);invalid.push(nationalFieldEl);}
    if(!phoneVals.length){markInvalid(phoneField);invalid.push(phoneField);}
    if(!typeVal||typeVal==='انتخاب کنید'){markInvalid(typeField);invalid.push(typeField);}
    if(!selected.size){markInvalid(activityField);invalid.push(activityField);}
    if(!requiredBank){
      markInvalid(bankField); invalid.push(bankField);
      bankEntries.forEach(entry=>{
        const getE=k=>entry.querySelector(`[data-key="${k}"]`)?.value.trim()||'';
        ['ownerName','bankName','card'].forEach(k=>{
          if(!getE(k)) markInvalid(entry.querySelector(`[data-key="${k}"]`)?.closest('.contact-field'));
        });
      });
    }
    if(invalid.length){
      runtime.showToast('لطفاً موارد مشخص‌شده را تکمیل کنید');
      const target=invalid[0]; target?.scrollIntoView({behavior:'smooth',block:'center'}); return;
    }
    const bankVals=bankEntries.map(entry=>{const getE=k=>entry.querySelector(`[data-key="${k}"]`)?.value.trim()||'';return {ownerName:getE('ownerName'),bankName:getE('bankName'),card:toEnglishDigits(getE('card')),iban:toEnglishDigits(getE('iban')),account:toEnglishDigits(getE('account'))};}).filter(b=>b.ownerName||b.bankName||b.card||b.iban||b.account);
    c.pending=false;c.draftUpdatedAt=null;c.nationalityType=nat;c.nationality=get('nationality');c.foreignId=toEnglishDigits(get('foreignId'));c.foreignIdImages=nat==='غیر ایرانی'?c.foreignIdImages:[];c.iranianDocumentImages=nat==='ایرانی'?c.iranianDocumentImages:[];c.foreignIdImage=c.foreignIdImages[0]||'';
    c.firstName=firstName;c.lastName=lastName;c.fatherName=get('fatherName');c.name=[firstName,lastName].filter(Boolean).join(' ');c.nationalId=nat==='ایرانی'?toEnglishDigits(nationalId):'';c.address=get('address');c.postalCode=toEnglishDigits(get('postalCode'));c.phones=phoneVals;c.phone=phoneVals[0]||'';c.type=typeVal;c.activities=selectedActivityId?[selectedActivityId]:[];c.bankAccounts=bankVals;c.cards=bankVals.map(x=>x.card).filter(Boolean);c.ibans=bankVals.map(x=>x.iban).filter(Boolean);c.accounts=bankVals.map(x=>x.account).filter(Boolean);
    if(!contactApi.save(projectId, c).ok) return; clearContactDraft(c.id); contactSavedSuccessfully=true; backToList();
  };
}

export function resetContactFormShell(){
  const page=document.getElementById('contactsPage');
  const title=page?.querySelector('.inner-section-bar h2');
  const addButton=document.getElementById('contactAddBtn');
  leaveContactFormShell({page,title,addButton,setFormMode:runtime.setInternalFormMode});
}
