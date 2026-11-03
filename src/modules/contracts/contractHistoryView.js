const labels={approve_finance:'توسط بخش مالی تأیید شد',reject_finance:'توسط بخش مالی رد شد',revoke_finance:'تأیید مالی پس گرفته شد',add_signed:'نسخه امضاشده افزوده شد',remove_signed:'پیوست امضاشده حذف شد',replace_signed:'پیوست امضاشده جایگزین شد',send_finance:'به واحد مالی ارسال شد',withdraw_finance:'از واحد مالی پس گرفته شد',complete:'تکمیل قرارداد اعلام شد',cancel_completion:'اعلام تکمیل لغو شد',withdraw_submission:'از تأیید پس گرفته شد',create:'ایجاد شد',submit:'برای تأیید ارسال شد',approve:'تأیید شد',reject:'برای اصلاح برگشت داده شد',revoke:'تأیید لغو شد'};
const moment=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});

export function renderContractHistory(documentRef,contract,{finance=false}={}){
  const details=documentRef.createElement('details');details.className='contract-history';
  const summary=documentRef.createElement('summary');summary.textContent='تاریخچه';details.appendChild(summary);
  details.onclick=event=>event.stopPropagation();
  const financialActions=['send_finance','withdraw_finance','approve_finance','reject_finance','revoke_finance'];
  const events=finance?(contract.financeHistory || (contract.approvalHistory||[]).filter(e=>financialActions.includes(e.action))):[...(contract.creationEvent?[contract.creationEvent]:[]),...(contract.approvalHistory||[])];
  const entries=[...events].sort((a,b)=>Number(b.at)-Number(a.at));
  if(!entries.length){
    const empty=documentRef.createElement('div');empty.className='contract-history-empty';empty.textContent='هنوز رویدادی ثبت نشده است.';details.appendChild(empty);
  }
  entries.forEach(entry=>{
    const row=documentRef.createElement('div');row.className='contract-history-entry';
    const heading=documentRef.createElement('div');
    const date=new Date(entry.at);
    heading.textContent=[labels[entry.action] || 'تغییر وضعیت',entry.actor?.name || 'کاربر',entry.at && Number.isFinite(date.getTime())?moment.format(date):'زمان نامشخص'].join(' · ');
    row.appendChild(heading);
    if(entry.manualFields?.length){const note=documentRef.createElement('p');const names={contractDate:'تاریخ تنظیم',employerId:'کارفرما',startDate:'تاریخ شروع',endDate:'تاریخ پایان',retentionDuration:'مدت نگهداری'};note.textContent='تکمیل دستی پس از چاپ: '+entry.manualFields.map(key=>names[key]||key).join('، ');row.appendChild(note);}
    if(entry.files?.length){const files=documentRef.createElement('p');files.textContent=entry.files.join('، ');row.appendChild(files);}
    if(entry.reason){
      const reason=documentRef.createElement('p');reason.textContent=entry.reason;row.appendChild(reason);
    }
    details.appendChild(row);
  });
  return details;
}
