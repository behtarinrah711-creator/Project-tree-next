import {canAttachSignedContract,canReviseReturnedSignedContract,signedContractFiles,isContractInFinance,isContractSigned} from '../../domain/contractHandoff.js';
import {mountFileUploader} from '../files/fileUploader.js';
import {openWbsSheet,closeWbsSheet,fieldRow} from '../wbs/wbsSheet.js';
import {openConfirm} from '../../ui/confirm.js';
import {saveContractHandoff} from './contractHandoffApi.js';
const toast=message=>window.KarhaLegacy?.showToast?.(message);
function canWrite(project){
  const access=window.KarhaSaosaWorkspaceAccess?.[project.id];
  if(!access || access.role==='owner')return true;
  const permissions=access.permissions||{};
  const level=permissions.modules?.contracts ?? permissions.contracts;
  return ['create','edit','full'].includes(level) || (!permissions.modules && permissions.edit===true);
}
export function renderContractSignedSection(project,contract,{onChanged=()=>{},finance=false}={}){
  const existing=signedContractFiles(contract),ready=canAttachSignedContract(contract),returned=canReviseReturnedSignedContract(contract);
  if(!ready && !returned && !existing.length)return null;
  const section=document.createElement('section');section.className='contract-signed-section';
  section.onclick=event=>event.stopPropagation();
  const heading=document.createElement('h3');heading.textContent='نسخه امضاشده قرارداد';section.appendChild(heading);
  const count=document.createElement('p');count.textContent=existing.length?new Intl.NumberFormat('fa-IR').format(existing.length)+' فایل ذخیره شده':'هنوز نسخه امضاشده بارگذاری نشده است';section.appendChild(count);
  const sent=isContractInFinance(contract),writable=canWrite(project);
  const editable=writable && (ready || returned) && !sent && !finance;
  const button=(text,action)=>{const b=document.createElement('button');b.type='button';b.className='contract-review-action';b.textContent=text;b.onclick=action;section.appendChild(b);return b;};
  let busy=false;
  const run=async(action,options={})=>{
    if(busy)return false;busy=true;
    try{await saveContractHandoff(project.id,contract,action,options);onChanged();return true;}
    catch(error){toast(error.message);return false;}finally{busy=false;}
  };
  const openAttachments=()=>{
    const files=JSON.parse(JSON.stringify(existing));let uploader,saving=false;
    const sheet=openWbsSheet({title:'نسخه امضاشده قرارداد',saveLabel:'ذخیره',autoFocus:false,showSave:editable,historyKey:'contract-signed:'+contract.id,
      body(root){uploader=mountFileUploader(root,{projectId:project.id,recordId:contract.id,category:'contracts',files,readOnly:!editable,allowReplace:true,label:'افزودن نسخه امضاشده (عکس یا PDF)',onError:toast});},
      onSave(){
        if(saving)return false;
        if(uploader.isBusy()){toast('ابتدا بارگذاری فایل‌ها را کامل کنید');return false;}
        saving=true;
        run('save_signed',{files}).then(ok=>{saving=false;if(ok && sheet.isConnected)closeWbsSheet();});
        return false;
      }
    });
    const observer=new MutationObserver(()=>{if(!sheet.isConnected){uploader.destroy();observer.disconnect();}});
    observer.observe(document.body,{childList:true});
  };
  if(ready || returned || existing.length)button(existing.length?(editable?'مشاهده و اصلاح نسخه امضاشده':'مشاهده نسخه امضاشده'):'افزودن نسخه امضاشده',openAttachments);
  if(sent){
    const notice=document.createElement('p');notice.textContent='ارسال‌شده به واحد مالی؛ پیوست‌ها قفل هستند.';section.appendChild(notice);
    if(writable && !finance)button('پس‌گرفتن از مالی',()=>{const sheet=openWbsSheet({title:'پس‌گرفتن قرارداد از مالی',saveLabel:'ثبت برگشت',historyKey:'withdraw-finance:'+contract.id,
      body(root){const reason=document.createElement('textarea');reason.className='wbs-input today-textarea';reason.name='reason';root.appendChild(fieldRow('دلیل پس‌گرفتن (الزامی)',reason));},
      onSave(root){const reason=root.querySelector('[name="reason"]').value;if(reason.trim().length<5){toast('دلیل پس‌گرفتن حداقل ۵ حرف باشد');return false;}run('withdraw_finance',{reason}).then(ok=>{if(ok && sheet.isConnected)closeWbsSheet();});return false;}
    });});
  }else if(writable && ready && isContractSigned(contract))button('ارسال به واحد مالی',()=>openConfirm('قرارداد تنظیم‌شده به همراه نسخه امضاشده به واحد مالی ارسال شود؟',()=>run('send_finance'),'ارسال'));
  return section;
}
