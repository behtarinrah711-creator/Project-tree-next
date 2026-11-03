import test from 'node:test';
import assert from 'node:assert/strict';
import {loadContractDocumentImages,mountContractDocumentPreview} from './contractDocumentAttachments.js';

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

test('attachment preview retains the canonical print mount and repaginates after images load',async t=>{
  const old=globalThis.FileReader;t.after(()=>{globalThis.FileReader=old;});
  globalThis.FileReader=class{readAsDataURL(){this.result='data:image/jpeg;base64,YQ==';this.onload();}};
  const body={},preview={innerHTML:'initial'},mounts=[];let removed=0;
  const mountPrintPage=(parent,source,viewportClass)=>{
    assert.equal(parent,body);assert.equal(source,preview);assert.equal(viewportClass,'contract-real-preview-viewport');
    mounts.push(source.innerHTML);return {isConnected:true,remove(){removed++;}};
  };
  const dispose=mountContractDocumentPreview(body,preview,{contractorDocuments:['data:image/jpeg;base64,YQ==']},'p',{mountPrintPage});
  assert.equal(mounts.length,1);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(mounts.length,2);assert.equal(removed,1);
  assert.match(mounts[1],/contract-document-attachment/);assert.match(mounts[1],/src="data:image\/jpeg;base64,YQ=="/);
  dispose();
});

test('a disposed attachment preview cannot replace the next form preview',async t=>{
  const old=globalThis.FileReader;t.after(()=>{globalThis.FileReader=old;});
  globalThis.FileReader=class{readAsDataURL(){this.result='data:image/jpeg;base64,YQ==';this.onload();}};
  let mounts=0,errors=0;
  const dispose=mountContractDocumentPreview({}, {innerHTML:'initial'}, {contractorDocuments:['data:image/jpeg;base64,YQ==']}, 'p', {
    mountPrintPage:()=>{mounts++;return {isConnected:true,remove(){assert.fail('disposed view must remain untouched');}};},onError:()=>{errors++;}
  });
  dispose();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(mounts,1);assert.equal(errors,0);
});
