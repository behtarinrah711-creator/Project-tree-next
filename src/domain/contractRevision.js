import {statementsFor} from './contractStatements.js';

export function hasPaidContractDocument(project,contract){
  return Number(contract.paidAmount)>0 || statementsFor(project,contract.id).some(record=>
    Number(record.paidAmount)>0 || record.payments?.some(payment=>Number(payment.amount)>0));
}

const editableFields=[
  'title','contractDate','contractPlace','startDate','endDate','employerId','contractorId',
  'activityId','templateId','items','amountMethod','operationRows','amountRows','agreedRows','amount',
  'agreedAmount','amountDescription','remeasurement','paymentMethod','paymentRows','paymentItems',
  'paymentStageCount','paymentStages','retentionPercent','retentionDuration','retentionBasis',
  'retentionMethod','retentionAmount','amountAfterRetention','attachments','projectItemId','projectItemPath','projectItemRootTaskId'
];

export function reviseContract(project,contract,changes,reason,actor,at=Date.now()){
  if(hasPaidContractDocument(project,contract))return {ok:false,message:'این قرارداد سند پرداخت‌شده دارد و قابل ویرایش نیست'};
  if(typeof reason!=='string' || reason.trim().length<5 || !changes || typeof changes!=='object' || Array.isArray(changes))
    return {ok:false,message:'دلیل ویرایش قرارداد را وارد کنید'};
  const next={...contract};
  for(const key of editableFields)if(Object.hasOwn(changes,key))next[key]=changes[key];
  if(next.startDate && next.endDate && next.endDate<next.startDate)return {ok:false,message:'تاریخ پایان قبل از شروع است'};
  const event={action:'edit_contract',at,actor:{...actor},reason:reason.trim()};
  if(contract.signedFiles?.length)event.previousSignedFiles=contract.signedFiles;
  Object.assign(next,{contactId:next.contractorId,activityIds:next.activityId?[next.activityId]:[],
    status:'draft',isDraft:true,approvalStatus:null,approvedContactIds:[],approvalContactId:'',approvalContactIds:[],
    submittedAt:null,submittedBy:null,reviewedAt:null,reviewedBy:null,approvalRejectionReason:'',revisionBaseline:null,
    completedAt:null,completedBy:null,completionDeclarationId:null,manualCompletionFields:[],
    signedAt:null,signedBy:null,signatureStatus:null,signedFiles:[],signedFilesUpdatedAt:at,
    sentToAccountingAt:null,sentToAccountingBy:null,accountingStatus:null,accountingPackage:null,
    accountingDecision:null,accountingWithdrawal:null,financeRejection:null,
    approvalHistory:[...(contract.approvalHistory||[]),event],updatedAt:at,handoffVersion:Number(contract.handoffVersion||0)+1});
  if(contract.accountingStatus)next.financeHistory=[...(contract.financeHistory||[]),event];
  return {ok:true,contract:next};
}
