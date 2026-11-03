export const HANDOFF_FIELDS=['signedFiles','signedAt','signedBy','handoffVersion','accountingStatus','sentToAccountingAt','sentToAccountingBy','accountingPackage','accountingWithdrawal'];
export const isContractSigned=c=>!!c?.signedAt && Array.isArray(c.signedFiles) && c.signedFiles.length>0;
export const isContractInFinance=c=>c?.accountingStatus==='sent' && !!c.sentToAccountingAt && !!c.accountingPackage;
export const canAttachSignedContract=c=>!c?.trashed && c?.status==='final' && !c.isDraft && c.approvalStatus==='approved';
export function transitionContractHandoff(contract,action,actor,{files=[],reason='',at=Date.now(),projectName,activityName}={}){
  const fail=message=>({ok:false,message});
  if(!actor?.id || actor.id==='guest')return fail('ابتدا وارد حساب کاربری شوید');
  if(!canAttachSignedContract(contract))return fail('ابتدا قرارداد باید تکمیل و تأیید شود');
  const next={...contract},events=[];
  if(action==='withdraw_finance'){
    if(!isContractInFinance(contract))return fail('قرارداد در واحد مالی نیست');
    const text=String(reason).trim();if(text.length<5)return fail('دلیل پس‌گرفتن حداقل ۵ حرف باشد');
    next.accountingStatus='withdrawn';next.sentToAccountingAt=null;next.sentToAccountingBy=null;
    next.accountingWithdrawal={at,actor:{...actor},reason:text};
    events.push({action,reason:text});
  }else{
    if(isContractInFinance(contract))return fail('برای اصلاح ابتدا قرارداد را از مالی پس بگیرید');
    if(action==='save_signed'){
      if(!Array.isArray(files) || files.length>30 || new Set(files.map(f=>f?.id)).size!==files.length || files.some(f=>!f?.id || f.category!=='contracts' || String(f.recordId)!==String(contract.id) || !['image/jpeg','application/pdf'].includes(f.mime)))return fail('فقط عکس یا PDF معتبر این قرارداد را انتخاب کنید');
      const old=contract.signedFiles||[],added=files.filter(f=>!old.some(o=>o.id===f.id)),removed=old.filter(f=>!files.some(o=>o.id===f.id));
      if(!added.length && !removed.length)return {ok:true,contract};
      next.signedFiles=files.map(f=>({...f}));next.signedAt=files.length?at:null;next.signedBy=files.length?{...actor}:null;
      if(added.length===1 && removed.length===1)events.push({action:'replace_signed',files:added.map(f=>f.name),removed:removed.map(f=>f.name)});
      else{
        if(added.length)events.push({action:'add_signed',files:added.map(f=>f.name)});
        if(removed.length)events.push({action:'remove_signed',files:removed.map(f=>f.name)});
      }
    }else if(action==='send_finance'){
      if(!isContractSigned(contract))return fail('ابتدا نسخه امضاشده قرارداد را ذخیره کنید');
      const snapshot=JSON.parse(JSON.stringify(contract));
      snapshot.projectName=projectName ?? snapshot.projectName ?? '';
      snapshot.documentActivityName=activityName ?? snapshot.documentActivityName ?? '';
      for(const key of ['accountingPackage','accountingWithdrawal'])delete snapshot[key];
      next.accountingStatus='sent';next.sentToAccountingAt=at;next.sentToAccountingBy={...actor};
      next.accountingPackage={contract:snapshot,signedFiles:JSON.parse(JSON.stringify(contract.signedFiles)),sentAt:at,sentBy:{...actor}};
      events.push({action});
    }else return fail('عملیات نامعتبر است');
  }
  next.updatedAt=at;next.handoffVersion=Number(contract.handoffVersion||0)+1;
  next.approvalHistory=[...(contract.approvalHistory||[]),...events.map(event=>({...event,at,actor:{...actor}}))];
  return {ok:true,contract:next};
}

// Workspace snapshots cannot forge handoff state or roll back an executed contract.
export function preserveContractHandoff(project,previous){
  const old=new Map((previous?.contracts||[]).map(c=>[String(c.id),c]));
  project.contracts=(project.contracts||[]).map(candidate=>{
    const current=old.get(String(candidate.id));
    if(current?.signedAt || isContractInFinance(current))return JSON.parse(JSON.stringify(current));
    const record={...candidate};
    for(const key of HANDOFF_FIELDS){if(current && Object.hasOwn(current,key))record[key]=current[key];else delete record[key];}
    // Keep authenticated handoff events when an old workspace snapshot is saved.
    const actions=new Set(['add_signed','remove_signed','replace_signed','send_finance','withdraw_finance']);
    record.approvalHistory=[...(record.approvalHistory||[]).filter(e=>!actions.has(e.action)),...(current?.approvalHistory||[]).filter(e=>actions.has(e.action))];
    return record;
  });
  for(const current of old.values())if((current.signedAt || isContractInFinance(current)) && !project.contracts.some(c=>String(c.id)===String(current.id)))project.contracts.push(JSON.parse(JSON.stringify(current)));
  return project;
}
