import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore } from '../data/appDataStore.js';
import { wbsApi } from '../domain/wbs/wbsApi.js';
import { mergeTaskSnapshot, writeTaskRecordsNormalized } from './taskCloud.js';
import { mergeTaskRecords } from './taskRecordMerge.js';

for(const stageMode of ['base','none','single','multiple']){
  test(`${stageMode}: append and manual reorder survive ID-ordered cloud refresh`, async () => {
    const store=createAppDataStore();
    store.replaceSnapshot({projects:[{id:'p',settings:{stageMode},tasks:[]}]});
    globalThis.KarhaAppData=store;
    try{
      for(const id of ['z','m','a']) (stageMode === 'base' ? wbsApi.createWorkItem : wbsApi.createStage)('p',id,null,{id});
      const records=store.getProjects()[0].tasks;
      assert.deepEqual(records.map(t=>t.sortOrder),[0,1,2]);
      const uploaded=[];
      await writeTaskRecordsNormalized({cloudMode:true,currentUser:{uid:'u'},DATA_SCHEMA_VERSION:8,
        normalizeTaskRecord:t=>t,taskCollection:()=>({doc:id=>id}),db:{batch:()=>({
          set:(id,record)=>uploaded.push(record),commit:async()=>{}
        })}},'p',records);
      const cloud=[...uploaded].sort((a,b)=>a.id.localeCompare(b.id));
      assert.deepEqual(mergeTaskSnapshot(cloud,[],[],t=>t).map(t=>t.id),['z','m','a']);
      wbsApi.reorder('p',null,['a','z','m'],null,()=>new Date(Date.now() + 60_000));
      const reordered=JSON.parse(JSON.stringify(store.getProjects()[0].tasks));
      assert.deepEqual(mergeTaskSnapshot(cloud,reordered,[],t=>t).map(t=>t.id),['a','z','m']);
    }finally{delete globalThis.KarhaAppData;}
  });
}
test('newer parent retains reordered children without dropping distinct recovered children',()=>{
  const old={id:'root',updatedAt:1,subtasks:[{id:'a'},{id:'b'},{id:'recover'}]};
  const recent={id:'root',updatedAt:2,subtasks:[{id:'b'},{id:'a'}]};
  assert.deepEqual(mergeTaskRecords([[old],[recent]])[0].subtasks.map(t=>t.id),['b','a','recover']);
});
