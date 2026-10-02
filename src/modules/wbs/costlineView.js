import { COSTLINE_RANGES, WEEKDAYS, plannedCostline } from '../../domain/wbs/costline.js';
import { formatJalaliDisplay } from '../../ui/jalali.js';
import { closeWbsSheet, fieldRow, openWbsSheet } from './wbsSheet.js';
import { createViewToolbar } from './viewHeader.js';
import { uid } from '../../data/projectFactories.js';
import { projectRepository } from '../../data/projectRepository.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { activeWorkTasks } from '../../domain/wbs/workTaskModel.js';

const money = value => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);
const BAR_WIDTH = 28;
const BAR_HEIGHT = 220;
const BAR_RADIUS = 5;
const TIMESCALE_ICON = 'M120-240q-33 0-56.5-23.5T40-320q0-33 23.5-56.5T120-400h10.5q4.5 0 9.5 2l182-182q-2-5-2-9.5V-600q0-33 23.5-56.5T400-680q33 0 56.5 23.5T480-600q0 2-2 20l102 102q5-2 9.5-2h21q4.5 0 9.5 2l142-142q-2-5-2-9.5V-640q0-33 23.5-56.5T840-720q33 0 56.5 23.5T920-640q0 33-23.5 56.5T840-560h-10.5q-4.5 0-9.5-2L678-420q2 5 2 9.5v10.5q0 33-23.5 56.5T600-320q-33 0-56.5-23.5T520-400v-10.5q0-4.5 2-9.5L420-522q-5 2-9.5 2H400q-2 0-20-2L198-340q2 5 2 9.5v10.5q0 33-23.5 56.5T120-240Z';
const ORIGIN_ICON = 'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm112-192 56-56-128-128v-184h-80v216l152 152Z';

let rangeIndex = 1;
let originWeekday = 4;

export function renderCostline(project){
  const root = document.createElement('section');
  root.className = 'wbs-costline wbs-view-frame is-costline-frame';
  const range = COSTLINE_RANGES[rangeIndex] || COSTLINE_RANGES[1];
  const model = plannedCostline(project.tasks || [], { rangeId: range.id, originWeekday });
  root.append(renderToolbar(project, () => {
    root.replaceWith(renderCostline(project));
  }, project), renderChart(model));
  return root;
}

function materialIcon(path){
  return `<svg class="wbs-timescale-icon" viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

function cycleButton({ label, ariaLabel, shade, icon, onClick }){
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wbs-timescale-toggle wbs-costline-cycle' + (shade >= .4 ? ' is-past-midpoint' : '');
  button.setAttribute('aria-label', ariaLabel);
  button.setAttribute('title', label);
  button.innerHTML = `<svg class="wbs-timescale-shade" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width="1" height="1" fill="currentColor" opacity="${shade}"/></svg>${materialIcon(icon)}<span class="wbs-timescale-label">${label}</span>`;
  button.addEventListener('click', onClick);
  return button;
}

function renderToolbar(project, refresh){
  const controls = document.createElement('div');
  controls.className = 'wbs-costline-controls wbs-view-actions';
  const range = COSTLINE_RANGES[rangeIndex] || COSTLINE_RANGES[1];
  controls.append(
    cycleButton({
      label: range.label,
      ariaLabel: `نمای ${range.label}`,
      shade: range.shade,
      icon: TIMESCALE_ICON,
      onClick: () => {
        rangeIndex = (rangeIndex + 1) % COSTLINE_RANGES.length;
        refresh();
      },
    }),
    depositButton(project),
    cycleButton({
      label: WEEKDAYS[originWeekday],
      ariaLabel: `مبدأ دوره ${WEEKDAYS[originWeekday]}`,
      shade: (originWeekday + 1) / WEEKDAYS.length,
      icon: ORIGIN_ICON,
      onClick: () => {
        originWeekday = (originWeekday + 1) % WEEKDAYS.length;
        refresh();
      },
    }),
  );

  return createViewToolbar(document, {
    className:'wbs-costline-toolbar',
    ariaLabel:'ابزارهای برآورد هزینه',
    controls:[...controls.children],
  });
}

function depositButton(project){
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wbs-timescale-toggle wbs-costline-cycle';
  button.setAttribute('aria-label', 'واریز');
  button.setAttribute('title', 'واریز');
  button.innerHTML = '<span class="wbs-timescale-label">واریز</span>';
  button.addEventListener('click', () => openDepositSheet(project));
  return button;
}

function taskChoices(project){
  const rows = [];
  const walk = nodes => (nodes || []).forEach(node => {
    if(!node || node.trashed) return;
    activeWorkTasks(node).forEach(task => rows.push({ id:task.id, label:task.title || task.text || task.id }));
    if(!activeWorkTasks(node).length && node.text) rows.push({ id:node.id, label:node.text });
    walk(node.subtasks);
  });
  walk(project?.tasks || []);
  return rows;
}

function dateButton(name, value){
  const button = document.createElement('button');
  button.type = 'button';
  button.name = name;
  button.className = 'wbs-input wbs-date-input';
  button.dataset.value = value || '';
  const paint = () => { button.textContent = button.dataset.value ? formatJalaliDisplay(button.dataset.value) : 'انتخاب تاریخ'; };
  button.addEventListener('click', () => window.KarhaUI?.openJalaliPicker?.(button.dataset.value, next => { button.dataset.value = next || ''; paint(); }));
  paint();
  return button;
}

function openDepositSheet(project){
  openWbsSheet({
    title: 'واریز کارفرما',
    saveLabel: 'ذخیره',
    body(host){
      const amount = document.createElement('input');
      amount.className = 'wbs-input';
      amount.name = 'amount';
      amount.inputMode = 'numeric';
      host.appendChild(fieldRow('مبلغ', amount));
      host.appendChild(fieldRow('تاریخ مقرر', dateButton('dueDate', '')));
      host.appendChild(fieldRow('تاریخ واریز', dateButton('depositDate', '')));
      const party = document.createElement('input');
      party.className = 'wbs-input';
      party.name = 'party';
      party.value = 'کارفرما';
      host.appendChild(fieldRow('پرداخت‌کننده', party));
      const note = document.createElement('textarea');
      note.className = 'wbs-input';
      note.name = 'description';
      host.appendChild(fieldRow('توضیح', note));
      const list = document.createElement('div');
      taskChoices(project).forEach(choice => {
        const label = document.createElement('label');
        label.className = 'wbs-note';
        label.innerHTML = `<input type="checkbox" name="affected" value="${escapeText(choice.id)}"> ${escapeText(choice.label)}`;
        list.appendChild(label);
      });
      host.appendChild(fieldRow('تسک‌های متأثر', list));
    },
    onSave(host){
      const amount = Number(String(host.querySelector('[name="amount"]').value).replace(/[^0-9.]/g, ''));
      const dueDate = host.querySelector('[name="dueDate"]').dataset.value;
      if(!amount || !dueDate){
        window.KarhaUI?.showToast?.('مبلغ و تاریخ مقرر لازم است');
        return false;
      }
      const affectedTaskIds = [...host.querySelectorAll('[name="affected"]:checked')].map(input => input.value);
      const receipt = {
        id: uid(),
        amount,
        dueDate,
        depositDate: host.querySelector('[name="depositDate"]').dataset.value || '',
        party: host.querySelector('[name="party"]').value.trim() || 'کارفرما',
        description: host.querySelector('[name="description"]').value.trim(),
        affectedTaskIds,
        createdAt: Date.now(),
      };
      projectRepository.updateProject(project.id, current => ({
        ...current,
        fundingReceipts: [...(current.fundingReceipts || []), receipt],
      }));
      markDirty(project.id);
      persist({ local:false });
      return true;
    },
  });
}

function renderBar(bucket, max){
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('wbs-costline-bar');
  svg.setAttribute('viewBox', `0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const height = Math.max(4, (bucket.total / max) * BAR_HEIGHT);
  const top = BAR_HEIGHT - height;
  const radius = Math.min(BAR_RADIUS, height, BAR_WIDTH / 2);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M0 ${BAR_HEIGHT}V${top + radius}Q0 ${top} ${radius} ${top}H${BAR_WIDTH - radius}Q${BAR_WIDTH} ${top} ${BAR_WIDTH} ${top + radius}V${BAR_HEIGHT}Z`);
  svg.appendChild(path);
  return svg;
}

function renderMoney(value){
  const line = document.createElement('span');
  line.className = 'wbs-costline-value';
  const amount = document.createElement('span');
  amount.textContent = money(value);
  const unit = document.createElement('small');
  unit.textContent = 'تومان';
  line.append(amount, unit);
  return line;
}

function renderChart(model){
  const wrap = document.createElement('div');
  wrap.className = 'wbs-costline-chart wbs-view-body';
  const scroll = document.createElement('div');
  scroll.className = 'wbs-costline-scroll';
  const axis = document.createElement('div');
  axis.className = 'wbs-costline-axis';
  const max = Math.max(1, ...model.buckets.map(bucket => bucket.total));

  if(!model.buckets.length){
    wrap.innerHTML = '<div class="empty-state">کاری با تاریخ شروع و برآورد ثبت نشده است.</div>';
    return wrap;
  }

  model.buckets.forEach(bucket => {
    const col = document.createElement('button');
    col.type = 'button';
    col.className = 'wbs-costline-col';
    col.setAttribute('aria-label', `${bucket.label} ${money(bucket.total)} تومان`);
    const label = document.createElement('span');
    label.className = 'wbs-costline-label';
    label.textContent = bucket.label;
    col.append(renderMoney(bucket.total), renderBar(bucket, max), label);
    col.addEventListener('click', () => openBucketSheet(bucket));
    axis.appendChild(col);
  });

  scroll.appendChild(axis);
  wrap.appendChild(scroll);
  return wrap;
}

function openBucketSheet(bucket){
  openWbsSheet({
    title: `برآورد · ${bucket.label}`,
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
          <p>مبلغ برآورد: ${escapeText(money(work.amount))} تومان</p>
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
  rangeIndex = 1;
  originWeekday = 4;
  closeWbsSheet();
}
