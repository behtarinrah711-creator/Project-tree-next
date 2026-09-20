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
    lists: [{ id: listId, title: 'کارهای شخصی', createdAt: now(), updatedAt: now(), items: [], archived:false, trashed:false, showCost:false }],
  };
}

export function createNotebookItem(text = ''){
  const t = now();
  return {
    id: id('nbi'),
    text: String(text || ''),
    done: false,
    starred: false,
    starredSelf: false,
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

function setStarredSelf(item,value){
  item.starredSelf=!!value;
  item.starred=!!value;
  for(const child of item.children||[]) setStarredSelf(child,value);
}

export function refreshNotebookStars(items){
  const refresh=item=>{
    const childStarred=(item.children||[]).map(refresh).some(Boolean);
    const self=item.starredSelf===true||(item.starredSelf===undefined&&item.starred===true);
    item.starred=!!(self||childStarred);
    return item.starred;
  };
  (items||[]).forEach(refresh);
  return items;
}

function migrateNotebookStars(items){
  const migrate=item=>{
    if(item.starredSelf===undefined&&item.starred===true)setStarredSelf(item,true);
    else for(const child of item.children||[])migrate(child);
  };
  (items||[]).forEach(migrate);
  return refreshNotebookStars(items);
}

export function toggleNotebookStar(item,parents=[]){
  const next=!item.starred;
  setStarredSelf(item,next);
  const root=parents[0]||item;
  refreshNotebookStars([root]);
  return next;
}

function projectStarredItem(item,{done=null}={}){
  if(item.trashed)return null;
  const children=(item.children||[]).map(child=>projectStarredItem(child,{done})).filter(Boolean);
  const matches=item.starred&&(done===null||item.done===done);
  if(!matches&&!children.length)return null;
  return {...item,children};
}

export function collectStarredFamilies(notebook,{done=false}={}){
  const out=[];
  for(const list of notebook.lists||[]){
    const roots=done?collectCompletedFamilies(list.items||[]):list.items||[];
    for(const item of roots){
      const projected=projectStarredItem(item,{done});
      if(projected)out.push({item:projected,listId:list.id,listTitle:list.title});
    }
  }
  return out;
}

export function activeNotebookChildren(item){
  return (item?.children || []).filter(child => !child.trashed);
}

export function notebookItemCost(item){
  if(!item || item.trashed) return 0;
  const children = activeNotebookChildren(item);
  if(children.some(child => notebookItemCost(child) > 0)){
    return children.reduce((total, child) => total + notebookItemCost(child), 0);
  }
  return Number(item.cost) || 0;
}

export function notebookItemCostLocked(item){
  return activeNotebookChildren(item).some(child => notebookItemCost(child) > 0);
}

export function canCompleteNotebookItem(item){
  const children = activeNotebookChildren(item);
  return children.length === 0 || children.every(child => child.done);
}

export function collectCompleted(items){
  const out = [];
  walkNotebookItems(items || [], (item) => {
    if(item.done && !item.trashed) out.push(item);
  });
  return out;
}

export function collectCompletedFamilies(items){
  const out=[];
  const visit=(item,parentDone=false)=>{
    if(item.trashed)return;
    if(item.done&&!parentDone)out.push(item);
    for(const child of item.children||[])visit(child,parentDone||item.done);
  };
  for(const item of items||[])visit(item);
  return out;
}

export function restoreNotebookFamily(item){
  walkNotebookItems([item],node=>{node.done=false;node.completedAt=null;});
  return item;
}

export function collectTrashed(notebook){
  const out = [];
  for(const list of notebook.lists || []){
    if(list.trashed) out.push({ kind: 'list', list });
    walkNotebookItems(list.items || [], (item, parents) => {
      if(item.trashed && !parents.some(parent => parent.trashed)) out.push({ kind: 'item', item, listId: list.id, listTitle: list.title, parent: parents.at(-1) || null });
    });
  }
  return out;
}

export function sumCost(items){
  return (items || []).reduce((total, item) => total + notebookItemCost(item), 0);
}

export function createNotebookRepository({ storage = localStorageAdapter, storageKey = NOTEBOOK_STORAGE_KEY } = {}){
  let snapshot = null;
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => listener(snapshot));

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
      parsed.lists = parsed.lists.map(list => ({
        ...list,
        archived: false,
        trashed: !!list.trashed,
        showCost: list.showCost === true,
        items: Array.isArray(list.items) ? list.items : [],
      }));
      for(const list of parsed.lists) migrateNotebookStars(list.items);
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
    notify();
    return snapshot;
  }

  function mutate(fn){
    const current = clone(get());
    fn(current);
    current.updatedAt = now();
    snapshot = current;
    persist();
    notify();
    return snapshot;
  }

  function subscribe(listener){
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { load, persist, get, replace, mutate, subscribe, storageKey };
}
