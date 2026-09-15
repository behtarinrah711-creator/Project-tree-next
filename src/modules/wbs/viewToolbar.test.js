import test from 'node:test';
import assert from 'node:assert/strict';
import { ganttMenuPosition } from './ganttMenuGeometry.js';

test('Gantt menu stays within the right edge of a mobile viewport', () => {
  assert.deepEqual(
    ganttMenuPosition(
      {left:360, top:100, bottom:138},
      {width:280, height:300},
      {width:412, height:915},
    ),
    {left:124, top:143},
  );
});

test('Gantt menu opens above its trigger when the space below is insufficient', () => {
  assert.deepEqual(
    ganttMenuPosition(
      {left:20, top:700, bottom:738},
      {width:280, height:300},
      {width:412, height:800},
    ),
    {left:20, top:395},
  );
});
