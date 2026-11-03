import {projectRepository} from '../../data/projectRepository.js';
import {isContractInFinance} from '../../domain/contractHandoff.js';
import {renderContractSignedSection} from '../contracts/contractSignedView.js';
import {renderContractHistory} from '../contracts/contractHistoryView.js';
export function renderAccountingContracts(body,projectId){
  const project=projectRepository.find(projectId);body.replaceChildren();
  const contracts=(project?.contracts||[]).filter(c=>!c.trashed && isContractInFinance(c));
  if(!contracts.length){const empty=document.createElement('p');empty.className='contract-empty';empty.textContent='هنوز قراردادی به واحد مالی ارسال نشده است.';body.appendChild(empty);return;}
  for(const contract of contracts){
    const card=document.createElement('article');card.className='contract-row';
    const header=document.createElement('div');header.className='contract-card-heading';
    const title=document.createElement('h3');title.textContent=[contract.title||'قرارداد پیمانکاری',contract.accountingPackage.contract.contractorName||contract.contractorName].filter(Boolean).join(' ');
    const number=document.createElement('p');number.textContent=contract.contractNo||'بدون شماره';
    header.append(title,number);card.appendChild(header);
    card.appendChild(renderContractSignedSection(project,contract,{finance:true,onChanged:()=>renderAccountingContracts(body,projectId)}));
    card.appendChild(renderContractHistory(document,contract));body.appendChild(card);
  }
}
