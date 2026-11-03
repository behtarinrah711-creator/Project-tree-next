import test from 'node:test';
import assert from 'node:assert/strict';
import {contactDocumentImages,contractorDocumentImages} from './contactDocuments.js';
globalThis.window={location:{hash:'',search:''}};
const {syncContractPartyData,resolveContractDocumentDraft}=await import('../modules/contracts/realContractDomain.js');
const {makeRealContractDraft}=await import('../modules/contracts/realContractDomain.js');
const {contractDocumentMarkup}=await import('../modules/contracts/contractDocument.js');

const image=(id,recordId='iran')=>({id,recordId,projectId:'p',mime:'image/jpeg',name:id+'.jpg'});
const project={id:'p',contacts:[{id:'iran',firstName:'ایرانی',nationalityType:'ایرانی',iranianDocumentImages:[image('i'),image('i'),{id:'pdf',mime:'application/pdf'}]},
  {id:'foreign',firstName:'اتباع',nationalityType:'غیر ایرانی',foreignIdImages:[image('f','foreign')]}]};

test('new unsaved contract picks up photographs saved after its contractor was selected',()=>{
  const state=makeRealContractDraft();state.contractorId='iran';
  const before=structuredClone(project);before.contacts[0].iranianDocumentImages=[];
  syncContractPartyData(state,before);assert.deepEqual(state.contractorDocuments,[]);
  syncContractPartyData(state,project);
  assert.deepEqual(state.contractorDocuments.map(file=>file.id),['i']);
});
test('draft annex reads use current contact photographs even when an empty snapshot was saved earlier',()=>{
  const state={id:'c',contractorId:'iran',status:'draft',isDraft:true,contractorDocuments:[],contractorDocumentsContactId:'iran'};
  assert.deepEqual(contractorDocumentImages(state,project).map(file=>file.id),['i']);
});

test('Iranian and foreign contacts supply the same image annex pipeline, without duplicates or non-images',()=>{
  assert.deepEqual(contactDocumentImages(project.contacts[0]).map(file=>file.id),['i']);
  assert.deepEqual(contactDocumentImages(project.contacts[1]).map(file=>file.id),['f']);
  assert.deepEqual(contactDocumentImages({...project.contacts[0],trashed:true}),[]);
  assert.deepEqual(contractorDocumentImages({contractorId:'missing'},project),[]);
});
test('draft snapshots follow the chosen contractor and saved contract annexes remain stable',()=>{
  const state={contractorId:'iran',status:'draft'};
  syncContractPartyData(state,project);assert.equal(state.contractorDocuments[0].id,'i');
  state.contractorId='foreign';syncContractPartyData(state,project);assert.equal(state.contractorDocuments[0].id,'f');
  state.status='final';
  const changed=structuredClone(project);changed.contacts[1].foreignIdImages=[image('new','foreign')];
  const preview=resolveContractDocumentDraft(state,changed);assert.equal(preview.contractorDocuments[0].id,'f');
  state.status='draft';syncContractPartyData(state,changed);assert.equal(state.contractorDocuments[0].id,'new');
  state.contractorId='';syncContractPartyData(state,changed);assert.deepEqual(state.contractorDocuments,[]);
});
test('legacy inline images appear after signatures; missing images have no annex and unsafe URLs never render',()=>{
  const inline='data:image/jpeg;base64,YQ==';
  const state={contractorId:'old',contractorName:'پیمانکار',contractorDocuments:[inline]};
  const html=contractDocumentMarkup(state);
  assert.ok(html.indexOf('contract-document-attachment')>html.indexOf('doc-signatures'));
  assert.ok(html.includes('src="'+inline+'"'));assert.ok(html.includes('پیوست ۱'));
  assert.ok(!contractDocumentMarkup({}).includes('contract-document-attachment'));
  assert.deepEqual(contactDocumentImages({foreignIdImage:inline}).length,1);
  assert.ok(!contractDocumentMarkup({contractorDocuments:[image('x')],contractorDocumentImages:[{dataUrl:'javascript:alert(1)'}]}).includes('src="javascript:'));
});
