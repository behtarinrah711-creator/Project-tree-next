import { openSearchPicker } from './searchPickerAdapter.js';

export function responsibleContactPicker({contacts, ids, label, contextKey, onChange, readOnly=false}){
  const root=document.createElement('div');
  const name=contact=>[contact.type,contact.firstName,contact.lastName].filter(Boolean).join(' ') || contact.name || 'بدون نام';
  let selected=[...new Set(ids.map(String).filter(Boolean))];
  function update(ids){
    selected=ids;
    paint();
    onChange(ids);
  }
  function paint(){
    root.replaceChildren();
    for(const id of selected){
      const contact=contacts.find(item=>String(item.id)===id);
      const row=document.createElement('div');
      row.className='wbs-contract-approver';
      const text=document.createElement('span');
      text.textContent=contact?name(contact):'مخاطب حذف‌شده';
      text.title=text.textContent;
      const remove=document.createElement('button');
      remove.type='button';remove.textContent='×';remove.disabled=readOnly;
      remove.setAttribute('aria-label','حذف '+text.textContent);
      remove.onclick=()=>update(selected.filter(value=>value!==id));
      row.append(text,remove);root.append(row);
    }
    if(readOnly)return;
    const add=document.createElement('button');
    add.type='button';add.className='wbs-input wbs-approver-add-inline';
    add.textContent='+ افزودن شخص';add.setAttribute('aria-label','افزودن '+label);
    add.onclick=()=>openSearchPicker({
      title:'انتخاب '+label,listTitle:'مخاطبین',contextKey,resourceType:'contact',showAdd:false,showStar:false,
      items:contacts.filter(item=>!item.trashed&&!selected.includes(String(item.id))).map(item=>({id:item.id,name:name(item)})),
      onSelect:item=>update([...new Set([...selected,String(item.id)])]),
    });
    root.append(add);
  }
  paint();
  return root;
}
