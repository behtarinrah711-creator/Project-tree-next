import test from 'node:test';
import assert from 'node:assert/strict';
import {imageBounds,prepareUpload,IMAGE_LIMIT,fileEndpoint} from './fileApi.js';

test('image bounding preserves portrait and landscape proportions without enlargement',()=>{
  assert.deepEqual(imageBounds(6000,4000),{width:3200,height:2133});
  assert.deepEqual(imageBounds(4000,6000),{width:2133,height:3200});
  assert.deepEqual(imageBounds(120,80),{width:120,height:80});
  assert.equal(fileEndpoint({projectId:'p',recordId:'c',id:'id'}),'/api/v1/projects/p/files/contacts/c/id');
});
test('JPEG within limit is passed through; unsupported browser decoding falls back to server',async t=>{
  const photo=new File(['photo'],'photo.jpg',{type:'image/jpeg'});
  assert.equal(await prepareUpload(photo),photo);
  const old=globalThis.createImageBitmap;t.after(()=>{globalThis.createImageBitmap=old;});
  globalThis.createImageBitmap=async()=>{throw Error('HEIC unavailable in browser');};
  const heic=new File(['heic'],'photo.heic',{type:'image/heic'});assert.equal(await prepareUpload(heic),heic);
});
test('client compression keeps proportions, retries from original, and never emits WebP',async t=>{
  const oldBitmap=globalThis.createImageBitmap,oldDocument=globalThis.document;
  t.after(()=>{globalThis.createImageBitmap=oldBitmap;globalThis.document=oldDocument;});
  let closed=false;const sizes=[],formats=[];
  globalThis.createImageBitmap=async()=>({width:6000,height:4000,close(){closed=true;}});
  globalThis.document={createElement(){return {getContext(){return {fillRect(){},drawImage(){}};},toBlob(callback,type){sizes.push([this.width,this.height]);formats.push(type);callback(new Blob([new Uint8Array(sizes.length===1?IMAGE_LIMIT+1:100)],{type}));}};}};
  const result=await prepareUpload(new File(['x'],'photo.png',{type:'image/png'}));
  assert.equal(result.type,'image/jpeg');assert.equal(result.name,'photo.jpg');assert.ok(result.size<=IMAGE_LIMIT);
  assert.deepEqual(sizes,[[3200,2133],[3200,2133]]);assert.deepEqual(formats,['image/jpeg','image/jpeg']);assert.equal(closed,true);
});
