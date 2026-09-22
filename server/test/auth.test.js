import test from 'node:test';
import assert from 'node:assert/strict';
import {bearerToken, constantTimeEqual, hashToken} from '../src/auth.js';

test('extracts a bearer token', () => {
  assert.equal(bearerToken({headers:{authorization:'Bearer abc123'}}), 'abc123');
  assert.equal(bearerToken({headers:{}}), null);
});

test('token hashing is deterministic and secret-dependent', () => {
  assert.equal(hashToken('token', 'secret'), hashToken('token', 'secret'));
  assert.notEqual(hashToken('token', 'secret'), hashToken('token', 'different'));
});

test('constant-time comparison keeps value semantics', () => {
  assert.equal(constantTimeEqual('123456', '123456'), true);
  assert.equal(constantTimeEqual('123456', '123457'), false);
  assert.equal(constantTimeEqual('1', 'longer'), false);
});
