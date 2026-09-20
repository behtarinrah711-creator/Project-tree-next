import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectCompleted, collectCompletedFamilies, collectStarred, collectStarredFamilies, collectTrashed, createEmptyNotebook, createNotebookItem,
  canCompleteNotebookItem, createNotebookRepository, findNotebookItem, notebookItemCost,
  notebookItemCostLocked, restoreNotebookFamily, sumCost, toggleNotebookStar, trashCompletedItems, walkNotebookItems,
} from './notebookRepository.js';

function memory(){
  const store = new Map();
  return {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  };
}

test('notebook repository never uses Project.tasks and survives empty overwrite', () => {
  const repo = createNotebookRepository({ storage: memory() });
  const nb = repo.get();
  assert.equal(Array.isArray(nb.lists), true);
  assert.equal('tasks' in nb, false);
  repo.mutate(data => {
    data.lists[0].items.push(createNotebookItem('root'));
  });
  const kept = repo.replace({ version: 1, lists: [] });
  assert.equal(kept.lists[0].items[0].text, 'root');
});

test('notebook repository notifies subscribers after replace and mutate',()=>{
  const repo=createNotebookRepository({storage:memory(),storageKey:'notify'});
  repo.load();let calls=0;
  const unsubscribe=repo.subscribe(()=>calls++);
  repo.mutate(notebook=>{notebook.lists[0].title='تغییر';});
  repo.replace(repo.get());
  unsubscribe();
  repo.mutate(notebook=>{notebook.lists[0].title='بعدی';});
  assert.equal(calls,2);
});

test('recursive tree operations work at 4+ depth', () => {
  const root = createNotebookItem('p');
  let cursor = root;
  for(const label of ['c1','c2','c3','c4']){
    const child = createNotebookItem(label);
    cursor.children.push(child);
    cursor = child;
  }
  cursor.starred = true;
  cursor.done = true;
  cursor.cost = 250;
  const found = findNotebookItem([root], cursor.id);
  assert.equal(found.parents.length, 4);
  assert.equal(found.item.text, 'c4');
  const starred = collectStarred({ lists: [{ id: 'l1', title: 'L', items: [root] }] });
  assert.equal(starred[0].item.text, 'c4');
  assert.equal(collectCompleted([root]).map(i => i.text).join(), 'c4');
  assert.equal(sumCost([root]), 250);
});

test('trashed notebook items stay out of global project trash collections', () => {
  const item = createNotebookItem('gone');
  item.trashed = true;
  item.deletedAt = Date.now();
  const nb = createEmptyNotebook();
  nb.lists[0].items.push(item);
  const trash = collectTrashed(nb);
  assert.equal(trash[0].kind, 'item');
  assert.equal(trash[0].item.text, 'gone');
  let live = 0;
  walkNotebookItems(nb.lists[0].items, node => { if(!node.trashed) live++; });
  assert.equal(live, 0);
});

test('legacy notebook lists gain non-destructive project controls', () => {
  const storage=memory();
  storage.setItem('legacy-notebook',JSON.stringify({version:1,activeListId:'l1',lists:[{id:'l1',title:'قدیمی',items:[]}]}));
  const repo=createNotebookRepository({storage,storageKey:'legacy-notebook'});
  const list=repo.load().lists[0];
  assert.equal(list.archived,false);
  assert.equal(list.trashed,false);
  assert.equal(list.showCost,false);
});

test('legacy parent stars migrate to the whole family',()=>{
  const storage=memory();
  storage.setItem('legacy-stars',JSON.stringify({version:1,activeListId:'l1',lists:[{id:'l1',title:'قدیمی',items:[{id:'p',text:'والد',starred:true,children:[{id:'c',text:'فرزند',starred:false,children:[]}]}]}]}));
  const repo=createNotebookRepository({storage,storageKey:'legacy-stars'});
  const parent=repo.load().lists[0].items[0];
  assert.equal(parent.starred,true);
  assert.equal(parent.children[0].starred,true);
});

test('parent cost rolls up descendants without double counting manual parent cost',()=>{
  const parent=createNotebookItem('parent');parent.cost=900;
  const first=createNotebookItem('first');first.cost=200;
  const second=createNotebookItem('second');second.cost=300;
  parent.children.push(first,second);
  assert.equal(notebookItemCost(parent),500);
  assert.equal(sumCost([parent]),500);
  assert.equal(notebookItemCostLocked(parent),true);
  first.cost=0;second.cost=null;
  assert.equal(notebookItemCost(parent),900);
  assert.equal(notebookItemCostLocked(parent),false);
});

test('a parent can complete only after every active child is complete',()=>{
  const parent=createNotebookItem('parent');
  const child=createNotebookItem('child');parent.children.push(child);
  assert.equal(canCompleteNotebookItem(parent),false);
  child.done=true;
  assert.equal(canCompleteNotebookItem(parent),true);
  child.trashed=true;
  assert.equal(canCompleteNotebookItem(parent),true);
});

test('starring a parent stars its whole family',()=>{
  const parent=createNotebookItem('parent');
  const first=createNotebookItem('first'),second=createNotebookItem('second');
  parent.children.push(first,second);
  toggleNotebookStar(parent);
  assert.equal(parent.starred,true);
  assert.equal(first.starred,true);
  assert.equal(second.starred,true);
});

test('starring a child includes its ancestors but not its siblings',()=>{
  const parent=createNotebookItem('parent');
  const first=createNotebookItem('first'),second=createNotebookItem('second');
  parent.children.push(first,second);
  toggleNotebookStar(first,[parent]);
  assert.equal(parent.starred,true);
  assert.equal(first.starred,true);
  assert.equal(second.starred,false);
  const notebook={lists:[{id:'l1',title:'دفتر',items:[parent]}]};
  const [family]=collectStarredFamilies(notebook);
  assert.equal(family.item.text,'parent');
  assert.deepEqual(family.item.children.map(item=>item.text),['first']);
  toggleNotebookStar(parent);
  assert.equal(parent.starredSelf,true);
  assert.equal(first.starred,true);
  assert.equal(second.starred,true);
});

test('completed parent and children are one restorable family',()=>{
  const parent=createNotebookItem('parent');
  const first=createNotebookItem('first'),second=createNotebookItem('second');
  parent.children.push(first,second);
  first.done=true;second.done=true;
  assert.deepEqual(collectCompletedFamilies([parent]).map(item=>item.text),['first','second']);
  parent.done=true;
  assert.deepEqual(collectCompletedFamilies([parent]).map(item=>item.text),['parent']);
  restoreNotebookFamily(parent);
  assert.equal(parent.done,false);
  assert.equal(first.done,false);
  assert.equal(second.done,false);
});

test('completed starred families retain hierarchy',()=>{
  const parent=createNotebookItem('parent'),child=createNotebookItem('child');
  parent.children.push(child);
  toggleNotebookStar(parent);
  parent.done=true;child.done=true;
  const notebook={lists:[{id:'l1',title:'دفتر',items:[parent]}]};
  const [family]=collectStarredFamilies(notebook,{done:true});
  assert.equal(family.item.text,'parent');
  assert.deepEqual(family.item.children.map(item=>item.text),['child']);
});

test('completed cleanup trashes whole families and can be limited to starred items',()=>{
  const parent=createNotebookItem('parent'),child=createNotebookItem('child');
  const other=createNotebookItem('other');
  parent.children.push(child);
  parent.done=true;child.done=true;other.done=true;
  toggleNotebookStar(parent);
  assert.equal(trashCompletedItems([parent,other],{starredOnly:true,timestamp:123}),1);
  assert.equal(parent.trashed,true);
  assert.equal(child.trashed,true);
  assert.equal(other.trashed,false);
  assert.equal(trashCompletedItems([parent,other],{timestamp:456}),1);
  assert.equal(other.trashed,true);
  assert.equal(other.deletedAt,456);
});
