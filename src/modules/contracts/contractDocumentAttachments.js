import {fetchFile} from '../files/fileApi.js';
import {contractDocumentMarkup} from './contractDocument.js';

export async function loadContractDocumentImages(draft,projectId,{signal,fetchImage=fetchFile}={}){
  const images=[];
  for(const file of draft.contractorDocuments || []){
    if(typeof file!=='string' && file.projectId && String(file.projectId)!==String(projectId))throw new Error('مدرک متعلق به این پروژه نیست');
    const blob=await fetchImage(file,false,{signal,contractId:draft.id});
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const dataUrl=await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('خواندن مدارک انجام نشد'));reader.readAsDataURL(blob);
    });
    images.push({name:typeof file==='string'?'مدرک پیمانکار':file.name,dataUrl});
  }
  return {...draft,contractorDocumentImages:images};
}

export function mountContractDocumentPreview(body,preview,draft,projectId,{mountPrintPage,activityName='',onError=()=>{}}){
  const controller=new AbortController();
  let viewport=mountPrintPage(body,preview,'contract-real-preview-viewport');
  const replace=loaded=>{
    if(controller.signal.aborted || !viewport?.isConnected)return;
    viewport.remove();preview.innerHTML=contractDocumentMarkup(loaded,activityName);
    viewport=mountPrintPage(body,preview,'contract-real-preview-viewport');
  };
  if(draft.contractorDocuments?.length)loadContractDocumentImages(draft,projectId,{signal:controller.signal})
    .then(replace).catch(error=>{
      if(error.name==='AbortError' || controller.signal.aborted)return;
      replace({...draft,contractorDocumentsError:true});onError('دریافت مدارک پیمانکار انجام نشد؛ پیش‌نمایش را دوباره باز کنید');
    });
  return ()=>controller.abort();
}
