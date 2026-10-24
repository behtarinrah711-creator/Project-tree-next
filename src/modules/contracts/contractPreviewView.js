import { contractDocumentMarkup } from './contractDocument.js';
import { resolveContractDocumentDraft } from './realContractDomain.js';
import { mountContractPrintPage } from './contractTemplateFormModule.js';

let view=null;
export function createContractPreviewView({documentRef=globalThis.document,windowRef=globalThis.window,mountPrintPage=mountContractPrintPage}={}){
  let page=null,body=null,returnFocus=null;
  const close=(fromPopState=false)=>{
    page?.classList.add('hidden');
    windowRef.KarhaChildHistory?.consume?.('contract-preview',{fromPopState});
    returnFocus?.focus?.();
  };
  function open(project,contract,{trigger=null}={}){
    if(!project||!contract)return false;
    if(!page){
      page=documentRef.createElement('div');
      page.id='contractPreviewPage';page.className='page-overlay workspace-page hidden';
      const header=documentRef.createElement('div');header.className='inner-section-bar';
      const back=documentRef.createElement('button');back.type='button';back.className='inner-section-back';
      back.setAttribute('aria-label','بازگشت');
      back.innerHTML='<svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      back.onclick=()=>close(false);
      const title=documentRef.createElement('h2');title.textContent='پیش‌نمایش قرارداد';
      const spacer=documentRef.createElement('span');spacer.className='inner-section-spacer';
      header.append(back,title,spacer);
      body=documentRef.createElement('div');body.className='page-body contract-form-body';
      page.append(header,body);documentRef.body.appendChild(page);
      windowRef.KarhaChildHistory?.register?.('contract-preview',{onPop:()=>close(true)});
    }
    returnFocus=trigger;
    const draft=resolveContractDocumentDraft(contract,project);
    const activity=(project.activityTemplates||[]).find(a=>String(a.id)===String(contract.activityId));
    const preview=documentRef.createElement('div');
    preview.className='ctf-preview contract-doc-preview contract-real-print-preview';
    preview.innerHTML=contractDocumentMarkup(draft,activity?.name||activity?.title||'');
    body.replaceChildren();
    page.classList.remove('hidden');
    mountPrintPage(body,preview,'contract-real-preview-viewport');
    windowRef.KarhaChildHistory?.open?.('contract-preview');
    return true;
  }
  return {open,close};
}
export function openContractPreview(project,contract,options){
  view ||= createContractPreviewView();
  return view.open(project,contract,options);
}
