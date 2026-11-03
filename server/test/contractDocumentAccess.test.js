import test from 'node:test';
import assert from 'node:assert/strict';
import {canReadContractDocument,createFileUploadHandler} from '../src/fileUploads.js';

test('contract readers may read only photographs annexed to the selected contractor in that project',()=>{
  const file={id:'image-1',projectId:'p',recordId:'person',mime:'image/jpeg'};
  const contract={id:'c',contractorId:'person',contractorDocuments:[file],contractorDocumentsContactId:'person'};
  const row={owner_account_id:'owner',membership_status:'active',phone:'0912',permissions:{modules:{contracts:'view',people:'none'}},
    payload:{projectMembers:[{mobile:'0912',status:'active'}],contracts:[contract]}};
  assert.equal(canReadContractDocument(row,'member','c','person','image-1'),true);
  for(const [contractId,personId,fileId] of [['other','person','image-1'],['c','other','image-1'],['c','person','other']])assert.equal(canReadContractDocument(row,'member',contractId,personId,fileId),false);
  assert.equal(canReadContractDocument({...row,membership_status:'inactive'},'member','c','person','image-1'),false);
  assert.equal(canReadContractDocument({...row,permissions:{modules:{contracts:'none',people:'none'}}},'member','c','person','image-1'),false);
  assert.equal(canReadContractDocument({...row,payload:{...row.payload,contracts:[{...contract,trashed:true}]}},'member','c','person','image-1'),false);
});
test('older contracts can resolve current Iranian/foreign contact photographs, but an explicitly empty snapshot stays empty',()=>{
  const row={owner_account_id:'owner',payload:{contracts:[{id:'c',contractorId:'person'}],contacts:[{id:'person',nationalityType:'ایرانی',iranianDocumentImages:[{id:'file',recordId:'person',projectId:'p',mime:'image/jpeg'}]}]}};
  assert.equal(canReadContractDocument(row,'owner','c','person','file'),true);
  Object.assign(row.payload.contracts[0],{contractorDocuments:[],contractorDocumentsContactId:'person'});
  assert.equal(canReadContractDocument(row,'owner','c','person','file'),false);
});

test('GET contract context grants annex reads but cannot grant uploads or unrelated file reads',async()=>{
  const row={owner_account_id:'owner',membership_status:'active',phone:'0912',permissions:{modules:{contracts:'view',people:'none'}},
    payload:{projectMembers:[{mobile:'0912',status:'active'}],contracts:[{id:'c',contractorId:'person',contractorDocumentsContactId:'person',contractorDocuments:[{id:'file',projectId:'p',recordId:'person',mime:'image/jpeg'}]}]}};
  const handler=createFileUploadHandler({sessionSecret:'secret',pool:{async query(sql){return {rows:sql.includes('SELECT account_id')?[{account_id:'member'}]:[row]};}},
    storage:{metadata:async()=>({name:'document.jpg',mime:'image/jpeg'}),read:async()=>Buffer.from('JPEG')}});
  const request=async(method,path)=>{
    let status;
    const response={writeHead(code){status=code;},end(){}};
    await handler({method,headers:{authorization:'Bearer test'}},response,new URL(path,'http://localhost'));
    return status;
  };
  const path='/api/v1/projects/p/files/contacts/person';
  assert.equal(await request('GET',path+'/file?contractId=c'),200);
  assert.equal(await request('GET',path+'/file'),403);
  assert.equal(await request('GET',path+'/unrelated?contractId=c'),403);
  assert.equal(await request('POST',path+'?contractId=c'),403);
});
