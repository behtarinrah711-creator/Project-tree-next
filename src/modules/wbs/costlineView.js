import { COSTLINE_RANGES, WEEKDAYS, plannedCostline } from '../../domain/wbs/costline.js';
import { formatJalaliDisplay } from '../../ui/jalali.js';
import { closeWbsSheet, fieldRow, openWbsSheet } from './wbsSheet.js';
import { createViewToolbar } from './viewHeader.js';
import { uid } from '../../data/projectFactories.js';
import { projectRepository } from '../../data/projectRepository.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { allocatedForBucket, allocatedForTask, fundingReceiptsOf, placeCardFunding, poolReceived, poolRemaining, receiptTotalAllowed, setBucketFunding } from '../../domain/wbs/fundingReceipts.js';
import { openNumpadGeneric } from '../../ui/numpad.js';
import { contactRepository } from '../../data/contactRepository.js';
import { openSearchPicker } from '../../ui/searchPickerAdapter.js';

const RECEIPT_BLOCKED = 'ابتدا مبلغ تأمین‌شده کارت‌ها را کاهش دهید. در حال حاضر این بودجه به کارها تخصیص داده شده است.';
const money = value => new Intl.NumberFormat('fa-IR').format(Math.round(Number(value) || 0));
const chartMoney = value => Math.trunc((Number(value) || 0) / 1000) * 1000;
const BAR_WIDTH = 28;
const BAR_HEIGHT = 220;
const BAR_RADIUS = 5;
const TIMESCALE_ICON = 'M120-240q-33 0-56.5-23.5T40-320q0-33 23.5-56.5T120-400h10.5q4.5 0 9.5 2l182-182q-2-5-2-9.5V-600q0-33 23.5-56.5T400-680q33 0 56.5 23.5T480-600q0 2-2 20l102 102q5-2 9.5-2h21q4.5 0 9.5 2l142-142q-2-5-2-9.5V-640q0-33 23.5-56.5T840-720q33 0 56.5 23.5T920-640q0 33-23.5 56.5T840-560h-10.5q-4.5 0-9.5-2L678-420q2 5 2 9.5v10.5q0 33-23.5 56.5T600-320q-33 0-56.5-23.5T520-400v-10.5q0-4.5 2-9.5L420-522q-5 2-9.5 2H400q-2 0-20-2L198-340q2 5 2 9.5v10.5q0 33-23.5 56.5T120-240Z';
const ORIGIN_ICON = 'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm112-192 56-56-128-128v-184h-80v216l152 152Z';

let rangeIndex = 1;
let originWeekday = 4;

export function renderCostline(project){
  project = projectRepository.getActiveProject(project.id) || project;
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
  button.setAttribute('aria-label', 'دریافتی');
  button.setAttribute('title', 'دریافتی');
  button.innerHTML = '<span aria-hidden="true">+</span><span class="wbs-timescale-label">دریافتی</span>';
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

function depositRow(label, control){
  const row = document.createElement('div');
  row.className = 'wbs-deposit-row';
  const caption = document.createElement('span');
  caption.textContent = label;
  row.append(caption, control);
  return row;
}

function openDepositSheet(project, refresh, receipt = null){
  const editing = Boolean(receipt);
  openWbsSheet({
    title: editing ? 'ویرایش بودجه' : 'ثبت بودجه',
    saveLabel: 'ذخیره',
    presentation: 'stage-create',
    autoFocus: false,
    historyKey: 'funding-deposit-sheet',
    body(host){
      host.classList.add('wbs-deposit-body');
      const fields = document.createElement('div');
      fields.className = 'wbs-deposit-fields';
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
      fields.appendChild(depositRow('مبلغ', amount));
      fields.appendChild(depositRow('تاریخ دریافت', dateButton('depositDate', receipt?.depositDate || '')));
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
      fields.appendChild(depositRow('واریزکننده', party));
      host.appendChild(fields);
      const note = document.createElement('textarea');
      note.className = 'wbs-inline-description';
      note.name = 'description';
      note.value = receipt?.description || '';
      note.rows = 2;
      host.appendChild(fieldRow('توضیح اختیاری', note));
      if(editing){
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'wbs-info-row is-danger';
        remove.textContent = 'حذف واریزی';
        remove.addEventListener('click', () => {
          const perform = () => {
            const current = projectRepository.getActiveProject(project.id) || project;
            const nextReceived = poolReceived(current) - (Number(receipt.amount) || 0);
            if(!receiptTotalAllowed(current, nextReceived)){
              window.KarhaUI?.showToast?.(RECEIPT_BLOCKED);
              return;
            }
            projectRepository.updateProject(project.id, row => ({
              ...row,
              fundingReceipts:(row.fundingReceipts || []).map(item => String(item.id) === String(receipt.id)
                ? { ...item, trashed:true, updatedAt:Date.now() }
                : item),
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
      let blocked = false;
      projectRepository.updateProject(project.id, current => {
        const without = (current.fundingReceipts || []).filter(row => !editing || String(row.id) !== String(receipt.id));
        const nextReceived = without.filter(row => row && !row.trashed).reduce((sum, row) => sum + (Number(row.amount) || 0), 0) + amount;
        if(!receiptTotalAllowed(current, nextReceived)){
          blocked = true;
          return current;
        }
        const nextReceipt = {
          ...(receipt || {}),
          id: receipt?.id || uid(),
          amount,
          depositDate,
          partyContactId: partyId,
          party: contactName(partyContact),
          description: host.querySelector('[name="description"]').value.trim(),
          allocations: (current.fundingReceipts || []).find(row => String(row.id) === String(receipt?.id))?.allocations || [],
          createdAt: receipt?.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        return {
          ...current,
          fundingAllocations: !editing && fundingReceiptsOf(current).length === 0 ? [] : (current.fundingAllocations || []),
          fundingReceipts: editing
            ? (current.fundingReceipts || []).map(row => String(row.id) === String(receipt.id) ? nextReceipt : row)
            : [...(current.fundingReceipts || []), nextReceipt],
        };
      });
      if(blocked){
        window.KarhaUI?.showToast?.(RECEIPT_BLOCKED);
        return false;
      }
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
  title.textContent = 'دریافتی‌ها';
  header.append(title, budgetButton(project, refresh));

  const body = document.createElement('div');
  body.className = 'wbs-funding-list wbs-view-body';
  const receipts = fundingReceiptsOf(project);
  body.append(
    fundingRow('مجموع دریافتی:', `${money(receipts.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))} تومان`, 'is-summary'),
    fundingRow('مانده:', `${money(poolRemaining(project))} تومان`, 'is-summary'),
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
  amount.textContent = `${money(chartMoney(value))}${negative ? '-' : ''}`;
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
    const allocated = Math.min(bucket.total, bucket.works.reduce((sum, work) => sum + allocatedForBucket(project, work.id, bucket), 0));
    const shortage = Math.max(0, bucket.total - allocated);
    col.setAttribute('aria-label', `${bucket.label}، مورد نیاز ${money(chartMoney(bucket.total))} تومان، تأمین شده ${money(chartMoney(allocated))} تومان، کسری ${money(chartMoney(shortage))} تومان`);
    const values = document.createElement('span');
    values.className = 'wbs-costline-values';
    values.append(
      renderMoney(bucket.total),
      renderMoney(allocated, { className:'is-funded' }),
      renderMoney(shortage, { className:'is-shortage', negative:shortage > 0 }),
    );
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

function bucketFundingLimit(project, work, bucket){
  const covered = allocatedForBucket(project, work.id, bucket);
  return Math.min(Number(work.sliceAmount) || 0, covered + poolRemaining(project));
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
    title: `برآورد ${bucket.label}`,
    showSave: false,
    presentation: 'stage-create',
    onSave: () => true,
    body(host){
      host.classList.add('wbs-costline-sheet');
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
        const heading = document.createElement('div');
        heading.className = 'wbs-costline-work-heading';
        const parent = document.createElement('strong');
        parent.textContent = work.path || work.text || '—';
        const stage = document.createElement('span');
        stage.textContent = `مرحله ${work.text || '—'}`;
        heading.append(parent, stage);
        card.append(
          heading,
          costlineDetailRow('تاریخ', `از ${formatJalaliDisplay(work.start) || work.start || '—'} تا ${formatJalaliDisplay(work.end) || work.end || '—'}`),
          costlineDetailRow('برآورد کل', `${money(work.amount)} تومان`),
          costlineDetailRow(sliceNeedLabel(), `${money(slice)} تومان`),
        );
        const accrualOptions = [
          { id:'spread', name:'پخش روی مدت' },
          { id:'start', name:'ابتدای کار' },
          { id:'end', name:'انتهای کار' },
        ];
        const modeRow = document.createElement('div');
        modeRow.className = 'wbs-costline-control-row';
        const modeLabel = document.createElement('span');
        modeLabel.textContent = 'نحوه تأمین';
        const mode = document.createElement('button');
        mode.type = 'button';
        mode.className = 'wbs-costline-mode';
        mode.dataset.value = work.accrual || 'spread';
        const paintMode = () => {
          mode.textContent = accrualOptions.find(option => option.id === mode.dataset.value)?.name || accrualOptions[0].name;
        };
        const modeMenu = document.createElement('div');
        modeMenu.className = 'wbs-costline-mode-menu';
        modeMenu.hidden = true;
        accrualOptions.forEach(option => {
          const item = document.createElement('button');
          item.type = 'button';
          item.textContent = option.name;
          item.addEventListener('click', () => {
            modeMenu.hidden = true;
            if(option.id === mode.dataset.value) return;
            const live = projectRepository.getActiveProject(project.id) || project;
            const funded = allocatedForTask(live, work.id);
            const apply = () => {
              projectRepository.updateProject(project.id, row => setAccrual(row, work.id, option.id));
              markDirty(project.id);
              persist({ local:false });
              closeWbsSheet();
              refresh();
            };
            if(funded > 0 && typeof window.KarhaUI?.openConfirm === 'function'){
              const [message, label] = accrualChangeCopy(mode.dataset.value, option.id, funded, work);
              window.KarhaUI.openConfirm(message, apply, label);
              return;
            }
            apply();
          });
          modeMenu.appendChild(item);
        });
        mode.addEventListener('click', event => {
          event.stopPropagation();
          modeMenu.hidden = !modeMenu.hidden;
          if(!modeMenu.hidden) queueMicrotask(() => document.addEventListener('click', () => { modeMenu.hidden = true; }, { once:true }));
        });
        paintMode();
        modeRow.append(modeLabel, mode, modeMenu);
        card.appendChild(modeRow);
        const assignLabel = document.createElement('span');
        assignLabel.className = 'wbs-costline-fund-slice';
        assignLabel.textContent = 'اختصاص وجه';
        const manual = document.createElement('button');
        manual.type = 'button';
        manual.className = 'wbs-costline-manual';
        const paintManual = () => {
          const live = projectRepository.getActiveProject(project.id) || project;
          const amount = allocatedForBucket(live, work.id, bucket);
          manual.textContent = amount > 0
            ? `${money(amount)} تومان`
            : 'وارد کردن مبلغ';
        };
        manual.addEventListener('click', () => {
          const live = projectRepository.getActiveProject(project.id) || project;
          const visibleAmount = allocatedForBucket(live, work.id, bucket);
          openNumpadGeneric(visibleAmount || '', value => {
            const next = Number(value) || 0;
            const latest = projectRepository.getActiveProject(project.id) || project;
            const allowed = bucketFundingLimit(latest, work, bucket);
            if(next > allowed){
              window.KarhaUI?.showToast?.(`مبلغ نمی‌تواند بیشتر از ${money(allowed)} تومان باشد`);
              return false;
            }
            saveBucketFunding(project.id, work.id, bucket, next);
            refresh();
            paint();
            return true;
          }, { suffix:' تومان', validate:value => {
            const latest = projectRepository.getActiveProject(project.id) || project;
            const allowed = bucketFundingLimit(latest, work, bucket);
            const next = Number(value || 0);
            return next <= allowed ? '' : `حداکثر مبلغ مجاز ${money(allowed)} تومان است`;
          }});
        });
        paintManual();
        const allocationRow = document.createElement('div');
        allocationRow.className = 'wbs-costline-allocation-row';
        allocationRow.append(assignLabel, manual);
        card.appendChild(allocationRow);
        host.appendChild(card);
      });
      };
      paint();
    },
  });
}



function sliceNeedLabel(){
  const range = COSTLINE_RANGES[rangeIndex] || COSTLINE_RANGES[1];
  const period = { day:'این تاریخ', week:'این هفته', week2:'این دوهفته', month:'این ماه', quarter:'این فصل', year:'این سال' }[range.id] || 'این بازه';
  return `وجه مورد نیاز ${period}`;
}

function accrualChangeCopy(from, to, amount, work){
  const funded = `${money(amount)} تومان`;
  const range = `${formatJalaliDisplay(work.start) || work.start || '—'} تا ${formatJalaliDisplay(work.end) || work.end || '—'}`;
  const share = 'سهم بازه‌ها از نو حساب می‌شود.';
  const copy = {
    'start->end': [`${funded} از ابتدای کار برداشته می‌شود و یکجا به انتهای کار منتقل می‌شود. ${share}`, 'انتقال به انتها'],
    'end->start': [`${funded} از انتهای کار برداشته می‌شود و یکجا به ابتدای کار منتقل می‌شود. ${share}`, 'انتقال به ابتدا'],
    'start->spread': [`${funded} از ابتدای کار خارج می‌شود و روی روزهای ${range} پخش می‌شود. ${share}`, 'پخش روی مدت'],
    'spread->start': [`${funded} از پخش روزانه جمع می‌شود و یکجا به ابتدای کار منتقل می‌شود. ${share}`, 'انتقال به ابتدا'],
    'end->spread': [`${funded} از انتهای کار خارج می‌شود و روی روزهای ${range} پخش می‌شود. ${share}`, 'پخش روی مدت'],
    'spread->end': [`${funded} از پخش روزانه جمع می‌شود و یکجا به انتهای کار منتقل می‌شود. ${share}`, 'انتقال به انتها'],
  };
  return copy[`${from}->${to}`] || [`زمان تأمین عوض می‌شود. ${share}`, 'تأیید'];
}

function saveBucketFunding(projectId, taskId, bucket, amount){
  const result = { ok:true };
  projectRepository.updateProject(projectId, row => {
    const saved = setBucketFunding(row, taskId, bucket, amount);
    if(!saved.ok){
      result.ok = false;
      result.reason = saved.reason;
      return row;
    }
    return saved.project;
  });
  if(!result.ok){
    window.KarhaUI?.showToast?.(result.reason === 'budget' ? 'مانده بودجه کافی نیست' : 'مبلغ نمی‌تواند بیشتر از سهم این بازه باشد');
    return;
  }
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
  return placeCardFunding({ ...project, tasks: walk(project.tasks) }, taskId);
}

export function resetCostlineState(){
  rangeIndex = 1;
  originWeekday = 4;
  closeWbsSheet();
}
