import {contractRevisionContent} from './contractApproval.js';

export const HANDOFF_FIELDS=['signedFiles','signedFilesUpdatedAt','signedAt','signedBy','handoffVersion','accountingStatus','sentToAccountingAt','sentToAccountingBy','accountingPackage','accountingWithdrawal','accountingDecision','financeRejection','financeHistory'];
export const FINANCE_REASON_MIN_LENGTH=5;
export const isContractSigned=c=>!!c?.signedAt && Array.isArray(c.signedFiles) && c.signedFiles.length>0;
export const isContractInFinance=c=>['sent','accepted'].includes(c?.accountingStatus) && !!c.sentToAccountingAt && !!c.accountingPackage;
export const canAttachSignedContract=c=>!c?.trashed && c?.status==='final' && !c.isDraft && c.approvalStatus==='approved';
export const canReviseReturnedSignedContract=c=>!c?.trashed && c?.accountingStatus==='rejected' && (c.status==='draft' || c.isDraft) && !!c.accountingPackage;
export function signedContractFiles(contract){
  if(Array.isArray(contract?.signedFiles) && (contract.signedFiles.length || contract.signedFilesUpdatedAt || contract.accountingStatus!=='rejected'))return contract.signedFiles;
  return contract?.accountingStatus==='rejected'?(contract.accountingPackage?.signedFiles||[]):[];
}
export function isAddendumVisibleInFinance(addendum){
  return !!addendum?.parentContractId && !addendum.trashed && (isContractInFinance(addendum)
    || (addendum.accountingStatus==='rejected' && !!addendum.accountingPackage?.contract));
}

export function canReuseReturnedSignature(contract){
  if(contract?.accountingStatus!=='rejected' || !canAttachSignedContract(contract))return false;
  const previous=contract.accountingPackage?.contract;
  const previousFiles=contract.accountingPackage?.signedFiles || [];
  const files=signedContractFiles(contract);
  if(!previous?.signedAt || !files.length || files.length!==previousFiles.length
    || files.some((file,index)=>file.id!==previousFiles[index].id))return false;

  if(!contract.parentContractId){
    const terms=['contractNo','paymentMethod','paymentStageCount'];
    const stages=record=>(record.paymentStages||[]).map(({progress,paymentPercent,description})=>[progress,paymentPercent,description]);
    return terms.every(key=>String(contract[key]??'')===String(previous[key]??''))
      && contractRevisionContent(contract)===contractRevisionContent(previous)
      && JSON.stringify(stages(contract))===JSON.stringify(stages(previous));
  }

  const fields=['type','title','parentContractId','parentContractNo','contractNo','contractDate','note','previousEndDate','endDate','amount'];
  const operationFields=['description','pricingMode','unit','quantity','unitPrice','amount'];
  const operationValues=record=>(record.rows||[]).map(row=>operationFields.map(key=>row[key]));
  return fields.every(key=>contract[key]===previous[key])
    && JSON.stringify(operationValues(contract))===JSON.stringify(operationValues(previous));
}

export function transitionContractHandoff(contract,action,actor,{files=[],reason='',at=Date.now(),projectName,activityName}={}){
  const fail=message=>({ok:false,message});
  if(!actor?.id || actor.id==='guest')return fail('ابتدا وارد حساب کاربری شوید');
  if(!canAttachSignedContract(contract) && !(action==='save_signed' && canReviseReturnedSignedContract(contract)))return fail('ابتدا قرارداد باید تکمیل و تأیید شود');
  const next={...contract},events=[];
  if(['approve_finance','reject_finance','revoke_finance'].includes(action)){
    if(!isContractInFinance(contract))return fail('قرارداد در واحد مالی نیست');
    if(action==='revoke_finance'){
      if(contract.accountingStatus!=='accepted' || contract.accountingDecision?.actor?.id!==actor.id)return fail('فقط می‌توانید تأیید مالی خودتان را پس بگیرید');
      if(String(reason).trim().length<FINANCE_REASON_MIN_LENGTH)return fail('توضیح پس‌گرفتن تأیید مالی حداقل ۵ حرف باشد');
      next.accountingStatus='rejected';next.accountingDecision=null;
    }else{
      if(contract.accountingStatus!=='sent')return fail('ابتدا تأیید مالی را پس بگیرید');
      const text=String(reason).trim();
      if(action==='reject_finance' && text.length<FINANCE_REASON_MIN_LENGTH)return fail('دلیل رد قرارداد حداقل ۵ حرف باشد');
      next.accountingDecision={status:action==='approve_finance'?'accepted':'rejected',at,actor:{...actor},reason:text};
      next.accountingStatus=next.accountingDecision.status;
    }
    if(['reject_finance','revoke_finance'].includes(action)){
        const text=String(reason).trim();
        Object.assign(next,{status:'draft',isDraft:true,approvalStatus:null,approvedContactIds:[],approvalContactIds:[],approvalContactId:'',submittedAt:null,submittedBy:null,reviewedAt:null,reviewedBy:null,revisionBaseline:null,completedAt:null,completedBy:null,completionDeclarationId:null,manualCompletionFields:[],signedAt:null,signedBy:null,signedFiles:signedContractFiles(contract).map(file=>({...file})),sentToAccountingAt:null,sentToAccountingBy:null});
        next.financeRejection={at,actor:{...actor},reason:text};
    }
    events.push({action,...(['reject_finance','revoke_finance'].includes(action)?{reason:String(reason).trim()}:{})});
  }else if(action==='withdraw_finance'){
    if(!isContractInFinance(contract))return fail('قرارداد در واحد مالی نیست');
    const text=typeof reason==='string'?reason.trim():'';
    if(text.length<FINANCE_REASON_MIN_LENGTH)return fail('دلیل پس‌گرفتن حداقل ۵ حرف باشد');
    next.accountingDecision=null;next.accountingStatus='withdrawn';next.sentToAccountingAt=null;next.sentToAccountingBy=null;
    next.accountingWithdrawal={at,actor:{...actor},reason:text};
    events.push({action,reason:text});
  }else{
    if(isContractInFinance(contract))return fail('برای اصلاح ابتدا قرارداد را از مالی پس بگیرید');
    if(action==='save_signed'){
      if(!Array.isArray(files) || files.length>30 || new Set(files.map(f=>f?.id)).size!==files.length || files.some(f=>!f?.id || f.category!=='contracts' || String(f.recordId)!==String(contract.id) || !['image/jpeg','application/pdf'].includes(f.mime)))return fail('فقط عکس یا PDF معتبر این قرارداد را انتخاب کنید');
      const old=signedContractFiles(contract),added=files.filter(f=>!old.some(o=>o.id===f.id)),removed=old.filter(f=>!files.some(o=>o.id===f.id));
      if(!added.length && !removed.length && (!canAttachSignedContract(contract) || isContractSigned(contract) || !files.length))return {ok:true,contract};
      next.signedFiles=files.map(f=>({...f}));next.signedFilesUpdatedAt=at;next.signedAt=canAttachSignedContract(contract) && files.length?at:null;next.signedBy=next.signedAt?{...actor}:null;
      if(!added.length && !removed.length)events.push({action:'confirm_signed',files:files.map(file=>file.name)});
      if(added.length===1 && removed.length===1)events.push({action:'replace_signed',files:added.map(f=>f.name),removed:removed.map(f=>f.name)});
      else{
        if(added.length)events.push({action:'add_signed',files:added.map(f=>f.name)});
        if(removed.length)events.push({action:'remove_signed',files:removed.map(f=>f.name)});
      }
    }else if(action==='send_finance'){
      if(!isContractSigned(contract)){
        if(!canReuseReturnedSignature(contract))return fail('ابتدا نسخه امضاشده قرارداد را ذخیره کنید');
        const previous=contract.accountingPackage.contract;
        next.signedAt=previous.signedAt;
        next.signedBy=previous.signedBy;
        next.signedFiles=signedContractFiles(contract);
      }
      const snapshot=JSON.parse(JSON.stringify(next));
      snapshot.projectName=projectName ?? snapshot.projectName ?? '';
      snapshot.documentActivityName=activityName ?? snapshot.documentActivityName ?? '';
      for(const key of ['accountingPackage','accountingWithdrawal','financeHistory'])delete snapshot[key];
      next.accountingDecision=null;next.financeRejection=null;next.accountingStatus='sent';next.sentToAccountingAt=at;next.sentToAccountingBy={...actor};
      next.accountingPackage={contract:snapshot,signedFiles:JSON.parse(JSON.stringify(next.signedFiles)),sentAt:at,sentBy:{...actor}};
      events.push({action});
    }else return fail('عملیات نامعتبر است');
  }
  next.updatedAt=at;next.handoffVersion=Number(contract.handoffVersion||0)+1;
  const financialActions=['send_finance','withdraw_finance','approve_finance','reject_finance','revoke_finance'];
  const previousFinance=contract.financeHistory || (contract.approvalHistory||[]).filter(e=>financialActions.includes(e.action));
  next.financeHistory=[...previousFinance,...events.filter(e=>financialActions.includes(e.action)).map(event=>({...event,at,actor:{...actor}}))];
  next.approvalHistory=[...(contract.approvalHistory||[]),...events.map(event=>({...event,at,actor:{...actor}}))];
  return {ok:true,contract:next};
}

// Workspace snapshots cannot forge handoff state or roll back an executed contract.
export function preserveContractHandoff(project,previous){
  const old=new Map((previous?.contracts||[]).map(c=>[String(c.id),c]));
  project.contracts=(project.contracts||[]).map(candidate=>{
    const current=old.get(String(candidate.id));
    if(current?.handoffVersion && Number(candidate.handoffVersion||0)!==Number(current.handoffVersion))return JSON.parse(JSON.stringify(current));
    if(current?.signedAt || isContractInFinance(current))return JSON.parse(JSON.stringify(current));
    const record={...candidate};
    for(const key of HANDOFF_FIELDS){if(current && Object.hasOwn(current,key))record[key]=current[key];else delete record[key];}
    // Keep authenticated handoff events when an old workspace snapshot is saved.
    const actions=new Set(['confirm_signed','add_signed','remove_signed','replace_signed','send_finance','withdraw_finance','approve_finance','reject_finance','revoke_finance']);
    record.approvalHistory=[...(record.approvalHistory||[]).filter(e=>!actions.has(e.action)),...(current?.approvalHistory||[]).filter(e=>actions.has(e.action))];
    return record;
  });
  for(const current of old.values())if((current.signedAt || isContractInFinance(current)) && !project.contracts.some(c=>String(c.id)===String(current.id)))project.contracts.push(JSON.parse(JSON.stringify(current)));
  return project;
}
