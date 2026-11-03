import {projectRepository} from '../../data/projectRepository.js';
import {isContractInFinance} from '../../domain/contractHandoff.js';
import {renderContractCard} from '../contracts/contractsModule.js';
export function renderAccountingContracts(body,projectId){
  const project=projectRepository.find(projectId);body.replaceChildren();
  const contracts=(project?.contracts||[]).filter(c=>!c.trashed && isContractInFinance(c));
  if(!contracts.length){const empty=document.createElement('p');empty.className='contract-empty';empty.textContent='هنوز قراردادی به واحد مالی ارسال نشده است.';body.appendChild(empty);return;}
  const list=document.createElement('div');list.className='contract-list';
  for(const contract of contracts)list.appendChild(renderContractCard(project,contract,{finance:true,onChanged:()=>renderAccountingContracts(body,projectId)}));
  body.appendChild(list);
}
