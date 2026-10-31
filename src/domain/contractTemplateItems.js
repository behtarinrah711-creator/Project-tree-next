export function cloneTemplateIntoContract(template){
  return (template?.items||[]).map(x=>({
    id:'rc_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
    text:x.text||'', number:x.number||'',
    children:(x.children||[]).map(c=>({
      id:'rc_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
      text:c.text||'', number:c.number||'', children:[]
    }))
  }));
}
