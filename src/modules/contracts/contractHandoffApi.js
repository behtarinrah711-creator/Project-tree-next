import {fileToken} from '../files/fileApi.js';
import {contractRepository} from '../../data/contractRepository.js';
import {projectRepository} from '../../data/projectRepository.js';

export async function saveContractHandoff(projectId,contract,action,options={}){
  const response=await fetch('/api/v1/projects/'+encodeURIComponent(projectId)+'/contracts/'+encodeURIComponent(contract.id)+'/handoff',{
    method:'POST',headers:{authorization:'Bearer '+fileToken(),'content-type':'application/json'},
    body:JSON.stringify({...options,action,version:contract.handoffVersion||0,updatedAt:contract.updatedAt||0}),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok || !result.contract)throw new Error(result.message || 'ثبت تغییرات انجام نشد؛ دوباره تلاش کنید');
  contractRepository.save(projectId,result.contract);
  const live=window.KarhaLegacy?.getProject?.(projectId),stored=projectRepository.find(projectId);
  if(live && stored)live.contracts=stored.contracts;
  window.dispatchEvent(new CustomEvent('karha:contract-handoff',{detail:{projectId,contractId:contract.id}}));
  return result.contract;
}
