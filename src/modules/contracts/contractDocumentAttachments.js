import {fetchFile} from '../files/fileApi.js';
import {contractDocumentMarkup} from './contractDocument.js';

async function documentImageSize(file,dataUrl,signal){
  if(Number(file?.width)>0 && Number(file?.height)>0)return {width:Number(file.width),height:Number(file.height)};
  if(typeof Image==='undefined')return {};
  return new Promise((resolve,reject)=>{
    const image=new Image();
    const cleanup=()=>{signal?.removeEventListener('abort',abort);image.onload=null;image.onerror=null;};
    const abort=()=>{cleanup();image.src='';reject(new DOMException('Aborted','AbortError'));};
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    image.onload=()=>{cleanup();resolve({width:image.naturalWidth,height:image.naturalHeight});};
    image.onerror=()=>{cleanup();reject(new Error('ابعاد تصویر مدرک قابل خواندن نیست'));};
    image.src=dataUrl;
  });
}

export async function loadContractDocumentImages(draft,projectId,{signal,fetchImage=fetchFile}={}){
  const images=[];
  for(const file of draft.contractorDocuments || []){
    if(typeof file!=='string' && file.projectId && String(file.projectId)!==String(projectId))throw new Error('مدرک متعلق به این پروژه نیست');
    const blob=await fetchImage(file,false,{signal,contractId:draft.id});
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const dataUrl=await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('خواندن مدارک انجام نشد'));reader.readAsDataURL(blob);
    });
    const dimensions=await documentImageSize(file,dataUrl,signal);
    images.push({name:typeof file==='string'?'مدرک پیمانکار':file.name,dataUrl,...dimensions});
  }
  return {...draft,contractorDocumentImages:images};
}

export function mountContractDocumentPreview(body,preview,draft,projectId,{mountPrintPage,activityName='',highlightValues=false,onError=()=>{}}){
  const controller=new AbortController();
  let viewport=mountPrintPage(body,preview,'contract-real-preview-viewport');
  const replace=loaded=>{
    if(controller.signal.aborted || !viewport?.isConnected)return;
    viewport.remove();preview.innerHTML=contractDocumentMarkup(loaded,activityName,{highlightValues});
    viewport=mountPrintPage(body,preview,'contract-real-preview-viewport');
  };
  if(draft.contractorDocuments?.length)loadContractDocumentImages(draft,projectId,{signal:controller.signal})
    .then(replace).catch(error=>{
      if(error.name==='AbortError' || controller.signal.aborted)return;
      replace({...draft,contractorDocumentsError:true});onError('دریافت مدارک پیمانکار انجام نشد؛ پیش‌نمایش را دوباره باز کنید');
    });
  return ()=>controller.abort();
}
