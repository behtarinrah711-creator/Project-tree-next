import {syncContractPartyData} from '../../src/domain/contractPartyData.js';
import {authenticate} from './auth.js';
import {readJson,sendJson} from './http.js';
import {canAccessFiles} from './fileUploads.js';
import {transitionContractHandoff} from '../../src/domain/contractHandoff.js';

export function createContractHandoffHandler({pool,sessionSecret,storage}){
  return async(request,response,url)=>{
    const match=/^\/api\/v1\/projects\/([^/]+)\/contracts\/([^/]+)\/handoff$/.exec(url.pathname);
    if(!match)return false;
    if(request.method!=='POST'){sendJson(response,405,{error:'method_not_allowed'});return true;}
    const accountId=await authenticate(request,pool,sessionSecret);
    if(!accountId){sendJson(response,401,{error:'unauthorized'});return true;}
    const body=await readJson(request,128*1024),[projectId,contractId]=match.slice(1).map(decodeURIComponent);
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
      const financeAction=['approve_finance','reject_finance','revoke_finance'].includes(body.action);
      const allowed=financeAction?(canAccessFiles(row,accountId,true,'accounting') || canAccessFiles(row,accountId,true,'accounting-contracts')):canAccessFiles(row,accountId,true,'contracts');
      if(!allowed){sendJson(response,403,{message:'اجازه تغییر قرارداد را ندارید'});return true;}
      const contract=(row.payload.contracts||[]).find(c=>String(c.id)===contractId && !c.trashed);
      if(!contract){sendJson(response,404,{message:'قرارداد پیدا نشد'});return true;}
      if(Number(body.version)!==Number(contract.handoffVersion||0) || Number(body.updatedAt)!==Number(contract.updatedAt||0)){
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
      const person=(row.payload.contacts||[]).find(c=>!c.trashed && (c.phones||[c.phone]).includes(row.phone));
      const actor={id:String(accountId),name:[person?.firstName,person?.lastName].filter(Boolean).join(' ')||person?.name||row.phone||'کاربر'};
      const activity=(row.payload.activityTemplates||[]).find(a=>String(a.id)===String(contract.activityId));
      const transition=transitionContractHandoff(body.action==='send_finance'?syncContractPartyData({...contract},row.payload):contract,body.action,actor,{files,reason:body.reason,projectName:row.payload.name||row.payload.title||'',activityName:activity?.name||activity?.title||''});
      if(!transition.ok){sendJson(response,400,{message:transition.message});return true;}
      row.payload.contracts=row.payload.contracts.map(c=>String(c.id)===contractId?transition.contract:c);
      await client.query('UPDATE projects SET payload=$2::jsonb,revision=revision+1,updated_at=now() WHERE id=$1',[projectId,JSON.stringify(row.payload)]);
      await client.query('COMMIT');committed=true;sendJson(response,200,{contract:transition.contract});
    }finally{if(!committed)await client.query('ROLLBACK');client.release();}
    return true;
  };
}
