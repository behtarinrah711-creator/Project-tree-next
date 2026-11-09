import {renderContractAddenda} from '../contracts/contractAddendaView.js';
import {projectRepository} from '../../data/projectRepository.js';
import {isAddendumVisibleInFinance,isContractInFinance} from '../../domain/contractHandoff.js';
import {renderContractCard} from '../contracts/contractsModule.js';
export function renderAccountingContracts(body,projectId){
  const project=projectRepository.find(projectId);body.replaceChildren();
  const contracts=(project?.contracts||[]).filter(c=>!c.trashed && isContractInFinance(c));
  const hasAddenda=(project?.contractAddenda||[]).some(isAddendumVisibleInFinance);
  if(!contracts.length && !hasAddenda){const empty=document.createElement('p');empty.className='contract-empty';empty.textContent='هنوز قراردادی به واحد مالی ارسال نشده است.';body.appendChild(empty);return;}
  const list=document.createElement('div');list.className='contract-list';
  for(const contract of contracts)list.appendChild(renderContractCard(project,contract,{finance:true,onChanged:()=>renderAccountingContracts(body,projectId)}));
  if(contracts.length)body.appendChild(list);
  if(hasAddenda)renderContractAddenda(body,projectId,{finance:true,onChanged:()=>renderAccountingContracts(body,projectId)});
}
