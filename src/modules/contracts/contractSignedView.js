import {canWriteProjectModule} from '../roleManagement/permissionState.js';
import {canAttachSignedContract,canReviseReturnedSignedContract,signedContractFiles,isContractInFinance,isContractSigned} from '../../domain/contractHandoff.js';
import {mountFileUploader} from '../files/fileUploader.js';
import {openWbsSheet,closeWbsSheet,fieldRow} from '../wbs/wbsSheet.js';
import {openConfirm} from '../../ui/confirm.js';
import {saveContractHandoff} from './contractHandoffApi.js';
const toast=message=>window.KarhaLegacy?.showToast?.(message);
export function renderContractSignedSection(project,contract,{onChanged=()=>{},finance=false,inlineActions=null}={}){
  const label=contract.parentContractId?'الحاقیه':'قرارداد';
  const financeFiles=inlineActions && contract.accountingPackage?.signedFiles;
  const existing=financeFiles?.length?financeFiles:signedContractFiles(contract);
  const ready=canAttachSignedContract(contract),returned=canReviseReturnedSignedContract(contract);
  const sent=isContractInFinance(contract),writable=canWriteProjectModule(project.id,'contracts');
  const editable=writable && (ready || returned) && !sent && !finance;
  if(!existing.length && !editable)return null;
  const section=inlineActions || document.createElement('section');
  if(!inlineActions){
    section.className='contract-signed-section';
    section.onclick=event=>event.stopPropagation();
  }
  const button=(text,action)=>{const b=document.createElement('button');b.type='button';b.className='contract-review-action';b.textContent=text;b.onclick=action;section.appendChild(b);return b;};
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
    sheet.classList.add('contract-signed-overlay','wbs-sheet-centered-header');
    const observer=new MutationObserver(()=>{if(!sheet.isConnected){uploader.destroy();observer.disconnect();}});
    observer.observe(document.body,{childList:true});
  };
  if(inlineActions){
    button('نسخه امضا شده '+label,openAttachments);
    return section;
  }
  if(sent){
    section.className+=' contract-signed-section--sent';
    if(writable && !finance)button('پس‌گرفتن از مالی',()=>{const sheet=openWbsSheet({title:'پس‌گرفتن قرارداد از مالی',saveLabel:'ثبت برگشت',historyKey:'withdraw-finance:'+contract.id,
      body(root){const reason=document.createElement('textarea');reason.className='wbs-input today-textarea';reason.name='reason';root.appendChild(fieldRow('دلیل پس‌گرفتن (الزامی)',reason));},
      onSave(root){const reason=root.querySelector('[name="reason"]').value;if(reason.trim().length<5){toast('دلیل پس‌گرفتن حداقل ۵ حرف باشد');return false;}run('withdraw_finance',{reason}).then(ok=>{if(ok && sheet.isConnected)closeWbsSheet();});return false;}
    });});
  }
  if(ready || returned || existing.length)button((existing.length?'نسخه امضاشده ':'افزودن عکس یا PDF ')+label,openAttachments).className+=' contract-signed-trigger';
  if(!sent && writable && ready && isContractSigned(contract))button('ارسال به واحد مالی',()=>openConfirm((contract.parentContractId?label:'قرارداد تنظیم‌شده')+' به همراه نسخه امضاشده به واحد مالی ارسال شود؟',()=>run('send_finance'),'ارسال'));
  return section;
}
