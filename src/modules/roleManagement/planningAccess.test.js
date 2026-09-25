import test from 'node:test';
import assert from 'node:assert/strict';
import {canDeletePlanning,canViewPlanning,canWritePlanning,firstAllowedPlanningView,planningAccessLevel} from './planningAccess.js';

test('planning access reads invitation module permissions and normalizes legacy edit',()=>{
  const win={KarhaSaosaWorkspaceAccess:{p:{role:'invite',permissions:{modules:{'planning:tree':'none','planning:timeline':'edit','planning:costline':'view'}}}}};
  assert.equal(planningAccessLevel('p','tree',win),'none');
  assert.equal(planningAccessLevel('p','timeline',win),'create');
  assert.equal(firstAllowedPlanningView('p',undefined,win),'timeline');
  assert.equal(planningAccessLevel('p','costline',{KarhaSaosaWorkspaceAccess:{p:{role:'invite',permissions:{modules:{'planning:tree':'view'},edit:true}}}}),'none');
});

test('owner and legacy projects remain fully accessible',()=>{
  assert.equal(planningAccessLevel('p','tree',{}),'full');
  assert.equal(planningAccessLevel('p','tree',{KarhaSaosaWorkspaceAccess:{p:{role:'owner',permissions:{}}}}),'full');
});

test('planning capabilities keep delete exclusive to full access',()=>{
  assert.equal(canViewPlanning('view'),true);
  assert.equal(canWritePlanning('view'),false);
  assert.equal(canWritePlanning('create'),true);
  assert.equal(canDeletePlanning('create'),false);
  assert.equal(canDeletePlanning('full'),true);
});
