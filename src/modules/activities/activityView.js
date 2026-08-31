import { activityApi } from '../../domain/activityApi.js';

function activityLabel(projectId, activityId){
  const activity=activityApi.lookup(projectId,activityId);
  return activity ? activity.name : 'فعالیت حذف‌شده';
}

/** Render and bind the Activity picker embedded in a task/subtask detail sheet. */
export function renderTaskActivities({document,item,projectId,container,onChange}){
  const field=document.createElement('div');
  field.className='detail-field';
  field.innerHTML='<div class="detail-label">فعالیت‌ها (اختیاری)</div>';
  const list=document.createElement('div');
  list.className='detail-activities-list';

  const selectedIds=()=>Array.isArray(item.activities) ? item.activities : [];
  const commit=ids=>{
    const next=[...new Set(ids.filter(Boolean))];
    onChange(next);
    item.activities=next;
    renderSelected();
  };
  const renderSelected=()=>{
    list.innerHTML='';
    const ids=selectedIds();
    ids.forEach(id=>{
      const chip=document.createElement('div');
      chip.className='detail-activity-chip';
      const label=document.createElement('span');
      label.textContent=activityLabel(projectId,id);
      const remove=document.createElement('button');
      remove.type='button';
      remove.textContent='حذف';
      remove.onclick=()=>commit(ids.filter(value=>value!==id));
      chip.append(label,remove);
      list.appendChild(chip);
    });
    if(!ids.length){
      const empty=document.createElement('div');
      empty.className='detail-activity-empty';
      empty.textContent='برای این آیتم فعالیتی انتخاب نشده است.';
      list.appendChild(empty);
    }
  };
  renderSelected();
  field.appendChild(list);

  const picker=document.createElement('div');
  picker.className='activity-picker';
  const input=document.createElement('input');
  input.type='search';
  input.className='activity-search-input';
  input.placeholder='جستجوی فعالیت...';
  input.autocomplete='off';
  const results=document.createElement('div');
  results.className='activity-search-results';
  picker.append(input,results);
  field.appendChild(picker);

  const available=()=>activityApi.listPage(projectId,{limit:200}).items
    .filter(activity=>!selectedIds().includes(activity.id));
  const renderResults=(open=true)=>{
    const query=input.value.trim().toLocaleLowerCase('fa');
    const matches=available().filter(activity=>
      String(activity.name||'').toLocaleLowerCase('fa').includes(query)
    );
    results.innerHTML='';
    if(!matches.length){
      const empty=document.createElement('div');
      empty.className='activity-search-empty';
      empty.textContent=query ? 'فعالیتی پیدا نشد.' : 'فعالیت جدیدی برای انتخاب وجود ندارد.';
      results.appendChild(empty);
    }else{
      matches.forEach(activity=>{
        const option=document.createElement('button');
        option.type='button';
        option.className='activity-search-option';
        option.textContent=activity.name;
        option.onclick=()=>{
          commit([...selectedIds(),activity.id]);
          results.classList.remove('open');
          input.value='';
        };
        results.appendChild(option);
      });
    }
    results.classList.toggle('open',open);
  };
  input.addEventListener('focus',()=>renderResults(true));
  input.addEventListener('input',()=>renderResults(true));
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      results.classList.remove('open');
      input.blur();
    }
    if(event.key==='Enter'){
      const first=results.querySelector('.activity-search-option');
      if(first){event.preventDefault();first.click();}
    }
  });
  document.addEventListener('click',event=>{
    if(!picker.contains(event.target)) results.classList.remove('open');
  });
  container.appendChild(field);
  return field;
}
