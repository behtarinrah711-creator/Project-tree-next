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

export function seedCollapsed(projectId){
  const state = bucket(projectId);
  if(state.seeded) return state.ids;
  state.seeded = true;
  return state.ids;
}

export function advanceExpansionLevel(projectId, items){
  const state = bucket(projectId);
  const levels = [];
  const walk = (nodes, depth = 0) => {
    (nodes || []).filter(node => node && !node.trashed).forEach(node => {
      const children = (node.subtasks || []).filter(child => child && !child.trashed);
      if(children.length){
        if(!levels[depth]) levels[depth] = [];
        levels[depth].push(String(node.id));
        walk(children, depth + 1);
      }
    });
  };
  walk(items);
  const expandableIds = levels.flat();
  if(!expandableIds.length || expandableIds.every(id => state.ids.has(id))){
    state.ids.clear();
    state.seeded = true;
    return { collapsed:true, visibleDepth:0 };
  }
  const nextDepth = levels.findIndex(ids => ids.some(id => !state.ids.has(id)));
  for(let depth = 0; depth <= nextDepth; depth += 1){
    (levels[depth] || []).forEach(id => state.ids.add(id));
  }
  state.seeded = true;
  return { collapsed:false, visibleDepth:nextDepth + 1 };
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
