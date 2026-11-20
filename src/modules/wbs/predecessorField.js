import { openNumpadGeneric } from '../../ui/numpad.js';
import { flattenDependencyCandidates, validatePredecessors } from '../../domain/wbs/scheduling.js';
import { openExecutionBranchFilter, selectableWbsTree } from './executionBranchFilter.js';

const RELATION_TYPES = Object.freeze(['FS','SS','FF']);

function label(row){
  const kind = row.kind === 'stage' ? 'بسته' : (row.kind === 'workTask' ? 'Task' : 'Work');
  const path = row.parentPath.join(' ← ');
  return path ? `${kind} — ${row.title} (${path})` : `${kind} — ${row.title}`;
}

function normalizeRelations(initial){
  return (Array.isArray(initial) ? initial : []).map(value => {
    if(value && typeof value === 'object'){
      return {
        predecessorId:String(value.predecessorId || value.id || ''),
        type:RELATION_TYPES.includes(value.type) ? value.type : 'FS',
        lagDays:Number.isFinite(Number(value.lagDays)) ? Number(value.lagDays) : 0,
      };
    }
    return { predecessorId:String(value || ''), type:'FS', lagDays:0 };
  }).filter(row => row.predecessorId);
}

export function validInitialRelations(initial, candidates = []){
  const candidateIds = new Set(candidates.map(row => String(row.id)));
  return normalizeRelations(initial).filter(row => candidateIds.has(row.predecessorId));
}

export function predecessorField({ documentRef = document, project, consumerId, initial = [], onChange = () => {} } = {}){
  const root = documentRef.createElement('div'); root.className = 'wbs-field wbs-predecessor-field';
  const caption = documentRef.createElement('span'); caption.className = 'wbs-field-label'; caption.textContent = 'پیش‌نیاز';
  const candidates = flattenDependencyCandidates(project?.tasks || []).filter(row => row.id !== String(consumerId));
  const relations = new Map(validInitialRelations(initial, candidates).map(row => [row.predecessorId, row]));
  const chips = documentRef.createElement('div'); chips.className = 'wbs-predecessor-list';
  const add = documentRef.createElement('button'); add.type = 'button'; add.className = 'wbs-choice'; add.textContent = '+ افزودن پیش‌نیاز';

  const paint = () => {
    chips.replaceChildren();
    [...relations.values()].forEach(relation => {
      const row = candidates.find(item => item.id === relation.predecessorId); if(!row) return;
      const chip = documentRef.createElement('div'); chip.className = 'wbs-activity-row wbs-predecessor-row';

      const text = documentRef.createElement('span');
      text.className = 'wbs-predecessor-name';
      text.textContent = label(row);

      const type = documentRef.createElement('select');
      type.className = 'wbs-predecessor-type';
      RELATION_TYPES.forEach(value => {
        const option = documentRef.createElement('option');
        option.value = value; option.textContent = value;
        type.appendChild(option);
      });
      type.value = relation.type;
      type.setAttribute('aria-label', 'نوع رابطه');
      type.addEventListener('change', () => { relation.type = type.value; onChange(); });

      const lag = documentRef.createElement('span');
      lag.className='wbs-predecessor-lag';
      const sign=documentRef.createElement('button');sign.type='button';
      sign.setAttribute('aria-label','تغییر علامت فاصلهٔ زمانی');
      const value=documentRef.createElement('button');value.type='button';value.className='wbs-input';
      value.setAttribute('aria-label','Lag روز');
      let negative=relation.lagDays<0;
      const draw=()=>{
        sign.textContent=negative?'−':'+';
        value.textContent=new Intl.NumberFormat('fa-IR').format(Math.abs(relation.lagDays))+' روز';
      };
      sign.onclick=()=>{
        negative=!negative;
        relation.lagDays=negative?-Math.abs(relation.lagDays):Math.abs(relation.lagDays);
        draw();onChange();
      };
      value.onclick=()=>openNumpadGeneric('',raw=>{
        if(raw==='')return;
        relation.lagDays=(negative?-1:1)*Number(raw);
        draw();onChange();
      },{suffix:' روز',group:false,maxLen:5});
      draw();
      lag.append(sign,value);

      const remove = documentRef.createElement('button');
      remove.type = 'button'; remove.className = 'wbs-activity-remove'; remove.textContent = 'حذف';
      remove.addEventListener('click', () => { relations.delete(relation.predecessorId); paint(); onChange(); });

      chip.append(text, type, lag, remove);
      chips.appendChild(chip);
    });
  };

  add.addEventListener('click', () => {
    const tree=selectableWbsTree(project);
    tree.title='انتخاب پیش‌نیاز';
    const byTreeId=new Map(candidates.filter(row=>!relations.has(row.id)).map(row=>[
      row.kind==='workTask'?`task:${row.workId}:${row.id}`:`branch:${row.id}`,row.id,
    ]));
    const prune=node=>{
      node.children=node.children.filter(child=>prune(child));
      return byTreeId.has(node.id) || node.children.length>0;
    };
    prune(tree);
    openExecutionBranchFilter(project,tree,key=>{
      const id=byTreeId.get(key);
      if(!id)return;
      relations.set(id,{predecessorId:id,type:'FS',lagDays:0});
      paint();
      onChange();
    },null,{selectionMode:true,keepParent:true,canSelect:node=>byTreeId.has(node.id)});
  });

  const controls=documentRef.createElement('div');
  controls.append(chips,add);
  root.append(caption,controls);paint();
  return {
    element:root,
    value:() => [...relations.keys()],
    relations:() => [...relations.values()].map(row => ({ ...row })),
    validate:() => validatePredecessors(project?.tasks || [], consumerId, [...relations.keys()]),
  };
}
