const byProject = new Map();

function bucket(projectId){
  const key = String(projectId || '');
  if(!key) return { seeded: false, ids: new Set() };
  if(!byProject.has(key)) byProject.set(key, { seeded: false, ids: new Set() });
  return byProject.get(key);
}

export function getExpandedIds(projectId){
  return bucket(projectId).ids;
}

export function isExpanded(projectId, itemId){
  return bucket(projectId).ids.has(String(itemId));
}

export function toggleExpanded(projectId, itemId){
  const ids = bucket(projectId).ids;
  const key = String(itemId);
  if(ids.has(key)) ids.delete(key);
  else ids.add(key);
  return ids.has(key);
}

export function seedRootLevel(projectId, items){
  const state = bucket(projectId);
  if(state.seeded) return state.ids;
  (items || []).forEach(item => {
    if(item?.id) state.ids.add(String(item.id));
  });
  state.seeded = true;
  return state.ids;
}

export function expandAll(projectId, items){
  const state = bucket(projectId);
  const walk = nodes => {
    (nodes || []).forEach(node => {
      if(node?.id) state.ids.add(String(node.id));
      walk(node.subtasks);
    });
  };
  walk(items);
  state.seeded = true;
  return state.ids;
}

export function collapseAll(projectId){
  const state = bucket(projectId);
  state.ids.clear();
  state.seeded = true;
  return state.ids;
}

export function resetExpandState(projectId){
  if(projectId == null){
    byProject.clear();
    return;
  }
  byProject.delete(String(projectId));
}
