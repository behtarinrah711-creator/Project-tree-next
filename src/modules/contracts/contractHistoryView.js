const labels={create:'ایجاد شد',submit:'برای تأیید ارسال شد',approve:'تأیید شد',reject:'برای اصلاح برگشت داده شد',revoke:'تأیید لغو شد'};
const moment=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});

export function renderContractHistory(documentRef,contract){
  const details=documentRef.createElement('details');details.className='contract-history';
  const summary=documentRef.createElement('summary');summary.textContent='تاریخچه';details.appendChild(summary);
  details.onclick=event=>event.stopPropagation();
  const entries=[...(contract.creationEvent ? [contract.creationEvent] : []),
    ...(Array.isArray(contract.approvalHistory)?contract.approvalHistory:[])].sort((a,b)=>Number(b.at)-Number(a.at));
  if(!entries.length){
    const empty=documentRef.createElement('div');empty.className='contract-history-empty';empty.textContent='هنوز رویدادی ثبت نشده است.';details.appendChild(empty);
  }
  entries.forEach(entry=>{
    const row=documentRef.createElement('div');row.className='contract-history-entry';
    const heading=documentRef.createElement('div');
    const date=new Date(entry.at);
    heading.textContent=[labels[entry.action] || 'تغییر وضعیت',entry.actor?.name || 'کاربر',entry.at && Number.isFinite(date.getTime())?moment.format(date):'زمان نامشخص'].join(' · ');
    row.appendChild(heading);
    if(entry.reason){
      const reason=documentRef.createElement('p');reason.textContent=entry.reason;row.appendChild(reason);
    }
    details.appendChild(row);
  });
  return details;
}
