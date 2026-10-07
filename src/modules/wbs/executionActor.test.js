import test from 'node:test';
import assert from 'node:assert/strict';
import { currentExecutionActor, isExecutionApprover, isExecutionAssignee } from './executionActor.js';

test('Saosa execution history uses the linked contact full name',()=>{
  const session={phone:'09120000000',accountId:'acc-1',token:'t',expiresAt:Date.now()+60_000};
  const windowRef={localStorage:{getItem:()=>JSON.stringify(session)}};
  const project={
    projectMembers:[{mobile:session.phone,contactId:'c1'}],
    contacts:[{id:'c1',firstName:'سیامند',lastName:'احمدی',phones:[session.phone]}],
  };
  const actor=currentExecutionActor(project,windowRef);
  assert.deepEqual(actor,{id:'acc-1',contactId:'c1',name:'سیامند احمدی'});
  assert.equal(isExecutionAssignee({assigneeContactId:'c1'},actor),true);
  assert.equal(isExecutionApprover({approvalContactId:'c1'},actor),true);
  assert.equal(isExecutionAssignee({assigneeContactId:''},actor),false);
  assert.equal(isExecutionApprover({approvalContactId:''},actor),false);
});
