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
      documentBuilder:list=>'<section class="contract-export-document" dir="rtl">'+contractDocumentMarkup(list.contract,list.activityName)+'</section>',
      extraStyles:'.contract-export-document{font-family:IRANSansX,Tahoma,sans-serif;line-height:2;font-size:12px}.doc-title{text-align:center;font-size:22px;font-weight:600;margin-bottom:20px}.doc-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px}.doc-parties,.doc-clauses,.doc-payment{margin-top:20px}.doc-clause{margin-top:12px;white-space:pre-wrap;break-inside:auto;overflow-wrap:anywhere}.doc-child{break-inside:avoid;margin-right:20px;white-space:pre-wrap}.doc-signatures{break-inside:avoid;display:flex;justify-content:space-between;margin-top:36px}.note{white-space:pre-wrap;margin-top:24px}.signature img{max-width:180px;max-height:75px}.signature{margin-top:24px}',
    });
  }
  const draft=JSON.parse(JSON.stringify(contract));
  draft.contractorId=draft.contractorId||draft.contactId;
  syncContractPartyData(draft,project);
  const activityName=(project.activityTemplates||[]).find(a=>String(a.id)===String(contract.activityId))?.name||'بدون فعالیت';
  const person=draft.contractorName||'بدون پیمانکار';
  return view.open({title:'قرارداد '+activityName+' + '+person,activityName,contract:draft,items:[]},{trigger});
}
