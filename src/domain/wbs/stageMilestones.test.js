import test from 'node:test';
import assert from 'node:assert/strict';
import {milestoneStageForWork,stageMilestones,updateWorkMilestoneLinks} from './stageMilestones.js';

test('work links update only their own associations in the root stage',()=>{
  const stage={id:'suite',kind:'stage',subtasks:[{id:'floor',kind:'stage',subtasks:[{id:'split',kind:'work'}]}],milestones:[
    {id:'handover',predecessorIds:['electric']},{id:'test',predecessorIds:['split']},
  ]};
  assert.equal(milestoneStageForWork({tasks:[stage]},'split'),stage);
  assert.equal(milestoneStageForWork({tasks:[stage]},'unrelated'),null);
  const updated=updateWorkMilestoneLinks(stage,'split',['handover']);
  assert.deepEqual(updated.map(point=>point.predecessorIds),[['electric','split'],[]]);
  assert.deepEqual(stageMilestones(stage).map(point=>point.predecessorIds),[['electric'],['split']]);
  assert.equal(updateWorkMilestoneLinks({...stage,milestones:updated},'split',['handover']),null);
});
