import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirestoreCollections} from './firestoreCollections.js';

test('Firestore adapters preserve every project path',()=>{
  const path={collection:name=>({path:name,doc(id){return {path:`${name}/${id}`,collection(child){return {path:`${name}/${id}/${child}`};}};}})};
  const adapter=createFirestoreCollections(path);
  assert.equal(adapter.project('p1').path,'projects/p1');
  assert.equal(adapter.tasks('p1').path,'projects/p1/tasks');
  assert.equal(adapter.purchases('p1').path,'projects/p1/purchases');
  assert.equal(adapter.estimates('p1').path,'projects/p1/estimates');
  assert.equal(adapter.taskReports('p1').path,'projects/p1/taskReports');
});
