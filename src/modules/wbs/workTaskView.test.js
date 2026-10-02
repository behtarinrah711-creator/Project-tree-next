import test from 'node:test';
import assert from 'node:assert/strict';
import { bindTaskReorder } from './workTaskView.js';

function pointerEvent(type, pointerId = 1){
  const event = new Event(type, { cancelable:true });
  Object.defineProperties(event, {
    pointerId:{ value:pointerId },
    button:{ value:0 },
    clientY:{ value:5 },
  });
  event.stopPropagation = () => {};
  return event;
}

function row(id, grip = null){
  const classes = new Set();
  return {
    dataset:{ taskId:id },
    classList:{
      add:value => classes.add(value),
      remove:value => classes.delete(value),
      contains:value => classes.has(value),
    },
    querySelector:() => grip,
  };
}

test('a task grip tap releases pointer capture without rerendering or leaving drag state', () => {
  const documentRef = new EventTarget();
  documentRef.defaultView = new EventTarget();
  documentRef.visibilityState = 'visible';
  const grip = new EventTarget();
  let captured = null;
  let released = null;
  grip.setPointerCapture = id => { captured = id; };
  grip.hasPointerCapture = id => captured === id;
  grip.releasePointerCapture = id => { released = id; captured = null; };
  const first = row('first', grip);
  const second = row('second');
  const rows = [first, second];
  const group = {
    querySelectorAll:() => rows,
    insertBefore(){},
    appendChild(){},
  };
  let renders = 0;

  bindTaskReorder(group, first, {
    projectId:'project', workId:'work', taskId:'first', documentRef,
    onChanged:() => { renders += 1; },
  });
  grip.dispatchEvent(pointerEvent('pointerdown', 7));
  assert.equal(first.classList.contains('is-dragging'), true);
  documentRef.dispatchEvent(pointerEvent('pointerup', 7));

  assert.equal(first.classList.contains('is-dragging'), false);
  assert.equal(released, 7);
  assert.equal(renders, 0);
});

test('task drag uses the same drop-line classes as stage drag', () => {
  const documentRef = new EventTarget();
  documentRef.defaultView = new EventTarget();
  documentRef.visibilityState = 'visible';
  let indicator = null;
  documentRef.createElement = () => {
    indicator = row('indicator');
    indicator.remove = () => {};
    return indicator;
  };
  const grip = new EventTarget();
  grip.setPointerCapture = () => {};
  grip.hasPointerCapture = () => false;
  const first = row('first', grip);
  const second = row('second');
  second.getBoundingClientRect = () => ({ top:0, height:20 });
  const rows = [first, second];
  const group = {
    scrollTop:0,
    getBoundingClientRect:() => ({ top:0 }),
    querySelectorAll:() => rows,
    insertBefore(item, before){
      if(!rows.includes(item)) return;
      rows.splice(rows.indexOf(item), 1);
      rows.splice(rows.indexOf(before), 0, item);
    },
    appendChild(item){
      if(!rows.includes(item)) return;
      rows.splice(rows.indexOf(item), 1);
      rows.push(item);
    },
  };

  bindTaskReorder(group, first, { projectId:'project', workId:'work', taskId:'first', documentRef });
  grip.dispatchEvent(pointerEvent('pointerdown', 9));
  documentRef.dispatchEvent(pointerEvent('pointermove', 9));

  assert.equal(indicator.classList.contains('is-visible'), true);
  documentRef.dispatchEvent(pointerEvent('pointercancel', 9));
});

test('task drag cleanup also runs when the browser cancels the mobile gesture', () => {
  const documentRef = new EventTarget();
  documentRef.defaultView = new EventTarget();
  documentRef.visibilityState = 'visible';
  const grip = new EventTarget();
  grip.setPointerCapture = () => {};
  grip.hasPointerCapture = () => false;
  const first = row('first', grip);
  const second = row('second');
  const group = { querySelectorAll:() => [first, second], insertBefore(){}, appendChild(){} };

  bindTaskReorder(group, first, { projectId:'project', workId:'work', taskId:'first', documentRef });
  grip.dispatchEvent(pointerEvent('pointerdown', 3));
  documentRef.dispatchEvent(pointerEvent('pointercancel', 3));

  assert.equal(first.classList.contains('is-dragging'), false);
});
