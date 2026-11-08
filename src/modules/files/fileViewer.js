import {fetchFile} from './fileApi.js';

const viewerIcons={
  back:'<path d="m12 5-7 7 7 7M5 12h14"/>',
  share:'<path d="m8 11 8-5M8 13l8 5"/><circle cx="6" cy="12" r="2" fill="currentColor"/><circle cx="18" cy="5" r="2" fill="currentColor"/><circle cx="18" cy="19" r="2" fill="currentColor"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',
};

export function openFileViewer(file,{onError=()=>{},compactImageHeader=false}={}){
  const isImage=typeof file==='string' || file.mime?.startsWith('image/');
  const compact=compactImageHeader && isImage;
  const previous=document.activeElement;
  const dialog=document.createElement('dialog');dialog.className='saosa-file-viewer';
  if(compact)dialog.classList.add('saosa-file-viewer--compact');
  dialog.setAttribute('aria-label',compact?'نمایش عکس':'نمایش پیوست');
  const header=document.createElement('header');header.className='saosa-file-viewer-head';
  const title=document.createElement('span');title.textContent=compact?'نمایش عکس':(file.name||'نمایش عکس');
  const button=(label,action,icon)=>{
    const b=document.createElement('button');b.type='button';b.onclick=action;
    if(compact && icon){
      b.setAttribute('aria-label',label);
      b.title=label;
      b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+viewerIcons[icon]+'</svg>';
    }else b.textContent=label;
    return b;
  };
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
  const downloadButton=button('دانلود',download,'download');downloadButton.disabled=true;
  const shareButton=button('اشتراک‌گذاری',async()=>{
    if(!blob)return;
    const shared=new File([blob],file.name||'image.jpg',{type:blob.type});
    try{
      if(navigator.canShare?.({files:[shared]}))await navigator.share({files:[shared]});
      else {onError('اشتراک‌گذاری مستقیم در این مرورگر پشتیبانی نمی‌شود؛ فایل را دانلود کنید');download();}
    }catch(error){if(error.name!=='AbortError')onError('اشتراک‌گذاری انجام نشد');}
  },'share');shareButton.disabled=true;
  const backButton=button('بازگشت',()=>close(),'back');
  if(compact)header.append(title,downloadButton,shareButton,backButton);
  else header.append(backButton,title,downloadButton,shareButton);
  dialog.appendChild(header);
  const content=document.createElement('div');content.className='saosa-file-viewer-body';content.textContent='در حال دریافت…';dialog.appendChild(content);
  let zoomed=false;
  const toggleZoom=()=>{
    zoomed=!zoomed;
    content.classList.toggle('is-zoomed',zoomed);
    return zoomed;
  };
  if(isImage && !compact)header.append(button('بزرگ‌نمایی',toggleZoom));
  document.body.appendChild(dialog);dialog.showModal();
  window.KarhaChildHistory?.register(key,{onPop:()=>close(true)});window.KarhaChildHistory?.open(key);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  fetchFile(file,false,{signal:controller.signal}).then(value=>{
    if(closed)return;blob=value;objectUrl=URL.createObjectURL(blob);content.textContent='';
    if(isImage){
      const img=document.createElement('img');img.src=objectUrl;img.alt=file.name||'تصویر پیوست';
      if(compact){
        const zoom=document.createElement('button');zoom.type='button';zoom.className='saosa-file-image-zoom';
        zoom.setAttribute('aria-label','بزرگ‌نمایی عکس');zoom.setAttribute('aria-pressed','false');
        zoom.onclick=()=>zoom.setAttribute('aria-pressed',String(toggleZoom()));
        zoom.appendChild(img);content.appendChild(zoom);
      }else content.appendChild(img);
    }
    else{const note=document.createElement('p');note.textContent='برای بازکردن این فایل در برنامه دستگاه، آن را دانلود کنید.';content.appendChild(note);}
    downloadButton.disabled=false;shareButton.disabled=false;
  }).catch(error=>{if(error.name!=='AbortError' && !closed){content.textContent=error.message;onError(error.message);}});
  return close;
}
