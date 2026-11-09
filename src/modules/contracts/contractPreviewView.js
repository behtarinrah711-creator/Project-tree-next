import {mountFileUploader} from '../files/fileUploader.js';
import { addendumDocumentMarkup, contractDocumentMarkup } from './contractDocument.js';
import { resolveCurrentContractDocument,makeRealContractDraft } from './realContractDomain.js';
import { mountContractPrintPage } from './contractTemplateFormModule.js';
import {mountContractDocumentPreview} from './contractDocumentAttachments.js';

let view=null;
export function createContractPreviewView({documentRef=globalThis.document,windowRef=globalThis.window,mountPrintPage=mountContractPrintPage}={}){
  let page=null,body=null,title=null,returnFocus=null,disposeDocuments=null,disposeSigned=null;
  const close=(fromPopState=false)=>{
    disposeDocuments?.();disposeSigned?.();
    page?.classList.add('hidden');
    windowRef.KarhaChildHistory?.consume?.('contract-preview',{fromPopState});
    returnFocus?.focus?.();
  };
  function open(project,contract,{trigger=null,frozen=false,signedFiles=null,addendum=null}={}){
    if(!project||!contract)return false;
    disposeDocuments?.();disposeSigned?.();
    if(!page){
      page=documentRef.createElement('div');
      page.id='contractPreviewPage';page.className='page-overlay workspace-page workspace-page--own-section-bar hidden';
      const header=documentRef.createElement('div');header.className='inner-section-bar';
      const back=documentRef.createElement('button');back.type='button';back.className='inner-section-back';
      back.setAttribute('aria-label','بازگشت');
      back.innerHTML='<svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      back.onclick=()=>close(false);
      title=documentRef.createElement('h2');
      const spacer=documentRef.createElement('span');spacer.className='inner-section-spacer';
      header.append(back,title,spacer);
      body=documentRef.createElement('div');body.className='page-body contract-form-body';
      page.append(header,body);documentRef.body.appendChild(page);
      windowRef.KarhaChildHistory?.register?.('contract-preview',{onPop:()=>close(true)});
    }
    returnFocus=trigger;
    title.textContent=addendum?'پیش‌نمایش الحاقیه':'پیش‌نمایش قرارداد';
    const current=addendum?{project,draft:contract}:frozen?{project,draft:makeRealContractDraft(contract)}:resolveCurrentContractDocument(project,contract);
    project=current.project;
    const draft=current.draft;
    const activity=(project.activityTemplates||[]).find(a=>String(a.id)===String(draft.activityId));
    const activityName=frozen?(draft.documentActivityName||''):(activity?.name||activity?.title||'');
    const preview=documentRef.createElement('div');
    preview.className='ctf-preview contract-doc-preview contract-real-print-preview';
    preview.innerHTML=addendum?addendumDocumentMarkup(draft,addendum.parent):contractDocumentMarkup(draft,activityName);
    body.replaceChildren();
    page.classList.remove('hidden');
    const printBody=signedFiles?.length?documentRef.createElement('div'):body;
    if(printBody!==body)body.appendChild(printBody);
    disposeDocuments=mountContractDocumentPreview(printBody,preview,draft,project.id,{mountPrintPage,activityName:activityName});
    if(signedFiles?.length){const attachments=documentRef.createElement('section');const title=documentRef.createElement('h3');title.textContent=addendum?'نسخه امضاشده الحاقیه':'نسخه امضاشده قرارداد';attachments.appendChild(title);body.appendChild(attachments);const uploader=mountFileUploader(attachments,{projectId:project.id,recordId:contract.id,category:'contracts',files:signedFiles,readOnly:true});disposeSigned=()=>uploader.destroy();}
    windowRef.KarhaChildHistory?.open?.('contract-preview');
    return true;
  }
  return {open,close};
}
export function openContractPreview(project,contract,options){
  view ||= createContractPreviewView();
  return view.open(project,contract,options);
}
