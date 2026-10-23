import { notebookIcons } from '../notebook/notebookIcons.js';

const more='<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
const close='<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg>';
let closeActive=null;
export function contractActionsMenu({onEdit,onExport,onDelete}){
  const wrap=document.createElement('div');wrap.className='nb-project-menu-wrap contract-menu-wrap';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='nb-more';
  toggle.innerHTML=more;toggle.setAttribute('aria-label','عملیات قرارداد');toggle.setAttribute('aria-expanded','false');
  let menu=null,dismiss=null;
  const shut=()=>{
    menu?.remove();dismiss?.remove();menu=null;dismiss=null;
    toggle.innerHTML=more;toggle.setAttribute('aria-expanded','false');
    if(closeActive===shut)closeActive=null;
  };
  toggle.onclick=e=>{
    e.stopPropagation();
    if(menu){shut();return;}
    closeActive?.();closeActive=shut;
    toggle.innerHTML=close;toggle.setAttribute('aria-expanded','true');
    dismiss=document.createElement('button');dismiss.type='button';dismiss.className='nb-menu-dismiss';
    dismiss.setAttribute('aria-label','بستن منو');dismiss.onclick=shut;
    menu=document.createElement('div');menu.className='nb-project-menu';menu.setAttribute('role','menu');
    for(const [title,icon,handler,danger] of [
      ['ویرایش',notebookIcons.edit,onEdit],['خروجی',notebookIcons.export,()=>onExport(toggle)],['حذف',notebookIcons.trash,onDelete,true],
    ]){
      const button=document.createElement('button');button.type='button';button.className='nb-action-icon'+(danger?' danger':'');
      button.title=title;button.setAttribute('aria-label',title);button.setAttribute('role','menuitem');button.innerHTML=icon;
      button.onclick=event=>{event.stopPropagation();shut();handler?.();};
      menu.appendChild(button);
    }
    wrap.append(dismiss,menu);
  };
  wrap.onkeydown=e=>{if(e.key==='Escape'){shut();toggle.focus();}};
  wrap.appendChild(toggle);return wrap;
}
