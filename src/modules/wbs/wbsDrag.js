let dragState = null;

export function reorderedIds(ids, draggedId, targetId, position){
  const order = (ids || []).map(String);
  const from = order.indexOf(String(draggedId));
  if(from < 0 || String(draggedId) === String(targetId)) return null;
  const [moved] = order.splice(from, 1);
  let to = order.indexOf(String(targetId));
  if(to < 0) return null;
  if(position === 'after') to += 1;
  order.splice(to, 0, moved);
  return order;
}

function rowOf(wrapper,rowClass='wbs-row'){
  const row = wrapper?.firstElementChild;
  return row?.classList?.contains(rowClass) ? row : null;
}

function clearIndicators(state){
  state?.wrapper?.classList.remove(state.draggingClass);
  state?.siblings?.forEach(wrapper => wrapper.classList.remove(state.dropBeforeClass,state.dropAfterClass));
}

function onPointerMove(event){
  if(!dragState) return;
  const others = dragState.siblings.filter(wrapper => wrapper !== dragState.wrapper);
  let target = null;
  let position = null;
  for(const wrapper of others){
    const rect = rowOf(wrapper,dragState.rowClass).getBoundingClientRect();
    if(event.clientY < rect.top + rect.height / 2){
      target = wrapper;
      position = 'before';
      break;
    }
  }
  if(!target && others.length){
    target = others[others.length - 1];
    position = 'after';
  }
  dragState.siblings.forEach(wrapper=>wrapper.classList.remove(dragState.dropBeforeClass,dragState.dropAfterClass));
  target?.classList.add(position === 'before' ? dragState.dropBeforeClass : dragState.dropAfterClass);
  dragState.target = target;
  dragState.position = position;
}

function onPointerEnd(){
  if(!dragState) return;
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerEnd);
  document.removeEventListener('pointercancel', onPointerEnd);
  const state = dragState;
  dragState = null;
  clearIndicators(state);
  if(!state.target) return;
  const targetId = rowOf(state.target,state.rowClass)?.dataset.dragId;
  const ids = state.siblings.map(wrapper => rowOf(wrapper,state.rowClass)?.dataset.dragId).filter(Boolean);
  const orderedIds = reorderedIds(ids, state.id, targetId, state.position);
  if(orderedIds) state.onReorder?.(orderedIds);
}

export function bindSiblingRowDrag(row,{id,onReorder,rowClass='wbs-row',gripSelector='.wbs-grip',draggingClass='wbs-row-dragging',dropBeforeClass='wbs-drop-before',dropAfterClass='wbs-drop-after'}={}){
  if(!row) return;
  row.dataset.dragId=id;
  const grip=row.querySelector(gripSelector);
  if(!grip) return;
  grip.addEventListener('pointerdown', event => {
    if(event.button === 2) return;
    event.preventDefault();
    event.stopPropagation();
    const wrapper = row.parentElement;
    const container = wrapper?.parentElement;
    const siblings=Array.from(container?.children||[]).filter(child=>rowOf(child,rowClass));
    if(!wrapper || siblings.length < 2) return;
    dragState={id:String(id),wrapper,siblings,target:null,position:null,onReorder,rowClass,draggingClass,dropBeforeClass,dropAfterClass};
    wrapper.classList.add(draggingClass);
    try{ grip.setPointerCapture(event.pointerId); }catch(_error){}
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerEnd, { once:true });
    document.addEventListener('pointercancel', onPointerEnd, { once:true });
  });
}

export function bindRowDrag(row,{id,onReorder}){
  bindSiblingRowDrag(row,{id,onReorder});
}
