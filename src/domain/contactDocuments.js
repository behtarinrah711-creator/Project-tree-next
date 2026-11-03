export function isDocumentImage(file){
  return typeof file==='string' ? /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(file)
    : !!file && file.mime?.startsWith('image/') && !!file.id;
}

export function contactDocumentImages(contact){
  if(!contact || contact.trashed)return [];
  const iranian=Array.isArray(contact.iranianDocumentImages)?contact.iranianDocumentImages:[];
  const foreign=Array.isArray(contact.foreignIdImages)?contact.foreignIdImages:contact.foreignIdImage?[contact.foreignIdImage]:[];
  const files=contact.nationalityType==='غیر ایرانی'?foreign:contact.nationalityType==='ایرانی'?iranian:[...iranian,...foreign];
  const seen=new Set();
  return files.filter(isDocumentImage).filter(file=>{
    const key=typeof file==='string'?file:[file.projectId,file.recordId,file.id].join('/');
    if(seen.has(key))return false;seen.add(key);return true;
  }).map(file=>typeof file==='string'?file:{...file});
}

export function contractorDocumentImages(contract,project){
  const id=String(contract?.contractorId || contract?.contactId || '');
  if(!id)return [];
  const snapshot=Array.isArray(contract.contractorDocuments) && String(contract.contractorDocumentsContactId)===id
    ? contract.contractorDocuments.filter(isDocumentImage):null;
  const contact=project?.contacts?.find(contact=>String(contact.id)===id);
  if(contact && (contract.status==='draft' || contract.isDraft))return contactDocumentImages(contact);
  return snapshot ?? contactDocumentImages(contact);
}
