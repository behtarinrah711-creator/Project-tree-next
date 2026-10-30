import { REJECTION_MIN_LENGTH } from './wbs/todayApi.js';
export { REJECTION_MIN_LENGTH };
export function contractApprovalState(contract){
  if(contract.approvalStatus==='pending')return 'pending';
  if(contract.approvalStatus==='approved')return 'approved';
  if(contract.approvalStatus==='returned')return 'returned';
  return contract.isDraft || contract.status==='draft' ? 'incomplete' : 'ready';
}
export const approvalLabels={incomplete:'در حال تکمیل',ready:'آماده ارسال برای تأیید',pending:'در انتظار تأیید',approved:'تأییدشده؛ در انتظار امضا',returned:'برگشت برای اصلاح'};
export function canReviewContract(contract,actor){
  return contractApprovalState(contract)==='pending' && !!actor?.contactId &&
    String(contract.approvalContactId)===String(actor.contactId);
}
export function transitionContractApproval(contract,action,actor,{approverId='',reason='',at=Date.now()}={}){
  const status=contractApprovalState(contract);
  if(!actor?.id || actor.id==='guest')return {ok:false,message:'ابتدا وارد حساب کاربری شوید'};
  if(action==='submit'){
    if(contract.isDraft || contract.status!=='final' || !['ready','returned'].includes(status))return {ok:false,message:'ابتدا اطلاعات قرارداد را تکمیل و ذخیره کنید'};
    if(!approverId)return {ok:false,message:'مسئول تأیید را انتخاب کنید'};
  }else if(!['approve','reject'].includes(action) || !canReviewContract(contract,actor)){
    return {ok:false,message:'این درخواست در انتظار تأیید شما نیست'};
  }
  const text=String(reason).trim();
  if(action==='reject' && text.length<REJECTION_MIN_LENGTH)return {ok:false,message:'علت رد حداقل '+REJECTION_MIN_LENGTH+' حرف باشد'};
  const next={...contract,updatedAt:at,approvalStatus:action==='submit'?'pending':action==='approve'?'approved':'returned'};
  if(action==='submit'){next.approvalContactId=String(approverId);next.submittedAt=at;next.submittedBy={...actor};}
  else{next.reviewedAt=at;next.reviewedBy={...actor};}
  if(action==='reject')next.approvalRejectionReason=text;
  if(action==='submit')next.approvalRejectionReason='';
  next.approvalHistory=[...(contract.approvalHistory||[]),{action,at,actor:{...actor},approverId:next.approvalContactId,reason:action==='reject'?text:''}];
  return {ok:true,contract:next};
}
