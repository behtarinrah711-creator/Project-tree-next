const config = {
  title:true,
  dates:true,
  actualProgress:true,
  plannedProgress:true,
  dependencies:true,
  float:false,
  criticalPath:false,
};

const levels = new Map();

function levelKey(entry){
  if(entry.kind === 'workTask') return 'workTask';
  if(entry.kind === 'work') return 'work';
  if(entry.kind === 'stage') return entry.depth === 0 ? 'package' : `stage:${entry.depth}`;
  return null;
}

export function ganttConfig(){ return { ...config }; }

export function setGanttConfig(key, value){
  if(!(key in config)) return false;
  config[key] = Boolean(value);
  return true;
}

export function ganttLevelOptions(items){
  let maxStageDepth = 0;
  const visit = (nodes, depth = 0) => (nodes || []).filter(node => node && !node.trashed).forEach(node => {
    const isStage = node.kind === 'stage' || node.type === 'stage' || node.nodeType === 'stage' || Array.isArray(node.subtasks);
    if(isStage){
      maxStageDepth = Math.max(maxStageDepth, depth);
      visit(node.subtasks || [], depth + 1);
    }
  });
  visit(items || [], 0);
  const options = [{ key:'package', label:'بسته های کاری' }];
  for(let depth = 1; depth <= maxStageDepth; depth += 1) options.push({ key:`stage:${depth}`, label:`مرحله ${depth}` });
  options.push({ key:'work', label:'کارها' }, { key:'workTask', label:'خرده کارها' });
  options.forEach(option => { if(!levels.has(option.key)) levels.set(option.key, true); });
  return options;
}

export function isGanttLevelVisible(entry){
  const key = levelKey(entry);
  return key ? levels.get(key) !== false : true;
}

export function setGanttLevelVisible(key, value){ levels.set(String(key), Boolean(value)); }

export function ganttLevelState(){ return new Map(levels); }
