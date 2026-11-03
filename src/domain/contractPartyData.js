import {contractorDocumentImages} from './contactDocuments.js';

export function syncContractPartyData(state, project){
  if(!state || !project) return state;
  state.projectName=String(project.name || project.title || '').trim();
  const contacts=Array.isArray(project.contacts)?project.contacts:[];
  const find=id=>contacts.find(c=>String(c.id)===String(id) && !c.trashed);
  const name=c=>[c?.firstName,c?.lastName].filter(Boolean).join(' ') || c?.name || '';
  const e=find(state.employerId), c=find(state.contractorId);
  state.contractorDocuments=contractorDocumentImages(state,project).map(file=>typeof file==='string'?file:{...file});
  state.contractorDocumentsContactId=String(state.contractorId || '');
  if(e){
    state.employerName=name(e);
    state.employerNationalId=e.nationalId||'';
    state.employerAddress=e.address||'';
    state.employerPhone=(e.phones&&e.phones[0])||e.phone||'';
  }
  if(c){
    state.contractorName=name(c);
    state.contractorNationalId=c.nationalId||'';
    state.contractorAddress=c.address||'';
    state.contractorPhone=(c.phones&&c.phones[0])||c.phone||'';
  }
  return state;
}
