import { appendReportPhotos } from '../wbs/dailyExecutionReport.js';
import { executionReportDay, jalaliDayNumber, tehranTodayJalali } from '../../domain/wbs/todayDomain.js';
import { formatJalaliDisplay, openJalaliPicker } from '../../ui/jalali.js';
import { toEnglishDigits, toPersianDigits } from '../../ui/digits.js';

const clock = new Intl.DateTimeFormat('fa-IR', { timeZone:'Asia/Tehran', hour:'2-digit', minute:'2-digit' });
const ALL_WORKS = '';
const kindLabel = { progress:'گزارش پیشرفت', start_delayed:'شروع نشد' };

export function executionWorkKey({ kind, workId, id }){
  return JSON.stringify([kind,String(workId),String(id)]);
}

export function collectDailyExecutionReports(project){
  const rows = [];
  function add(entity, path, ref){
    if(!entity || entity.trashed || entity.type==='خرید') return;
    const work = {
      key:executionWorkKey(ref),
      title:entity.title || entity.text || 'کار',
      path:path.join(' ← '),
    };
    for(const report of entity.executionReports || []){
      if(!report || report.trashed) continue;
      const day = executionReportDay(report);
      if(jalaliDayNumber(day) === null) continue;
      rows.push({ work, kind:'progress', day, at:report.createdAt, author:report.createdBy?.name,
        description:report.description, progress:report.progress, photos:report.photos });
    }
    for(const entry of entity.executionHistory || []){
      if(entry?.type !== 'start_delayed') continue;
      if(jalaliDayNumber(entry.day) === null) continue;
      rows.push({ work, kind:'start_delayed', day:entry.day, at:entry.at, author:entry.actor?.name,
        description:[entry.reason,entry.description].filter(Boolean).join('\n') });
    }
  }
  function walk(nodes, path){
    for(const node of nodes || []){
      if(!node || node.trashed) continue;
      add(node, path, { kind:'work', workId:node.id, id:node.id });
      const next = [...path, node.text || node.title].filter(Boolean);
      for(const task of node.workTasks || []){
        if(task) add(task, next, { kind:'task', workId:node.id, id:task.id });
      }
      walk(node.subtasks, next);
    }
  }
  walk(project?.tasks, []);
  return rows.sort((a,b)=>b.day.localeCompare(a.day) || new Date(b.at) - new Date(a.at));
}

function searchable(value){
  return toEnglishDigits(String(value ?? '')).replaceAll('ي','ی').replaceAll('ك','ک').replace(/\s|\u200c/g,'').toLowerCase();
}

export function filterDailyExecutionReports(rows, { work, query, firstDay, lastDay }){
  const search = searchable(query);
  return rows.filter(row=>{
    const day = jalaliDayNumber(row.day);
    return (!work || row.work.key===work)
      && (firstDay == null || day>=firstDay)
      && (lastDay == null || day<=lastDay)
      && [row.work.title,row.work.path,row.description].some(value=>searchable(value).includes(search));
  });
}

function counts(rows){
  const delays = rows.filter(row=>row.kind==='start_delayed').length;
  return `${toPersianDigits(rows.length-delays)} گزارش پیشرفت · ${toPersianDigits(delays)} ثبت دلیل شروع نشدن`;
}

export function renderDailyExecutionReports(project, documentRef = document, requestedWork = ''){
  const element = (tag, className, text) => {
    const node = documentRef.createElement(tag);
    if(className) node.className = className;
    if(text !== undefined) node.textContent = text;
    return node;
  };
  const select = (label, options) => {
    const control = element('select','wbs-input');
    control.setAttribute('aria-label',label);
    for(const [value,title] of options){
      const option = element('option','',title);
      option.value = value;
      control.appendChild(option);
    }
    return control;
  };

  const rows = collectDailyExecutionReports(project);
  const works = new Map(rows.map(row=>[row.work.key,row.work]));
  const frame = element('section','wbs-view-frame daily-execution-reports');
  const filters = element('div','daily-execution-filters');
  const search = element('input','wbs-input');
  search.type = 'search';
  search.placeholder = 'جست‌وجوی کار، مسیر یا متن گزارش';
  search.setAttribute('aria-label',search.placeholder);
  const work = select('انتخاب کار',[[ALL_WORKS,'همهٔ کارها'], ...Array.from(works.values(), item=>
    [item.key,[item.title,item.path].filter(Boolean).join(' · ')])]);
  const period = select('بازهٔ گزارش',[
    ['today','امروز'],['week','۷ روز اخیر'],['custom','بازهٔ دلخواه'],['all','همهٔ تاریخ‌ها'],
  ]);
  work.value = works.has(requestedWork) ? requestedWork : ALL_WORKS;
  period.value = work.value ? 'all' : 'week';
  const dates = element('div','daily-execution-dates');
  let from = tehranTodayJalali();
  let to = from;
  const fromButton = element('button','wbs-input');
  const toButton = element('button','wbs-input');
  fromButton.type = toButton.type = 'button';
  const pickerOptions = { documentRef, windowRef:documentRef.defaultView };
  fromButton.addEventListener('click',()=>openJalaliPicker(from,day=>{
    from = day;
    if(to<from) to=from;
    paint();
  },{},pickerOptions));
  toButton.addEventListener('click',()=>openJalaliPicker(to,day=>{
    to = day;
    if(from>to) from=to;
    paint();
  },{},pickerOptions));
  dates.append(fromButton,toButton);
  filters.append(search,work,period,dates);

  const selected = element('div','daily-execution-work');
  const totals = element('div','daily-execution-totals');
  totals.setAttribute('aria-live','polite');
  const body = element('div','wbs-view-body daily-execution-days');

  function paint(){
    const today = jalaliDayNumber(tehranTodayJalali());
    const firstDay = { today, week:today-6, custom:jalaliDayNumber(from) }[period.value];
    const lastDay = period.value==='all' ? null : period.value==='custom' ? jalaliDayNumber(to) : today;
    const filtered = filterDailyExecutionReports(rows,{work:work.value,query:search.value,firstDay,lastDay});
    dates.hidden = period.value!=='custom';
    fromButton.textContent = 'از ' + formatJalaliDisplay(from);
    toButton.textContent = 'تا ' + formatJalaliDisplay(to);
    const item = works.get(work.value);
    selected.hidden = !item;
    selected.replaceChildren();
    if(item) selected.append(element('strong','',item.title),element('small','',item.path));
    totals.textContent = counts(filtered);
    body.replaceChildren();
    if(!filtered.length){
      body.appendChild(element('div','empty-state','گزارشی در این بازه پیدا نشد.'));
      return;
    }
    const groups = new Map();
    for(const row of filtered){
      if(!groups.has(row.day)) groups.set(row.day,[]);
      groups.get(row.day).push(row);
    }
    for(const [day, dayRows] of groups){
      const group = element('section','daily-execution-day');
      group.append(
        element('h3','',formatJalaliDisplay(day)),
        element('small','',counts(dayRows)),
      );
      for(const row of dayRows){
        const card = element('details','today-report');
        card.open = Boolean(work.value);
        const heading = element('summary','daily-execution-summary');
        const progress = row.progress == null ? '' : ` · ${toPersianDigits(row.progress)}٪`;
        const stamp = new Date(row.at);
        const time = Number.isFinite(stamp.getTime()) ? clock.format(stamp) : '';
        heading.append(
          element('strong','',row.work.title),
          element('small','',row.work.path),
          element('small','',[kindLabel[row.kind]+progress,row.author || 'کاربر',time].filter(Boolean).join(' · ')),
        );
        card.append(heading,element('p','',row.description || '—'));
        appendReportPhotos(card,row.photos);
        group.appendChild(card);
      }
      body.appendChild(group);
    }
  }

  search.addEventListener('input',paint);
  period.addEventListener('change',paint);
  work.addEventListener('change',()=>{
    period.value = work.value ? 'all' : 'week';
    paint();
  });
  frame.append(filters,selected,totals,body);
  paint();
  return frame;
}
