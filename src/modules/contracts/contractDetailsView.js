import {projectRepository} from '../../data/projectRepository.js';
import {renderContractAddendaRow} from './contractAddendaView.js';
import {openContractPreview} from './contractPreviewView.js';
import {renderContractSignedSection} from './contractSignedView.js';
import {renderContractFinancialSummary,renderContractStatementsRow} from './contractStatementsView.js';

export function openContractDetails(project,contract,trigger){
  const page=document.createElement('section');
  page.className='page-overlay workspace-page workspace-page--own-section-bar';
  const key='contract-details:'+contract.id;
  const close=(fromPopState=false)=>{
    page.remove();
    window.KarhaChildHistory?.consume?.(key,{fromPopState});
    trigger?.focus?.();
  };
  const header=document.createElement('div');header.className='inner-section-bar';
  const back=document.createElement('button');back.type='button';back.className='inner-section-back';
  back.textContent='‹';back.setAttribute('aria-label','بازگشت');back.onclick=()=>close();
  const heading=document.createElement('h2');heading.textContent='جزئیات قرارداد';
  const spacer=document.createElement('span');spacer.className='inner-section-spacer';
  header.append(back,heading,spacer);
  const body=document.createElement('div');body.className='page-body contract-details-body';
  const paint=()=>{
    const source=projectRepository.find(project.id)||project;
    const current=(source.contracts||[]).find(item=>!item.trashed && String(item.id)===String(contract.id))||contract;
    const title=document.createElement('h3');title.textContent=current.title||'قرارداد اصلی';
    const number=document.createElement('p');number.textContent=current.contractNo||'';
    const preview=document.createElement('button');preview.type='button';preview.className='contract-review-action';
    preview.textContent='پیش‌نمایش قرارداد';
    preview.onclick=()=>openContractPreview(source,current,{trigger:preview});
    const summary=document.createElement('h3');summary.textContent='خلاصه مالی';
    body.replaceChildren(title,number,preview);
    const signed=renderContractSignedSection(source,current,{onChanged:paint});
    if(signed)body.append(signed);
    body.append(summary,renderContractFinancialSummary(source,current));
    const addenda=renderContractAddendaRow(source,current,{approvedOnly:true,onChanged:paint});
    if(addenda)body.append(addenda);
    body.append(renderContractStatementsRow(source,current,{approvedOnly:true,onChanged:paint}));
  };
  page.append(header,body);
  document.body.append(page);
  window.KarhaChildHistory?.register?.(key,{onPop:()=>close(true)});
  window.KarhaChildHistory?.open?.(key);
  paint();
  back.focus();
}
