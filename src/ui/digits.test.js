import test from 'node:test';
import assert from 'node:assert/strict';
import { toPersianDigits,toEnglishDigits,formatCost,formatCostDisplay } from './digits.js';

test('canonical formatting preserves foundation outputs',()=>{
  assert.equal(toPersianDigits('123'),'۱۲۳');
  assert.equal(toEnglishDigits('۱۲۳'),'123');
  assert.equal(formatCost(1234567),'۱,۲۳۴,۵۶۷');
  assert.equal(formatCost('bad'),'۰');
  assert.equal(formatCostDisplay(-1234),'۱,۲۳۴ تومان');
  assert.equal(formatCostDisplay(null),'');
});
