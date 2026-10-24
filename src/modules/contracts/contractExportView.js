import { paginateContractMarkup } from './contractPagination.js';
import { getContractPageStyles } from './contractTemplateFormModule.js';
import { installNotebookExportView } from '../notebook/notebookExportView.js';
import { contractDocumentMarkup } from './contractDocument.js';
import { syncContractPartyData } from './realContractDomain.js';

let view=null;
export function openContractExport(project,contract,{trigger=null}={}){
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
  const draft=JSON.parse(JSON.stringify(contract));
  draft.contractorId=draft.contractorId||draft.contactId;
  syncContractPartyData(draft,project);
  const activityName=(project.activityTemplates||[]).find(a=>String(a.id)===String(contract.activityId))?.name||'بدون فعالیت';
  const person=draft.contractorName||'بدون پیمانکار';
  return view.open({title:'قرارداد '+activityName+' + '+person,activityName,contract:draft,items:[]},{trigger});
}
