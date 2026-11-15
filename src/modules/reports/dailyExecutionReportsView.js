import { renderTodayCard } from '../wbs/todayView.js';
import { appendReportPhotos } from '../wbs/dailyExecutionReport.js';
import { executionWorkKey, executionReportDay, jalaliDayNumber, tehranTodayJalali } from '../../domain/wbs/todayDomain.js';
import { formatJalaliDisplay, openJalaliPicker } from '../../ui/jalali.js';
import { toEnglishDigits, toPersianDigits } from '../../ui/digits.js';
import { openWbsSheet, closeWbsSheet } from '../wbs/wbsSheet.js';
import { openContractorPicker, openActivityPicker, openContractTemplatePicker } from '../contracts/contractPickers.js';

const clock = new Intl.DateTimeFormat('fa-IR', { timeZone:'Asia/Tehran', hour:'2-digit', minute:'2-digit' });
const kindLabel = { progress:'گزارش پیشرفت', start_delayed:'شروع نشد' };

export {executionWorkKey};

export function collectDailyExecutionReports(project){
  const rows = [];
  function add(entity, path, ref){
    if(!entity || entity.trashed || (entity.type==='خرید' && ref.kind!=='standalone')) return;
    const work = {
      key:executionWorkKey(ref),
      item:{...ref,entity,path},
      title:entity.title || entity.text || 'کار',
      path:path.join(' ← '),
      contractorContactId: entity.contractorContactId || '',
      activityIds: entity.activityIds || (entity.activityId ? [entity.activityId] : []),
      templateId: entity.templateId || '',
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
  for(const work of project?.standaloneWorks||[]){
    if(work)add(work,[],{kind:'standalone',workId:work.id,id:work.id});
  }
  return rows.sort((a,b)=>b.day.localeCompare(a.day) || new Date(b.at) - new Date(a.at));
}

function searchable(value){
  return toEnglishDigits(String(value ?? '')).replaceAll('ي','ی').replaceAll('ك','ک').replace(/\s|\u200c/g,'').toLowerCase();
}

export function filterDailyExecutionReports(rows, filters = {}){
  const { query, selectedWorkKeys, contractorId, activityId, templateId, fromDay, toDay } = filters;
  const search = searchable(query);
  const keySet = selectedWorkKeys && selectedWorkKeys.size ? selectedWorkKeys : null;
  return rows.filter(row=>{
    const day = jalaliDayNumber(row.day);
    if(keySet && !keySet.has(row.work.key)) return false;
    if(contractorId && String(row.work.contractorContactId) !== String(contractorId)) return false;
    if(activityId && !(row.work.activityIds || []).map(String).includes(String(activityId))) return false;
    if(templateId && String(row.work.templateId) !== String(templateId)) return false;
    if(fromDay != null && day < fromDay) return false;
    if(toDay != null && day > toDay) return false;
    if(search && ![row.work.title, row.work.path, row.description].some(value=>searchable(value).includes(search))) return false;
    return true;
  });
}

function counts(rows){
  const delays = rows.filter(row=>row.kind==='start_delayed').length;
  return `${toPersianDigits(rows.length-delays)} گزارش پیشرفت · ${toPersianDigits(delays)} ثبت دلیل شروع نشدن`;
}

function buildStageTree(project){
  const tree = [];
  function walk(nodes, parentPath = []){
    return (nodes || []).filter(n => n && !n.trashed).map(node => {
      const title = node.title || node.text || 'بدون نام';
      const path = [...parentPath, title];
      const children = walk(node.subtasks, path);
      const works = (node.workTasks || []).filter(t => t && !t.trashed).map(t => ({
        key: executionWorkKey({ kind:'task', workId:node.id, id:t.id }),
        title: t.title || t.text || 'کار',
        path: [...path, t.title || t.text].join(' ← '),
        isWork: true,
      }));
      return {
        id: node.id,
        title,
        path: path.join(' ← '),
        children,
        works,
        isStage: true,
      };
    });
  }
  tree.push(...walk(project?.tasks || []));
  // standalone
  for(const work of project?.standaloneWorks || []){
    if(!work || work.trashed) continue;
    tree.push({
      id: work.id,
      title: work.title || work.text || 'خرده کار',
      path: work.title || '',
      children: [],
      works: [{ key: executionWorkKey({ kind:'standalone', workId:work.id, id:work.id }), title: work.title || 'کار', path:'', isWork:true }],
      isStage: false,
    });
  }
  return tree;
}

function collectAllWorkKeys(node){
  const keys = new Set();
  if(node.works) node.works.forEach(w => keys.add(w.key));
  (node.children || []).forEach(c => collectAllWorkKeys(c).forEach(k => keys.add(k)));
  return keys;
}

export function renderDailyExecutionReports(project, documentRef = document, requestedWork = ''){
  const element = (tag, className, text) => {
    const node = documentRef.createElement(tag);
    if(className) node.className = className;
    if(text !== undefined) node.textContent = text;
    return node;
  };

  const rows = collectDailyExecutionReports(project);
  const stageTree = buildStageTree(project);

  // Filter state
  let selectedWorkKeys = new Set(requestedWork ? [requestedWork] : []);
  let contractorId = '';
  let activityId = '';
  let templateId = '';
  let fromDate = '';
  let toDate = '';
  let query = '';

  const frame = element('section','wbs-view-frame wbs-today-frame daily-execution-reports');
  const filters = element('div','daily-execution-filters');
  filters.style.display = 'flex';
  filters.style.gap = '8px';
  filters.style.alignItems = 'center';

  const search = element('input','wbs-input');
  search.type = 'search';
  search.placeholder = 'جست‌وجوی کار، مسیر یا متن گزارش';
  search.setAttribute('aria-label', search.placeholder);
  search.style.flex = '1';
  search.style.minWidth = '0';

  const filterBtn = element('button','wbs-input filter-trigger');
  filterBtn.type = 'button';
  filterBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align:middle"><path fill="currentColor" d="M3 5h18v2H3V5zm4 6h10v2H7v-2zm2 6h6v2H9v-2z"/></svg> فیلتر`;
  filterBtn.style.flex = 'none';
  filterBtn.style.padding = '0 12px';
  filterBtn.style.display = 'flex';
  filterBtn.style.alignItems = 'center';
  filterBtn.style.gap = '4px';

  const badge = element('span','filter-badge');
  badge.style.background = '#c62828';
  badge.style.color = '#fff';
  badge.style.borderRadius = '10px';
  badge.style.padding = '1px 6px';
  badge.style.fontSize = '11px';
  badge.style.marginInlineStart = '4px';
  badge.hidden = true;
  filterBtn.append(badge);

  filters.append(search, filterBtn);

  const totals = element('div','daily-execution-totals');
  totals.setAttribute('aria-live','polite');
  const body = element('div','wbs-view-body daily-execution-days');

  function activeFilterCount(){
    let n = 0;
    if(selectedWorkKeys.size) n++;
    if(contractorId) n++;
    if(activityId) n++;
    if(templateId) n++;
    if(fromDate || toDate) n++;
    return n;
  }

  function updateBadge(){
    const n = activeFilterCount();
    badge.hidden = !n;
    badge.textContent = toPersianDigits(n);
  }

  function paint(){
    const fromDay = fromDate ? jalaliDayNumber(fromDate) : null;
    const toDay = toDate ? jalaliDayNumber(toDate) : null;
    const filtered = filterDailyExecutionReports(rows, {
      query: search.value,
      selectedWorkKeys,
      contractorId,
      activityId,
      templateId,
      fromDay,
      toDay,
    });
    totals.textContent = counts(filtered);
    body.replaceChildren();
    updateBadge();
    if(!filtered.length){
      body.appendChild(element('div','empty-state','گزارشی با این فیلترها پیدا نشد.'));
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
        card.open = true;
        const heading = element('summary','daily-execution-summary');
        const progress = row.progress == null ? '' : ` · ${toPersianDigits(row.progress)}٪`;
        const stamp = new Date(row.at);
        const time = Number.isFinite(stamp.getTime()) ? clock.format(stamp) : '';
        heading.append(
          element('small','',[kindLabel[row.kind]+progress,row.author || 'کاربر',time].filter(Boolean).join(' · ')),
        );
        card.append(heading,element('p','',row.description || '—'));
        appendReportPhotos(card,row.photos);
        group.append(renderTodayCard(documentRef,project,row.work.item,day,undefined,{}),card);
      }
      body.appendChild(group);
    }
  }

  function openHierarchicalStagePicker(){
    let currentPath = []; // array of nodes
    let currentNodes = stageTree;
    const selected = new Set(selectedWorkKeys);

    const sheetBody = documentRef.createElement('div');
    sheetBody.style.padding = '0';

    function renderLevel(){
      sheetBody.replaceChildren();
      // breadcrumb
      const crumb = element('div','filter-breadcrumb');
      crumb.style.padding = '12px 16px';
      crumb.style.borderBottom = '1px solid #eee';
      crumb.style.display = 'flex';
      crumb.style.alignItems = 'center';
      crumb.style.gap = '6px';
      crumb.style.fontSize = '13px';
      if(currentPath.length){
        const back = element('button','','←');
        back.type = 'button';
        back.style.border = '0';
        back.style.background = 'transparent';
        back.style.fontSize = '18px';
        back.onclick = () => {
          currentPath.pop();
          currentNodes = currentPath.length ? currentPath[currentPath.length-1].children : stageTree;
          renderLevel();
        };
        crumb.append(back);
      }
      crumb.append(element('span','', currentPath.map(n=>n.title).join(' < ') || 'مراحل و کارها'));
      sheetBody.append(crumb);

      // search
      const searchIn = element('input','wbs-input');
      searchIn.placeholder = 'جستجو در مراحل...';
      searchIn.style.margin = '12px 16px';
      searchIn.style.width = 'calc(100% - 32px)';
      sheetBody.append(searchIn);

      const list = element('div','filter-stage-list');
      list.style.padding = '0 8px';

      const term = '';
      const items = currentNodes.filter(n => !term || searchable(n.title).includes(searchable(term)));

      items.forEach(node => {
        const row = element('button','filter-stage-row');
        row.type = 'button';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.width = '100%';
        row.style.padding = '14px 12px';
        row.style.border = '0';
        row.style.borderBottom = '1px solid #f0f0f0';
        row.style.background = 'transparent';
        row.style.textAlign = 'right';
        row.style.font = 'inherit';
        const hasChildren = (node.children && node.children.length) || (node.works && node.works.length);
        const label = element('span','', node.title);
        const right = element('span','');
        if(hasChildren) right.textContent = '›';
        else right.textContent = '';
        row.append(label, right);
        row.onclick = () => {
          if(hasChildren){
            currentPath.push(node);
            currentNodes = node.children.length ? node.children : node.works.map(w => ({...w, children:[], works:[]}));
            renderLevel();
          } else {
            // select single work
            if(selected.has(node.key)) selected.delete(node.key);
            else selected.add(node.key);
            updateApplyButton();
          }
        };
        // also allow selecting the package
        if(node.isStage){
          const selectPkg = element('button','','انتخاب پکیج');
          selectPkg.type = 'button';
          selectPkg.style.fontSize = '11px';
          selectPkg.style.color = '#1565c0';
          selectPkg.style.border = '0';
          selectPkg.style.background = 'transparent';
          selectPkg.onclick = (e) => {
            e.stopPropagation();
            const keys = collectAllWorkKeys(node);
            keys.forEach(k => selected.add(k));
            updateApplyButton();
          };
          row.append(selectPkg);
        }
        list.append(row);
      });
      sheetBody.append(list);

      // bottom apply button (red)
      const footer = element('div','filter-apply-bar');
      footer.style.position = 'sticky';
      footer.style.bottom = '0';
      footer.style.padding = '12px 16px';
      footer.style.background = '#fff';
      footer.style.borderTop = '1px solid #eee';
      const apply = element('button','filter-apply-btn');
      apply.type = 'button';
      apply.style.width = '100%';
      apply.style.padding = '12px';
      apply.style.background = '#c62828';
      apply.style.color = '#fff';
      apply.style.border = '0';
      apply.style.borderRadius = '8px';
      apply.style.fontWeight = '600';
      function updateApplyButton(){
        const count = selected.size;
        apply.textContent = count ? `${toPersianDigits(count)} کار انتخاب شد · اعمال` : 'اعمال فیلتر مراحل';
      }
      updateApplyButton();
      apply.onclick = () => {
        selectedWorkKeys = selected;
        closeWbsSheet();
        paint();
      };
      footer.append(apply);
      sheetBody.append(footer);
    }

    renderLevel();

    openWbsSheet({
      title: 'مراحل و کارها',
      body: () => sheetBody,
      showSave: false,
      presentation: 'filter-sheet',
    });
  }

  function openFilterSheet(){
    const bodyEl = documentRef.createElement('div');
    bodyEl.style.padding = '0';

    const items = [
      { label: 'پیمانکار', value: () => contractorId ? 'انتخاب شده' : 'انتخاب', action: () => {
        // simplified: open a simple list or use existing picker if possible
        // For now, open a basic picker via search or alert for demo; in real use openContractorPicker
        openContractorPicker(project.id, { contractorId }, (id) => { contractorId = id; closeWbsSheet(); paint(); openFilterSheet(); });
      }},
      { label: 'مراحل و کارها', value: () => selectedWorkKeys.size ? `${toPersianDigits(selectedWorkKeys.size)} مورد` : 'انتخاب', action: () => { closeWbsSheet(); openHierarchicalStagePicker(); }},
      { label: 'فعالیت', value: () => activityId ? 'انتخاب شده' : 'انتخاب', action: () => {
        openActivityPicker(project.id, { activityId }, (id) => { activityId = id; closeWbsSheet(); paint(); openFilterSheet(); });
      }},
      { label: 'قالب قرارداد', value: () => templateId ? 'انتخاب شده' : 'انتخاب', action: () => {
        openContractTemplatePicker(project.id, { templateId }, (id) => { templateId = id; closeWbsSheet(); paint(); openFilterSheet(); });
      }},
      { label: 'از تاریخ', value: () => fromDate ? formatJalaliDisplay(fromDate) : 'انتخاب', action: () => {
        openJalaliPicker(fromDate, day => { fromDate = day; if(toDate && toDate < fromDate) toDate = fromDate; paint(); openFilterSheet(); });
      }},
      { label: 'تا تاریخ', value: () => toDate ? formatJalaliDisplay(toDate) : 'انتخاب', action: () => {
        openJalaliPicker(toDate, day => { toDate = day; if(fromDate && fromDate > toDate) fromDate = toDate; paint(); openFilterSheet(); });
      }},
    ];

    items.forEach(item => {
      const row = element('button','filter-option-row');
      row.type = 'button';
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.width = '100%';
      row.style.padding = '16px';
      row.style.border = '0';
      row.style.borderBottom = '1px solid #eee';
      row.style.background = 'transparent';
      row.style.font = 'inherit';
      row.style.textAlign = 'right';
      row.append(element('span','', item.label), element('span','filter-select-label', item.value()));
      row.querySelector('.filter-select-label').style.color = '#1565c0';
      row.onclick = item.action;
      bodyEl.append(row);
    });

    const clear = element('button','filter-clear-btn','پاک کردن فیلترها');
    clear.type = 'button';
    clear.style.width = '100%';
    clear.style.padding = '16px';
    clear.style.border = '0';
    clear.style.background = 'transparent';
    clear.style.color = '#c62828';
    clear.style.fontWeight = '600';
    clear.onclick = () => {
      selectedWorkKeys = new Set();
      contractorId = activityId = templateId = fromDate = toDate = '';
      closeWbsSheet();
      paint();
    };
    bodyEl.append(clear);

    openWbsSheet({
      title: 'فیلترها',
      body: () => bodyEl,
      showSave: false,
    });
  }

  filterBtn.onclick = openFilterSheet;
  search.addEventListener('input', paint);

  frame.append(filters, totals, body);
  paint();
  return frame;
}
