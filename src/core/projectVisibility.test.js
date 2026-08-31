import test from 'node:test';
import assert from 'node:assert/strict';
import { isProjectVisibleForSession, projectsVisibleForSession } from './projectVisibility.js';

const local = { id: 'local', name: 'Local' };
const owned = { id: 'cloud', name: 'Cloud', ownerUid: 'u1' };

test('visibility is unfiltered until session is ready', () => {
  const session = { ready: false, uid: null };
  assert.equal(isProjectVisibleForSession(owned, session), true);
  assert.equal(projectsVisibleForSession([local, owned], session).length, 2);
});

test('guest after auth cannot see ownerUid projects', () => {
  const session = { ready: true, uid: null };
  assert.equal(isProjectVisibleForSession(local, session), true);
  assert.equal(isProjectVisibleForSession(owned, session), false);
  assert.deepEqual(projectsVisibleForSession([local, owned], session).map(p => p.id), ['local']);
});

test('authenticated session still sees every project this phase', () => {
  const session = { ready: true, uid: 'u1' };
  assert.equal(isProjectVisibleForSession(owned, session), true);
  assert.equal(isProjectVisibleForSession(local, session), true);
});
