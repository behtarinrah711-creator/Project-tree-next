import {prepareUpload,fileToken,fileError,fetchFile,FILE_LIMIT} from './fileApi.js';
import {openFileViewer} from './fileViewer.js';

export function hasActiveFileUploads(requestCount,items=[]){
  return requestCount>0 || items.some(file=>[1,3,7,9].includes(file.status));
}

export function mountFileUploader(root,{projectId,recordId,files,onChange=()=>{},onError=()=>{},label='افزودن عکس یا فایل',category='contacts',readOnly=false,allowReplace=false,buttonLabel=false,confirmRemove=remove=>remove()}={}){
  root.classList.add('saosa-file-uploader');
  const input=document.createElement('input');input.type='file';input.multiple=true;
  const imagesOnly=category==='reports';
  input.accept=imagesOnly?'image/jpeg,image/png,image/heic,image/heif,image/avif,image/webp,.heic,.heif':category==='contracts'?'image/jpeg,image/png,image/heic,image/heif,.heic,.heif,.pdf':'image/jpeg,image/png,image/heic,image/heif,image/avif,image/webp,.heic,.heif,.pdf,.docx,.xlsx,.pptx';
  input.setAttribute('aria-label',label);input.disabled=true;root.appendChild(input);
  const note=document.createElement('p');note.className='saosa-file-note';note.textContent=imagesOnly?'هر عکس ذخیره‌شده تا ۲ مگابایت':category==='contracts'?'عکس ذخیره‌شده تا ۲ مگابایت؛ PDF تا ۲۵ مگابایت':'عکس ذخیره‌شده تا ۲ مگابایت؛ PDF و فایل‌های اداری تا ۲۵ مگابایت';root.appendChild(note);
  const gallery=document.createElement('div');gallery.className='saosa-file-gallery';root.appendChild(gallery);
  if(readOnly)input.hidden=true;
  const replacement=allowReplace && !readOnly?document.createElement('input'):null;
  let replacingFile=null;
  if(replacement){
    replacement.type='file';replacement.accept=input.accept;replacement.hidden=true;root.appendChild(replacement);
    replacement.oncancel=()=>{replacingFile=null;};replacement.onchange=()=>{const file=replacement.files?.[0];if(file)pond?.addFile(file);replacement.value='';};
  }
  const urls=new Set(),requests=new Set();let pond,disposed=false,viewerClose;
  // Detaching a saved reference must not depend on FilePond's retained queue items.
  const isUploading=()=>requests.size>0;
  const isBusy=()=>hasActiveFileUploads(requests.size,pond?.getFiles()||[]) || !!pond?.getFiles().some(file=>[6,8,10].includes(file.status));
  const controllers=new Set();
  let observer;
  const release=()=>{controllers.forEach(c=>c.abort());controllers.clear();urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();observer?.disconnect();};
  const render=()=>{
    release();gallery.textContent='';
    const load=async(img,file)=>{
      const controller=new AbortController();controllers.add(controller);
      try{const blob=await fetchFile(file,true,{signal:controller.signal});if(controller.signal.aborted || disposed)return;const url=URL.createObjectURL(blob);urls.add(url);img.src=url;}
      catch(error){if(error.name!=='AbortError'){img.alt='دریافت تصویر انجام نشد؛ برای تلاش دوباره باز کنید';}}
      finally{controllers.delete(controller);}
    };
    if(typeof IntersectionObserver==='function')observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){observer.unobserve(entry.target);load(entry.target,entry.target.fileReference);}}));
    files.forEach(file=>{
      const card=document.createElement('div');card.className='saosa-file-card';
      const open=document.createElement('button');open.type='button';open.className='saosa-file-open';open.setAttribute('aria-label','نمایش '+(file.name||'عکس'));
      open.onclick=()=>{viewerClose?.();viewerClose=openFileViewer(file,{onError,compactImageHeader:category==='contracts' || imagesOnly});};
      if(typeof file==='string' || file.mime?.startsWith('image/')){
        const img=document.createElement('img');img.alt=file.name||'تصویر پیوست';img.loading='lazy';img.fileReference=file;open.appendChild(img);if(observer)observer.observe(img);else load(img,file);
      }else{const name=document.createElement('span');name.textContent=file.name;open.appendChild(name);}
      const remove=document.createElement('button');remove.type='button';remove.className='saosa-file-remove';remove.textContent='×';remove.setAttribute('aria-label','حذف '+(file.name||'عکس'));
      if(readOnly)remove.hidden=true;
      let replaceButton;
      if(allowReplace && !readOnly){const replace=document.createElement('button');replace.type='button';replace.className='saosa-file-replace';replace.textContent='جایگزینی';replace.onclick=()=>{if(isUploading()){onError('ابتدا بارگذاری جاری را تمام کنید');return;}replacingFile=file;replacement.click();};replaceButton=replace;}
      remove.onclick=()=>confirmRemove(()=>{
        if(disposed)return;
        if(isUploading()){onError('ابتدا بارگذاری جاری را تمام کنید');return;}
        const index=files.indexOf(file);
        if(index<0)return;
        files.splice(index,1);
        render();
        onChange();
      });
      const caption=document.createElement('small');caption.textContent=file.size?Math.ceil(file.size/1024)+' کیلوبایت':'';card.appendChild(open);if(!readOnly)card.appendChild(remove);card.appendChild(caption);if(replaceButton)card.appendChild(replaceButton);gallery.appendChild(card);
    });
  };
  render();
  if(!readOnly)import('../../../vendor/filepond/filepond.esm.min.js').then(({create})=>{
    if(disposed)return;
    input.disabled=false;
    pond=create(input,{allowMultiple:true,maxParallelUploads:1,maxFiles:category==='contracts'?30:10,credits:false,
      labelIdle:buttonLabel?'<span class="filepond--label-action">'+label+'</span>':label+' <span class="filepond--label-action">انتخاب</span>',labelFileProcessing:'در حال بارگذاری',labelFileProcessingComplete:'بارگذاری شد',labelFileProcessingError:'بارگذاری انجام نشد',
      labelTapToRetry:'برای تلاش مجدد بزنید',labelTapToCancel:'برای لغو بزنید',labelButtonRemoveItem:'حذف',labelButtonAbortItemProcessing:'لغو',
      beforeAddFile:item=>{if(files.length>=30 && replacingFile===null){onError('حداکثر ۳۰ صفحه انتخاب کنید');return false;}if(item.fileSize>FILE_LIMIT){onError(fileError('file_too_large'));return false;}return true;},
      server:{process:(_field,file,_metadata,load,error,progress,abort)=>{
        const xhr=new XMLHttpRequest();requests.add(xhr);let cancelled=false;
        prepareUpload(file).then(prepared=>{
          if(cancelled || disposed)return;
          xhr.open('POST','/api/v1/projects/'+encodeURIComponent(projectId)+'/files/'+category+'/'+encodeURIComponent(recordId)+'?name='+encodeURIComponent(prepared.name));
          xhr.setRequestHeader('Authorization','Bearer '+fileToken());xhr.setRequestHeader('Content-Type','application/octet-stream');
          xhr.upload.onprogress=event=>progress(event.lengthComputable,event.loaded,event.total);
          xhr.onload=()=>{
            requests.delete(xhr);if(cancelled || disposed)return;
            let data;try{data=JSON.parse(xhr.responseText);}catch{data={};}
            if(xhr.status!==201 || !data.file){const message=fileError(data.error);error(message);onError(message);return;}
            if(replacingFile!==null){const index=files.indexOf(replacingFile);if(index>=0)files.splice(index,1,data.file);else files.push(data.file);replacingFile=null;}else files.push(data.file);render();onChange();load(data.file.id);
          };
          xhr.onerror=()=>{requests.delete(xhr);error('اتصال برقرار نشد');onError('بارگذاری انجام نشد؛ دوباره تلاش کنید');};
          xhr.send(prepared);
        }).catch(err=>{requests.delete(xhr);if(!cancelled && !disposed){error(err.message);onError(err.message);}});
        return {abort:()=>{cancelled=true;xhr.abort();requests.delete(xhr);abort();}};
      },revert:null,restore:null,load:null,fetch:null},
      onprocessfile:(error,item)=>{if(!error)pond.removeFile(item.id);}
    });
  }).catch(()=>{if(!disposed){note.textContent='آپلودر بارگذاری نشد؛ صفحه را دوباره باز کنید';onError(note.textContent);}});
  return {
    isBusy,
    destroy:()=>{disposed=true;viewerClose?.();requests.forEach(xhr=>xhr.abort());requests.clear();release();pond?.destroy();},
  };
}
