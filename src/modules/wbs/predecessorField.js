import { openNumpadGeneric } from '../../ui/numpad.js';
import { flattenDependencyCandidates, validatePredecessors } from '../../domain/wbs/scheduling.js';
import { openExecutionBranchFilter, selectableWbsTree } from './executionBranchFilter.js';

const RELATION_TYPES = Object.freeze(['FS','SS','FF']);

const RELATION_LABELS={FS:'پایان به شروع (FS)',SS:'شروع به شروع (SS)',FF:'پایان به پایان (FF)'};

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
  const root = documentRef.createElement('div'); root.className = 'wbs-predecessor-field wbs-dependency-cards';
  const caption = documentRef.createElement('span'); caption.className = 'wbs-field-label'; caption.textContent = 'پیش‌نیازها';
  const candidates = flattenDependencyCandidates(project?.tasks || []).filter(row => row.id !== String(consumerId));
  const relations = new Map(validInitialRelations(initial, candidates).map(row => [row.predecessorId, row]));
  const chips = documentRef.createElement('div'); chips.className = 'wbs-predecessor-list';
  const add = documentRef.createElement('button'); add.type = 'button'; add.className = 'wbs-choice wbs-dependency-add'; add.textContent = '+ افزودن پیش‌نیاز';

  const paint = () => {
    chips.replaceChildren();
    [...relations.values()].forEach(relation => {
      const row = candidates.find(item => item.id === relation.predecessorId); if(!row) return;
      const chip = documentRef.createElement('div'); chip.className = 'wbs-activity-row wbs-predecessor-row';

      const header=documentRef.createElement('div');
      header.className='wbs-dependency-header';
      const text=documentRef.createElement('div');
      const title=documentRef.createElement('strong');title.textContent=row.title||'بدون عنوان';
      const path=documentRef.createElement('small');path.textContent=row.parentPath.join(' · ');
      text.append(title,path);
      const button=(label,action)=>{
        const control=documentRef.createElement('button');
        control.type='button';control.textContent=label;control.onclick=action;
        return control;
      };
      const remove=button('×',()=>{relations.delete(relation.predecessorId);paint();onChange();});
      remove.className='wbs-activity-remove';
      remove.setAttribute('aria-label','حذف پیش‌نیاز '+title.textContent);
      header.append(text,remove);

      const type=documentRef.createElement('select');
      type.className='wbs-predecessor-type';
      type.setAttribute('aria-label','نوع رابطه');
      for(const value of RELATION_TYPES){
        const option=documentRef.createElement('option');
        option.value=value;option.textContent=RELATION_LABELS[value];type.append(option);
      }
      type.value=relation.type;
      type.onchange=()=>{relation.type=type.value;onChange();};
      const typeRow=documentRef.createElement('label');
      typeRow.className='wbs-dependency-control';typeRow.append('نوع رابطه',type);

      let direction=Math.sign(relation.lagDays);
      const directions=documentRef.createElement('div');
      directions.className='wbs-dependency-directions';
      const stepper=documentRef.createElement('div');stepper.className='wbs-dependency-stepper';
      const steps=documentRef.createElement('div');steps.className='wbs-dependency-steps';
      const changeDays=days=>{
        const magnitude=Math.max(0,Math.min(99999,days));
        if(!magnitude)direction=0;
        relation.lagDays=direction*magnitude;
        draw();onChange();
      };
      const value=button('',()=>openNumpadGeneric('',raw=>{
        if(/^\d+$/.test(raw))changeDays(Number(raw));
      },{suffix:' روز',group:false,maxLen:5}));
      value.className='wbs-input';value.setAttribute('aria-label','تعداد روز فاصلهٔ زمانی');
      const up=button('⌃',()=>changeDays(Math.abs(relation.lagDays)+1));
      up.setAttribute('aria-label','افزایش تعداد روز');
      const down=button('⌄',()=>changeDays(Math.abs(relation.lagDays)-1));
      down.setAttribute('aria-label','کاهش تعداد روز');
      steps.append(up,down);stepper.append(value,steps);
      const choices=[[-1,'زودتر'],[0,'بدون فاصله'],[1,'دیرتر']].map(([sign,label])=>{
        const choice=button(label,()=>{
          direction=sign;
          changeDays(sign?Math.abs(relation.lagDays)||1:0);
        });
        directions.append(choice);return [sign,choice];
      });
      const draw=()=>{
        for(const [sign,choice] of choices)choice.setAttribute('aria-pressed',String(sign===direction));
        stepper.hidden=!direction;
        value.textContent=new Intl.NumberFormat('fa-IR').format(Math.abs(relation.lagDays))+' روز';
      };
      draw();
      const lagLabel=documentRef.createElement('span');lagLabel.textContent='فاصلهٔ زمانی';
      chip.append(header,typeRow,lagLabel,directions,stepper);
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
  controls.append(add,chips);
  root.append(caption,controls);paint();
  return {
    element:root,
    value:() => [...relations.keys()],
    relations:() => [...relations.values()].map(row => ({ ...row })),
    validate:() => validatePredecessors(project?.tasks || [], consumerId, [...relations.keys()]),
  };
}
