const config = {
  title:true,
  dates:true,
  actualProgress:true,
  plannedProgress:true,
  dependencies:false,
  float:false,
  criticalPath:false,
};

const levels = new Map();
let orderMode = 'date';

function levelKey(entry){
  if(entry.kind === 'workTask') return 'workTask';
  if(entry.kind === 'work' || entry.kind === 'stage'){
    const depth = entry.sourceDepth ?? entry.depth;
    return depth === 0 ? 'package' : `stage:${depth}`;
  }
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
    maxStageDepth = Math.max(maxStageDepth, depth);
    visit(node.subtasks || [], depth + 1);
  });
  visit(items || [], 0);
  const options = [{ key:'package', label:'مرحله ۱' }];
  for(let depth = 1; depth <= maxStageDepth; depth += 1) options.push({ key:`stage:${depth}`, label:`مرحله ${new Intl.NumberFormat('fa-IR').format(depth + 1)}` });
  options.push({ key:'workTask', label:'کارها' });
  options.forEach(option => { if(!levels.has(option.key)) levels.set(option.key, true); });
  return options;
}

export function isGanttLevelVisible(entry){
  const key = levelKey(entry);
  return key ? levels.get(key) !== false : true;
}

export function setGanttLevelVisible(key, value){ levels.set(String(key), Boolean(value)); }

export function ganttLevelState(){ return new Map(levels); }

export function ganttOrderMode(){ return orderMode; }

export function setGanttOrderMode(value){
  if(value !== 'date' && value !== 'wbs') return false;
  orderMode = value;
  return true;
}
