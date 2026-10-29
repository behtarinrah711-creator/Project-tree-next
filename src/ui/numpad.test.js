import test from 'node:test';
import assert from 'node:assert/strict';
import {openNumpadGeneric,installNumpadBindings} from './numpad.js';

test('optional decimal quantity keypad shows unit and does not leak decimal mode into money inputs',()=>{
  const nodes=new Map();
  const element=()=>({style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},before(node){nodes.set(node.id,node);},after(node){nodes.set(node.id,node);}});
  for(const id of ['numpadDisplay','numpadOverlay','numpadBackspace','numpadDoneBtn','numpadCancelBtn','numpadError']) nodes.set(id,element());
  const keys=[...'0123456789'].map(d=>({...element(),dataset:{d}}));
  const documentRef={getElementById:id=>nodes.get(id),createElement:element,querySelectorAll:()=>keys};
  const env={documentRef,windowRef:{}};let saved;
  installNumpadBindings(env);
  openNumpadGeneric('12',value=>{saved=value;},{allowDecimal:true,suffix:' مترمربع'},env);
  nodes.get('numpadDecimal').onclick();keys[5].onclick();
  assert.equal(nodes.get('numpadDisplay').textContent,'۱۲٫۵ مترمربع');
  nodes.get('numpadDoneBtn').onclick();assert.equal(saved,'12.5');
  openNumpadGeneric('1000',()=>{},{suffix:' تومان'},env);
  assert.equal(nodes.get('numpadDecimal').hidden,true);
  nodes.get('numpadDecimal').onclick();
  assert.equal(nodes.get('numpadDisplay').textContent,'۱,۰۰۰ تومان');
});
