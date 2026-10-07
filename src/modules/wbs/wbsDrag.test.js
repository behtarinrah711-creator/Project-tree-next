import test from 'node:test';
import assert from 'node:assert/strict';
import { bindRowDrag, reorderedIds } from './wbsDrag.js';

test('moves a sibling before the target', () => {
  assert.deepEqual(reorderedIds(['a', 'b', 'c'], 'c', 'a', 'before'), ['c', 'a', 'b']);
});

test('moves a sibling after the target', () => {
  assert.deepEqual(reorderedIds(['a', 'b', 'c'], 'a', 'b', 'after'), ['b', 'a', 'c']);
});

test('rejects a missing target and a drop onto itself', () => {
  assert.equal(reorderedIds(['a', 'b'], 'a', 'missing', 'before'), null);
  assert.equal(reorderedIds(['a', 'b'], 'a', 'a', 'before'), null);
});

test('mobile stage drag releases capture when the page is hidden', () => {
  const documentRef = new EventTarget();
  documentRef.defaultView = new EventTarget();
  documentRef.visibilityState = 'visible';
  const classes = new Set();
  const grip = new EventTarget();
  let captured = null;
  grip.setPointerCapture = id => { captured = id; };
  grip.hasPointerCapture = id => captured === id;
  grip.releasePointerCapture = () => { captured = null; };
  const row = {
    dataset:{},
    classList:{ contains:value => value === 'wbs-row' },
    querySelector:() => grip,
  };
  const wrapper = {
    firstElementChild:row,
    classList:{ add:value => classes.add(value), remove:value => classes.delete(value) },
  };
  const otherRow = { classList:{ contains:value => value === 'wbs-row' } };
  const other = { firstElementChild:otherRow, classList:{ remove(){} } };
  row.parentElement = wrapper;
  wrapper.parentElement = { children:[wrapper,other] };

  bindRowDrag(row,{id:'stage-1',documentRef});
  const down = new Event('pointerdown',{cancelable:true});
  Object.defineProperties(down,{pointerId:{value:4},button:{value:0}});
  down.stopPropagation=()=>{};
  grip.dispatchEvent(down);
  assert.equal(classes.has('wbs-row-dragging'),true);

  documentRef.visibilityState = 'hidden';
  documentRef.dispatchEvent(new Event('visibilitychange'));
  assert.equal(classes.has('wbs-row-dragging'),false);
  assert.equal(captured,null);
});
