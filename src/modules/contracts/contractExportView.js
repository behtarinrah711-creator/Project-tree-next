import { paginateContractMarkup } from './contractPagination.js';
import { getContractPageStyles } from './contractTemplateFormModule.js';
import { installNotebookExportView } from '../notebook/notebookExportView.js';
import { contractDocumentMarkup } from './contractDocument.js';
import { resolveContractDocumentDraft } from './realContractDomain.js';
import {loadContractDocumentImages} from './contractDocumentAttachments.js';

let view=null;
let exportRequest=0;
export async function openContractExport(project,contract,{trigger=null}={}){
  const request=++exportRequest;
  if(!view){
    const source=document.getElementById('notebookExportPage');
    if(!source) return false;
    const page=source.cloneNode(true);
    page.id='contractExportPage';
    page.innerHTML=page.innerHTML.replaceAll('notebookExport','contractExport');
    document.body.appendChild(page);
    view=installNotebookExportView({
      idPrefix:'contractExport',historyKey:'contract-export',
      paginateDocument:html=>paginateContractMarkup(html),
      documentBuilder:list=>'<section class="contract-export-document" dir="rtl">'+contractDocumentMarkup(list.contract,list.activityName)+'</section>',
      extraStyles:getContractPageStyles(),
    });
  }
  let draft=resolveContractDocumentDraft(contract,project);
  if(draft.contractorDocuments?.length){
    window.KarhaLegacy?.showToast?.('در حال دریافت مدارک پیمانکار…');
    try{draft=await loadContractDocumentImages(draft,project.id);}
    catch{window.KarhaLegacy?.showToast?.('دریافت مدارک پیمانکار انجام نشد؛ خروجی ناقص ساخته نمی‌شود. دوباره تلاش کنید');return false;}
    if(request!==exportRequest)return false;
  }
  const activityName=(project.activityTemplates||[]).find(a=>String(a.id)===String(contract.activityId))?.name||'بدون فعالیت';
  const person=draft.contractorName||'بدون پیمانکار';
  return view.open({title:'قرارداد '+activityName+' + '+person,activityName,contract:draft,items:[]},{trigger});
}
