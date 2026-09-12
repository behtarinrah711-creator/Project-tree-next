export const DELAY_ICON = 'M120-160q0-56 24.5-106t69.5-84q-44-28-69-73t-25-97q0-116 81.5-198T400-800q66 0 125.5 30.5T625-685q22-35 57.5-55t76.5-20q63 0 112 33t49 90q0 47-33 80t-80 33h-7v164q0 84-58.5 142T600-160H120Zm200-240q50 0 85-38.5t35-81.5q0-24-11-32t-25-8q-20 0-32 11.5T360-520h-80q0-50 35-85t86-35q49 0 84 33t35 87q0 29-11 61.5T478-400h62q25 0 42.5-17t17.5-43v-60q0-83-58.5-141.5T400-720q-84 0-142 58.5T200-520q0 51 34.5 85.5T320-400Zm-99 160h379q50 0 85-34.5t35-85.5v-164q0-35 21-57.5t56-22.5h13q14 0 22-9.5t8-23.5q0-11-7-19t-18-12q-14-5-28-8.5t-28-3.5q-33 0-56 23.5T680-600v140q0 59-41 99.5T540-320H360q-44 0-80.5 21.5T221-240Zm494-6Z';

export function renderDelayView(project, documentRef = document, onEditFinish = null){
  const frame = documentRef.createElement('section');
  frame.className = 'wbs-view-frame wbs-delay-frame is-delay-view';
  frame.dataset.view = 'delay';
  if(project?.id) frame.dataset.projectId = String(project.id);

  const header = documentRef.createElement('div');
  header.className = 'wbs-view-header';

  const title = documentRef.createElement('div');
  title.className = 'wbs-view-title';
  title.textContent = 'دیرکرد';

  const actions = documentRef.createElement('div');
  actions.className = 'wbs-view-actions';
  actions.setAttribute('aria-label', 'ابزارهای نما');
  const finishButton = documentRef.createElement('button');
  finishButton.type = 'button';
  finishButton.className = 'wbs-tree-mode-tab';
  finishButton.textContent = project?.plannedFinish ? 'موعد پایان' : '+ موعد پایان';
  finishButton.setAttribute('aria-label', 'تنظیم موعد پایان پروژه');
  finishButton.addEventListener('click', () => onEditFinish?.());
  actions.appendChild(finishButton);

  const body = documentRef.createElement('div');
  body.className = 'wbs-view-body wbs-delay-body';
  const analysis = projectScheduleAnalysis(project);
  const cpmRows = analysis.rows || new Map();
  const unresolvedConsumers = new Set((analysis.network?.unresolved || []).map(row => String(row.consumerId)));
  const rows = flattenDependencyCandidates(project?.tasks || []).filter(row => row.kind !== 'stage').map(row => {
    const entity = row.kind === 'workTask' ? { ...row.item, kind:'workTask' } : row.item;
    const actual = actualProgress(entity); const planned = plannedProgressOf(entity);
    const variance = progressVariance(entity); const delay = temporalDelay(entity);
    const cpm = cpmRows.get(String(row.id));
    const float = cpm?.totalFloat ?? null;
    return { row, entity, actual, planned, variance, delay, float, transferred:transferredDelay(delay, float), unresolved:unresolvedConsumers.has(String(row.id)) };
  }).filter(item => item.variance < 0 || item.delay > 0 || item.float === 0 || item.transferred > 0 || item.unresolved);
  const summary = documentRef.createElement('div');
  summary.className = 'wbs-note wbs-delay-summary';
  summary.textContent = `پایان محاسباتی: ${dayLabel(analysis.calculatedFinish)}${project?.plannedFinish ? ` · موعد پروژه: ${project.plannedFinish}` : ''}`;
  body.appendChild(summary);
  if(!rows.length){
    body.insertAdjacentHTML('beforeend', '<div class="empty-state">فعالیت مسئله‌داری برای نمایش وجود ندارد.</div>');
  }else{
    rows.forEach(({ row, actual, planned, variance, delay, float, transferred, unresolved }) => {
      const item = documentRef.createElement('article'); item.className = 'wbs-delay-row';
      const percent = value => value === null ? '—' : `٪${new Intl.NumberFormat('fa-IR', { maximumFractionDigits:1 }).format(value)}`;
      const days = value => value === null ? 'قابل‌محاسبه نیست' : `${new Intl.NumberFormat('fa-IR').format(value)} روز`;
      item.innerHTML = `<strong>${escapeHtml(row.title)}</strong><span>واقعی: ${percent(actual)}</span><span>برنامه‌ای: ${percent(planned)}</span><span>شکاف: ${percent(variance)}</span><span>تأخیر قطعی: ${days(delay)}</span><span>شناوری: ${days(float)}</span><span>تأخیر منتقل‌شده: ${days(transferred)}</span>${unresolved?'<span class="is-danger">وابستگی حل‌نشده</span>':''}`;
      body.appendChild(item);
    });
  }

  header.append(title, actions);
  frame.append(header, body);
  return frame;
}
import { gregorianToJalali } from '../../ui/jalali.js';
import { actualProgress, flattenDependencyCandidates, plannedProgressOf, progressVariance, projectScheduleAnalysis, temporalDelay, transferredDelay } from '../../domain/wbs/scheduling.js';

function dayLabel(day){
  if(!Number.isFinite(day)) return '—';
  const date = new Date(day * 86400000); const j = gregorianToJalali(date.getUTCFullYear(), date.getUTCMonth()+1, date.getUTCDate());
  return new Intl.NumberFormat('fa-IR', { useGrouping:false }).format(j.jy) + '/' + new Intl.NumberFormat('fa-IR', { minimumIntegerDigits:2, useGrouping:false }).format(j.jm) + '/' + new Intl.NumberFormat('fa-IR', { minimumIntegerDigits:2, useGrouping:false }).format(j.jd);
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
