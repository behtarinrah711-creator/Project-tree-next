import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderedIds } from './wbsDrag.js';

test('moves a sibling before the target', () => {
  assert.deepEqual(reorderedIds(['a', 'b', 'c'], 'c', 'a', 'before'), ['c', 'a', 'b']);
});

test('moves a sibling after the target', () => {
  assert.deepEqual(reorderedIds(['a', 'b', 'c'], 'a', 'b', 'after'), ['b', 'a', 'c']);
});

test('rejects a missing target and a drop onto itself', () => {
  assert.equal(reorderedIds(['a', 'b'], 'a', 'missing', 'before'), null);
  assert.equal(reorderedIds(['a', 'b'], 'a', 'a', 'before'), null);
});
