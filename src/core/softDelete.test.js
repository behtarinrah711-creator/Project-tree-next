import test from 'node:test';
import assert from 'node:assert/strict';
import { installSoftDelete } from './softDelete.js';

function element(){
  const classes = new Set(['hidden']);
  return {
    classList: {
      add(name){ classes.add(name); },
      remove(name){ classes.delete(name); },
      contains(name){ return classes.has(name); },
    },
    setAttribute(){},
    style:{},
    offsetWidth:0,
  };
}

test('confirmed delete mode finalizes immediately without opening undo toast', () => {
  const undoToast = element();
  const elements = {
    undoToast,
    undoToastText:element(),
    undoToastBar:element(),
    undoToastBtn:element(),
  };
  const trashed = [];
  const windowRef = {
    document:{ getElementById(id){ return elements[id] || null; } },
    KarhaApp:{ taskApi:{ trash(projectId, taskId){ trashed.push([projectId, taskId]); return true; } } },
  };
  const api = installSoftDelete({ windowRef });

  assert.equal(api.softDelete('task', 'p1', 't1', null, 'حذف شد', { undo:false }), true);
  assert.deepEqual(trashed, [['p1', 't1']]);
  assert.equal(api.getPendingDelete(), null);
  assert.equal(undoToast.classList.contains('hidden'), true);
});
