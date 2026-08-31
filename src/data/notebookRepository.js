import { localStorageAdapter } from './storageAdapter.js';
import { STORAGE_KEYS } from '../config/deploymentConfig.js';

export const NOTEBOOK_STORAGE_KEY = STORAGE_KEYS.notebook;

function now(){ return Date.now(); }
function id(prefix){ return `${prefix}-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

export function createEmptyNotebook(){
  const listId = id('nbl');
  return {
    version: 1,
    activeListId: listId,
    lists: [{ id: listId, title: 'کارهای شخصی', createdAt: now(), updatedAt: now(), items: [] }],
  };
}

export function createNotebookItem(text = ''){
  const t = now();
  return {
    id: id('nbi'),
    text: String(text || ''),
    done: false,
    starred: false,
    cost: null,
    children: [],
    createdAt: t,
    updatedAt: t,
    trashed: false,
    deletedAt: null,
    expanded: true,
  };
}

function clone(value){
  return JSON.parse(JSON.stringify(value));
}

export function walkNotebookItems(items, visit, parents = []){
  for(const item of items || []){
    visit(item, parents);
    if(item.children?.length) walkNotebookItems(item.children, visit, parents.concat(item));
  }
}

export function findNotebookItem(items, itemId, parents = []){
  for(const item of items || []){
    if(item.id === itemId) return { item, parent: parents[parents.length - 1] || null, siblings: items, parents };
    const nested = findNotebookItem(item.children || [], itemId, parents.concat(item));
    if(nested) return nested;
  }
  return null;
}

export function collectStarred(notebook){
  const out = [];
  for(const list of notebook.lists || []){
    walkNotebookItems(list.items || [], (item, parents) => {
      if(item.starred && !item.trashed){
        out.push({
          item,
          listId: list.id,
          listTitle: list.title,
          parentText: parents.length ? parents[parents.length - 1].text : null,
        });
      }
    });
  }
  return out;
}

export function collectCompleted(items){
  const out = [];
  walkNotebookItems(items || [], (item) => {
    if(item.done && !item.trashed) out.push(item);
  });
  return out;
}

export function collectTrashed(notebook){
  const out = [];
  for(const list of notebook.lists || []){
    if(list.trashed) out.push({ kind: 'list', list });
    walkNotebookItems(list.items || [], (item, parents) => {
      if(item.trashed) out.push({ kind: 'item', item, listId: list.id, listTitle: list.title, parent: parents.at(-1) || null });
    });
  }
  return out;
}

export function sumCost(items){
  let total = 0;
  walkNotebookItems(items || [], item => {
    if(!item.trashed && item.cost != null && item.cost !== '') total += Number(item.cost) || 0;
  });
  return total;
}

export function createNotebookRepository({ storage = localStorageAdapter, storageKey = NOTEBOOK_STORAGE_KEY } = {}){
  let snapshot = null;

  function load(){
    try{
      const raw = storage.getItem(storageKey);
      if(!raw){
        snapshot = createEmptyNotebook();
        return snapshot;
      }
      const parsed = JSON.parse(raw);
      if(!parsed || !Array.isArray(parsed.lists) || parsed.lists.length === 0){
        if(snapshot?.lists?.length) return snapshot;
        snapshot = createEmptyNotebook();
        return snapshot;
      }
      snapshot = parsed;
      return snapshot;
    }catch{
      snapshot = snapshot || createEmptyNotebook();
      return snapshot;
    }
  }

  function persist(){
    if(!snapshot) load();
    storage.setItem(storageKey, JSON.stringify(snapshot));
    return snapshot;
  }

  function get(){
    return snapshot || load();
  }

  function replace(next){
    if(!next || !Array.isArray(next.lists)) return get();
    if(snapshot?.lists?.length && next.lists.length === 0) return snapshot;
    snapshot = next;
    persist();
    return snapshot;
  }

  function mutate(fn){
    const current = clone(get());
    fn(current);
    current.updatedAt = now();
    snapshot = current;
    persist();
    return snapshot;
  }

  return { load, persist, get, replace, mutate, storageKey };
}
