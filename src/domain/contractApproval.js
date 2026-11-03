import { REJECTION_MIN_LENGTH } from './wbs/todayApi.js';
export { REJECTION_MIN_LENGTH };
export function contractApprovalState(contract){
  if(contract.isDraft || contract.status==='draft')return 'incomplete';
  if(contract.approvalStatus==='pending')return 'pending';
  if(contract.approvalStatus==='approved')return 'approved';
  if(['unapproved','returned'].includes(contract.approvalStatus))return 'unapproved';
  return contract.isDraft || contract.status==='draft' ? 'incomplete' : 'ready';
}
export const approvalLabels={incomplete:'در حال تکمیل',ready:'آماده ارسال برای تأیید',pending:'در انتظار تأیید',approved:'تأییدشده؛ در انتظار امضا',unapproved:'تأییدنشده'};
// Compare editable content, not timestamps, generated numbering or workflow metadata.
export function contractRevisionContent(contract){
  const scalar=value=>String(value??'');
  const rows=list=>(list||[]).map(row=>({
    description:scalar(row.description),pricingMode:row.pricingMode||'quantity',
    ...(row.pricingMode==='agreed' ? {agreedPrice:scalar(row.agreedPrice)} : {
      unit:scalar(row.unit),quantity:scalar(row.quantity),unitPrice:scalar(row.unitPrice),remeasurement:!!row.remeasurement,
    }),
  }));
  const clauses=list=>(list||[]).map(item=>({text:scalar(item.text),included:item.included!==false,children:clauses(item.children)}));
  const content={};
  for(const key of ['title','templateId','projectItemId','projectItemPath','workTaskId','activityId',
    'employerId','contractorId','contractDate','startDate','endDate','contractPlace',
    'retentionPercent','retentionDuration','retentionBasis'])content[key]=scalar(contract[key]);
  content.retentionBasis=contract.retentionBasis||'تحویل موقت';
  content.contractorId=scalar(contract.contractorId||contract.contactId);
  content.employerId=scalar(contract.employerId||contract.employerContactId);
  content.retentionMethod=contract.retentionMethod||'first';
  content.operations=rows(contract.operationRows ?? (contract.amountMethod==='quantity' ? contract.amountRows :
    (contract.agreedRows ?? [{description:contract.amountDescription||'',agreedPrice:contract.agreedAmount ?? contract.amount ?? ''}]).map(row=>({...row,pricingMode:'agreed'}))));
  if(!content.operations.length){content.amount=scalar(contract.amount);content.amountDescription=scalar(contract.amountDescription);}
  content.payments=rows(contract.paymentRows);
  content.items=clauses(contract.items);
  return JSON.stringify(content);
}
export function canSubmitContract(contract){
  if(contract.isDraft || contract.status!=='final')return false;
  const status=contractApprovalState(contract);
  return status==='ready' || (status==='unapproved' && typeof contract.revisionBaseline==='string' &&
    contractRevisionContent(contract)!==contract.revisionBaseline);
}
export function contractApproverIds(contract){
  return [...new Set((Array.isArray(contract.approvalContactIds) ? contract.approvalContactIds : [contract.approvalContactId]).filter(Boolean).map(String))];
}
export function approvedContractContactIds(contract){
  if(Array.isArray(contract.approvedContactIds))return contract.approvedContactIds.map(String);
  return contractApprovalState(contract)==='approved' ? contractApproverIds(contract) : [];
}
export function canRevokeContractApproval(contract,actor){
  return !executedContract(contract) && ['pending','approved'].includes(contractApprovalState(contract)) && !!actor?.contactId &&
    contractApproverIds(contract).includes(String(actor.contactId)) &&
    approvedContractContactIds(contract).includes(String(actor.contactId));
}
export function canReviewContract(contract,actor){
  return contractApprovalState(contract)==='pending' && !!actor?.contactId &&
    contractApproverIds(contract).includes(String(actor.contactId)) && !(contract.approvedContactIds || []).includes(String(actor.contactId));
}
function executedContract(contract){return contract.signedAt || contract.sentToAccountingAt || contract.signatureStatus==='signed' || ['sent','accepted'].includes(contract.accountingStatus);}
export function canCancelContractCompletion(contract){
  if(contract.status!=='final' || contract.isDraft || executedContract(contract))return false;
  const status=contractApprovalState(contract);
  const reviewers=Array.isArray(contract.contractApproverContactIds)?contract.contractApproverContactIds:contractApproverIds(contract);
  return ['ready','unapproved'].includes(status) || (status==='approved' && !reviewers.length);
}
export function transitionContractApproval(contract,action,actor,{approverId='',approverIds=null,reason='',at=Date.now()}={}){
  const reviewers=[...new Set((approverIds || [approverId]).filter(Boolean).map(String))];
  if(!actor?.id || actor.id==='guest')return {ok:false,message:'ابتدا وارد حساب کاربری شوید'};
  if(['cancel_completion','withdraw_submission'].includes(action)){
    const text=String(reason).trim();
    if(text.length<REJECTION_MIN_LENGTH)return {ok:false,message:'علت برگشت حداقل '+REJECTION_MIN_LENGTH+' حرف باشد'};
    if(action==='cancel_completion' && !canCancelContractCompletion(contract))return {ok:false,message:'ابتدا تأیید قرارداد را لغو کنید؛ قرارداد امضاشده قابل برگشت نیست'};
    if(action==='withdraw_submission' && (contractApprovalState(contract)!=='pending' || contract.submittedBy?.id!==actor.id || executedContract(contract)))return {ok:false,message:'فقط ارسال‌کننده می‌تواند درخواست تأیید را پس بگیرد'};
    const next={...contract,status:'draft',isDraft:true,updatedAt:at,approvedContactIds:[],completedAt:null,completedBy:null,completionCancellation:{action,reason:text,at,by:actor.id}};
    if(action==='withdraw_submission'){
      next.approvalStatus='unapproved';next.approvalRejectionReason=text;next.revisionBaseline=contractRevisionContent(contract);
    }else if(next.approvalStatus==='approved')next.approvalStatus=null;
    next.approvalHistory=[...(contract.approvalHistory||[]),{action,at,actor:{...actor},reason:text}];
    return {ok:true,contract:next};
  }
  if(action==='submit'){
    if(!canSubmitContract(contract))return {ok:false,message:'ابتدا اطلاعات قرارداد را تکمیل و ذخیره کنید'};
    if(!reviewers.length)return {ok:false,message:'مسئول تأیید را انتخاب کنید'};
  }else if(action==='revoke'){
    if(!canRevokeContractApproval(contract,actor))return {ok:false,message:'فقط می‌توانید تأیید خودتان را لغو کنید'};
  }else if(action!=='approve' || !canReviewContract(contract,actor)){
    return {ok:false,message:'این درخواست در انتظار تأیید شما نیست'};
  }
  const text=String(reason).trim();
  if(action==='revoke' && text.length<REJECTION_MIN_LENGTH)return {ok:false,message:'علت لغو تأیید حداقل '+REJECTION_MIN_LENGTH+' حرف باشد'};
  const next={...contract,updatedAt:at,approvalStatus:action==='submit'?'pending':action==='approve'?'approved':'unapproved'};
  if(action==='submit'){next.approvalContactIds=reviewers;next.approvalContactId=reviewers[0];next.approvedContactIds=[];next.submittedAt=at;next.submittedBy={...actor};}
  if(action==='approve'){
    next.approvedContactIds=[...new Set([...(contract.approvedContactIds || []),String(actor.contactId)])];
    next.approvalStatus=contractApproverIds(contract).every(id=>next.approvedContactIds.includes(id))?'approved':'pending';
  }
  if(action==='revoke'){
    next.approvedContactIds=[];
    next.approvalStatus='unapproved';
    next.approvalRejectionReason=text;
    next.revisionBaseline=contractRevisionContent(contract);
  }
  if(action!=='submit'){next.reviewedAt=at;next.reviewedBy={...actor};}
  if(action==='submit'){next.approvalRejectionReason='';next.revisionBaseline=null;}
  next.approvalHistory=[...(contract.approvalHistory||[]),{action,at,actor:{...actor},approverId:next.approvalContactId,reason:action==='revoke'?text:''}];
  return {ok:true,contract:next};
}
