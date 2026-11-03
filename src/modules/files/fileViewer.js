import {fetchFile} from './fileApi.js';

export function openFileViewer(file,{onError=()=>{}}={}){
  const previous=document.activeElement;
  const dialog=document.createElement('dialog');dialog.className='saosa-file-viewer';dialog.setAttribute('aria-label','نمایش پیوست');
  const header=document.createElement('header');header.className='saosa-file-viewer-head';
  const title=document.createElement('span');title.textContent=file.name||'نمایش عکس';
  const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;return b;};
  const controller=new AbortController();let objectUrl,blob,closed=false;
  const key='transient:file-viewer';
  const close=(fromPopState=false)=>{
    if(closed)return;closed=true;controller.abort();dialog.close();dialog.remove();
    if(objectUrl)URL.revokeObjectURL(objectUrl);
    window.KarhaChildHistory?.consume(key,{fromPopState});previous?.focus?.();
  };
  const download=()=>{
    if(!objectUrl)return;
    const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=file.name||'image.jpg';document.body.appendChild(anchor);anchor.click();anchor.remove();
  };
  const downloadButton=button('دانلود',download);downloadButton.disabled=true;
  const shareButton=button('اشتراک‌گذاری',async()=>{
    if(!blob)return;
    const shared=new File([blob],file.name||'image.jpg',{type:blob.type});
    try{
      if(navigator.canShare?.({files:[shared]}))await navigator.share({files:[shared]});
      else {onError('اشتراک‌گذاری مستقیم در این مرورگر پشتیبانی نمی‌شود؛ فایل را دانلود کنید');download();}
    }catch(error){if(error.name!=='AbortError')onError('اشتراک‌گذاری انجام نشد');}
  });shareButton.disabled=true;
  header.append(button('بازگشت',()=>close()),title,downloadButton,shareButton);dialog.appendChild(header);
  const content=document.createElement('div');content.className='saosa-file-viewer-body';content.textContent='در حال دریافت…';dialog.appendChild(content);
  const isImage=typeof file==='string' || file.mime?.startsWith('image/');
  let zoomed=false;
  if(isImage)header.append(button('بزرگ‌نمایی',()=>{zoomed=!zoomed;content.classList.toggle('is-zoomed',zoomed);}));
  document.body.appendChild(dialog);dialog.showModal();
  window.KarhaChildHistory?.register(key,{onPop:()=>close(true)});window.KarhaChildHistory?.open(key);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  fetchFile(file,false,{signal:controller.signal}).then(value=>{
    if(closed)return;blob=value;objectUrl=URL.createObjectURL(blob);content.textContent='';
    if(isImage){const img=document.createElement('img');img.src=objectUrl;img.alt=file.name||'تصویر پیوست';content.appendChild(img);}
    else{const note=document.createElement('p');note.textContent='برای بازکردن این فایل در برنامه دستگاه، آن را دانلود کنید.';content.appendChild(note);}
    downloadButton.disabled=false;shareButton.disabled=false;
  }).catch(error=>{if(error.name!=='AbortError' && !closed){content.textContent=error.message;onError(error.message);}});
  return close;
}
