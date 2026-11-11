import {canWriteProjectModule} from '../roleManagement/permissionState.js';
import {canAttachSignedContract,canReuseReturnedSignature,canReviseReturnedSignedContract,signedContractFiles,isContractInFinance,isContractSigned} from '../../domain/contractHandoff.js';
import {mountFileUploader} from '../files/fileUploader.js';
import {openWbsSheet,closeWbsSheet} from '../wbs/wbsSheet.js';
import {openContractReasonSheet} from './contractReasonSheet.js';
import {openConfirm} from '../../ui/confirm.js';
import {saveContractHandoff} from './contractHandoffApi.js';
const toast=message=>window.KarhaLegacy?.showToast?.(message);
export function renderContractSignedSection(project,contract,{onChanged=()=>{},finance=false,inlineActions=null,attachmentActions=null}={}){
  const label=contract.parentContractId?'الحاقیه':'قرارداد';
  const existing=finance && inlineActions ? contract.accountingPackage?.signedFiles || [] : signedContractFiles(contract);
  const ready=canAttachSignedContract(contract),returned=canReviseReturnedSignedContract(contract);
  const sent=isContractInFinance(contract),writable=canWriteProjectModule(project.id,'contracts');
  const editable=writable && (ready || returned) && !sent && !finance;
  if(!existing.length && !editable)return null;
  const section=inlineActions || document.createElement('section');
  if(!inlineActions){
    section.className='contract-signed-section';
    section.onclick=event=>event.stopPropagation();
  }
  const button=(text,action,target=section)=>{const b=document.createElement('button');b.type='button';b.className='contract-review-action';b.textContent=text;b.onclick=action;target.appendChild(b);return b;};
  let busy=false;
  const run=async(action,options={})=>{
    if(busy)return false;busy=true;
    try{await saveContractHandoff(project.id,contract,action,options);onChanged();return true;}
    catch(error){toast(error.message);return false;}finally{busy=false;}
  };
  const openAttachments=()=>{
    const files=JSON.parse(JSON.stringify(existing));let uploader,saving=false;
    const sheet=openWbsSheet({title:'نسخه امضاشده '+label,saveLabel:'ذخیره',autoFocus:false,showSave:editable,historyKey:'contract-signed:'+contract.id,
      body(root){uploader=mountFileUploader(root,{projectId:project.id,recordId:contract.id,category:'contracts',files,readOnly:!editable,label:'افزودن عکس یا PDF '+label,buttonLabel:true,onError:toast,
        confirmRemove:remove=>{if(!saving)openConfirm('این فایل حذف شود؟',()=>{if(!saving)remove();},'حذف');}});},
      onSave(){
        if(saving)return false;
        if(uploader.isBusy()){toast('ابتدا بارگذاری فایل‌ها را کامل کنید');return false;}
        saving=true;
        run('save_signed',{files}).then(ok=>{saving=false;if(ok && sheet.isConnected)closeWbsSheet();});
        return false;
      }
    });
    sheet.classList.add('contract-signed-overlay');
    const observer=new MutationObserver(()=>{if(!sheet.isConnected){uploader.destroy();observer.disconnect();}});
    observer.observe(document.body,{childList:true});
  };
  if(inlineActions){
    button('نسخه امضا شده '+label,openAttachments);
    return section;
  }
  if(sent){
    section.className+=' contract-signed-section--sent';
    if(writable && !finance){
      const withdraw=button(attachmentActions?'× پس گرفتن از مالی':'پس‌گرفتن از مالی',()=>openContractReasonSheet({
        title:'پس گرفتن '+label+' از مالی',
        historyKey:'withdraw-finance:'+contract.id,
        fieldLabel:'دلیل پس گرفتن از مالی (الزامی)',
        submit:reason=>run('withdraw_finance',{reason}),
      }),attachmentActions || section);
      if(attachmentActions)withdraw.className+=' danger';
    }
  }
  if(ready || returned || existing.length){
    const trigger=button((existing.length?'نسخه امضاشده ':'افزودن عکس یا PDF ')+label,openAttachments,attachmentActions || section);
    trigger.className+=' contract-signed-trigger';
    if(attachmentActions)attachmentActions.prepend(trigger);
  }
  if(!sent && writable && ready && (isContractSigned(contract) || canReuseReturnedSignature(contract)))button('ارسال به واحد مالی',()=>openConfirm((contract.parentContractId?label:'قرارداد تنظیم‌شده')+' به همراه نسخه امضاشده به واحد مالی ارسال شود؟',()=>run('send_finance'),'ارسال'));
  return section.children.length ? section : null;
}
