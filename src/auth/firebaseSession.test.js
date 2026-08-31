import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseSession} from './firebaseSession.js';

const documentRef={getElementById(){return null;}};
test('auth transition installs authenticated and guest sessions',async()=>{
  let observer,authenticated=0,guests=0;
  const auth={onAuthStateChanged(fn){observer=fn;return()=>{};},signOut(){return Promise.resolve();}};
  const runtime=createFirebaseSession({auth,documentRef,windowRef:{addEventListener(){},removeEventListener(){}},
    onAuthenticated(){authenticated++;},onGuest(){guests++;}});
  await observer({uid:'u1',email:'Owner@Example.com'});
  assert.equal(runtime.currentUser.uid,'u1');assert.equal(runtime.cloudMode,true);assert.equal(authenticated,1);
  await observer(null);assert.equal(runtime.currentUser,null);assert.equal(runtime.cloudMode,false);assert.equal(guests,1);
});
