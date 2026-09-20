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

function rowOf(wrapper){
  const row = wrapper?.firstElementChild;
  return row?.classList?.contains('wbs-row') ? row : null;
}

function clearIndicators(state){
  state?.wrapper?.classList.remove('wbs-row-dragging');
  state?.siblings?.forEach(wrapper => wrapper.classList.remove('wbs-drop-before', 'wbs-drop-after'));
}

function onPointerMove(event){
  if(!dragState) return;
  const others = dragState.siblings.filter(wrapper => wrapper !== dragState.wrapper);
  let target = null;
  let position = null;
  for(const wrapper of others){
    const rect = rowOf(wrapper).getBoundingClientRect();
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
  clearIndicators({ siblings:dragState.siblings });
  target?.classList.add(position === 'before' ? 'wbs-drop-before' : 'wbs-drop-after');
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
  const targetId = rowOf(state.target)?.dataset.wbsId;
  const ids = state.siblings.map(wrapper => rowOf(wrapper)?.dataset.wbsId).filter(Boolean);
  const orderedIds = reorderedIds(ids, state.id, targetId, state.position);
  if(orderedIds) state.onReorder?.(orderedIds);
}

export function bindRowDrag(row, { id, onReorder }){
  if(!row) return;
  row.dataset.wbsId = id;
  const grip = row.querySelector('.wbs-grip');
  if(!grip) return;
  grip.addEventListener('pointerdown', event => {
    if(event.button === 2) return;
    event.preventDefault();
    event.stopPropagation();
    const wrapper = row.parentElement;
    const container = wrapper?.parentElement;
    const siblings = Array.from(container?.children || []).filter(child => rowOf(child));
    if(!wrapper || siblings.length < 2) return;
    dragState = { id:String(id), wrapper, siblings, target:null, position:null, onReorder };
    wrapper.classList.add('wbs-row-dragging');
    try{ grip.setPointerCapture(event.pointerId); }catch(_error){}
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerEnd, { once:true });
    document.addEventListener('pointercancel', onPointerEnd, { once:true });
  });
}
