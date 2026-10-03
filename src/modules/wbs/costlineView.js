import { COSTLINE_RANGES, WEEKDAYS, plannedCostline } from '../../domain/wbs/costline.js';
import { formatJalaliDisplay } from '../../ui/jalali.js';
import { closeWbsSheet, fieldRow, openWbsSheet } from './wbsSheet.js';
import { createViewToolbar } from './viewHeader.js';
import { uid } from '../../data/projectFactories.js';
import { projectRepository } from '../../data/projectRepository.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { allocatedForBucket, allocationForInterval, fundingReceiptsOf, poolRemaining } from '../../domain/wbs/fundingReceipts.js';
import { openNumpadGeneric } from '../../ui/numpad.js';
import { contactRepository } from '../../data/contactRepository.js';
import { openSearchPicker } from '../../ui/searchPickerAdapter.js';

const money = value => new Intl.NumberFormat('fa-IR').format(Math.round(Number(value) || 0));
const BAR_WIDTH = 28;
const BAR_HEIGHT = 220;
const BAR_RADIUS = 5;
const TIMESCALE_ICON = 'M120-240q-33 0-56.5-23.5T40-320q0-33 23.5-56.5T120-400h10.5q4.5 0 9.5 2l182-182q-2-5-2-9.5V-600q0-33 23.5-56.5T400-680q33 0 56.5 23.5T480-600q0 2-2 20l102 102q5-2 9.5-2h21q4.5 0 9.5 2l142-142q-2-5-2-9.5V-640q0-33 23.5-56.5T840-720q33 0 56.5 23.5T920-640q0 33-23.5 56.5T840-560h-10.5q-4.5 0-9.5-2L678-420q2 5 2 9.5v10.5q0 33-23.5 56.5T600-320q-33 0-56.5-23.5T520-400v-10.5q0-4.5 2-9.5L420-522q-5 2-9.5 2H400q-2 0-20-2L198-340q2 5 2 9.5v10.5q0 33-23.5 56.5T120-240Z';
const ORIGIN_ICON = 'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm112-192 56-56-128-128v-184h-80v216l152 152Z';

let rangeIndex = 1;
let originWeekday = 4;

export function renderCostline(project){
  const root = document.createElement('section');
  root.className = 'wbs-costline';
  const range = COSTLINE_RANGES[rangeIndex] || COSTLINE_RANGES[1];
  const model = plannedCostline(project.tasks || [], { rangeId: range.id, originWeekday });
  const chartFrame = document.createElement('section');
  chartFrame.className = 'wbs-costline-frame wbs-view-frame is-costline-frame';
  chartFrame.append(renderToolbar(() => {
    root.replaceWith(renderCostline(projectRepository.getActiveProject(project.id) || project));
  }), renderChart(project, model));
  root.append(chartFrame, renderFundingPanel(project, () => {
    root.replaceWith(renderCostline(projectRepository.getActiveProject(project.id) || project));
  }));
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

function renderToolbar(refresh){
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
  const toolbar = createViewToolbar(document, {
    className:'wbs-costline-toolbar',
    ariaLabel:'ابزارهای برآورد هزینه',
    controls:[...controls.children],
  });
  const title = document.createElement('strong');
  title.className = 'wbs-costline-title';
  title.textContent = 'نمودار میله‌ای';
  toolbar.prepend(title);
  return toolbar;
}

function budgetButton(project, refresh){
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wbs-timescale-toggle wbs-funding-add';
  button.setAttribute('aria-label', 'ثبت بودجه');
  button.setAttribute('title', 'ثبت بودجه');
  button.innerHTML = '<span aria-hidden="true">+</span><span class="wbs-timescale-label">ثبت بودجه</span>';
  button.addEventListener('click', () => openDepositSheet(project, refresh));
  return button;
}

function contactName(contact){
  return [contact?.type, contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim()
    || contact?.name || 'مخاطب';
}

function numericJalaliDate(value){
  const parts = String(value || '').split(/[\/-]/).map(part => Number(part));
  if(parts.length < 3 || parts.some(part => !Number.isFinite(part))) return String(value || '');
  const digits = new Intl.NumberFormat('fa-IR', { useGrouping:false });
  return `${digits.format(parts[0])}/${digits.format(parts[1])}/${digits.format(parts[2])}`;
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

function openDepositSheet(project, refresh, receipt = null){
  const editing = Boolean(receipt);
  openWbsSheet({
    title: editing ? 'ویرایش بودجه' : 'ثبت بودجه',
    saveLabel: 'ذخیره',
    presentation: 'stage-create',
    body(host){
      const amount = document.createElement('button');
      amount.type = 'button';
      amount.className = 'wbs-input';
      amount.name = 'amount';
      amount.dataset.value = receipt?.amount ? String(receipt.amount) : '';
      amount.textContent = amount.dataset.value ? `${money(amount.dataset.value)} تومان` : 'مبلغ را وارد کنید';
      amount.addEventListener('click', () => openNumpadGeneric(amount.dataset.value, value => {
        amount.dataset.value = String(value || '');
        amount.textContent = amount.dataset.value ? new Intl.NumberFormat('fa-IR').format(Number(amount.dataset.value)) + ' تومان' : 'مبلغ را وارد کنید';
      }, { suffix: ' تومان' }));
      host.appendChild(fieldRow('مبلغ', amount));
      host.appendChild(fieldRow('تاریخ دریافت', dateButton('depositDate', receipt?.depositDate || '')));
      const contacts = contactRepository.list(project.id).filter(contact => contact && !contact.trashed);
      const party = document.createElement('button');
      party.type = 'button';
      party.className = 'wbs-input';
      party.name = 'party';
      party.dataset.value = receipt?.partyContactId ? String(receipt.partyContactId) : '';
      const paintParty = () => {
        const selected = contacts.find(contact => String(contact.id) === String(party.dataset.value));
        party.textContent = selected ? contactName(selected) : (editing && party.dataset.value ? receipt.party : 'انتخاب واریزکننده');
      };
      party.addEventListener('click', () => openSearchPicker({
        title:'انتخاب واریزکننده', listTitle:'مخاطبین', selectedTitle:'واریزکننده منتخب',
        contextKey:`wbs-funding-party:${project.id}`,
        items:contacts.map(contact => ({ id:contact.id, name:contactName(contact) })),
        showStar:false, showAdd:false,
        onSelect:selected => { party.dataset.value = String(selected.id); paintParty(); },
      }));
      paintParty();
      host.appendChild(fieldRow('واریزکننده', party));
      const note = document.createElement('textarea');
      note.className = 'wbs-input';
      note.name = 'description';
      note.value = receipt?.description || '';
      host.appendChild(fieldRow('توضیح', note));
      const hint = document.createElement('div');
      hint.className = 'wbs-note';
      hint.textContent = 'تخصیص این مبلغ روی کارت همان بازهٔ برآورد تیک می‌خورد، نه اینجا.';
      host.appendChild(hint);
      if(editing){
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'wbs-info-row is-danger';
        remove.textContent = 'حذف واریزی';
        remove.addEventListener('click', () => {
          const perform = () => {
            projectRepository.updateProject(project.id, current => ({
              ...current,
              fundingReceipts: (current.fundingReceipts || []).map(row => String(row.id) === String(receipt.id)
                ? { ...row, trashed:true, updatedAt:Date.now() }
                : row),
            }));
            markDirty(project.id);
            persist({ local:false });
            closeWbsSheet();
            refresh();
          };
          if(typeof window.KarhaUI?.openConfirm === 'function') window.KarhaUI.openConfirm('این واریزی حذف شود؟', perform, 'حذف');
          else if(window.confirm?.('این واریزی حذف شود؟')) perform();
        });
        host.appendChild(remove);
      }
    },
    onSave(host){
      const amount = Number(host.querySelector('[name="amount"]').dataset.value || 0);
      const depositDate = host.querySelector('[name="depositDate"]').dataset.value;
      const partyButton = host.querySelector('[name="party"]');
      const partyId = partyButton.dataset.value;
      if(!amount || !depositDate || !partyId){
        window.KarhaUI?.showToast?.('مبلغ، تاریخ دریافت و واریزکننده لازم است');
        return false;
      }
      const partyContact = contactRepository.get(project.id, partyId);
      const nextReceipt = {
        ...(receipt || {}),
        id: receipt?.id || uid(),
        amount,
        depositDate,
        partyContactId: partyId,
        party: contactName(partyContact),
        description: host.querySelector('[name="description"]').value.trim(),
        allocations: receipt?.allocations || [],
        createdAt: receipt?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      projectRepository.updateProject(project.id, current => ({
        ...current,
        fundingReceipts: editing
          ? (current.fundingReceipts || []).map(row => String(row.id) === String(receipt.id) ? nextReceipt : row)
          : [...(current.fundingReceipts || []), nextReceipt],
      }));
      markDirty(project.id);
      persist({ local:false });
      refresh();
      return true;
    },
  });
}

function renderFundingPanel(project, refresh){
  const frame = document.createElement('section');
  frame.className = 'wbs-funding-frame wbs-view-frame';
  const header = document.createElement('div');
  header.className = 'wbs-view-header wbs-view-toolbar wbs-funding-toolbar';
  const title = document.createElement('strong');
  title.className = 'wbs-funding-title';
  title.textContent = 'بودجه‌های تأمین‌شده';
  header.append(title, budgetButton(project, refresh));

  const body = document.createElement('div');
  body.className = 'wbs-funding-list wbs-view-body';
  const receipts = fundingReceiptsOf(project);
  body.append(
    fundingRow('مجموع دریافتی تاکنون:', `${money(receipts.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))} تومان`, 'is-summary'),
    fundingRow('مانده تخصیص داده نشده:', `${money(poolRemaining(project))} تومان`, 'is-summary'),
  );
  receipts
    .map((receipt, index) => ({ receipt, number:index + 1 }))
    .sort((a, b) => String(b.receipt.depositDate || '').localeCompare(String(a.receipt.depositDate || '')) || Number(b.receipt.createdAt || 0) - Number(a.receipt.createdAt || 0))
    .forEach(({ receipt, number }) => {
      body.appendChild(fundingRow(
        `دریافتی شماره ${new Intl.NumberFormat('fa-IR').format(number)} | ${numericJalaliDate(receipt.depositDate)}`,
        `${money(receipt.amount)} تومان`,
        'is-action',
        () => openDepositSheet(project, refresh, receipt),
      ));
    });
  frame.append(header, body);
  return frame;
}

function fundingRow(label, value, className = '', onClick = null){
  const row = document.createElement(onClick ? 'button' : 'div');
  row.className = `wbs-funding-row${className ? ` ${className}` : ''}`;
  if(onClick){
    row.type = 'button';
    row.addEventListener('click', onClick);
  }
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'wbs-funding-amount';
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  return row;
}

function barPath(height){
  const safeHeight = Math.max(0, Math.min(BAR_HEIGHT, height));
  const top = BAR_HEIGHT - safeHeight;
  const radius = Math.min(BAR_RADIUS, safeHeight, BAR_WIDTH / 2);
  return `M0 ${BAR_HEIGHT}V${top + radius}Q0 ${top} ${radius} ${top}H${BAR_WIDTH - radius}Q${BAR_WIDTH} ${top} ${BAR_WIDTH} ${top + radius}V${BAR_HEIGHT}Z`;
}

function renderBar(bucket, max, allocated){
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('wbs-costline-bar');
  svg.setAttribute('viewBox', `0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const height = Math.max(4, (bucket.total / max) * BAR_HEIGHT);
  const planned = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  planned.classList.add('wbs-costline-bar-planned');
  planned.setAttribute('d', barPath(height));
  svg.appendChild(planned);
  if(allocated > 0){
    const funded = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    funded.classList.add('wbs-costline-bar-funded');
    funded.setAttribute('d', barPath(Math.min(height, (allocated / max) * BAR_HEIGHT)));
    svg.appendChild(funded);
  }
  return svg;
}

function renderMoney(value, { className = '', negative = false } = {}){
  const line = document.createElement('span');
  line.className = `wbs-costline-value${className ? ` ${className}` : ''}`;
  const amount = document.createElement('span');
  amount.textContent = `${money(value)}${negative ? '-' : ''}`;
  const unit = document.createElement('small');
  unit.textContent = 'تومان';
  line.append(amount, unit);
  return line;
}

function renderChart(project, model){
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
    const allocated = Math.min(bucket.total, bucket.works.reduce((sum, work) => sum + allocatedForBucket(project, work.id, bucket), 0));
    const shortage = Math.max(0, bucket.total - allocated);
    const values = document.createElement('span');
    values.className = 'wbs-costline-values';
    values.appendChild(renderMoney(bucket.total, { className:shortage <= 1 ? 'is-funded' : '' }));
    if(shortage > 1) values.appendChild(renderMoney(shortage, { className:'is-shortage', negative:true }));
    const label = document.createElement('span');
    label.className = 'wbs-costline-label';
    label.textContent = bucket.label;
    col.append(values, renderBar(bucket, max, allocated), label);
    col.addEventListener('click', () => openBucketSheet(project, bucket, () => {
      wrap.closest('.wbs-costline')?.replaceWith(renderCostline(projectRepository.getActiveProject(project.id) || project));
    }));
    axis.appendChild(col);
  });
  scroll.appendChild(axis);
  wrap.appendChild(scroll);
  return wrap;
}

function receiptRemaining(receipt){
  const used = (receipt.allocations || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return Math.max(0, (Number(receipt.amount) || 0) - used);
}

function intervalAllocationLimit(project, work, bucket){
  const existing = Number(allocationForInterval(project, work.id, bucket)?.amount) || 0;
  const covered = allocatedForBucket(project, work.id, bucket);
  const sliceRemaining = Math.max(0, (Number(work.sliceAmount) || 0) - covered);
  return Math.min(poolRemaining(project) + existing, existing + sliceRemaining);
}

function costlineDetailRow(label, value, className = ''){
  const row = document.createElement('div');
  row.className = `wbs-costline-detail-row${className ? ` ${className}` : ''}`;
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  return row;
}

function openBucketSheet(project, bucket, refresh){
  openWbsSheet({
    title: `برآورد · ${bucket.label}`,
    saveLabel: 'بستن',
    presentation: 'stage-create',
    onSave: () => true,
    body(host){
      const paint = () => {
        host.replaceChildren();
      const current = projectRepository.getActiveProject(project.id) || project;
      const pool = document.createElement('div');
      pool.className = 'wbs-costline-balance';
      pool.append(
        Object.assign(document.createElement('span'), { textContent:'مانده بودجه' }),
        Object.assign(document.createElement('span'), { textContent:`${money(poolRemaining(current))} تومان` }),
      );
      host.appendChild(pool);
      if(!bucket.works.length){
        host.append('کاری در این بازه نیست.');
        return;
      }
      bucket.works.forEach(work => {
        const slice = Number(work.sliceAmount) || 0;
        const covered = allocatedForBucket(current, work.id, bucket);
        const card = document.createElement('article');
        card.className = 'wbs-costline-work';
        card.append(
          costlineDetailRow('عنوان کار', work.text || '—', 'is-title'),
          costlineDetailRow('مرحله', work.path || '—'),
          costlineDetailRow('شروع', formatJalaliDisplay(work.start) || work.start || '—'),
          costlineDetailRow('پایان', formatJalaliDisplay(work.end) || work.end || '—'),
          costlineDetailRow('سهم این بازه', `${money(slice)} تومان`),
          costlineDetailRow('تأمین‌شده', `${money(covered)} تومان`),
          costlineDetailRow('کل برآورد', `${money(work.amount)} تومان`),
        );
        const mode = document.createElement('select');
        mode.className = 'wbs-input';
        [['spread','پخش روی مدت'],['start','اول کار'],['end','آخر کار']].forEach(([value, label]) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = label;
          option.selected = (work.accrual || 'spread') === value;
          mode.appendChild(option);
        });
        mode.addEventListener('change', () => {
          projectRepository.updateProject(project.id, row => setAccrual(row, work.id, mode.value));
          markDirty(project.id);
          persist({ local:false });
          refresh();
        });
        card.appendChild(fieldRow('زمان پول', mode));
        const tick = document.createElement('label');
        tick.className = 'wbs-note';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = covered + 1 >= slice && slice > 0;
        box.addEventListener('change', () => {
          const live = projectRepository.getActiveProject(project.id) || project;
          const previous = Number(allocationForInterval(live, work.id, bucket)?.amount) || 0;
          const liveCovered = allocatedForBucket(live, work.id, bucket);
          const nextAmount = previous + Math.max(0, slice - liveCovered);
          const available = intervalAllocationLimit(live, work, bucket);
          if(box.checked && nextAmount > available + 1){
            box.checked = false;
            window.KarhaUI?.showToast?.('مانده بودجه کافی نیست');
            return;
          }
          saveIntervalAllocation(project.id, work.id, bucket, box.checked ? nextAmount : 0, 'slice');
          refresh();
          paint();
        });
        tick.append(box, document.createTextNode(' تأمین همین برش'));
        const manual = document.createElement('button');
        manual.type = 'button';
        manual.className = 'wbs-costline-manual';
        const paintManual = () => {
          const live = projectRepository.getActiveProject(project.id) || project;
          const allocation = allocationForInterval(live, work.id, bucket);
          manual.textContent = allocation?.kind === 'manual' && Number(allocation.amount) > 0
            ? `${money(allocation.amount)} تومان`
            : 'وارد کردن مبلغ';
        };
        manual.addEventListener('click', () => {
          const live = projectRepository.getActiveProject(project.id) || project;
          const previous = allocationForInterval(live, work.id, bucket);
          const previousAmount = Number(previous?.amount) || 0;
          openNumpadGeneric(previous?.kind === 'manual' ? previousAmount : '', value => {
            const next = Number(value) || 0;
            const latest = projectRepository.getActiveProject(project.id) || project;
            const allowed = intervalAllocationLimit(latest, work, bucket);
            if(next > allowed){
              window.KarhaUI?.showToast?.(`مبلغ نمی‌تواند بیشتر از ${money(allowed)} تومان باشد`);
              return false;
            }
            saveIntervalAllocation(project.id, work.id, bucket, next, 'manual');
            refresh();
            paint();
            return true;
          }, { suffix:' تومان', validate:value => {
            const latest = projectRepository.getActiveProject(project.id) || project;
            const allowed = intervalAllocationLimit(latest, work, bucket);
            return Number(value || 0) <= allowed ? '' : `حداکثر مبلغ مجاز ${money(allowed)} تومان است`;
          }});
        });
        paintManual();
        card.append(tick, manual);
        host.appendChild(card);
      });
      };
      paint();
    },
  });
}

function saveIntervalAllocation(projectId, taskId, bucket, amount, kind){
  projectRepository.updateProject(projectId, row => ({
    ...row,
    fundingAllocations: [
      ...(row.fundingAllocations || []).filter(item => !(String(item.taskId) === String(taskId)
        && Number(item.startDay) === Number(bucket.startDay)
        && Number(item.endDay) === Number(bucket.endDay))),
      ...(Number(amount) > 0 ? [{ taskId, bucketId:bucket.id, startDay:bucket.startDay, endDay:bucket.endDay, amount:Number(amount), kind }] : []),
    ],
  }));
  markDirty(projectId);
  persist({ local:false });
}

function setAccrual(project, taskId, accrual){
  const walk = nodes => (nodes || []).map(node => {
    if(!node) return node;
    const workTasks = (node.workTasks || []).map(task => String(task.id) === String(taskId) ? { ...task, fundingAccrual: accrual } : task);
    const self = String(node.id) === String(taskId) ? { ...node, fundingAccrual: accrual } : node;
    return { ...self, workTasks, subtasks: walk(node.subtasks) };
  });
  return { ...project, tasks: walk(project.tasks) };
}

export function resetCostlineState(){
  rangeIndex = 1;
  originWeekday = 4;
  closeWbsSheet();
}
