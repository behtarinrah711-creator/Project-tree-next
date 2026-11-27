import { renderContractHistory } from '../contracts/contractHistoryView.js';

const labels = {
  work_form_saved:'فرم کار ذخیره شد',
  work_form_deleted:'کار حذف شد',
};

export function renderWorkFormHistory(documentRef, work){
  const events = [...(work.formHistory || [])];
  if(work.trashed && work.deletedAt && !events.some(event=>event.action==='work_form_deleted' && event.at===work.deletedAt)){
    events.push({action:'work_form_deleted',at:work.deletedAt,actor:work.deletedBy});
  }
  const wrapper = documentRef.createElement('section');
  wrapper.className = 'contract-history-sheet';
  wrapper.append(renderContractHistory(documentRef,{approvalHistory:events},{
    compact:true,eventLabels:labels,
  }));
  return wrapper;
}
