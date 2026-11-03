import test from 'node:test';
import assert from 'node:assert/strict';
import {hasActiveFileUploads,mountFileUploader} from './fileUploader.js';
test('completed FilePond entries never block detachment or replacement, active requests and queued uploads do',()=>{
  assert.equal(hasActiveFileUploads(0,[{status:5}]),false);
  assert.equal(hasActiveFileUploads(0,[{status:2},{status:5}]),false);
  assert.equal(hasActiveFileUploads(1,[{status:5}]),true);
  for(const status of [6,8,10])assert.equal(hasActiveFileUploads(0,[{status}]),false);
  for(const status of [1,3,7,9])assert.equal(hasActiveFileUploads(0,[{status:5},{status}]),true);
});
test('ordinary uploader keeps one file input; replacement input exists only when enabled for editing',()=>{
  const previous=globalThis.document;
  const element=()=>({children:[],classList:{add(){}},setAttribute(){},appendChild(node){this.children.push(node);}});
  globalThis.document={createElement:element};
  try{
    for(const [options,expected] of [[{},1],[{allowReplace:true},2],[{allowReplace:true,readOnly:true},1]]){
      const root=element(),uploader=mountFileUploader(root,{projectId:'p',recordId:'c',files:[],...options});
      assert.equal(root.children.filter(node=>node.type==='file').length,expected);
      uploader.destroy();
    }
  }finally{globalThis.document=previous;}
});
