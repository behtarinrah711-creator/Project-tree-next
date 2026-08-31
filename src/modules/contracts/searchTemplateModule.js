/* Search Template presentation/state; child stack belongs to KarhaChildHistory. */
let searchTemplateState = null;

function stplGetInitials(name){
  const t=String(name||'').trim();
  if(!t) return '؟';
  const parts=t.split(/\s+/).filter(Boolean);
  if(parts.length>=2) return (parts[0][0]+parts[1][0]).slice(0,2);
  return t.slice(0,2);
}
function stplAvatarClass(name){
  let h=0; const s=String(name||'');
  for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0;
  return 'c'+(h%6);
}
function stplFirstLetter(name){
  const t=String(name||'').trim();
  if(!t) return '#';
  return t[0];
}
function stplStarSvg(on){
  if(on) return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.3l-6.2 3.7 1.7-7.1L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7.1z"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 17.3l-6.2 3.7 1.7-7.1L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7.1z"/></svg>';
}

/** ستاره وابسته به زمینه (پیمانکار / کارفرما / …) — نه سراسری روی مخاطب */
function getSearchTemplateStarMap(contextKey){
  const p=getCurrentProject();
  if(!p) return {};
  if(!p.searchTemplateStars || typeof p.searchTemplateStars!=='object') p.searchTemplateStars={};
  if(!p.searchTemplateStars[contextKey] || typeof p.searchTemplateStars[contextKey]!=='object'){
    p.searchTemplateStars[contextKey]={};
  }
  return p.searchTemplateStars[contextKey];
}
function isSearchTemplateStarred(contextKey, id){
  const map=getSearchTemplateStarMap(contextKey);
  return !!map[String(id)];
}
function setSearchTemplateStarred(contextKey, id, on){
  const p=getCurrentProject();
  if(!p) return;
  const map=getSearchTemplateStarMap(contextKey);
  const k=String(id);
  if(on) map[k]=true; else delete map[k];
  markDirty(p.id); persist();
}

function isSearchTemplateOpen(){
  const page=document.getElementById('searchTemplatePage');
  return !!(page && !page.classList.contains('hidden'));
}
function isSearchTemplateSearchMode(){
  const top=document.getElementById('searchTemplateTopbar');
  return !!(top && top.classList.contains('search-mode'));
}
function exitSearchTemplateSearchMode(){
  const top=document.getElementById('searchTemplateTopbar');
  const inp=document.getElementById('searchTemplateInput');
  if(top) top.classList.remove('search-mode');
  if(inp){
    inp.value='';
    try{ inp.blur(); }catch(e){}
  }
  if(searchTemplateState){
    searchTemplateState.query='';
    renderSearchTemplateBody();
  }
}
function enterSearchTemplateSearchMode(){
  const top=document.getElementById('searchTemplateTopbar');
  const inp=document.getElementById('searchTemplateInput');
  if(!top) return;
  top.classList.add('search-mode');
  window.KarhaChildHistory?.open('search-template-search');
  setTimeout(()=>{ try{ if(inp){ inp.focus(); } }catch(e){} }, 30);
}
function closeSearchTemplate(fromPop){
  const page=document.getElementById('searchTemplatePage');
  if(page){ page.classList.add('hidden'); page.setAttribute('aria-hidden','true'); }
  searchTemplateState=null;
  const top=document.getElementById('searchTemplateTopbar');
  if(top) top.classList.remove('search-mode');
  const inp=document.getElementById('searchTemplateInput');
  if(inp){ inp.value=''; try{ inp.blur(); }catch(e){} }
  const searchOpen=window.KarhaChildHistory?.isOpen('search-template-search');
  window.KarhaChildHistory?.consume('search-template-search',{fromPopState:true});
  window.KarhaChildHistory?.consume('search-template',{fromPopState:!!fromPop,steps:searchOpen?2:1});
}
/** قانون تمپلیت جستجو:
 * بک اول (اگر جستجو فعال است) = فقط خروج از حالت جستجو
 * بک بعدی = بستن تمپلیت و ماندن روی فرم زیرین
 */
function handleSearchTemplateBack(){
  if(!isSearchTemplateOpen()) return false;
  if(isSearchTemplateSearchMode()){
    exitSearchTemplateSearchMode();
    window.KarhaChildHistory?.consume('search-template-search');
    return true;
  }
  closeSearchTemplate(false);
  return true;
}

/**
 * opts: {
 *   title, listTitle, selectedTitle?,
 *   contextKey: 'contractor'|'employer'|...,
 *   items:[{id,name}],
 *   onSelect, onAdd, showStar, showAdd
 * }
 */
function openSearchTemplate(opts){
  const page=document.getElementById('searchTemplatePage');
  if(!page) return;
  const contextKey=String(opts.contextKey||opts.listTitle||'default');
  const starMap=getSearchTemplateStarMap(contextKey);
  const items=(Array.isArray(opts.items)?opts.items:[]).map(it=>({
    id:it.id,
    name:it.name,
    starred:!!starMap[String(it.id)],
    _raw:it
  }));
  searchTemplateState={
    title: opts.title||'انتخاب',
    listTitle: opts.listTitle||'موارد',
    selectedTitle: opts.selectedTitle || ((opts.listTitle||'موارد')+' منتخب'),
    contextKey,
    items,
    onSelect: typeof opts.onSelect==='function'?opts.onSelect:null,
    onAdd: typeof opts.onAdd==='function'?opts.onAdd:null,
    showStar: opts.showStar!==false,
    showAdd: opts.showAdd!==false && typeof opts.onAdd==='function',
    query:''
  };
  const titleEl=document.getElementById('searchTemplateTitle');
  if(titleEl) titleEl.textContent=searchTemplateState.title;
  const fab=document.getElementById('searchTemplateFab');
  if(fab) fab.classList.toggle('hidden', !searchTemplateState.showAdd);
  const top=document.getElementById('searchTemplateTopbar');
  if(top) top.classList.remove('search-mode');
  const inp=document.getElementById('searchTemplateInput');
  if(inp) inp.value='';
  page.classList.remove('hidden');
  page.setAttribute('aria-hidden','false');
  renderSearchTemplateBody();
  window.KarhaChildHistory?.open('search-template');
}

function renderSearchTemplateBody(){
  const body=document.getElementById('searchTemplateBody');
  if(!body||!searchTemplateState) return;
  body.innerHTML='';
  const q=String(searchTemplateState.query||'').trim().toLocaleLowerCase('fa');
  let items=searchTemplateState.items.filter(it=>{
    if(!q) return true;
    return String(it.name||'').toLocaleLowerCase('fa').includes(q);
  });

  if(!items.length){
    body.innerHTML='<div class="stpl-empty">موردی یافت نشد.</div>';
    return;
  }

  const starred=items.filter(it=>!!it.starred);
  const rest=items.filter(it=>!it.starred);

  const appendSection=(label, list, isSelected)=>{
    if(!list.length) return;
    const lab=document.createElement('div');
    lab.className='stpl-section-label'+(isSelected?' stpl-selected-label':'');
    lab.textContent=label;
    body.appendChild(lab);
    if(isSelected){
      list.forEach(it=>body.appendChild(makeSearchTemplateRow(it)));
      return;
    }
    const groups={};
    list.forEach(it=>{
      const L=stplFirstLetter(it.name);
      if(!groups[L]) groups[L]=[];
      groups[L].push(it);
    });
    Object.keys(groups).sort((a,b)=>a.localeCompare(b,'fa')).forEach(L=>{
      const letter=document.createElement('div');
      letter.className='stpl-letter';
      letter.textContent=L;
      body.appendChild(letter);
      groups[L].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fa'));
      groups[L].forEach(it=>body.appendChild(makeSearchTemplateRow(it)));
    });
  };

  if(starred.length) appendSection(searchTemplateState.selectedTitle, starred, true);
  appendSection(searchTemplateState.listTitle, rest, false);
}

function makeSearchTemplateRow(item){
  const row=document.createElement('div');
  row.className='stpl-row';
  row.dataset.id=String(item.id||'');

  const av=document.createElement('div');
  av.className='stpl-avatar '+stplAvatarClass(item.name);
  av.textContent=stplGetInitials(item.name);

  const name=document.createElement('div');
  name.className='stpl-name';
  name.textContent=item.name||'—';
  row.append(av, name);

  if(searchTemplateState.showStar){
    const star=document.createElement('button');
    star.type='button';
    star.className='stpl-star'+(item.starred?' on':'');
    star.innerHTML=stplStarSvg(!!item.starred);
    star.onclick=(e)=>{
      e.preventDefault(); e.stopPropagation();
      item.starred=!item.starred;
      const ref=searchTemplateState.items.find(x=>String(x.id)===String(item.id));
      if(ref) ref.starred=item.starred;
      setSearchTemplateStarred(searchTemplateState.contextKey, item.id, item.starred);
      renderSearchTemplateBody();
    };
    row.appendChild(star);
  }

  row.onclick=()=>{
    const handler=searchTemplateState && searchTemplateState.onSelect;
    // اول تمپلیت را ببند (با سرکوب بک فرم)، بعد انتخاب را اعمال کن تا روی فرم بمانیم
    closeSearchTemplate(false);
    if(handler){
      try{ handler(item); }catch(err){}
    }
  };
  return row;
}

function initSearchTemplateUI(){
  const back=document.getElementById('searchTemplateBack');
  const searchBtn=document.getElementById('searchTemplateSearchBtn');
  const inp=document.getElementById('searchTemplateInput');
  const fab=document.getElementById('searchTemplateFab');
  const top=document.getElementById('searchTemplateTopbar');
  if(back) back.onclick=()=>{ handleSearchTemplateBack(); };
  if(searchBtn) searchBtn.onclick=()=>{ enterSearchTemplateSearchMode(); };
  if(inp){
    inp.oninput=()=>{
      if(!searchTemplateState) return;
      searchTemplateState.query=inp.value||'';
      renderSearchTemplateBody();
    };
  }
  if(fab) fab.onclick=()=>{
    if(searchTemplateState && searchTemplateState.onAdd){
      try{ searchTemplateState.onAdd(); }catch(e){}
    }
  };
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initSearchTemplateUI);
else setTimeout(initSearchTemplateUI,0);

window.KarhaChildHistory?.register('search-template-search',{
  onPop:()=>exitSearchTemplateSearchMode(),
  onRestore:()=>enterSearchTemplateSearchMode()
});
window.KarhaChildHistory?.register('search-template',{
  onPop:()=>closeSearchTemplate(true),
  onRestore:()=>{ if(searchTemplateState) document.getElementById('searchTemplatePage')?.classList.remove('hidden'); }
});
window.KarhaSearchTemplate={open:openSearchTemplate,close:closeSearchTemplate,back:handleSearchTemplateBack,isOpen:isSearchTemplateOpen,isSearchMode:isSearchTemplateSearchMode,enterSearch:enterSearchTemplateSearchMode,exitSearch:exitSearchTemplateSearchMode,render:renderSearchTemplateBody};
