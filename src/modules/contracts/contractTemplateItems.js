export function appendContractChild(items, parentId, text='', makeItem, renumber){
  const value=String(text||'').trim();
  if(!value || !Array.isArray(items) || typeof makeItem!=='function') return null;
  const parent=items.find(item=>String(item?.id)===String(parentId));
  if(!parent) return null;
  if(!Array.isArray(parent.children)) parent.children=[];
  const child=makeItem(value);
  if(!child) return null;
  parent.children.push(child);
  if(typeof renumber==='function') renumber(items);
  return child;
}
