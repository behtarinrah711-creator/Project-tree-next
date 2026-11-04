import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createContractHandoffHandler} from '../src/contractHandoff.js';
import {createFileUploadHandler} from '../src/fileUploads.js';
const file={id:'file-one',projectId:'p',category:'contracts',recordId:'c',name:'signed.jpg',mime:'image/jpeg',uploadedBy:'member'};
function fixture(){
  let payload={id:'p',projectMembers:[{mobile:'0912',status:'active'}],contracts:[{id:'c',status:'final',approvalStatus:'approved',updatedAt:1}]};
  let permissions={modules:{contracts:'create'}},active='active',commits=0;
  const client={async query(sql,args){
    if(sql.includes('FOR UPDATE'))return {rows:[{owner_account_id:'owner',payload:structuredClone(payload)}]};
    if(sql.includes('SELECT a.phone'))return {rows:[{phone:'0912',membership_status:active,permissions}]};
    if(sql.startsWith('UPDATE projects'))payload=JSON.parse(args[1]);
    if(sql==='COMMIT')commits++;
    return {rows:[]};
  },release(){}};
  const pool={connect:async()=>client,query:async sql=>({rows:sql.includes('SELECT account_id')?[{account_id:'member'}]:[{owner_account_id:'owner',payload,phone:'0912',membership_status:active,permissions}]})};
  const storage={metadata:async key=>{if(key!=='p/contracts/c/file-one')throw Object.assign(Error(),{code:'ENOENT'});return file;},read:async()=>Buffer.from('image')};
  const handler=createContractHandoffHandler({pool,sessionSecret:'s',storage});
  return {get payload(){return payload;},get commits(){return commits;},setPermissions(value){permissions=value;},deactivate(){active='inactive';},pool,storage,
    async call(body){let status,result;const request=Readable.from([Buffer.from(JSON.stringify(body))]);request.method='POST';request.headers={authorization:'Bearer token'};
      await handler(request,{writeHead(code){status=code;},end(value){result=JSON.parse(value);}},new URL('http://local/api/v1/projects/p/contracts/c/handoff'));
      return {status,result};
    }};
}
test('member saves signed files, sends frozen package and withdraws using authenticated history',async()=>{
  const f=fixture();f.payload.name='پروژه تست';f.payload.contacts=[{id:'person',firstName:'جواد',lastName:'قریشی',phones:['0912']}];f.payload.activityTemplates=[{id:'activity',name:'فونداسیون'}];Object.assign(f.payload.contracts[0],{contractorId:'person',activityId:'activity'});let result=await f.call({action:'save_signed',version:0,updatedAt:1,files:[file],actor:{id:'forged'}});
  assert.equal(result.status,200);let c=result.result.contract;
  assert.equal(c.approvalHistory.at(-1).actor.id,'member');
  result=await f.call({action:'send_finance',version:c.handoffVersion,updatedAt:c.updatedAt});assert.equal(result.status,200);c=result.result.contract;
  assert.equal(c.accountingPackage.signedFiles[0].id,file.id);
  assert.equal(c.accountingPackage.contract.contractorName,'جواد قریشی');
  assert.equal(c.accountingPackage.contract.projectName,'پروژه تست');
  assert.equal(c.accountingPackage.contract.documentActivityName,'فونداسیون');
  f.payload.contacts[0].firstName='تغییر';assert.equal(c.accountingPackage.contract.contractorName,'جواد قریشی');
  result=await f.call({action:'withdraw_finance',version:c.handoffVersion,updatedAt:c.updatedAt,reason:'اصلاح مدرک'});assert.equal(result.status,200);
  assert.equal(result.result.contract.accountingStatus,'withdrawn');assert.equal(f.commits,3);
});
test('read-only, inactive members, stale writes and foreign references cannot mutate handoff',async()=>{
  const f=fixture(),body={action:'save_signed',version:0,updatedAt:1,files:[file]};
  f.setPermissions({modules:{contracts:'view'}});assert.equal((await f.call(body)).status,403);
  f.setPermissions({modules:{contracts:'create'}});assert.equal((await f.call({...body,updatedAt:99})).status,409);
  assert.equal((await f.call({...body,files:[{...file,projectId:'other'}]})).status,400);
  assert.equal((await f.call({...body,files:[{...file,id:'missing'}]})).status,400);
  f.deactivate();assert.equal((await f.call(body)).status,403);assert.equal(f.commits,0);
});
test('finance-only readers can download attached signed files but cannot upload or read unrelated files',async()=>{
  const f=fixture();let c=(await f.call({action:'save_signed',version:0,updatedAt:1,files:[file]})).result.contract;
  await f.call({action:'send_finance',version:c.handoffVersion,updatedAt:c.updatedAt});
  f.setPermissions({modules:{contracts:'none',people:'none',accounting:'view'}});
  const handler=createFileUploadHandler({pool:f.pool,sessionSecret:'s',storage:f.storage});
  const call=async(method,path)=>{let status;await handler({method,headers:{authorization:'Bearer token'}},{writeHead(code){status=code;},end(){}},new URL('http://local'+path));return status;};
  assert.equal(await call('GET','/api/v1/projects/p/files/contracts/c/file-one'),200);
  assert.equal(await call('POST','/api/v1/projects/p/files/contracts/c'),403);
  assert.equal(await call('GET','/api/v1/projects/p/files/contracts/other/file-one'),403);
});
test('approved contract upload accepts PDF in its own category and is locked after finance handoff',async()=>{
  const f=fixture();let stored;
  f.storage.put=async(key,metadata)=>{stored={key,metadata};};
  const handler=createFileUploadHandler({pool:f.pool,sessionSecret:'s',storage:f.storage});
  const upload=async()=>{let status,result;const request=Readable.from([Buffer.from('%PDF-1.7\nexample')]);request.method='POST';request.headers={authorization:'Bearer token'};
    await handler(request,{writeHead(code){status=code;},end(value){result=JSON.parse(value);}},new URL('http://local/api/v1/projects/p/files/contracts/c?name=signed.pdf'));return {status,result};};
  const result=await upload();assert.equal(result.status,201);assert.equal(result.result.file.category,'contracts');assert.equal(stored.metadata.mime,'application/pdf');assert.ok(stored.key.startsWith('p/contracts/c/'));
  let c=(await f.call({action:'save_signed',version:0,updatedAt:1,files:[file]})).result.contract;
  await f.call({action:'send_finance',version:c.handoffVersion,updatedAt:c.updatedAt});
  assert.equal((await upload()).status,409);
});
test('only financial writers can approve, revoke their approval and reject with a reason',async()=>{
  const f=fixture();let c=(await f.call({action:'save_signed',version:0,updatedAt:1,files:[file]})).result.contract;
  c=(await f.call({action:'send_finance',version:c.handoffVersion,updatedAt:c.updatedAt})).result.contract;
  const decision=(action,reason)=>f.call({action,reason,version:c.handoffVersion,updatedAt:c.updatedAt});
  assert.equal((await decision('approve_finance')).status,403,'contract writer is not a finance reviewer');
  f.setPermissions({modules:{contracts:'none',accounting:'view'}});
  assert.equal((await decision('approve_finance')).status,403);
  f.setPermissions({modules:{contracts:'none',accounting:'create'}});
  let result=await decision('approve_finance');assert.equal(result.status,200);c=result.result.contract;
  assert.equal(c.accountingStatus,'accepted');
  result=await decision('withdraw_finance','برگشت برای اصلاح');assert.equal(result.status,403,'finance role cannot withdraw for the sender');
  result=await decision('revoke_finance');assert.equal(result.status,200);c=result.result.contract;
  assert.equal((await decision('reject_finance','کم')).status,400);
  result=await decision('reject_finance','مدرک ناقص است');assert.equal(result.status,200);c=result.result.contract;
  assert.equal(c.status,'draft');assert.equal(c.signedAt,null);assert.equal(c.financeRejection.reason,'مدرک ناقص است');
});
test('contract editor can replace returned printed files in draft without approving or sending the contract',async()=>{
 const f=fixture();let c=(await f.call({action:'save_signed',version:0,updatedAt:1,files:[file]})).result.contract;
 c=(await f.call({action:'send_finance',version:c.handoffVersion,updatedAt:c.updatedAt})).result.contract;
 f.setPermissions({modules:{accounting:'create'}});
 c=(await f.call({action:'reject_finance',reason:'اسکن ناقص است',version:c.handoffVersion,updatedAt:c.updatedAt})).result.contract;
 f.setPermissions({modules:{contracts:'create'}});
 const saved=new Map(),originalMetadata=f.storage.metadata;
 f.storage.put=async(key,metadata)=>saved.set(key,metadata);
 f.storage.metadata=async key=>saved.get(key)||originalMetadata(key);
 const request=Readable.from([Buffer.from('%PDF-1.7\nreplacement')]);request.method='POST';request.headers={authorization:'Bearer token'};
 let status,uploaded;
 await createFileUploadHandler({pool:f.pool,sessionSecret:'s',storage:f.storage})(request,{writeHead(code){status=code;},end(value){uploaded=JSON.parse(value);}},new URL('http://local/api/v1/projects/p/files/contracts/c?name=replacement.pdf'));
 assert.equal(status,201);
 const result=await f.call({action:'save_signed',files:[uploaded.file],version:c.handoffVersion,updatedAt:c.updatedAt});
 assert.equal(result.status,200);assert.equal(result.result.contract.status,'draft');assert.equal(result.result.contract.signedAt,null);
 assert.equal(result.result.contract.signedFiles[0].id,uploaded.file.id);
 assert.equal(result.result.contract.accountingPackage.signedFiles[0].id,file.id);
});
