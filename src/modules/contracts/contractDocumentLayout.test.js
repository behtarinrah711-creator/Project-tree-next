import test from 'node:test';
import assert from 'node:assert/strict';
import {planContractAnnexes} from './contractDocumentLayout.js';
import {contractDocumentMarkup} from './contractDocument.js';

const portrait={width:600,height:1000},landscape={width:1000,height:600};
test('portraits are paired first and horizontal images occupy the remaining third',()=>{
  const files=[landscape,portrait,portrait,landscape,portrait];
  const before=JSON.stringify(files),pages=planContractAnnexes(files);
  assert.deepEqual(pages.map(page=>page.map(photo=>photo.sourceIndex)),[[1,2,0],[4,3]]);
  assert.deepEqual(pages[0].slice(0,2).map(photo=>photo.column),[1,2]);
  assert.equal(pages[0][2].row,3);
  assert.equal(pages[1][0].column,1);
  assert.equal(pages[1][1].rotated,true);
  assert.equal(pages[1][1].column,2);
  assert.equal(JSON.stringify(files),before);
});
test('only portraits, only horizontals, squares, and extra horizontal pages retain every image',()=>{
  assert.deepEqual(planContractAnnexes([portrait,portrait,portrait]).map(page=>page.length),[2,1]);
  assert.deepEqual(planContractAnnexes(Array(7).fill(landscape)).map(page=>page.length),[3,3,1]);
  assert.equal(planContractAnnexes([{width:500,height:500}])[0][0].portrait,false);
  const files=[portrait,...Array(5).fill(landscape)];
  assert.deepEqual(planContractAnnexes(files).map(page=>page.map(photo=>photo.sourceIndex)),[[0,1,2],[3,4,5]]);
});
test('decoded image dimensions classify legacy references without changing the source association',()=>{
  const photos=['data:image/jpeg;base64,YQ==','data:image/jpeg;base64,Yg=='];
  const images=[{...landscape,dataUrl:photos[0]},{...portrait,dataUrl:photos[1]}];
  const plan=planContractAnnexes(photos,images);assert.deepEqual(plan[0].map(photo=>photo.sourceIndex),[1,0]);
  const html=contractDocumentMarkup({contractorDocuments:photos,contractorDocumentImages:images});
  assert.ok(html.indexOf('src="'+photos[1]+'"')<html.indexOf('href="'+photos[0]+'"'));
  assert.match(html,/contract-document-photo--portrait contract-document-photo--left/);
  assert.match(html,/contract-document-photo--portrait contract-document-photo--right/);
  assert.match(html,/viewBox="0 0 600 1000"/);
  assert.match(html,/transform="translate\(0 1000\) rotate\(-90\)"/);
  assert.ok(html.indexOf('تصویر مدرک ۱')<html.indexOf('تصویر مدرک ۲'));
});
test('signature labels match requested text with no quotation marks or dotted line below',()=>{
  const html=contractDocumentMarkup({});
  const signature=html.match(/<div class="doc-signatures">([\s\S]*?)<\/div><\/div>/)[1];
  assert.ok(signature.includes('نام و نام خانوادگی، امضا و اثر انگشت کارفرما:'));
  assert.ok(signature.includes('نام و نام خانوادگی، امضا و اثر انگشت پیمانکار:'));
  assert.doesNotMatch(signature,/\.{2,}|<br>|[«»]/);
});

test('rotation only fills an odd portrait partner and never rotates squares or unknown sizes',()=>{
  const files=[portrait,landscape,landscape];
  const before=JSON.stringify(files),page=planContractAnnexes(files)[0];
  assert.deepEqual(page.map(p=>p.sourceIndex),[0,1,2]);
  assert.equal(page[1].rotated,true);
  assert.equal(page[2].row,3);
  assert.equal(JSON.stringify(files),before);
  const even=planContractAnnexes([portrait,portrait,landscape])[0];
  assert.equal(even.some(p=>p.rotated),false);
  const unknown=planContractAnnexes([portrait,{}, {width:500,height:500}])[0];
  assert.equal(unknown.some(p=>p.rotated),false);
});
