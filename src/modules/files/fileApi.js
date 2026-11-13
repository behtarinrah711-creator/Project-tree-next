import {readSaosaSession} from '../../cloud/saosaWorkspaceSync.js';

export const IMAGE_LIMIT=2*1024*1024;
export const FILE_LIMIT=25*1024*1024;
export function imageBounds(width,height,edge=3200){
  const scale=Math.min(1,edge/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export function fileEndpoint(file){
  return '/api/v1/projects/'+encodeURIComponent(file.projectId)+'/files/'+(['contracts','reports','oddjob-invoices'].includes(file.category)?file.category:'contacts')+'/'+encodeURIComponent(file.recordId)+'/'+encodeURIComponent(file.id);
}
export function fileError(code){
  return ({unauthorized:'برای بارگذاری یا دریافت فایل وارد حساب شوید',forbidden_project_files:'به فایل‌های این پروژه دسترسی ندارید',
    file_too_large:'حداکثر حجم هر فایل ۲۵ مگابایت است',image_too_large:'حداکثر ورودی عکس ۲۰ مگابایت و خروجی آن ۲ مگابایت است',
    unsupported_file_type:'فقط عکس، PDF و فایل‌های DOCX، XLSX و PPTX پذیرفته می‌شوند',invalid_or_unsupported_image:'عکس خراب یا غیرقابل تبدیل است؛ عکس دیگری انتخاب کنید',
    contract_files_locked:'نسخه امضاشده در این وضعیت قابل تغییر نیست',unsupported_report_type:'فقط عکس برای گزارش پذیرفته می‌شود',unsupported_signed_type:'فقط عکس یا PDF قرارداد پذیرفته می‌شود',upload_busy:'سرور مشغول پردازش عکس است؛ دوباره تلاش کنید',file_storage_unavailable:'فضای ذخیره‌سازی آماده نیست',file_not_found:'فایل پیدا نشد',
    image_dimensions_too_large:'ابعاد عکس بیش از حد بزرگ است'})[code] || 'ارسال یا دریافت فایل انجام نشد؛ دوباره تلاش کنید';
}
export function fileToken(){
  const session=readSaosaSession();
  if(!session)throw new Error(fileError('unauthorized'));
  return session.token;
}

// Optimise before sending when the browser can decode the image. HEIC falls back
// to the server's local decoder; no conversion service is contacted.
export async function prepareUpload(file){
  if(file.size>FILE_LIMIT)throw new Error(fileError('file_too_large'));
  if(!file.type.startsWith('image/'))return file;
  if(file.size>20*1024*1024)throw new Error(fileError('image_too_large'));
  if(file.type==='image/jpeg' && file.size<=IMAGE_LIMIT)return file;
  if(typeof createImageBitmap!=='function')return file;
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{return file;}
  try{
    if(bitmap.width*bitmap.height>40_000_000)throw new Error(fileError('image_dimensions_too_large'));
    const canvas=document.createElement('canvas');
    for(const [edge,quality] of [[3200,0.9],[3200,0.82],[2800,0.8],[2400,0.78],[2000,0.75],[1800,0.72],[1600,0.72]]){
      const bounds=imageBounds(bitmap.width,bitmap.height,edge);canvas.width=bounds.width;canvas.height=bounds.height;
      const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(blob && blob.size<=IMAGE_LIMIT)return new File([blob],file.name.replace(/\.[^.]*$/,'')+'.jpg',{type:'image/jpeg'});
    }
    throw new Error(fileError('image_too_large'));
  }finally{bitmap.close();}
}

export async function fetchFile(file,thumbnail=false,{signal,contractId}={}){
  // Compatibility with previously stored inline images. Never fetch arbitrary URLs.
  if(typeof file==='string'){
    if(!/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(file))throw new Error('فرمت تصویر قدیمی پشتیبانی نمی‌شود');
    return (await fetch(file,{signal})).blob();
  }
  const query=new URLSearchParams();if(thumbnail)query.set('variant','thumbnail');if(contractId)query.set('contractId',contractId);
  const search=query.toString();
  const response=await fetch(fileEndpoint(file)+(search?'?'+search:''),{headers:{authorization:'Bearer '+fileToken()},signal});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(fileError(body.error));}
  return response.blob();
}
