import test from 'node:test';
import assert from 'node:assert/strict';
import {loadContractDocumentImages} from './contractDocumentAttachments.js';

test('annex hydration carries contract access context and never mutates the saved reference',async t=>{
  const old=globalThis.FileReader;t.after(()=>{globalThis.FileReader=old;});
  globalThis.FileReader=class{readAsDataURL(){this.result='data:image/jpeg;base64,YQ==';this.onload();}};
  const state={id:'contract',contractorDocuments:[{id:'file',name:'مدرک',projectId:'p',recordId:'person',mime:'image/jpeg'}]};
  const before=JSON.stringify(state);let options;
  const hydrated=await loadContractDocumentImages(state,'p',{fetchImage:async(file,thumbnail,opts)=>{options=opts;assert.equal(thumbnail,false);assert.equal(file.id,'file');return new Blob(['a'],{type:'image/jpeg'});}});
  assert.equal(options.contractId,'contract');assert.equal(hydrated.contractorDocumentImages[0].dataUrl,'data:image/jpeg;base64,YQ==');
  assert.equal(JSON.stringify(state),before);
});
test('failed or cancelled image downloads reject instead of silently producing an incomplete export',async()=>{
  const state={id:'c',contractorDocuments:[{id:'file'}]};
  await assert.rejects(loadContractDocumentImages(state,'p',{fetchImage:async()=>{throw Error('forbidden');}}),/forbidden/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadContractDocumentImages(state,'p',{signal:controller.signal,fetchImage:async()=>new Blob(['a'])}),{name:'AbortError'});
});
