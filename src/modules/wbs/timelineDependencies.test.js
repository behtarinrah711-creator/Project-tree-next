import test from 'node:test';
import assert from 'node:assert/strict';
import { roundedOrthogonalPath } from './timelineDependencies.js';

test('FS connector path uses rounded orthogonal segments and ends at target Start', () => {
  const path = roundedOrthogonalPath(40, 20, 100, 80, 4);
  assert.match(path, /^M 40 20 H /);
  assert.match(path, / Q /);
  assert.match(path, / V /);
  assert.match(path, / H 100$/);
});
