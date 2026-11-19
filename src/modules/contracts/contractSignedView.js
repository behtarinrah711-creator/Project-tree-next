import {hasPaidContractDocument} from '../../domain/contractRevision.js';
import {canWriteProjectModule} from '../roleManagement/permissionState.js';
import {canReopenSignedContract,canAttachSignedContract,canReuseReturnedSignature,canReviseReturnedSignedContract,signedContractFiles,isContractInFinance,isContractSigned} from '../../domain/contractHandoff.js';
import {mountFileUploader} from '../files/fileUploader.js';
import {openWbsSheet,closeWbsSheet} from '../wbs/wbsSheet.js';
import {openContractReasonSheet} from './contractReasonSheet.js';
import {openConfirm} from '../../ui/confirm.js';
import {saveContractHandoff} from './contractHandoffApi.js';
const toast=message=>window.KarhaLegacy?.showToast?.(message);
export function renderContractSignedSection(project,contract,{onChanged=()=>{},finance=false,inlineActions=null,attachmentActions=null,stage=null,label=contract.parentContractId?'الحاقیه':'قرارداد'}={}){
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
  const openAttachments=()=>openContractSignedUpload(project,contract,{onChanged,finance,label});
  if(inlineActions){
    button('نسخه امضا شده '+label,openAttachments);
    return section;
  }
  if(sent && (!stage || stage==='finance' || (contract.parentContractId && stage==='finance-approved'))){
    section.className+=' contract-signed-section--sent';
    if(writable && !finance && !hasPaidContractDocument(project,contract)){
      const withdraw=button(attachmentActions?'× پس گرفتن از مالی':'پس‌گرفتن از مالی',()=>openContractReasonSheet({
        title:'پس گرفتن '+label+' از مالی',
        historyKey:'withdraw-finance:'+contract.id,
        fieldLabel:'دلیل پس گرفتن از مالی (الزامی)',
        submit:reason=>run('withdraw_finance',{reason}),
      }),attachmentActions || section);
      if(attachmentActions)withdraw.className+=' danger';
    }
  }
  if((!stage || stage==='signed') && (ready || returned || existing.length)){
    const trigger=button((existing.length?'نسخه امضاشده ':'افزودن عکس یا PDF ')+label,openAttachments,attachmentActions || section);
    trigger.className+=' contract-signed-trigger';
    if(attachmentActions)attachmentActions.prepend(trigger);
  }
  if((!stage || stage==='finance') && !sent && writable && ready && (isContractSigned(contract) || canReuseReturnedSignature(contract)))button('ارسال به واحد مالی',()=>openConfirm((contract.parentContractId?label:'قرارداد تنظیم‌شده')+' به همراه نسخه امضاشده به واحد مالی ارسال شود؟',()=>run('send_finance'),'ارسال'));
  if((!stage || stage==='signed') && writable && !finance && canReopenSignedContract(contract))button('بازگشت برای ویرایش',()=>openContractReasonSheet({
    title:'بازگشت قرارداد برای ویرایش',
    historyKey:'reopen-signed-contract:'+contract.id,
    fieldLabel:'دلیل بازگشت (الزامی)',
    submit:reason=>run('reopen_signed_contract',{reason}),
  })).className+=' danger';
  return section.children.length ? section : null;
}

export function openContractSignedUpload(project,contract,{onChanged=()=>{},finance=false,label=contract.parentContractId?'الحاقیه':'قرارداد',openSheet=openWbsSheet,mountUploader=mountFileUploader}={}){
  const existing=finance?(contract.accountingPackage?.signedFiles || signedContractFiles(contract)):signedContractFiles(contract);
  const writable=canWriteProjectModule(project.id,'contracts');
  const editable=writable && (canAttachSignedContract(contract) || canReviseReturnedSignedContract(contract)) && !isContractInFinance(contract) && !finance && !hasPaidContractDocument(project,contract);
  if(!existing.length && !editable)return null;
  const files=JSON.parse(JSON.stringify(existing));
  let uploader,reason,saving=false;
  const sheet=openSheet({title:(editable?'بارگذاری نسخه امضاشده ':'نسخه امضاشده ')+label,saveLabel:'ذخیره',autoFocus:false,showSave:editable,reuseHistoryOnReplace:true,historyKey:'contract-signed:'+contract.id,
    body(root){
      uploader=mountUploader(root,{projectId:project.id,recordId:contract.id,category:'contracts',files,readOnly:!editable,allowReplace:editable && !contract.parentContractId && !contract.statementType,label:'افزودن عکس یا PDF '+label,buttonLabel:true,onError:toast,
        confirmRemove:remove=>{if(!saving)openConfirm('این فایل حذف شود؟',()=>{if(!saving)remove();},'حذف');}});
      if(editable && existing.length && !contract.parentContractId && !contract.statementType){
        reason=document.createElement('textarea');reason.className='wbs-input';reason.placeholder='دلیل تغییر نسخه امضاشده';reason.setAttribute('aria-label',reason.placeholder);root.append(reason);
      }
    },
    onSave(){
      if(!editable || saving)return false;
      if(uploader.isBusy()){toast('ابتدا بارگذاری فایل‌ها را کامل کنید');return false;}
      const changed=existing.length!==files.length || files.some(file=>!existing.some(old=>old.id===file.id));
      if(changed && reason && reason.value.trim().length<5){toast('دلیل تغییر نسخه امضاشده را وارد کنید');reason.focus();return false;}
      saving=true;
      saveContractHandoff(project.id,contract,'save_signed',{files,reason:reason?.value.trim()}).then(()=>{
        onChanged();
        if(sheet.isConnected)closeWbsSheet();
      }).catch(error=>toast(error.message)).finally(()=>{saving=false;});
      return false;
    },
  });
  sheet.classList.add('contract-signed-overlay');
  const observer=new MutationObserver(()=>{if(!sheet.isConnected){uploader.destroy();observer.disconnect();}});
  observer.observe(document.body,{childList:true});
  return sheet;
}
