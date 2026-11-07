import {fileToken} from '../files/fileApi.js';
import {contractRepository} from '../../data/contractRepository.js';
import {projectRepository} from '../../data/projectRepository.js';

export async function saveContractHandoff(projectId,contract,action,options={}){
  const addendum=!!contract.parentContractId;
  const response=await fetch('/api/v1/projects/'+encodeURIComponent(projectId)+(addendum?'/addenda/':'/contracts/')+encodeURIComponent(contract.id)+'/handoff',{
    method:'POST',headers:{authorization:'Bearer '+fileToken(),'content-type':'application/json'},
    body:JSON.stringify({...options,action,version:contract.handoffVersion||0,updatedAt:contract.updatedAt||0}),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok || !result.contract)throw new Error(result.message || 'ثبت تغییرات انجام نشد؛ دوباره تلاش کنید');
  if(addendum){
    projectRepository.updateProject(projectId,project=>{
      const rows=project.contractAddenda||[];
      const found=rows.some(row=>row.id===result.contract.id);
      return {...project,contractAddenda:found?rows.map(row=>row.id===result.contract.id?result.contract:row):[...rows,result.contract]};
    });
  }else contractRepository.save(projectId,result.contract);
  const live=window.KarhaLegacy?.getProject?.(projectId),stored=projectRepository.find(projectId);
  if(live && stored){
    const field=addendum?'contractAddenda':'contracts';
    live[field]=stored[field];
  }
  window.dispatchEvent(new CustomEvent('karha:contract-handoff',{detail:{projectId,contractId:contract.id}}));
  return result.contract;
}
