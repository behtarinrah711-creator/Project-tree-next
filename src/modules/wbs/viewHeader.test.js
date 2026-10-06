import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewToolbar } from './viewHeader.js';

function fakeElement(tagName){
  return {
    tagName,
    className:'',
    children:[],
    attributes:{},
    appendChild(child){ this.children.push(child); child.parentElement = this; return child; },
    setAttribute(name, value){ this.attributes[name] = value; },
  };
}

const documentRef = {
  createElement:fakeElement,
};

test('shared planning toolbar includes export before view-specific controls', () => {
  const control = fakeElement('button');
  const header = createViewToolbar(documentRef, {
    className:'example-toolbar',
    ariaLabel:'ابزارهای آزمایشی',
    controls:[control],
  });

  assert.equal(header.className, 'wbs-view-header wbs-view-toolbar wbs-frame-header example-toolbar');
  const actions = header.children[0];
  assert.equal(actions.attributes['aria-label'], 'ابزارهای آزمایشی');
  assert.match(actions.children[0].className, /wbs-export-tool/);
  assert.equal(actions.children[1], control);
});
