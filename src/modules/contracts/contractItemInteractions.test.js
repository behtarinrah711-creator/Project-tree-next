import test from 'node:test';
import assert from 'node:assert/strict';
const previousWindow = globalThis.window;
globalThis.window = { location: { hash: '', search: '' } };
const { attachPointerDrag } = await import('./contractItemInteractions.js');
globalThis.window = previousWindow;

for (const nested of [false, true]) {
  test(`drag indicator and reorder for ${nested ? 'clauses' : 'articles'}`, () => {
    const listeners = new Map();
    const previous = globalThis.document;
    globalThis.document = {
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: name => listeners.delete(name)
    };
    try {
      const makeRow = (id, top) => {
        const classes = new Set();
        return {
          dataset: { contractDragId: id },
          classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n) },
          getBoundingClientRect: () => ({ top, height: 100 })
        };
      };
      const rows = [makeRow('a', 0), makeRow('b', 100)];
      const container = { children: rows };
      rows.forEach(row => { row.parentElement = container; });
      const list = [{ id: 'a', children: [] }, { id: 'b', children: [] }];
      const state = { items: nested ? [{ id: 'root', children: list }] : list };
      let renders = 0;
      attachPointerDrag({
        handle: { closest: () => rows[0] }, list, id: 'a', kind: 'real', state,
        onDirty() {}, onRender: () => renders++
      });
      listeners.get('pointermove')({ clientY: 110 });
      assert.ok(rows[1].classList.contains('contract-drag-over-top'));
      listeners.get('pointermove')({ clientY: 250 });
      assert.ok(!rows[1].classList.contains('contract-drag-over-top'));
      assert.ok(rows[1].classList.contains('contract-drag-over-bottom'));
      listeners.get('pointerup')();
      assert.deepEqual(list.map(item => item.id), ['b', 'a']);
      assert.ok(!rows[1].classList.contains('contract-drag-over-bottom'));
      assert.ok(!rows[0].classList.contains('contract-row-dragging'));
      assert.equal(renders, 1);
    } finally {
      globalThis.document = previous;
    }
  });
}
