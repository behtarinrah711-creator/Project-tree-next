import {projectRepository} from '../../data/projectRepository.js';
import {isAddendumVisibleInFinance,isContractInFinance} from '../../domain/contractHandoff.js';
import {renderContractCard} from '../contracts/contractsModule.js';
export function renderAccountingContracts(body,projectId){
  const project=projectRepository.find(projectId);body.replaceChildren();
  const contracts=new Map((project?.contracts||[]).filter(c=>!c.trashed && isContractInFinance(c)).map(c=>[String(c.id),c]));
  for(const addendum of (project?.contractAddenda||[]).filter(isAddendumVisibleInFinance)){
    const id=String(addendum.parentContractId);
    const parent=addendum.accountingPackage.contract.parentDocument;
    if(!contracts.has(id) && parent)contracts.set(id,{...parent,id:addendum.parentContractId});
  }
  if(!contracts.size){const empty=document.createElement('p');empty.className='contract-empty';empty.textContent='هنوز قراردادی به واحد مالی ارسال نشده است.';body.appendChild(empty);return;}
  const list=document.createElement('div');list.className='contract-list';
  for(const contract of contracts.values())list.appendChild(renderContractCard(project,contract,{finance:true,onChanged:()=>renderAccountingContracts(body,projectId)}));
  body.appendChild(list);
}
