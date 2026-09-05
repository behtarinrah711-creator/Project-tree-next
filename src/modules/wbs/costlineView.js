import { COSTLINE_RANGES, WEEKDAYS, plannedCostline } from '../../domain/wbs/costline.js';
import { formatJalaliDisplay } from '../../ui/jalali.js';
import { closeWbsSheet, openWbsSheet } from './wbsSheet.js';

const money = value => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);

let rangeId = 'week';
let originWeekday = 4;

export function renderCostline(project){
  const root = document.createElement('section');
  root.className = 'wbs-costline';
  const model = plannedCostline(project.tasks || [], { rangeId, originWeekday });
  root.append(renderToolbar(project, () => {
    root.replaceWith(renderCostline(project));
  }), renderChart(model));
  return root;
}

function renderToolbar(project, refresh){
  const bar = document.createElement('div');
  bar.className = 'wbs-costline-toolbar';
  const title = document.createElement('div');
  title.className = 'wbs-costline-project';
  title.textContent = project.name || '';
  const ranges = document.createElement('div');
  ranges.className = 'wbs-costline-ranges';
  COSTLINE_RANGES.forEach(range => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wbs-costline-range' + (rangeId === range.id ? ' active' : '');
    btn.textContent = range.label;
    btn.addEventListener('click', () => { rangeId = range.id; refresh(); });
    ranges.appendChild(btn);
  });
  const origin = document.createElement('label');
  origin.className = 'wbs-costline-origin';
  origin.textContent = 'مبدأ دوره';
  const select = document.createElement('select');
  WEEKDAYS.forEach((label, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = label;
    if(index === originWeekday) option.selected = true;
    select.appendChild(option);
  });
  select.addEventListener('change', () => { originWeekday = Number(select.value); refresh(); });
  origin.appendChild(select);
  bar.append(title, ranges, origin);
  return bar;
}

function renderChart(model){
  const wrap = document.createElement('div');
  wrap.className = 'wbs-costline-scroll';
  const axis = document.createElement('div');
  axis.className = 'wbs-costline-axis';
  const bars = document.createElement('div');
  bars.className = 'wbs-costline-bars';
  const max = Math.max(1, ...model.buckets.map(bucket => bucket.total));
  if(!model.buckets.length){
    wrap.innerHTML = '<div class="empty-state">کاری با تاریخ شروع و برآورد ثبت نشده است.</div>';
    return wrap;
  }
  model.buckets.forEach(bucket => {
    const col = document.createElement('button');
    col.type = 'button';
    col.className = 'wbs-costline-col';
    col.setAttribute('aria-label', `${bucket.label} ${money(bucket.total)}`);
    const bar = document.createElement('span');
    bar.className = 'wbs-costline-bar';
    bar.style.height = `${Math.max(4, (bucket.total / max) * 140)}px`;
    const value = document.createElement('span');
    value.className = 'wbs-costline-value';
    value.textContent = money(bucket.total);
    const label = document.createElement('span');
    label.className = 'wbs-costline-label';
    label.textContent = formatJalaliDisplay(bucket.start) || bucket.label;
    col.append(value, bar, label);
    col.addEventListener('click', () => openBucketSheet(bucket));
    axis.appendChild(col);
  });
  bars.appendChild(axis);
  wrap.appendChild(bars);
  return wrap;
}

function openBucketSheet(bucket){
  openWbsSheet({
    title: `Planned · ${formatJalaliDisplay(bucket.start) || bucket.label}`,
    saveLabel: 'بستن',
    onSave: () => true,
    body(host){
      if(!bucket.works.length){
        host.textContent = 'کاری در این بازه نیست.';
        return;
      }
      bucket.works.forEach(work => {
        const card = document.createElement('article');
        card.className = 'wbs-costline-work';
        card.innerHTML = `
          <h4>${escapeText(work.text)}</h4>
          <p>نوع کار: ${escapeText(work.type || '—')}</p>
          <p>مبلغ برآورد: ${escapeText(money(work.amount))}</p>
          <p>تاریخ شروع: ${escapeText(formatJalaliDisplay(work.start) || work.start || '—')}</p>
          <p>تاریخ پایان: ${escapeText(formatJalaliDisplay(work.end) || work.end || '—')}</p>
          <p>مدت کار: ${escapeText(new Intl.NumberFormat('fa-IR').format(work.duration || 0))} روز</p>
          <p>مسیر: ${escapeText(work.path || work.text)}</p>
        `;
        host.appendChild(card);
      });
    },
  });
}

function escapeText(value){
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function resetCostlineState(){
  rangeId = 'week';
  originWeekday = 4;
  closeWbsSheet();
}
