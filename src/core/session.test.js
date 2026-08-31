import test from 'node:test';
import assert from 'node:assert/strict';
import { getSession, installSessionObserver, resetSessionObservation } from './session.js';

test('session is not ready before the first auth emission', () => {
  resetSessionObservation();
  assert.deepEqual(getSession({ firebase: { auth: () => ({ currentUser: null }) } }), {
    ready: false,
    uid: null,
  });
});

test('session observer records uid without deciding cloud behavior', () => {
  resetSessionObservation();
  let callback;
  const windowRef = {
    firebase: {
      auth: () => ({
        currentUser: { uid: 'u1' },
        onAuthStateChanged(fn){ callback = fn; },
      }),
    },
  };
  assert.equal(installSessionObserver({ windowRef }), true);
  assert.equal(installSessionObserver({ windowRef }), false);
  callback({ uid: 'u1' });
  assert.deepEqual(getSession(), { ready: true, uid: 'u1' });
  callback(null);
  assert.deepEqual(getSession(), { ready: true, uid: null });
});
