import { renderTaskActivities } from '../activities/activityView.js';

/** Task-owned DOM rendering, editing, detail sheet, and pointer drag behavior. */
export function createTaskView(runtime, dependencies){
  const { getData, document, requestAnimationFrame, setTimeout, isPendingDeleted,
    formatCost, formatCostDisplay, projectCostSum, taskCostSum, svgPlus, svgGrip, svgChevron, svgTrash,
    svgCheck, svgStar, itemChildren, findNestedItem, findProject, findTask, findSub, walkItems,
    toggleTaskDone, toggleSubDone, toggleTaskStar, toggleSubStar, removeFromStarredOrder,
    openConfirm, showToast, renderAll, refreshStarredPartial, softDelete,
    isFloatingConfirmUser, persist, markDirty, openNumpadGeneric, addTrashSourceBadge, appendTrashActions } = dependencies;
  let addItemActive=false;
  let currentDetail=null;
  let itemDragState=null;
  let starredDragState=null;
  let starredCompletedOpen=false;
  function collectStarredGrouped(){
    const groups=[];
    (getData().projects||[]).forEach(project=>{
      if(isPendingDeleted('project',project.id)||project.trashed||project.archived) return;
      runtime.list(project.id).forEach(task=>{
        const starredItems=[];
        walkItems(task.subtasks,(item,parent,depth)=>{
          if(item.starred&&!item.trashed&&!isPendingDeleted('sub',project.id,task.id,item.id)) starredItems.push({id:item.id,text:item.text,parentText:parent?parent.text:'',depth,done:!!item.done,cost:item.cost});
        });
        if((task.starred&&!task.trashed&&!isPendingDeleted('task',project.id,task.id))||starredItems.length) groups.push({pid:project.id,tid:task.id,taskText:task.text||'',projectName:project.name||'',taskCost:task.cost,taskDone:!!task.done,taskStarred:!!task.starred,subs:starredItems});
      });
    });
    return groups;
  }
  const openCostEditor=(item,pid,tid,sid,displayEl)=>openNumpadGeneric(item.cost,value=>{
    const cost=value===''?null:Number(value);
    sid ? runtime.updateSubtask(pid,tid,sid,{cost}) : runtime.update(pid,tid,{cost});
    const text=formatCostDisplay(cost); displayEl.textContent=text||'وارد کنید…'; displayEl.classList.toggle('empty',!text);
  },{suffix:' تومان',maxLen:13,group:true});
function renderProjectView(content, p){
  if(getData().viewMode === 'cost'){
    const summary = document.createElement('div');
    summary.className = 'cost-summary';
    summary.innerHTML = '<span>مجموع هزینه</span><span class="cost-sum-val"><span class="cost-unit">تومان</span> '+formatCost(projectCostSum(p))+'</span>';
    content.appendChild(summary);
  }

  const visibleTasks = p.tasks.filter(t => !isPendingDeleted('task', p.id, t.id) && !t.trashed);
  const active = visibleTasks.filter(t=>!t.done);
  const completedTasks = visibleTasks.filter(t=>t.done).sort((a,b)=> (b.completedAt||0) - (a.completedAt||0));
  // فرزندان تکمیل‌شده زیر والد باز
  const doneSubsUnderOpen = [];
  active.forEach(t=>{
    (t.subtasks||[]).forEach(s=>{
      if(!s.trashed && s.done && !isPendingDeleted('sub', p.id, t.id, s.id))
        doneSubsUnderOpen.push({ t, s });
    });
  });
  const completedCount = completedTasks.length + doneSubsUnderOpen.length;

  if(!active.length && !completedCount){
    content.appendChild(elFromHtml('<div class="empty-state">کاری در این پروژه نیست. با دکمهٔ + یکی اضافه کنید.</div>'));
  }

  const activeWrap = document.createElement('div');
  activeWrap.className = 'active-tasks-wrap';
  // والد + فقط فرزندان باز
  active.forEach(t => activeWrap.appendChild(renderTaskBlock(p, t, { onlyOpenSubs: true })));
  content.appendChild(activeWrap);

  content.appendChild(renderInlineAddRow(p));

  if(completedCount){
    const header = document.createElement('div');
    header.className = 'completed-header';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'completed-title';
    titleSpan.textContent = 'تکمیل‌شده ('+completedCount+')';
    header.appendChild(titleSpan);
    if(p.completedOpen){
      const clearBtn = document.createElement('button');
      clearBtn.className = 'completed-clear-btn';
      clearBtn.textContent = 'حذف همه';
      clearBtn.onclick = (e)=>{
        e.stopPropagation();
        openConfirm('همه موارد تکمیل‌شده این پروژه حذف شوند؟', ()=>{
          completedTasks.forEach(t=>runtime.softDelete(p.id,t.id));
          doneSubsUnderOpen.forEach(({t,s})=>runtime.softDelete(p.id,t.id,s.id));
          renderAll();
          showToast('تکمیل‌شده‌ها حذف شدند');
        }, 'حذف همه');
      };
      header.appendChild(clearBtn);
    }
    const chev = document.createElement('span');
    chev.className = 'chev'+(p.completedOpen?'':' collapsed');
    chev.innerHTML = svgChevron();
    header.appendChild(chev);
    header.onclick = ()=>{ p.completedOpen = !p.completedOpen; markDirty(p.id); persist({ local:false }); renderAll(); };
    content.appendChild(header);

    const list = document.createElement('div');
    list.className = 'completed-list' + (p.completedOpen ? '' : ' hidden');
    completedTasks.forEach(t => list.appendChild(renderTaskBlock(p, t)));
    // هر فرزند تکمیل‌شده جداگانه با برچسب والد
    doneSubsUnderOpen.forEach(({t, s})=>{
      list.appendChild(renderTaskBlock(p, t, { hideParent: true, onlyDoneSubs: true, singleSubId: s.id }));
    });
    content.appendChild(list);
  }
}

function refreshProjectPartial(p){
  const emptyState = document.querySelector('.content .empty-state');
  if(emptyState) emptyState.remove();

  const wrap = document.querySelector('.active-tasks-wrap');
  if(wrap){
    wrap.innerHTML = '';
    const visibleTasks = p.tasks.filter(t => !isPendingDeleted('task', p.id, t.id) && !t.trashed);
    visibleTasks.filter(t=>!t.done).forEach(t => wrap.appendChild(renderTaskBlock(p, t)));
  }

  const tabEl = document.querySelector('.tab[data-id="'+p.id+'"]');
  if(tabEl){
    const undone = p.tasks.filter(t=>!t.done && !isPendingDeleted('task', p.id, t.id) && !t.trashed).length;
    let countEl = tabEl.querySelector('.count');
    if(undone){
      if(!countEl){ countEl = document.createElement('span'); countEl.className = 'count'; tabEl.appendChild(countEl); }
      countEl.textContent = undone;
    } else if(countEl){ countEl.remove(); }
  }

  if(getData().viewMode === 'cost'){
    const summaryVal = document.querySelector('.cost-summary .cost-sum-val');
    if(summaryVal) summaryVal.innerHTML = '<span class="cost-unit">تومان</span> '+formatCost(projectCostSum(p));
  }
}

function renderInlineAddRow(p){
  const row = document.createElement('div');

  if(!addItemActive){
    row.className = 'inline-add-row';
    row.innerHTML = '<span class="plus-circle">'+svgPlus()+'</span><span>افزودن مورد</span>';
    row.onclick = ()=>{ addItemActive = true; renderAll(); focusInlineAdd(); };
    return row;
  }

  row.className = 'inline-add-row active';
  // در RTL اولین عنصر سمت راست است → تیک سبز سمت راست چک‌باکس مربعی
  let confBtn = null;
  if(typeof isFloatingConfirmUser === 'function' && isFloatingConfirmUser()){
    confBtn = document.createElement('button');
    confBtn.type = 'button';
    confBtn.className = 'inline-confirm-btn';
    confBtn.title = 'تایید';
    confBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l3.5 3.5L16 6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    confBtn.onmousedown = (e)=>{ e.preventDefault(); };
    row.appendChild(confBtn);
  }
  const check = document.createElement('span');
  check.className = 'empty-check';
  row.appendChild(check);

  const input = document.createElement('input');
  input.id = 'inlineAddInput';
  input.placeholder = 'مورد جدید…';

  let ignoreBlur = false;
  const commit = (keepFocus)=>{
    if(!input.value.trim()) return;
    const text = input.value.trim();
    input.value = '';
    const t = runtime.create(p.id,text);
    if(!t) return;
    // append task without destroying the input (keeps mobile keyboard open)
    const wrap = document.querySelector('.active-tasks-wrap');
    if(wrap){
      const emptyState = document.querySelector('.content .empty-state');
      if(emptyState) emptyState.remove();
      wrap.appendChild(renderTaskBlock(p, t));
    } else {
      refreshProjectPartial(p);
    }
    // update tab count
    const tabEl = document.querySelector('.tab[data-id="'+p.id+'"]');
    if(tabEl){
      const undone = p.tasks.filter(x=>!x.done && !isPendingDeleted('task', p.id, x.id) && !x.trashed).length;
      let countEl = tabEl.querySelector('.count');
      if(undone){
        if(!countEl){ countEl = document.createElement('span'); countEl.className = 'count'; tabEl.appendChild(countEl); }
        countEl.textContent = undone;
      }
    }
    if(getData().viewMode === 'cost'){
      const summaryVal = document.querySelector('.cost-summary .cost-sum-val');
      if(summaryVal) summaryVal.innerHTML = '<span class="cost-unit">تومان</span> '+formatCost(projectCostSum(p));
    }
    persist({ local:false });
    if(keepFocus){
      addItemActive = true;
      ignoreBlur = true;
      input.focus();
      setTimeout(()=>{ ignoreBlur = false; }, 100);
    }
  };
  input.onkeydown = (e)=>{
    if(e.key==='Enter'){ e.preventDefault(); e.stopPropagation(); commit(true); }
    if(e.key==='Escape'){ addItemActive = false; renderAll(); }
  };
  if(confBtn){
    confBtn.onclick = (e)=>{ e.preventDefault(); e.stopPropagation(); commit(true); };
  }
  input.onblur = ()=>{
    if(ignoreBlur) return;
    setTimeout(()=>{
      if(ignoreBlur) return;
      const el = document.getElementById('inlineAddInput');
      if(!el) return;
      if(document.activeElement === el) return;
      if(el.value.trim()) commit(false);
      else { /* keep row open while keyboard might bounce */ }
    }, 120);
  };
  row.appendChild(input);

  const xBtn = document.createElement('button');
  xBtn.className = 'x-btn';
  xBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  xBtn.onclick = ()=>{ addItemActive = false; renderAll(); };
  row.appendChild(xBtn);

  return row;
}
function focusInlineAdd(){
  setTimeout(()=>{
    const el = document.getElementById('inlineAddInput');
    if(el) el.focus();
  }, 0);
}

/* ---------- vertical drag reorder (tasks & subtasks) ---------- */
function startItemDrag(e, id, list, containerEl, wrapperEl, pid, rootId, parentId){
  if(!containerEl) return;
  const siblingEls = Array.from(containerEl.children).filter(el => el.dataset && el.dataset.dragId);
  itemDragState = { id, list, siblingEls, hoverEl:null, hoverPos:null, wrapperEl, pid, rootId, parentId };
  wrapperEl.classList.add('row-dragging');
  document.addEventListener('pointermove', onItemDragMove);
  document.addEventListener('pointerup', onItemDragEnd, { once:true });
}
function onItemDragMove(e){
  if(!itemDragState) return;
  const y = e.clientY;
  const others = itemDragState.siblingEls.filter(el => el !== itemDragState.wrapperEl);
  let target=null, pos=null;
  for(const el of others){
    const rect = el.getBoundingClientRect();
    const mid = rect.top + rect.height/2;
    if(y < mid){ target = el; pos = 'before'; break; }
  }
  if(!target && others.length){ target = others[others.length-1]; pos = 'after'; }
  others.forEach(el => el.classList.remove('drag-over-top','drag-over-bottom'));
  if(target) target.classList.add(pos==='before' ? 'drag-over-top' : 'drag-over-bottom');
  itemDragState.hoverEl = target;
  itemDragState.hoverPos = pos;
}
function onItemDragEnd(){
  if(!itemDragState) return;
  document.removeEventListener('pointermove', onItemDragMove);
  itemDragState.wrapperEl.classList.remove('row-dragging');
  itemDragState.siblingEls.forEach(el => el.classList.remove('drag-over-top','drag-over-bottom'));
  const { id, list, hoverEl, hoverPos, pid, wrapperEl, rootId, parentId } = itemDragState;
  const wasInCompletedList = !!wrapperEl.closest('.completed-list');
  itemDragState = null;
  if(!hoverEl) return;
  const targetId = hoverEl.dataset.dragId;
  const order=list.map(item=>item.id);
  const fromIdx=order.findIndex(value=>String(value)===String(id));
  if(fromIdx===-1) return;
  const [movedId]=order.splice(fromIdx,1);
  let toIdx=order.findIndex(value=>String(value)===String(targetId));
  if(toIdx===-1) return;
  if(hoverPos==='after') toIdx+=1;
  order.splice(toIdx,0,movedId);
  runtime.reorder(pid,rootId||id,order,parentId||null);
  if(wasInCompletedList){ /* completedAt ordering remains repository-owned data order */ }
  renderAll();
}

function renderTaskBlock(p, t, opts){
  opts = opts || {};
  const block = document.createElement('div');
  block.className = 'task-block';
  block.dataset.dragId = t.id;

  const row = document.createElement('div');
  row.className = 'row' + (t.done ? ' completed' : '');
  row.style.setProperty('--item-depth', String(opts.depth||0));
  if((opts.depth||0)>0) row.classList.add('sub');

  const grip = document.createElement('span');
  grip.className = 'drag-grip' + ((opts.depth||0)>0 ? ' sub-grip' : '');
  grip.innerHTML = svgGrip();
  grip.onpointerdown = (e)=>{
    e.stopPropagation(); e.preventDefault();
    const parent = opts.parent || null;
    const list = parent ? parent.subtasks : p.tasks;
    startItemDrag(e,t.id,list,block.parentElement,block,p.id,opts.rootId||t.id,parent&&parent.id);
  };
  row.appendChild(grip);
  row.appendChild(buildCircle(t.done, (e)=>{ e.stopPropagation(); opts.depth ? toggleSubDone(p.id, p.tasks.find(x=>x.subtasks&&findNestedItem(x.subtasks,t.id))?.id || '', t.id) : toggleTaskDone(p.id, t.id); }, (opts.depth||0)>0));

  const body = document.createElement('div'); body.className='row-body';
  const title = document.createElement('div'); title.className='row-title'; title.textContent=t.text;
  body.appendChild(title);
  if(opts.hideParent){
    const tag=document.createElement('span'); tag.className='starred-tag'; tag.textContent=opts.parent ? opts.parent.text : ''; body.appendChild(tag);
  }
  row.appendChild(body);

  if(getData().viewMode==='cost'){
    const val=(opts.depth||0)>0 ? (Number(t.cost)||0) : (opts.onlyOpenSubs ? (Number(t.cost)||0) : taskCostSum(t));
    if(val>0){ const c=document.createElement('span'); c.className='row-cost'; c.innerHTML='<span class="cost-unit">تومان</span> '+formatCost(val); row.appendChild(c); }
  }
  row.appendChild(buildStar(t.starred,(e)=>{
    e.stopPropagation();
    if(opts.depth){ toggleSubStar(p.id, opts.rootId, t.id); } else toggleTaskStar(p.id,t.id);
  }));
  row.onclick=()=> opts.depth ? openSubDetail(p.id, opts.rootId, t.id) : openTaskDetail(p.id,t.id);
  block.appendChild(row);

  let children=itemChildren(t).filter(c=>!isPendingDeleted('sub',p.id,opts.rootId||t.id,c.id)&&!c.trashed);
  if(opts.onlyOpenSubs) children=children.filter(c=>!c.done);
  if(opts.onlyDoneSubs) children=children.filter(c=>c.done);
  if(opts.singleSubId) children=children.filter(c=>c.id===opts.singleSubId);

  children.forEach(child=>{
    block.appendChild(renderTaskBlock(p,child,{
      depth:(opts.depth||0)+1,
      parent:t,
      rootId:opts.rootId||t.id,
      onlyOpenSubs:opts.onlyOpenSubs,
      onlyDoneSubs:opts.onlyDoneSubs
    }));
  });
  return block;
}

function renderStarredView(content){
  const groups = collectStarredGrouped();
  if(!groups.length){
    content.appendChild(elFromHtml('<div class="empty-state">هنوز چیزی ستاره‌دار نشده. کنار هر کار روی ستاره بزنید.</div>'));
    return;
  }
  const activeList = [];
  const completedList = [];
  groups.forEach(g=>{
    const openSubs = (g.subs||[]).filter(s => !s.done);
    const doneSubs = (g.subs||[]).filter(s => s.done);
    if(g.taskDone){
      completedList.push({ ...g, subs: g.subs.slice() });
    } else {
      if(g.taskStarred || openSubs.length){
        activeList.push({ ...g, subs: openSubs, taskDone: false });
      }
      if(doneSubs.length){
        completedList.push({
          ...g,
          taskDone: false,
          taskStarred: false,
          subs: doneSubs,
          subsOnly: true
        });
      }
    }
  });

  const activeWrap = document.createElement('div');
  activeWrap.className = 'starred-active-list';
  activeList.forEach(g => activeWrap.appendChild(buildStarredGroup(g, activeWrap)));
  content.appendChild(activeWrap);

  if(completedList.length){
    const header = document.createElement('div');
    header.className = 'completed-header';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'completed-title';
    titleSpan.textContent = 'تکمیل‌شده ('+completedList.length+')';
    header.appendChild(titleSpan);
    if(starredCompletedOpen){
      const clearBtn = document.createElement('button');
      clearBtn.className = 'completed-clear-btn';
      clearBtn.textContent = 'حذف همه';
      clearBtn.onclick = (e)=>{
        e.stopPropagation();
        openConfirm('همه موارد تکمیل‌شده از ستاره‌دارها حذف شوند؟', ()=>{
          completedList.forEach(g=>{
            const t = findTask(g.pid, g.tid);
            if(t){
              if(t.starred) runtime.update(g.pid,g.tid,{starred:false});
              walkItems(t.subtasks,subtask=>{ if(subtask.starred) runtime.updateSubtask(g.pid,g.tid,subtask.id,{starred:false}); });
              removeFromStarredOrder(g.pid,g.tid);
            }
          });
          persist({ local:false });
          refreshStarredPartial();
          showToast('از ستاره‌دارها حذف شدند');
        }, 'حذف همه');
      };
      header.appendChild(clearBtn);
    }
    const chev = document.createElement('span');
    chev.className = 'chev'+(starredCompletedOpen?'':' collapsed');
    chev.innerHTML = svgChevron();
    header.appendChild(chev);
    header.onclick = ()=>{ starredCompletedOpen = !starredCompletedOpen; refreshStarredPartial(); };
    content.appendChild(header);

    const list = document.createElement('div');
    list.className = 'completed-list' + (starredCompletedOpen ? '' : ' hidden');
    completedList.forEach(g => list.appendChild(buildStarredGroup(g, list)));
    content.appendChild(list);
  }
}

function buildStarredGroup(g, containerEl){
  const block = document.createElement('div');
  block.className = 'task-block';
  block.dataset.dragId = g.pid + ':' + g.tid;

  const row = document.createElement('div');
  row.className = 'row' + (g.taskDone ? ' completed' : '');
  const grip = document.createElement('span');
  grip.className = 'drag-grip';
  grip.innerHTML = svgGrip();
  grip.onpointerdown = (e)=>{
    e.stopPropagation(); e.preventDefault();
    startStarredDrag(e, g.pid + ':' + g.tid, block, containerEl);
  };
  row.appendChild(grip);
  row.appendChild(buildCircle(g.taskDone, (e)=>{ e.stopPropagation(); toggleTaskDone(g.pid, g.tid); }));
  const body = document.createElement('div');
  body.className = 'row-body';
  const title = document.createElement('div');
  title.className = 'row-title';
  title.textContent = g.taskText;
  body.appendChild(title);
  const tag = document.createElement('span');
  tag.className = 'starred-tag';
  tag.textContent = g.projectName;
  body.appendChild(tag);
  row.appendChild(body);
  if(getData().viewMode === 'cost' && g.taskCost > 0 && !g.subsOnly){
    const c = document.createElement('span');
    c.className = 'row-cost';
    c.innerHTML = '<span class="cost-unit">تومان</span> '+formatCost(g.taskCost);
    row.appendChild(c);
  }
  row.appendChild(buildStar(g.taskStarred, (e)=>{ e.stopPropagation(); toggleTaskStar(g.pid, g.tid); }));
  row.onclick = ()=> openTaskDetail(g.pid, g.tid);
  block.appendChild(row);

  g.subs.forEach(s=>{
    const srow=document.createElement('div');
    srow.className='row sub'+(s.done?' completed':'');
    srow.style.setProperty('--item-depth',String(s.depth||1));
    srow.dataset.dragId=g.pid+':'+g.tid+':'+s.id;
    const sgrip=document.createElement('span'); sgrip.className='drag-grip sub-grip'; sgrip.innerHTML=svgGrip();
    srow.appendChild(sgrip);
    srow.appendChild(buildCircle(s.done,(e)=>{e.stopPropagation();toggleSubDone(g.pid,g.tid,s.id);},true));
    const sbody=document.createElement('div'); sbody.className='row-body';
    const stitle=document.createElement('div'); stitle.className='row-title'; stitle.textContent=s.text; sbody.appendChild(stitle);
    if(s.parentText){const tag=document.createElement('span');tag.className='starred-tag';tag.textContent=s.parentText;sbody.appendChild(tag);}
    srow.appendChild(sbody);
    if(getData().viewMode==='cost'&&s.cost){const c=document.createElement('span');c.className='row-cost';c.innerHTML='<span class="cost-unit">تومان</span> '+formatCost(s.cost);srow.appendChild(c);}
    srow.appendChild(buildStar(true,(e)=>{e.stopPropagation();toggleSubStar(g.pid,g.tid,s.id);}));
    srow.onclick=()=>openSubDetail(g.pid,g.tid,s.id);
    block.appendChild(srow);
  });

  return block;
}

function startStarredDrag(e, key, wrapperEl, containerEl){
  if(!containerEl) return;
  const siblingEls = Array.from(containerEl.querySelectorAll('.task-block')).filter(el => el.dataset && el.dataset.dragId);
  starredDragState = { key, siblingEls, hoverEl:null, hoverPos:null, wrapperEl, containerEl };
  wrapperEl.classList.add('row-dragging');
  document.addEventListener('pointermove', onStarredDragMove);
  document.addEventListener('pointerup', onStarredDragEnd, { once:true });
}
function onStarredDragMove(e){
  if(!starredDragState) return;
  const y = e.clientY;
  const others = starredDragState.siblingEls.filter(el => el !== starredDragState.wrapperEl);
  let target=null, pos=null;
  for(const el of others){
    const rect = el.getBoundingClientRect();
    const mid = rect.top + rect.height/2;
    if(y < mid){ target = el; pos = 'before'; break; }
  }
  if(!target && others.length){ target = others[others.length-1]; pos = 'after'; }
  others.forEach(el => el.classList.remove('drag-over-top','drag-over-bottom'));
  if(target) target.classList.add(pos==='before' ? 'drag-over-top' : 'drag-over-bottom');
  starredDragState.hoverEl = target;
  starredDragState.hoverPos = pos;
}
function onStarredDragEnd(){
  if(!starredDragState) return;
  document.removeEventListener('pointermove', onStarredDragMove);
  starredDragState.wrapperEl.classList.remove('row-dragging');
  starredDragState.siblingEls.forEach(el => el.classList.remove('drag-over-top','drag-over-bottom'));
  const { key, hoverEl, hoverPos } = starredDragState;
  starredDragState = null;
  if(!hoverEl) return;
  const targetKey = hoverEl.dataset.dragId;
  // build current order from groups
  const groups = collectStarredGrouped();
  let order = groups.map(g => g.pid + ':' + g.tid);
  const fromIdx = order.indexOf(key);
  if(fromIdx===-1) return;
  order.splice(fromIdx,1);
  let toIdx = order.indexOf(targetKey);
  if(toIdx===-1){ order.splice(fromIdx,0,key); return; }
  if(hoverPos==='after') toIdx += 1;
  order.splice(toIdx,0,key);
  getData().starredOrder = order;
  persist({ local:false });
  refreshStarredPartial();
}

function buildCircle(checked, onClick, small){
  const c = document.createElement('span');
  c.className = 'circle' + (checked ? ' checked' : '');
  c.innerHTML = checked ? svgCheck() : '';
  c.onclick = onClick;
  return c;
}
function buildStar(starred, onClick){
  const s = document.createElement('span');
  s.className = 'star-icon' + (starred ? ' starred' : '');
  s.innerHTML = svgStar(starred);
  s.onclick = onClick;
  return s;
}
function elFromHtml(html){
  const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild;
}

/* ---------- detail sheet ---------- */

function openTaskDetail(pid, tid){
  currentDetail = {pid, tid, sid:null};
  renderSheet();
  document.getElementById('overlay').classList.remove('hidden');
}
function openSubDetail(pid, tid, sid){
  currentDetail = {pid, tid, sid};
  renderSheet();
  document.getElementById('overlay').classList.remove('hidden');
}
function closeSheet(){
  currentDetail = null;
  document.getElementById('overlay').classList.add('hidden');
  renderAll();
}
document.getElementById('closeSheetBtn').onclick = closeSheet;
document.getElementById('overlay').onclick = (e)=>{ if(e.target.id==='overlay') closeSheet(); };

function renderSheet(){
  if(!currentDetail) return;
  const { pid, tid, sid } = currentDetail;
  const body = document.getElementById('sheetBody');
  body.innerHTML = '';

  const isSub = !!sid;
  const item = isSub ? findSub(pid, tid, sid) : findTask(pid, tid);
  if(!item){ closeSheet(); return; }

  const titleRow = document.createElement('div');
  titleRow.className = 'detail-title-row';
  titleRow.appendChild(buildCircle(item.done, ()=>{
    if(isSub) toggleSubDone(pid, tid, sid); else toggleTaskDone(pid, tid);
    if(currentDetail) renderSheet();
  }));
  const titleInput = document.createElement('textarea');
  titleInput.className = 'detail-title';
  titleInput.rows = 1;
  titleInput.value = item.text;
  const fitTitle = ()=>{ titleInput.style.height='auto'; titleInput.style.height = Math.max(28, titleInput.scrollHeight)+'px'; };
  titleInput.oninput = fitTitle;
  requestAnimationFrame(fitTitle);
  setTimeout(fitTitle, 50);
  titleInput.onblur = ()=>{
    const text=titleInput.value.trim();
    if(text) (isSub ? runtime.updateSubtask(pid,tid,sid,{text}) : runtime.update(pid,tid,{text}));
    renderAll();
  };
  titleRow.appendChild(titleInput);
  body.appendChild(titleRow);

  const starRow = document.createElement('div');
  starRow.className = 'detail-star-row';
  const starIcon = buildStar(item.starred, (e)=>{
    e.stopPropagation();
    if(isSub) toggleSubStar(pid, tid, sid); else toggleTaskStar(pid, tid);
    if(currentDetail) renderSheet();
  });
  starRow.appendChild(starIcon);
  starRow.onclick = ()=>{
    if(isSub) toggleSubStar(pid, tid, sid); else toggleTaskStar(pid, tid);
    if(currentDetail) renderSheet();
  };
  body.appendChild(starRow);

  renderTaskActivities({
    document,item,projectId:pid,container:body,
    onChange:activities=>{
      if(isSub) runtime.updateSubtask(pid,tid,sid,{activities});
      else runtime.update(pid,tid,{activities});
    },
  });

  {
    const subField = document.createElement('div');
    subField.className = 'detail-field';
    subField.innerHTML = '<div class="detail-label">زیرمجموعه‌ها</div>';
    const subListWrap = document.createElement('div');
    subField.appendChild(subListWrap);

    function renderSubItems(){
      subListWrap.innerHTML = '';
      itemChildren(item).filter(s=>!isPendingDeleted('sub',pid,tid,s.id)&&!s.trashed).forEach(s=>{
        const row=document.createElement('div'); row.className='sub-item';
        row.appendChild(buildCircle(s.done,()=>{ toggleSubDone(pid,tid,s.id); renderSubItems(); },true));
        const input=document.createElement('input'); input.className='sub-text'; input.value=s.text;
        input.onblur=()=>{ const text=input.value.trim(); if(text) runtime.updateSubtask(pid,tid,s.id,{text}); renderAll(); };
        row.appendChild(input);
        const del=document.createElement('button'); del.className='sub-del'; del.innerHTML=svgTrash();
        del.onclick=()=>{ softDelete('sub',pid,tid,s.id,'زیرمجموعه حذف شد'); renderSubItems(); };
        row.appendChild(del);
        row.onclick=(e)=>{ if(e.target===input||e.target===del||del.contains(e.target)) return; openSubDetail(pid,tid,s.id); };
        subListWrap.appendChild(row);
      });
    }
    renderSubItems();
    const addRow=document.createElement('div'); addRow.className='add-sub-row';
    const addInput=document.createElement('input'); addInput.className='sub-add-input'; addInput.placeholder='افزودن زیرمجموعه…';
    const addBtn=document.createElement('button'); addBtn.className='add-sub-btn'; addBtn.innerHTML=svgPlus();
    const commitAdd=()=>{
      if(!addInput.value.trim()) return;
      const text=addInput.value.trim(); addInput.value='';
      runtime.createSubtask(pid,tid,text,item.id); renderSubItems(); renderAll();
    };
    addBtn.onclick=commitAdd;
    addInput.onkeydown=e=>{ if(e.key==='Enter'){e.preventDefault();commitAdd();} };
    addInput.onblur=()=>{ if(addInput.value.trim()) commitAdd(); };
    addRow.append(addInput,addBtn); subField.appendChild(addRow); body.appendChild(subField);
  }

  const costField = document.createElement('div');
  costField.className = 'detail-field';
  costField.innerHTML = '<div class="detail-label">برآورد هزینه (تومان)</div>';
  const costDisplay = document.createElement('div');
  costDisplay.className = 'detail-cost-display';
  costDisplay.textContent = formatCostDisplay(item.cost) || 'وارد کنید…';
  if(!formatCostDisplay(item.cost)) costDisplay.classList.add('empty');
  costDisplay.onclick = ()=> openCostEditor(item,pid,tid,sid,costDisplay);
  costField.appendChild(costDisplay);
  body.appendChild(costField);

  document.getElementById('deleteSheetBtn').onclick = ()=>{
    closeSheet();
    if(isSub) softDelete('sub', pid, tid, sid, 'زیرمجموعه حذف شد');
    else softDelete('task', pid, tid, null, 'کار حذف شد');
  };

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'confirm-btn';
  confirmBtn.textContent = 'تایید';
  confirmBtn.onclick = ()=>{
    const text=titleInput.value.trim();
    if(text) (isSub ? runtime.updateSubtask(pid,tid,sid,{text}) : runtime.update(pid,tid,{text}));
    closeSheet();
  };
  body.appendChild(confirmBtn);
}

  function renderTrashItem(entry,list){
    const record=entry.record;
    const wrap=document.createElement('div'); wrap.className='trash-task-wrap project-trash-record'; addTrashSourceBadge(wrap,entry.type);
    const row=document.createElement('div'); row.className='row'+(record.done?' completed':'')+(entry.type==='subtask'?' sub':'');
    row.style.setProperty('--item-depth',entry.type==='subtask'?'1':'0'); row.classList.add('is-static-drag-row');
    const grip=document.createElement('span'); grip.className='drag-grip'+(entry.type==='subtask'?' sub-grip':''); grip.innerHTML=svgGrip(); row.appendChild(grip);
    row.appendChild(buildCircle(!!record.done,()=>{},entry.type==='subtask'));
    const body=document.createElement('div'); body.className='row-body'; const title=document.createElement('div'); title.className='row-title'; title.textContent=record.text||'مورد بدون عنوان'; body.appendChild(title); row.appendChild(body);
    const actions=document.createElement('div'); actions.className='project-trash-inline-actions'; appendTrashActions(actions,entry); row.appendChild(actions);
    row.appendChild(buildStar(!!record.starred,()=>{})); wrap.appendChild(row); list.appendChild(wrap);
  }
  return { renderProjectView, refreshProjectPartial, renderInlineAddRow, renderTaskBlock,
    renderStarredView, buildStarredGroup, renderTrashItem, openTaskDetail, openSubDetail, closeSheet, renderSheet,
    hasCurrentDetail:()=>!!currentDetail, setAddItemActive(value){ addItemActive=!!value; } };
}


export default createTaskView;
