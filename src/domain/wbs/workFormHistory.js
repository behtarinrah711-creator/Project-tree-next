import { uid } from '../../data/projectFactories.js';

const fields = {
  title:'عنوان', text:'عنوان', type:'نوع کار', description:'توضیحات', priority:'اهمیت',
  scheduleMode:'روش زمان‌بندی', scheduleStart:'شروع برنامه‌ای', scheduleEnd:'پایان برنامه‌ای',
  scheduleDuration:'مدت', dependencies:'پیش‌نیازها', assigneeContactIds:'مسئول پیگیری',
  financeContactIds:'مسئول مالی', executionApproverContactIds:'مسئول تأیید کار',
  contractApproverContactIds:'مسئول تأیید قرارداد', counterpartyContactId:'طرف کار',
  activityId:'فعالیت', contractTemplateId:'قالب قرارداد', weight:'وزن',
  progressWeight:'وزن', amount:'مبلغ', manualCost:'هزینه', hasContract:'قرارداد',
  hasProgressReport:'صورت‌وضعیت', hasInvoice:'فاکتور', hasPreInvoice:'پیش‌فاکتور',
  hasLaborPayroll:'لیست دستمزد', isRental:'کرایه',
};

export function workFormHistoryEntry(project, previous, patch, actor, at){
  const contacts = new Map((project?.contacts || []).filter(Boolean).map(person=>[
    String(person.id), [person.firstName,person.lastName].filter(Boolean).join(' ') || person.name || person.title,
  ]));
  const valueText = (key,value) => {
    if(value == null || value === '' || Array.isArray(value) && !value.length)return '—';
    if(key.includes('ContactId'))return [value].flat().map(id=>contacts.get(String(id)) || id).join('، ');
    if(key==='dependencies')return value.map(link=>[link.predecessorId,link.type,link.lagDays].join(' / ')).join('، ');
    if(typeof value==='boolean')return value?'بله':'خیر';
    if(key==='scheduleMode')return value==='auto'?'خودکار':'دستی';
    return String(value);
  };
  const changes = Object.entries(fields).flatMap(([key,label])=>{
    if(!Object.hasOwn(patch,key))return [];
    const before=valueText(key,previous[key] ?? (key==='assigneeContactIds'?previous.assigneeContactId:null));
    const after=valueText(key,patch[key]);
    return before===after?[]:[label+' از «'+before+'» به «'+after+'» تغییر کرد.'];
  });
  return changes.length ? {id:uid(),action:'work_form_saved',at,actor,reason:changes.join('\n')} : null;
}
