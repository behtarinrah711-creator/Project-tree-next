import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSearchPicker } from '../../ui/searchPickerAdapter.js';
import { getProjectRouteSurface } from '../../core/projectRouteSurface.js';

test('project form reuses flat pickers, clears the previous city and saves through the project repository', async () => {
  class Node {
    constructor(tag){ this.tag=tag; this.children=[]; this.attrs={}; }
    append(...children){ this.children.push(...children); }
    appendChild(child){ this.children.push(child); }
    replaceChildren(...children){ this.children=children; }
    setAttribute(key,value){ this.attrs[key]=value; }
  }
  const ids = new Map(['projectDetailsPageBody','closeProjectDetailsPage','saveProjectDetails'].map(id => [id,new Node('div')]));
  let projects = [{ id:'p1', name:'پروژه', contractProjectCode:'A7B', settings:{ stageMode:'base' }, contacts:[{ id:'c1', firstName:'کارفرما' }] }];
  globalThis.window = { location:{ hash:'', search:'' },
    KarhaAppData:{ getProjects:() => projects, setProjects:next => { projects=next; }, persistLocal:() => true },
    KarhaSaosaWorkspaceAccess:{ p1:{ role:'owner' } },
  };
  globalThis.document = { getElementById:id => ids.get(id), createElement:tag => new Node(tag) };
  let picker;
  registerSearchPicker({ open:options => { picker=options; } });
  try {
    const { default:module } = await import('./projectDetailsModule.js');
    module.mount({ projectId:'p1' });
    const fields = () => ids.get('projectDetailsPageBody').children[0].children;
    const find = label => fields().find(field => field.attrs['aria-label'] === label);
    const identifier = fields()[1].children[1];
    assert.equal(identifier.readOnly, true);
    assert.equal(identifier.value,'A7B');
    assert.equal(find('انتخاب شهر').disabled, true);
    find('انتخاب استان').onclick();
    assert.equal(picker.showAdd, false);
    assert.equal(picker.showStar, false);
    assert.equal(picker.preserveOrder, true);
    picker.onSelect(picker.items.find(item => item.name === 'فارس'));
    find('انتخاب شهر').onclick();
    picker.onSelect(picker.items.find(item => item.name === 'شیراز'));
    find('انتخاب استان').onclick();
    picker.onSelect(picker.items.find(item => item.name === 'تهران'));
    assert.equal(find('انتخاب شهر').children[1].textContent,'انتخاب');
    find('انتخاب نوع پروژه').onclick();
    assert.equal(picker.items.length,10);
    picker.onSelect(picker.items[0]);
    const input = fields()[0].children[1]; input.value='پروژه جدید'; input.oninput();
    // Save remains on the form when blank, with a useful validation error.
    input.value=' '; input.oninput();
    ids.get('saveProjectDetails').onclick();
    assert.equal(projects[0].name,'پروژه');
    assert.match(fields().at(-1).textContent,/نام پروژه/);
    assert.deepEqual(getProjectRouteSurface('project-details'),{ pageId:'projectDetailsPage',footer:'Settings',subpage:'projectDetails' });
    input.value='پروژه جدید'; input.oninput();
    ids.get('saveProjectDetails').onclick();
    assert.equal(projects[0].name,'پروژه جدید');
    assert.equal(projects[0].contractProjectCode,'A7B');
    assert.equal(projects[0].settings.stageMode,'base');
    assert.equal(projects[0].settings.projectDetails.cityId,'');
    window.KarhaSaosaWorkspaceAccess.p1.role='member';
    module.mount({ projectId:'p1' });
    assert.equal(ids.get('saveProjectDetails').hidden,true);
    assert.equal(find('انتخاب استان').disabled,true);
  } finally {
    registerSearchPicker({}); delete globalThis.window; delete globalThis.document;
  }
});
