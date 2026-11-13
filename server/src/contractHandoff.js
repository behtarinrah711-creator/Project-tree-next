import {contractStatementTotals} from '../../src/domain/contractStatements.js';
import {saveStatement,recordStatementPayment} from './contractStatement.js';
import {applyExecutionApproval,approveExecutionEntity,executionApprovalItem} from '../../src/domain/wbs/executionApproval.js';
import {saveAddendumDraft} from './contractAddendum.js';
import {canDeleteAddendumRecord,canDeleteContractAddenda,parentContractOf} from '../../src/domain/contractAddenda.js';
import {transitionContractApproval} from '../../src/domain/contractApproval.js';
import {syncContractPartyData} from '../../src/domain/contractPartyData.js';
import {authenticate} from './auth.js';
import {readJson,sendJson} from './http.js';
import {canAccessFiles} from './fileUploads.js';
import {canReuseReturnedSignature,isContractSigned,transitionContractHandoff} from '../../src/domain/contractHandoff.js';

export function createContractHandoffHandler({pool,sessionSecret,storage}){
  return async(request,response,url)=>{
    const match=/^\/api\/v1\/projects\/([^/]+)\/(contracts|addenda|statements|execution-approvals)\/([^/]+)\/handoff$/.exec(url.pathname);
    if(!match)return false;
    if(request.method!=='POST'){sendJson(response,405,{error:'method_not_allowed'});return true;}
    const accountId=await authenticate(request,pool,sessionSecret);
    if(!accountId){sendJson(response,401,{error:'unauthorized'});return true;}
    const body=await readJson(request,128*1024),[projectId,kind,contractId]=match.slice(1).map(decodeURIComponent);
    const addendum=kind==='addenda', statement=kind==='statements';
    const collection=statement?'contractStatusReports':addendum?'contractAddenda':'contracts';
    if(statement && !/^statement-[0-9a-f-]{36}$/i.test(contractId)){sendJson(response,400,{message:'شناسه صورت‌وضعیت نامعتبر است'});return true;}
    if(addendum && !/^addendum-[0-9a-f-]{36}$/i.test(contractId)){sendJson(response,400,{message:'شناسه الحاقیه نامعتبر است'});return true;}
    const client=await pool.connect();let committed=false;
    try{
      await client.query('BEGIN');
      const result=await client.query('SELECT owner_account_id,payload FROM projects WHERE id=$1 FOR UPDATE',[projectId]);
      const row=result.rows[0];
      if(!row){sendJson(response,404,{message:'پروژه پیدا نشد'});return true;}
      const member=await client.query(`SELECT a.phone,m.status AS membership_status,r.permissions FROM accounts a
        LEFT JOIN project_memberships m ON m.account_id=a.id AND m.project_id=$1
        LEFT JOIN project_roles r ON r.id=m.role_id AND r.project_id=$1 WHERE a.id=$2`,[projectId,accountId]);
      Object.assign(row,member.rows[0]);
      const memberContact=(row.payload.projectMembers||[]).find(member=>member.mobile===row.phone && member.status==='active')?.contactId;
      const person=(row.payload.contacts||[]).find(c=>!c.trashed && (String(c.id)===String(memberContact||'') || (c.phones||[c.phone]).includes(row.phone)));
      const actor={id:String(accountId),contactId:String(person?.id || memberContact || ''),name:[person?.firstName,person?.lastName].filter(Boolean).join(' ')||person?.name||row.phone||'کاربر'};
      if(kind==='execution-approvals'){
        const scope=body.scope;
        if(body.action!=='approve_execution' || !['execution:today','execution:shopping'].includes(scope)){
          sendJson(response,400,{message:'عملیات نامعتبر است'});return true;
        }
        if(!canAccessFiles(row,accountId,true,scope)){
          sendJson(response,403,{message:'اجازه تأیید این مورد را ندارید'});return true;
        }
        const item=executionApprovalItem(row.payload,{id:contractId,kind:body.kind,workId:body.workId});
        if(!item || Number(item.entity.updatedAt||0)!==Number(body.updatedAt)){
          sendJson(response,409,{message:'این مورد تغییر کرده است؛ صفحه را به‌روز کنید'});return true;
        }
        const actualScope=item.entity.type==='خرید'?'execution:shopping':'execution:today';
        if(scope!==actualScope || !actor.contactId || String(item.entity.approvalContactId)!==actor.contactId){
          sendJson(response,403,{message:'این مورد در انتظار تأیید شما نیست'});return true;
        }
        const entity={...approveExecutionEntity(item.entity,item.kind,actor,Date.now()),progress:100};
        const project=applyExecutionApproval(row.payload,item,entity);
        await client.query('UPDATE projects SET payload=$2::jsonb,revision=revision+1,updated_at=now() WHERE id=$1',[projectId,JSON.stringify(project)]);
        await client.query('COMMIT');committed=true;sendJson(response,200,{entity});
        return true;
      }
      const financeAction=['approve_finance','reject_finance','revoke_finance','record_payment'].includes(body.action);
      const reviewAction=statement?body.action==='approve_statement':addendum ? ['approve_addendum','revoke_addendum'].includes(body.action) : body.action==='approve_contract';
      const permissions=row.permissions||{};
      const financeModule=Object.hasOwn(permissions.modules||permissions,'accounting-contracts')?'accounting-contracts':'accounting';
      const deleteAddendum=addendum && body.action==='delete_addendum';
      const deleteStatement=statement && body.action==='delete_statement';
      const statementModule=Object.hasOwn(permissions.modules||permissions,'accounting-statements')?'accounting-statements':'accounting';
      const allowed=canAccessFiles(row,accountId,true,financeAction?(statement?statementModule:financeModule):'contracts');
      if(!allowed){sendJson(response,403,{message:'اجازه تغییر قرارداد را ندارید'});return true;}
      const owner=String(row.owner_account_id)===String(accountId);
      if((deleteAddendum || deleteStatement) && !canDeleteContractAddenda({role:owner?'owner':'member',permissions})){
        sendJson(response,403,{message:'برای حذف سند دسترسی کامل قراردادها لازم است'});return true;
      }
      const contract=(row.payload[collection]||[]).find(c=>String(c.id)===contractId && (addendum || !c.trashed));
      const saveDraft=(addendum && body.action==='save_addendum') || (statement && body.action==='save_statement');
      const statementParent=statement && (row.payload.contracts||[]).find(record=>!record.trashed && String(record.id)===String(contract?.contractId ?? body.contractId));
      if(statement && (!statementParent || (contract && !contract.statementType) || !['save_statement','delete_statement','approve_statement','save_signed','send_finance','approve_finance','reject_finance','withdraw_finance','record_payment'].includes(body.action))){sendJson(response,400,{message:'قرارداد یا عملیات صورت‌وضعیت نامعتبر است'});return true;}
      if(!statement && body.action==='record_payment'){sendJson(response,400,{message:'عملیات نامعتبر است'});return true;}
      if(contract?.trashed || (!contract && !saveDraft)){sendJson(response,404,{message:'قرارداد پیدا نشد'});return true;}
      if(Number(body.version)!==Number(contract?.handoffVersion||0) || Number(body.updatedAt)!==Number(contract?.updatedAt||0)){
        sendJson(response,409,{message:'قرارداد تغییر کرده است؛ صفحه را به‌روز کنید'});return true;
      }
      let files=[];
      if(body.action==='save_signed'){
        if(!storage){sendJson(response,503,{message:'فضای ذخیره‌سازی آماده نیست'});return true;}
        if(!Array.isArray(body.files) || body.files.length>30){sendJson(response,400,{message:'حداکثر ۳۰ صفحه انتخاب کنید'});return true;}
        for(const ref of body.files){
          if(ref?.projectId!==projectId || ref.category!=='contracts' || ref.recordId!==contractId || !/^[a-zA-Z0-9-]+$/.test(ref.id||'')){
            sendJson(response,400,{message:'فایل متعلق به این قرارداد نیست'});return true;
          }
          try{files.push(await storage.metadata(projectId+'/contracts/'+contractId+'/'+ref.id));}
          catch(error){if(error.code!=='ENOENT')throw error;sendJson(response,400,{message:'فایل پیدا نشد؛ دوباره بارگذاری کنید'});return true;}
        }
      }
      const activity=(row.payload.activityTemplates||[]).find(a=>String(a.id)===String(contract?.activityId));
      let transition;
      if(statement && body.action==='withdraw_finance' && contract.accountingStatus!=='sent'){sendJson(response,409,{message:'صورت‌وضعیت تأییدشده قابل پس گرفتن نیست'});return true;}
      if(deleteStatement){
        if(contract.signedAt || ['sent','accepted'].includes(contract.accountingStatus)){
          sendJson(response,409,{message:'صورت‌وضعیت در وضعیت فعلی قابل حذف نیست'});return true;
        }
        const at=Date.now();
        transition={ok:true,contract:{...contract,trashed:true,deletedAt:at,deletedBy:actor.id,updatedAt:at}};
      }else if(deleteAddendum){
        if(!canDeleteAddendumRecord(contract)){
          sendJson(response,409,{message:'این الحاقیه در وضعیت فعلی قابل حذف نیست'});return true;
        }
        const at=Date.now();
        transition={ok:true,contract:{...contract,trashed:true,deletedAt:at,deletedBy:actor.id,updatedAt:at}};
      }else if(statement && saveDraft) transition=saveStatement(row.payload,statementParent,contract,contractId,body,actor,Date.now());
      else if(statement && body.action==='record_payment'){
        const original=contractStatementTotals(row.payload,statementParent);
        if(contract.addendumId && (original.payable!==0 || original.remaining>0)){
          sendJson(response,409,{message:'ابتدا کارکرد و پرداخت قرارداد اصلی را تکمیل کنید'});return true;
        }
        transition=recordStatementPayment(contract,body.amount,actor,Date.now());
      }
      else if(saveDraft) transition=saveAddendumDraft(row.payload,contract,body,actor,contractId,Date.now());
      else if(reviewAction){
        transition=transitionContractApproval(contract,body.action==='revoke_addendum'?'revoke':'approve',actor,{reason:body.reason});
        if(transition.ok && body.action==='revoke_addendum')Object.assign(transition.contract,{isDraft:true,status:'draft'});
      }else if(addendum && body.action==='submit_addendum'){
        transition=transitionContractApproval(contract,'submit',actor,{approverIds:contract.contractApproverContactIds});
      }else if(addendum && ['cancel_completion','withdraw_submission'].includes(body.action)){
        transition=transitionContractApproval(contract,body.action,actor,{reason:body.reason});
      }else{
        let source=contract;
        if(body.action==='send_finance'){
          if(addendum){
            const parent=parentContractOf(row.payload,contract);
            if(!parent){sendJson(response,409,{message:'قرارداد اصلی پیدا نشد'});return true;}
            const previousParent=!isContractSigned(contract) && canReuseReturnedSignature(contract)
              ? contract.accountingPackage.contract.parentDocument : null;
            const parentDocument=previousParent || parent.accountingPackage?.contract || syncContractPartyData({...parent},row.payload);
            const {accountingPackage,approvalHistory,financeHistory,...frozen}=parentDocument;
            const parentActivity=(row.payload.activityTemplates||[]).find(a=>String(a.id)===String(parent.activityId));
            source={...contract,parentDocument:{...frozen,documentActivityName:frozen.documentActivityName || parentActivity?.name || ''}};
          }else if(!statement) source=syncContractPartyData({...contract},row.payload);
        }
        transition=transitionContractHandoff(source,body.action,actor,{files,reason:body.reason,projectName:row.payload.name||row.payload.title||'',activityName:activity?.name||activity?.title||''});
      }
      if(!transition.ok){sendJson(response,400,{message:transition.message});return true;}
      if(addendum || statement || reviewAction) transition.contract.handoffVersion=Number(contract?.handoffVersion||0)+1;
      row.payload[collection]=contract ? row.payload[collection].map(c=>String(c.id)===contractId?transition.contract:c)
        : [...(row.payload[collection]||[]),transition.contract];
      await client.query('UPDATE projects SET payload=$2::jsonb,revision=revision+1,updated_at=now() WHERE id=$1',[projectId,JSON.stringify(row.payload)]);
      await client.query('COMMIT');committed=true;sendJson(response,200,{contract:transition.contract});
    }finally{if(!committed)await client.query('ROLLBACK');client.release();}
    return true;
  };
}
