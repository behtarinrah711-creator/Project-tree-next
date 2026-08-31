import test from 'node:test';
import assert from 'node:assert/strict';
import { enterContactFormShell, leaveContactFormShell } from './contactFormBridge.js';

function shell(){
  const classes=new Set();
  return {
    page:{classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)}},
    body:{innerHTML:'old'}, title:{textContent:''}, addButton:{hidden:false}, classes,
  };
}

test('Contact form shell preserves create/edit enter and list leave semantics',()=>{
  const ui=shell();
  const modes=[];
  assert.equal(enterContactFormShell({...ui,isEdit:false,setFormMode:value=>modes.push(value)}),true);
  assert.equal(ui.title.textContent,'ثبت مخاطب');
  assert.equal(ui.body.innerHTML,'');
  assert.equal(ui.addButton.hidden,true);
  assert.equal(ui.classes.has('contact-form-mode'),true);

  leaveContactFormShell({...ui,setFormMode:value=>modes.push(value)});
  assert.equal(ui.title.textContent,'مخاطبین');
  assert.equal(ui.addButton.hidden,false);
  assert.equal(ui.classes.has('contact-form-mode'),false);
  assert.deepEqual(modes,[true,false]);
});

test('Contact form shell labels edit mode without owning navigation history',()=>{
  const ui=shell();
  enterContactFormShell({...ui,isEdit:true});
  assert.equal(ui.title.textContent,'ویرایش مخاطب');
  assert.equal('history' in ui.page,false);
});
