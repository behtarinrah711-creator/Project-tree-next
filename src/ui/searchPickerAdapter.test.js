import test from 'node:test';
import assert from 'node:assert/strict';
import { openSearchPicker, registerSearchPicker } from './searchPickerAdapter.js';

test('search picker adapter uses the registered service instead of window', () => {
  let seen = null;
  registerSearchPicker({
    open(opts){ seen = opts; return true; },
  });
  assert.equal(openSearchPicker({ title:'X' }), true);
  assert.equal(seen.title, 'X');
  registerSearchPicker({});
});
