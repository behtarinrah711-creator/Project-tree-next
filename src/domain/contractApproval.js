import { REJECTION_MIN_LENGTH } from './wbs/todayApi.js';
export { REJECTION_MIN_LENGTH };
export function contractApprovalState(contract){
  if(contract.approvalStatus==='pending')return 'pending';
  if(contract.approvalStatus==='approved')return 'approved';
  if(contract.approvalStatus==='returned')return 'returned';
  return contract.isDraft || contract.status==='draft' ? 'incomplete' : 'ready';
}
export const approvalLabels={incomplete:'در حال تکمیل',ready:'آماده ارسال برای تأیید',pending:'در انتظار تأیید',approved:'تأییدشده؛ در انتظار امضا',returned:'برگشت برای اصلاح'};
export function contractApproverIds(contract){
  return [...new Set((Array.isArray(contract.approvalContactIds) ? contract.approvalContactIds : [contract.approvalContactId]).filter(Boolean).map(String))];
}
export function approvedContractContactIds(contract){
  if(Array.isArray(contract.approvedContactIds))return contract.approvedContactIds.map(String);
  return contractApprovalState(contract)==='approved' ? contractApproverIds(contract) : [];
}
export function canRevokeContractApproval(contract,actor){
  return ['pending','approved'].includes(contractApprovalState(contract)) && !!actor?.contactId &&
    contractApproverIds(contract).includes(String(actor.contactId)) &&
    approvedContractContactIds(contract).includes(String(actor.contactId));
}
export function canReviewContract(contract,actor){
  return contractApprovalState(contract)==='pending' && !!actor?.contactId &&
    contractApproverIds(contract).includes(String(actor.contactId)) && !(contract.approvedContactIds || []).includes(String(actor.contactId));
}
export function transitionContractApproval(contract,action,actor,{approverId='',approverIds=null,reason='',at=Date.now()}={}){
  const status=contractApprovalState(contract);
  const reviewers=[...new Set((approverIds || [approverId]).filter(Boolean).map(String))];
  if(!actor?.id || actor.id==='guest')return {ok:false,message:'ابتدا وارد حساب کاربری شوید'};
  if(action==='submit'){
    if(contract.isDraft || contract.status!=='final' || !['ready','returned'].includes(status))return {ok:false,message:'ابتدا اطلاعات قرارداد را تکمیل و ذخیره کنید'};
    if(!reviewers.length)return {ok:false,message:'مسئول تأیید را انتخاب کنید'};
  }else if(action==='revoke'){
    if(!canRevokeContractApproval(contract,actor))return {ok:false,message:'فقط می‌توانید تأیید خودتان را لغو کنید'};
  }else if(!['approve','reject'].includes(action) || !canReviewContract(contract,actor)){
    return {ok:false,message:'این درخواست در انتظار تأیید شما نیست'};
  }
  const text=String(reason).trim();
  if(action==='reject' && text.length<REJECTION_MIN_LENGTH)return {ok:false,message:'علت رد حداقل '+REJECTION_MIN_LENGTH+' حرف باشد'};
  const next={...contract,updatedAt:at,approvalStatus:action==='submit'?'pending':action==='approve'?'approved':'returned'};
  if(action==='submit'){next.approvalContactIds=reviewers;next.approvalContactId=reviewers[0];next.approvedContactIds=[];next.submittedAt=at;next.submittedBy={...actor};}
  if(action==='approve'){
    next.approvedContactIds=[...new Set([...(contract.approvedContactIds || []),String(actor.contactId)])];
    next.approvalStatus=contractApproverIds(contract).every(id=>next.approvedContactIds.includes(id))?'approved':'pending';
  }
  if(action==='revoke'){
    next.approvedContactIds=approvedContractContactIds(contract).filter(id=>id!==String(actor.contactId));
    next.approvalStatus='pending';
  }
  if(action!=='submit'){next.reviewedAt=at;next.reviewedBy={...actor};}
  if(action==='reject')next.approvalRejectionReason=text;
  if(action==='submit')next.approvalRejectionReason='';
  next.approvalHistory=[...(contract.approvalHistory||[]),{action,at,actor:{...actor},approverId:next.approvalContactId,reason:action==='reject'?text:''}];
  return {ok:true,contract:next};
}
