import {openWbsSheet} from '../wbs/wbsSheet.js';
const labels={edit_advance:'پیش‌پرداخت ویرایش شد',record_payment:'پرداخت ثبت شد',complete_submit:'اعلام تکمیل شد و برای تأیید ارسال شد',edit_contract:'قرارداد ویرایش شد',edit_review:'مسئول تأیید قرارداد را ویرایش کرد',reopen_signed_contract:'قرارداد برای ویرایش به پیش‌نویس برگشت',confirm_signed:'نسخه امضاشده تأیید شد',approve_finance:'توسط بخش مالی تأیید شد',reject_finance:'توسط بخش مالی رد شد',revoke_finance:'تأیید مالی پس گرفته شد',add_signed:'نسخه امضاشده افزوده شد',remove_signed:'پیوست امضاشده حذف شد',replace_signed:'پیوست امضاشده جایگزین شد',send_finance:'به واحد مالی ارسال شد',withdraw_finance:'از واحد مالی پس گرفته شد',complete:'تکمیل قرارداد اعلام شد',cancel_completion:'اعلام تکمیل لغو شد',withdraw_submission:'از تأیید پس گرفته شد',create:'ایجاد شد',submit:'برای تأیید ارسال شد',approve:'تأیید شد',reject:'برای اصلاح برگشت داده شد',revoke:'تأیید لغو شد'};
const historyDate=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'long',day:'numeric'});
const historyTime=new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const moment=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});

export function renderContractHistory(documentRef,contract,{finance=false,compact=false}={}){
  const details=documentRef.createElement('details');details.className='contract-history';
  const summary=documentRef.createElement('summary');summary.textContent='تاریخچه';details.appendChild(summary);
  details.onclick=event=>event.stopPropagation();
  const financialActions=['send_finance','withdraw_finance','approve_finance','reject_finance','revoke_finance'];
  const history=contract.approvalHistory||[];
  const isAddendum=!!contract.parentContractId;
  const isAdvance=contract.statementType==='advance';
  const creation=contract.creationEvent || ((isAddendum || isAdvance) && contract.createdAt
    ? {action:'create',at:contract.createdAt,actor:contract.createdBy || (isAdvance?contract.submittedBy:undefined)} : null);
  const completion=isAddendum && contract.completedAt && !history.some(e=>e.action==='complete' && e.at===contract.completedAt)
    ? {action:'complete',at:contract.completedAt,actor:contract.completedBy} : null;
  const events=finance && !isAdvance?(contract.financeHistory || history.filter(e=>financialActions.includes(e.action)))
    : [creation,completion,...history].filter(Boolean);
  const entries=[];
  const actorsMatch=(a,b)=>a.at===b.at && (a.actor?.id || a.actor?.name)===(b.actor?.id || b.actor?.name);
  for(const entry of events){
    const last=entries.at(-1);
    if(last && ['complete','submit'].includes(entry.action) && ['complete','submit'].includes(last.action) && entry.action!==last.action && actorsMatch(entry,last)){
      entries[entries.length-1]={...last,...entry,manualFields:last.manualFields || entry.manualFields,action:'complete_submit'};
    }else entries.push(entry);
  }
  if(isAddendum)entries.reverse();
  entries.sort((a,b)=>Number(b.at)-Number(a.at));
  if(!entries.length){
    const empty=documentRef.createElement('div');empty.className='contract-history-empty';empty.textContent='هنوز رویدادی ثبت نشده است.';details.appendChild(empty);
  }
  entries.forEach(entry=>{
    const row=documentRef.createElement('div');row.className='contract-history-entry';
    const heading=documentRef.createElement('div');
    const date=new Date(entry.at);
    const label=isAdvance && entry.action==='create' ? 'درخواست پیش‌پرداخت ثبت شد' : isAddendum && entry.action==='complete' ? 'تکمیل الحاقیه اعلام شد' : labels[entry.action];
    const actor=entry.actor?.name || (isAddendum?'نام ثبت نشده':'کاربر');
    const validTime=entry.at && Number.isFinite(date.getTime());
    if(compact){
      heading.className='contract-history-entry-heading';
      const title=documentRef.createElement('div');title.className='contract-history-event';title.textContent=label || 'تغییر وضعیت';
      const person=documentRef.createElement('div');person.className='contract-history-actor';person.textContent=actor;
      const stamp=documentRef.createElement('div');stamp.className='contract-history-stamp';
      const day=documentRef.createElement('span');day.textContent=validTime?historyDate.format(date):'زمان نامشخص';
      const time=documentRef.createElement('bdi');time.dir='ltr';time.textContent=validTime?historyTime.format(date):'';
      stamp.appendChild(day);stamp.appendChild(time);
      heading.appendChild(title);heading.appendChild(person);heading.appendChild(stamp);
    }else{
      heading.textContent=[label || 'تغییر وضعیت',actor,validTime?moment.format(date):'زمان نامشخص'].join(' · ');
    }
    row.appendChild(heading);
    if(entry.manualFields?.length){const note=documentRef.createElement('p');const names={contractDate:'تاریخ تنظیم',employerId:'کارفرما',startDate:'تاریخ شروع',endDate:'تاریخ پایان',retentionDuration:'مدت نگهداری'};note.textContent='تکمیل دستی پس از چاپ: '+entry.manualFields.map(key=>names[key]||key).join('، ');row.appendChild(note);}
    if(entry.files?.length){const files=documentRef.createElement('p');files.textContent=entry.files.join('، ');row.appendChild(files);}
    if(entry.action==='record_payment' && entry.amount>0){
      const value=documentRef.createElement('p');value.textContent=new Intl.NumberFormat('fa-IR').format(entry.amount)+' تومان';row.appendChild(value);
    }
    if(entry.reason){
      const reason=documentRef.createElement('p');reason.textContent=entry.reason;row.appendChild(reason);
    }
    details.appendChild(row);
  });
  return details;
}

export function openContractHistory(record,{finance=false,documentRef=globalThis.document,openSheet=openWbsSheet}={}){
  return openSheet({title:'تاریخچه',showSave:false,reuseHistoryOnReplace:true,historyKey:'contract-history:'+record.id,
    body(root){
      root.className+=' contract-history-sheet';
      const history=renderContractHistory(documentRef,record,{finance,compact:true});
      history.open=true;
      root.append(history);
    },
  });
}

