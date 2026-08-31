import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAppSessionCache, installLogoutSessionGuard } from './logoutSessionGuard.js';

function makeStorage(entries={}){
  const map=new Map(Object.entries(entries));
  return {
    get length(){ return map.size; },
    key(i){ return [...map.keys()][i] ?? null; },
    removeItem(key){ map.delete(key); },
    getItem(key){ return map.get(key) ?? null; },
  };
}

test('clearAppSessionCache removes only Project-tree app keys', ()=>{
  const storage=makeStorage({
    'ptnext-v1:app-data':'projects',
    'ptnext-v1:task-recovery':'tasks',
    'ptnext-v1:user-profile':'profile',
    'other-app-key':'keep',
  });
  assert.equal(clearAppSessionCache(storage),3);
  assert.equal(storage.getItem('ptnext-v1:app-data'),null);
  assert.equal(storage.getItem('ptnext-v1:user-profile'),null);
  assert.equal(storage.getItem('other-app-key'),'keep');
});

test('guard preserves guest cache on initial signed-out startup', ()=>{
  let callback;
  let reloads=0;
  const storage=makeStorage({'ptnext-v1:app-data':'guest'});
  const windowRef={
    firebase:{auth:()=>({currentUser:null,onAuthStateChanged(fn){callback=fn;}})},
    localStorage:storage,
    sessionStorage:{clear(){}},
    location:{reload(){reloads++;}},
  };
  assert.equal(installLogoutSessionGuard({windowRef}),true);
  callback(null);
  assert.equal(storage.getItem('ptnext-v1:app-data'),'guest');
  assert.equal(reloads,0);
});

test('guard clears app cache and reloads on authenticated logout', ()=>{
  let callback;
  let reloads=0;
  const sessionStorage=makeStorage({'ptnext-v1:session':'temp','other-session':'keep'});
  const storage=makeStorage({
    'ptnext-v1:app-data':'account-data',
    'ptnext-v1:task-recovery':'account-tasks',
    'ptnext-v1:status-reports':'reports',
    'other-app-key':'keep',
  });
  const auth={currentUser:{uid:'u1'},onAuthStateChanged(fn){callback=fn;}};
  const windowRef={
    firebase:{auth:()=>auth},
    localStorage:storage,
    sessionStorage,
    location:{reload(){reloads++;}},
  };
  installLogoutSessionGuard({windowRef});
  callback(null);
  assert.equal(storage.getItem('ptnext-v1:app-data'),null);
  assert.equal(storage.getItem('ptnext-v1:task-recovery'),null);
  assert.equal(storage.getItem('ptnext-v1:status-reports'),null);
  assert.equal(storage.getItem('other-app-key'),'keep');
  assert.equal(sessionStorage.getItem('ptnext-v1:session'),null);
  assert.equal(sessionStorage.getItem('other-session'),'keep');
  assert.equal(reloads,1);
});
