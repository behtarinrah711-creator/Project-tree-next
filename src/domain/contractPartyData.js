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
  const idOf = contact => {
    if (!contact) return '';
    const isForeign = contact.nationalityType && contact.nationalityType !== 'ایرانی';
    return isForeign ? (contact.foreignId || '') : (contact.nationalId || '');
  };
  if(e){
    state.employerName=name(e);
    state.employerNationalId=idOf(e);
    state.employerIsForeign=!!(e.nationalityType && e.nationalityType !== 'ایرانی');
    state.employerFatherName=e.fatherName||'';
    state.employerAddress=e.address||'';
    state.employerPhone=(e.phones&&e.phones[0])||e.phone||'';
  }
  if(c){
    state.contractorName=name(c);
    state.contractorNationalId=idOf(c);
    state.contractorIsForeign=!!(c.nationalityType && c.nationalityType !== 'ایرانی');
    state.contractorFatherName=c.fatherName||'';
    state.contractorAddress=c.address||'';
    state.contractorPhone=(c.phones&&c.phones[0])||c.phone||'';
  }
  return state;
}
