import { formatJalaliDisplay } from '../../ui/jalali.js';
import { jalaliDayNumber } from '../../domain/wbs/costline.js';
import { todayApi } from '../../domain/wbs/todayApi.js';

const PAGE = 20;

export function completedWorks(project){
  const rows = [];
  const walk = (nodes, path) => (nodes || []).forEach(node => {
    if(!node || node.trashed) return;
    const next = path.concat(node.text || node.title || '').filter(Boolean);
    (node.workTasks || []).forEach(task => {
      if(task && !task.trashed && (task.completionState === 'approved' || task.completed)) rows.push(rowOf(task, next, { kind:'task', id:task.id, workId:node.id }));
    });
    if(node.completionState === 'approved' || node.completed) rows.push(rowOf(node, path, { kind:'work', id:node.id }));
    walk(node.subtasks, next);
  });
  walk(project?.tasks || [], []);
  return rows;
}

function rowOf(entity, path, ref){
  const plannedStart = entity.scheduleStart || '';
  const plannedEnd = entity.scheduleEnd || '';
  const actualStart = entity.actualStart || '';
  const actualEnd = jalaliFromStamp(entity.actualFinishDay) || entity.actualFinish || '';
  const planned = jalaliDayNumber(plannedEnd);
  const actual = jalaliDayNumber(actualEnd);
  const delta = planned != null && actual != null ? actual - planned : null;
  return {
    id: entity.id, ref,
    title: entity.title || entity.text || '',
    path: path.join(' ← '),
    plannedStart, plannedEnd, actualStart, actualEnd, delta,
    assignee: entity.assigneeName || '',
    approver: entity.approvedBy?.name || '',
    estimate: Number(entity.amount || entity.cost || entity.unitCost || 0),
    actualCost: entity.actualCost ?? null,
  };
}

function jalaliFromStamp(value){
  if(!value) return '';
  if(String(value).includes('/')) return String(value);
  const date = new Date(Number(value));
  if(Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year:'numeric', month:'2-digit', day:'2-digit', timeZone:'Asia/Tehran' }).format(date).replace(/-/g, '/');
}

export function renderDoneWorks(project, documentRef = document, onChanged){
  const frame = documentRef.createElement('section');
  frame.className = 'wbs-view-frame wbs-delay-frame';
  let shown = PAGE;
  let assignee = '';
  let approver = '';
  const header = documentRef.createElement('div');
  header.className = 'wbs-view-header';
  const title = documentRef.createElement('div');
  title.className = 'wbs-view-title';
  header.appendChild(title);
  const filters = documentRef.createElement('div');
  filters.className = 'wbs-view-actions';
  const assigneeInput = documentRef.createElement('input');
  assigneeInput.className = 'wbs-input';
  assigneeInput.placeholder = 'مسئول';
  const approverInput = documentRef.createElement('input');
  approverInput.className = 'wbs-input';
  approverInput.placeholder = 'تأییدکننده';
  [assigneeInput, approverInput].forEach(input => input.addEventListener('input', () => { assignee = assigneeInput.value.trim(); approver = approverInput.value.trim(); shown = PAGE; paint(); }));
  filters.append(assigneeInput, approverInput);
  header.appendChild(filters);
  const body = documentRef.createElement('div');
  body.className = 'wbs-view-body wbs-delay-body';
  const more = documentRef.createElement('button');
  more.type = 'button';
  more.className = 'wbs-tree-mode-tab';
  more.textContent = 'نمایش بیشتر';
  more.addEventListener('click', () => { shown += PAGE; paint(); });
  function paint(){
    const all = completedWorks(project);
    const rows = all.filter(row => (!assignee || row.assignee.includes(assignee)) && (!approver || row.approver.includes(approver)));
    title.textContent = `کارهای انجام‌شده · ${new Intl.NumberFormat('fa-IR').format(rows.length)}`;
    body.innerHTML = '';
    rows.slice(0, shown).forEach(row => {
      const card = documentRef.createElement('article');
      card.className = 'wbs-delay-row';
      const variance = row.delta == null ? '—' : row.delta > 0 ? `${row.delta} روز تأخیر` : row.delta < 0 ? `${Math.abs(row.delta)} روز زودتر` : 'به‌موقع';
      card.innerHTML = `<strong>${escapeText(row.title)}</strong><span>${escapeText(row.path || '—')}</span><span>برنامه: ${escapeText(show(row.plannedStart))} تا ${escapeText(show(row.plannedEnd))}</span><span>واقعی: ${escapeText(show(row.actualStart))} تا ${escapeText(show(row.actualEnd))}</span><span>${escapeText(variance)}</span><span>مسئول: ${escapeText(row.assignee || '—')}</span><span>تأییدکننده: ${escapeText(row.approver || '—')}</span><span>برآورد: ${money(row.estimate)}</span><span>هزینه واقعی: ${row.actualCost == null ? '—' : money(row.actualCost)}</span>`;
      const cancel = documentRef.createElement('button');
      cancel.type = 'button';
      cancel.className = 'wbs-primary-action is-secondary';
      cancel.textContent = 'لغو انجام کار';
      cancel.addEventListener('click', () => {
        const user = documentRef.defaultView?.firebase?.auth?.()?.currentUser;
        const result = todayApi.cancelApproval(project.id, row.ref, { id:user?.uid || 'guest', name:user?.displayName || user?.email || 'کاربر' });
        if(!result.ok) return;
        onChanged?.();
        paint();
      });
      card.appendChild(cancel);
      body.appendChild(card);
    });
    if(!rows.length) body.insertAdjacentHTML('beforeend', '<div class="empty-state">کار تأییدشده‌ای نیست.</div>');
    more.hidden = shown >= rows.length;
  }
  frame.append(header, body, more);
  paint();
  return frame;
}

function show(value){ return formatJalaliDisplay(value) || value || '—'; }
function money(value){ return new Intl.NumberFormat('fa-IR').format(Number(value) || 0) + ' تومان'; }
function escapeText(value){ return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'}[char])); }
