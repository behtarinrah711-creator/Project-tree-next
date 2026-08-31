/** Contract template/list item pointer drag — sole owner of drag state. */

let contractPointerDragState = null;

export function startContractPointerDrag(e, arr, index, wrapperEl, render){
  if(!arr || !wrapperEl) return;
  e.preventDefault(); e.stopPropagation();
  const container = wrapperEl.parentElement;
  const siblingEls = Array.from(container?.children || []).filter(el => el.dataset && el.dataset.contractDragId);
  contractPointerDragState = { arr, index, wrapperEl, siblingEls, hoverEl:null, hoverPos:null, render, moved:false };
  wrapperEl.classList.add('contract-row-dragging');
  document.addEventListener('pointermove', onContractPointerDragMove);
  document.addEventListener('pointerup', onContractPointerDragEnd, { once:true });
}

function onContractPointerDragMove(e){
  if(!contractPointerDragState) return;
  const st = contractPointerDragState; st.moved = true;
  const others = st.siblingEls.filter(el => el !== st.wrapperEl);
  let target = null, pos = null;
  for(const el of others){
    const r = el.getBoundingClientRect();
    if(e.clientY < r.top + r.height / 2){ target = el; pos = 'before'; break; }
  }
  if(!target && others.length){ target = others[others.length - 1]; pos = 'after'; }
  others.forEach(el => el.classList.remove('contract-drag-over-top', 'contract-drag-over-bottom'));
  if(target) target.classList.add(pos === 'before' ? 'contract-drag-over-top' : 'contract-drag-over-bottom');
  st.hoverEl = target; st.hoverPos = pos;
}

function onContractPointerDragEnd(){
  const st = contractPointerDragState; if(!st) return;
  document.removeEventListener('pointermove', onContractPointerDragMove);
  st.siblingEls.forEach(el => el.classList.remove('contract-drag-over-top', 'contract-drag-over-bottom'));
  st.wrapperEl.classList.remove('contract-row-dragging');
  contractPointerDragState = null;
  if(!st.moved || !st.hoverEl) return;
  const targetId = st.hoverEl.dataset.contractDragId;
  const from = st.arr.findIndex(x => String(x.id) === String(st.wrapperEl.dataset.contractDragId));
  if(from < 0) return;
  const [moved] = st.arr.splice(from, 1);
  let to = st.arr.findIndex(x => String(x.id) === String(targetId));
  if(to < 0){ st.arr.splice(from, 0, moved); return; }
  if(st.hoverPos === 'after') to++;
  st.arr.splice(to, 0, moved);
  if(typeof st.render === 'function') st.render();
}

export function attachContractDrag(handle, arr, index, render){
  if(!handle) return;
  handle.onpointerdown = e => startContractPointerDrag(e, arr, index, handle.closest('.contract-item-card') || handle.closest('[data-contract-drag-id]'), render);
}

export function installContractItemDrag({ windowRef = globalThis } = {}){
  windowRef.KarhaContractItemDrag = Object.freeze({ startContractPointerDrag, attachContractDrag });
  return windowRef.KarhaContractItemDrag;
}

export default { startContractPointerDrag, attachContractDrag, installContractItemDrag };
