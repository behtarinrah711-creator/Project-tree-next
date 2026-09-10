export const KIND_STAGE = 'stage';
export const KIND_WORK = 'work';

export const WORK_TYPES = ['اجرا', 'خرید', 'نیروی کار', 'پیمانکار', 'کرایه', 'خدمات', 'پیگیری'];
export const UNITS = ['متر', 'مترمربع', 'مترمکعب', 'کیلوگرم', 'تن', 'عدد', 'دستگاه', 'ست', 'ساعت', 'روز', 'ماه'];

export function itemKind(item){
  return item && item.kind === KIND_STAGE ? KIND_STAGE : KIND_WORK;
}

export function isStage(item){
  return itemKind(item) === KIND_STAGE;
}

export function isWork(item){
  return itemKind(item) === KIND_WORK;
}

export function activityIdsOf(item){
  const raw = item?.activityIds || item?.activities || [];
  const seen = new Set();
  const out = [];
  (Array.isArray(raw) ? raw : []).forEach(id => {
    const key = String(id || '').trim();
    if(!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out;
}

export function statusOf(item){
  if(item?.status === 'in_progress' || item?.status === 'در حال انجام') return 'in_progress';
  if(item?.status === 'completed' || item?.status === 'انجام‌شده' || item?.done) return 'completed';
  return 'not_started';
}

export function progressOf(item){
  const tasks = (Array.isArray(item?.workTasks) ? item.workTasks : []).filter(task => task && !task.trashed);
  if(itemKind(item) === KIND_WORK && tasks.length){
    const total = tasks.reduce((sum, task) => {
      const weight = Number(task.weight);
      return sum + (Number.isFinite(weight) && weight > 0 ? weight : 1);
    }, 0);
    const weighted = tasks.reduce((sum, task) => {
      const weight = Number(task.weight);
      const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 1;
      const rawProgress = task.completed || task.done ? 100 : Number(task.progress);
      const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;
      return sum + progress * safeWeight;
    }, 0);
    return total ? Math.round(weighted / total) : 0;
  }
  if(statusOf(item) === 'completed') return 100;
  const n = Number(item?.progress);
  if(!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function progressWeightOf(item){
  const n = Number(item?.progressWeight);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function scheduleStartOf(item){
  return /^\d{4}\/\d{2}\/\d{2}$/.test(String(item?.scheduleStart || '')) ? item.scheduleStart : '';
}

export function scheduleEndOf(item){
  return /^\d{4}\/\d{2}\/\d{2}$/.test(String(item?.scheduleEnd || '')) ? item.scheduleEnd : '';
}

export function quantityOf(item){
  const n = Number(item?.quantity);
  return Number.isFinite(n) ? n : 0;
}

export function unitCostOf(item){
  const n = Number(item?.unitCost);
  if(Number.isFinite(n)) return n;
  const legacy = Number(item?.cost);
  return Number.isFinite(legacy) ? legacy : 0;
}

export function lineTotal(item){
  if(!isWork(item) || item?.trashed) return 0;
  const tasks = (Array.isArray(item?.workTasks) ? item.workTasks : []).filter(task => task && !task.trashed);
  if(tasks.length) return tasks.reduce((sum, task) => {
    const amount = Number(task.amount ?? task.cost);
    return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
  }, 0);
  return quantityOf(item) * unitCostOf(item);
}

export function walkTree(items, fn, parent = null, depth = 0, rootId = null){
  (items || []).forEach(item => {
    if(!item) return;
    const root = rootId || item.id;
    fn(item, parent, depth, root);
    walkTree(item.subtasks, fn, item, depth + 1, root);
  });
}

export function findInTree(items, id){
  let found = null;
  let parent = null;
  let rootId = null;
  walkTree(items, (item, p, _d, root) => {
    if(String(item.id) === String(id)){
      found = item;
      parent = p;
      rootId = root;
    }
  });
  return found ? { item: found, parent, rootId } : null;
}

export function canAcceptChild(parent, childKind){
  if(!parent) return childKind === KIND_STAGE || childKind === KIND_WORK;
  if(!isStage(parent) || (childKind !== KIND_STAGE && childKind !== KIND_WORK)) return false;
  const existingKinds = new Set((parent.subtasks || [])
    .filter(child => child && !child.trashed)
    .map(itemKind));
  return existingKinds.size === 0 || (existingKinds.size === 1 && existingKinds.has(childKind));
}

export function normalizeItem(item){
  if(!item || typeof item !== 'object') return item;
  const kind = itemKind(item);
  const ids = activityIdsOf(item);
  const progress = progressOf(item);
  const hasTasks = kind === KIND_WORK && (item.workTasks || []).some(task => task && !task.trashed);
  const status = hasTasks ? (progress === 100 ? 'completed' : (progress > 0 ? 'in_progress' : 'not_started')) : statusOf(item);
  const done = hasTasks ? progress === 100 : status === 'completed';
  return {
    ...item,
    kind,
    text: item.text || item.title || item.name || '',
    activities: ids,
    activityIds: ids,
    status,
    done,
    progress,
    progressWeight: progressWeightOf(item),
    quantity: quantityOf(item),
    unit: item.unit || '',
    unitCost: unitCostOf(item),
    type: kind === KIND_WORK ? (item.type || '') : '',
    priority: item.priority || '',
    description: item.description || '',
    scheduleStart: kind === KIND_WORK ? scheduleStartOf(item) : '',
    scheduleEnd: kind === KIND_WORK ? scheduleEndOf(item) : '',
    assigneeContactId:kind === KIND_WORK ? String(item.assigneeContactId || '') : '',
    contractorContactId:kind === KIND_WORK ? String(item.contractorContactId || '') : '',
    completionState:kind === KIND_WORK ? (item.completionState || (done ? 'approved' : 'incomplete')) : '',
    workflowStatus:kind === KIND_WORK ? (item.workflowStatus || status) : '',
    executionReports:kind === KIND_WORK && Array.isArray(item.executionReports) ? item.executionReports.map(report => ({ ...report })) : [],
    executionComments:kind === KIND_WORK && Array.isArray(item.executionComments) ? item.executionComments.map(comment => ({ ...comment })) : [],
    executionHistory:kind === KIND_WORK && Array.isArray(item.executionHistory) ? item.executionHistory.map(entry => ({ ...entry })) : [],
    workTasks:kind === KIND_WORK && Array.isArray(item.workTasks) ? item.workTasks.map(task => ({ ...task })) : [],
    predecessorIds:kind === KIND_WORK && Array.isArray(item.predecessorIds) ? [...new Set(item.predecessorIds.map(String).filter(Boolean))] : [],
    subtasks: Array.isArray(item.subtasks) ? item.subtasks.map(normalizeItem) : [],
  };
}

function toPersianDigits(value){
  return String(value).replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

export function wbsCodeMap(items){
  const codes = new Map();
  let stageIndex = 0;
  const visit = (nodes, prefix) => {
    let local = 0;
    (nodes || []).forEach(node => {
      if(node?.trashed) return;
      if(isStage(node)){
        local += 1;
        const rawCode = prefix ? `${prefix}.${local}` : String(++stageIndex);
        codes.set(String(node.id), `${toPersianDigits(rawCode)} -`);
        visit(node.subtasks, rawCode);
      }else{
        visit(node.subtasks, prefix);
      }
    });
  };
  visit(items, '');
  return codes;
}
