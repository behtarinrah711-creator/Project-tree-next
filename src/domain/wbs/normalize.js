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
  if(statusOf(item) === 'completed') return 100;
  const n = Number(item?.progress);
  if(!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
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
  return isStage(parent) && (childKind === KIND_STAGE || childKind === KIND_WORK);
}

export function normalizeItem(item){
  if(!item || typeof item !== 'object') return item;
  const kind = itemKind(item);
  const ids = activityIdsOf(item);
  const status = statusOf(item);
  const done = status === 'completed';
  return {
    ...item,
    kind,
    text: item.text || item.title || item.name || '',
    activities: ids,
    activityIds: ids,
    status,
    done,
    progress: progressOf(item),
    quantity: quantityOf(item),
    unit: item.unit || '',
    unitCost: unitCostOf(item),
    type: kind === KIND_WORK ? (item.type || '') : '',
    priority: item.priority || '',
    description: item.description || '',
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
