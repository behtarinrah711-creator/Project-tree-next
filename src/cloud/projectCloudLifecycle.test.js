import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectCloudLifecycle} from './projectCloudLifecycle.js';

test('remote permanent delete tears down listeners and acknowledges canonical pending state',async()=>{
  const calls=[];
  const empty={empty:true,docs:[]};
  const ref={collection:name=>({limit:()=>({get:async()=>empty})}),delete:async()=>calls.push('delete')};
  const lifecycle=createProjectCloudLifecycle({collections:{project:()=>ref},db:{batch(){}},
    getSession:()=>({cloudMode:true,currentUser:{uid:'u1'}}),taskListeners:{stop:id=>calls.push(`stop:${id}`)},
    appDataStore:{markCloudWritePending:id=>calls.push(`pending:${id}`),clearCloudWritePending:id=>calls.push(`ack:${id}`)}});
  await lifecycle.permanentlyDelete({id:'p1',ownerUid:'u1'});
  assert.deepEqual(calls,['stop:p1','pending:p1','delete','ack:p1']);
});
