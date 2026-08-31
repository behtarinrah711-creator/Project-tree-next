import * as realContractDomain from './realContractDomain.js';

function legacy(name,...args){
  if(typeof window?.[name]==='function') return window[name](...args);
  return undefined;
}

export function moveItem(list,id,targetId,position='after'){
  if(!Array.isArray(list)) return false;
  const from=list.findIndex(x=>String(x.id)===String(id));
  if(from<0) return false;
  const [moved]=list.splice(from,1);
  let to=list.findIndex(x=>String(x.id)===String(targetId));
  if(to<0){list.splice(from,0,moved);return false;}
  if(position==='after')to++;
  list.splice(Math.min(to,list.length),0,moved);
  return true;
}

export function renumberAndMark(state,kind){
  if(kind==='template'){
    legacy('renumberContractItems',state.items);
    state.dirty=true;
  }else{
    realContractDomain.renumberRealContractItems(state.items);
    state.dirty=true;
  }
}

export function attachPointerDrag({handle,list,id,kind,state,onDirty,onRender}){
  if(!handle||!Array.isArray(list))return false;
  const wrapper=handle.closest('[data-contract-drag-id]')||handle.closest('.real-contract-item')||handle.parentElement;
  const container=wrapper?.parentElement;
  if(!wrapper||!container)return false;

  const siblings=Array.from(container.children).filter(el=>el.dataset&&el.dataset.contractDragId);
  const drag={moved:false,target:null,position:null};
  wrapper.classList.add(kind==='template'?'row-dragging':'contract-row-dragging');

  const move=e=>{
    drag.moved=true;
    const others=siblings.filter(el=>el!==wrapper);
    let target=null,position=null;
    for(const el of others){
      const r=el.getBoundingClientRect();
      if(e.clientY<r.top+r.height/2){target=el;position='before';break;}
    }
    if(!target&&others.length){target=others[others.length-1];position='after';}
    others.forEach(el=>el.classList.remove('drag-over-top','drag-over-bottom'));
    if(target)target.classList.add(position==='before'?'drag-over-top':'drag-over-bottom');
    drag.target=target;drag.position=position;
  };
  const end=()=>{
    document.removeEventListener('pointermove',move);
    wrapper.classList.remove('row-dragging','contract-row-dragging');
    siblings.forEach(el=>el.classList.remove('drag-over-top','drag-over-bottom'));
    if(drag.moved&&drag.target){
      const targetId=drag.target.dataset.contractDragId;
      if(moveItem(list,id,targetId,drag.position)){
        renumberAndMark(state,kind);
        onDirty?.();
        if(!onDirty) legacy('persist');
        onRender?.();
      }
    }
  };
  document.addEventListener('pointermove',move);
  document.addEventListener('pointerup',end,{once:true});
  return true;
}

export function createInlineAddRow({type='child',onCommit,onCancel}={}){
  const row=document.createElement('div');
  row.className='contract-inline-add-row';
  const input=document.createElement('input');
  input.type='text';
  input.className='form-control';
  input.placeholder=type==='root'?'عنوان بند جدید':'عنوان زیر‌بند جدید';
  const add=document.createElement('button');
  add.type='button';add.className='btn btn-primary btn-sm';add.textContent='افزودن';
  const cancel=document.createElement('button');
  cancel.type='button';cancel.className='btn btn-outline-secondary btn-sm';cancel.textContent='انصراف';
  add.onclick=()=>{const v=input.value.trim();if(!v)return;onCommit?.(v);};
  cancel.onclick=()=>onCancel?.();
  row.append(input,add,cancel);
  return row;
}

export function findItem(items,id){
  for(const item of items||[]){
    if(String(item.id)===String(id)) return item;
    const found=findItem(item.children,id);
    if(found)return found;
  }
  return null;
}
export function removeItem(list,index,state){
  if(!Array.isArray(list)||index<0||index>=list.length)return false;
  list.splice(index,1);
  if(state?.items) realContractDomain.renumberRealContractItems(state.items);
  if(state)state.dirty=true;
  return true;
}
export function updateItemText(item,value,state){
  if(!item)return false;
  item.text=String(value??'');
  if(state)state.dirty=true;
  return true;
}
