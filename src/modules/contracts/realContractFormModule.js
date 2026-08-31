import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { localStorageAdapter } from '../../data/storageAdapter.js';
import { STORAGE_KEYS } from '../../config/deploymentConfig.js';
import * as realContractDomain from './realContractDomain.js';
import { saveRealContract } from './realContractPersistence.js';
import * as contractPickers from './contractPickers.js';
import * as contractTemplatesDomain from './contractTemplatesDomain.js';
import * as paymentStagesModule from './paymentStagesModule.js';
import * as contractItemInteractions from './contractItemInteractions.js';

let state = null;
let dirty = false;
let editingId = null;
let inlineAddState = null;
let activeProjectId = null;
// True only while the current browser entry is owned by this mounted form.
// A popstate consumes that entry before requestClose runs, so this is ownership
// of the real stack entry rather than merely a record that open once pushed.
const REAL_CONTRACT_DRAFT_KEY = STORAGE_KEYS.realContractDraft;

function activeProject(projectId = null) {
  const id =
    projectId ||
    projectContext.getProjectId?.() ||
    projectContext.getActiveProjectId?.();

  if (!id) return null;

  return projectRepository.getActiveProject(id);
}

function legacy(name, ...args) {
  if (typeof window !== 'undefined' && typeof window[name] === 'function') return window[name](...args);
  if (typeof window !== 'undefined' && typeof window.KarhaLegacy?.[name] === 'function') return window.KarhaLegacy[name](...args);
  return undefined;
}

function helper(name, ...args) {
  if (typeof window !== 'undefined' && typeof window.KarhaUI?.[name] === 'function') {
    return window.KarhaUI[name](...args);
  }
  return legacy(name, ...args);
}

function contractShell(name, ...args) {
  if (typeof window !== 'undefined' && typeof window.KarhaContractShell?.[name] === 'function') {
    return window.KarhaContractShell[name](...args);
  }
  return helper(name, ...args);
}

function currentProject() {
  return activeProject(activeProjectId);
}

function openFormShell(projectId) {
  const opened = contractShell('openRealContractFormShell', projectId);
  if (opened !== true) return false;
  window.KarhaContractHistory?.enterForm();
  return true;
}

function closeFormShell(fromPopState = false) {
  contractShell('closeRealContractFormShell', fromPopState);
  window.KarhaContractHistory?.leaveForm(fromPopState);
}

function ftCreateRoot(parent) {
  const root = document.createElement('div');
  root.className = 'form-template';
  parent.appendChild(root);
  return root;
}

function ftTextRow(root, label, value, onChange, opts = {}) {
  const row = document.createElement('div');
  row.className = 'ft-row ft-stack';

  const lab = document.createElement('div');
  lab.className = 'ft-label';
  lab.textContent = label;

  const input = document.createElement('input');
  input.type = opts.inputType || 'text';
  input.className = 'ft-input';
  input.value = String(value ?? '');
  input.placeholder = opts.placeholder || label;
  if (opts.readonly) input.readOnly = true;
  input.oninput = () => {
    onChange?.(input.value);
    if (opts.dirty !== false) dirty = true;
  };

  row.append(lab, input);
  root.appendChild(row);
  return row;
}

function ftSelectRow(root, label, displayValue, onOpen, opts = {}) {
  const row = document.createElement('div');
  row.className = 'ft-row ft-tap';

  const lab = document.createElement('div');
  lab.className = 'ft-label';
  lab.textContent = label + (opts.hideColon ? '' : ':');

  const val = document.createElement('div');
  val.className = 'ft-value' + (displayValue ? '' : ' ft-placeholder');
  val.textContent = displayValue || opts.placeholder || 'انتخاب';

  row.append(lab, val);
  row.onclick = event => {
    event.preventDefault();
    onOpen?.();
  };
  root.appendChild(row);
  return row;
}

function ftDateRow(root, label, value, onChange, opts = {}) {
  const display = value ? (helper('formatJalaliDisplay', value) ?? String(value)) : '';
  return ftSelectRow(root, label, display, () => {
    helper('openJalaliPicker', value || helper('todayJalaliStr'), next => {
      onChange?.(next);
      if (opts.dirty !== false) dirty = true;
      renderContractForm();
    }, { maxToday: !!opts.maxToday });
  }, { placeholder: opts.placeholder || 'انتخاب تاریخ' });
}

function ftNumberRow(root, label, value, onChange, opts = {}) {
  let display = '';
  if (value !== '' && value != null && String(value).length) {
    const normalized = helper('toEnglishDigits', String(value)) ?? value;
    const raw = String(normalized).replace(/[^\d.]/g, '');
    const shown = opts.group === false
      ? (helper('toPersianDigits', raw) ?? raw)
      : (helper('formatCost', raw) ?? raw);
    display = (opts.prefix || '') + shown + (opts.suffix ? ` ${opts.suffix}` : '');
  }

  return ftSelectRow(root, label, display, () => {
    helper('openNumpadGeneric', value || '', raw => {
      onChange?.(raw);
      if (opts.dirty !== false) dirty = true;
      renderContractForm();
    }, {
      suffix: opts.suffix || '',
      maxLen: opts.maxLen || 16,
      group: opts.group !== false,
      prefix: opts.prefix || ''
    });
  }, { placeholder: opts.placeholder || 'وارد کنید' });
}

function ftCalcRow(root, text) {
  const row = document.createElement('div');
  row.className = 'ft-calc';
  row.textContent = text;
  root.appendChild(row);
  return row;
}

function contactDisplayName(contact) {
  if (!contact) return 'مخاطب';
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || 'مخاطب';
}

function pickerChanged() {
  dirty = true;
  renderContractForm();
}

function openContractPicker(kind) {
  const project = currentProject();
  if (!project || !state) return false;

  const addContact = () => {
    if (typeof window?.KarhaSearchTemplate?.close === 'function') window.KarhaSearchTemplate.close(false);
    else helper('closeSearchTemplate', false);

    const people = window?.KarhaApp?.modules?.get('people');
    if (typeof people?.openContactForm === 'function') {
      people.openContactForm(null, kind === 'contractor' ? { activityId: state.activityId } : undefined);
    } else {
      helper('showToast', 'افزودن مخاطب در دسترس نیست');
    }
  };

  if (kind === 'contractor') return contractPickers.openContractorPicker(project.id, state, pickerChanged, addContact);
  if (kind === 'employer') return contractPickers.openEmployerPicker(project.id, state, pickerChanged, addContact);
  return contractPickers.openProjectItemPicker(project.id, state, pickerChanged);
}

function makeInlineContractItem(text) {
  return {
    id: 'rc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    text: String(text || '').trim(),
    number: '',
    children: []
  };
}

function focusInlineAdd() {
  setTimeout(() => {
    document.querySelector('#realContractRootInlineAddInput, .real-contract-inline-add-input')?.focus();
  }, 0);
}

function commitContractInlineAdd(kind, parentId, input, keepFocus) {
  if (kind !== 'real' || !state) return false;
  const value = String(input?.value || '').trim();
  if (!value) return false;

  if (parentId) {
    const parent = contractItemInteractions.findItem(state.items, parentId);
    if (!parent) return false;
    if (!Array.isArray(parent.children)) parent.children = [];
    parent.children.push(makeInlineContractItem(value));
  } else {
    state.items.push(makeInlineContractItem(value));
  }

  realContractDomain.renumberRealContractItems(state.items);
  dirty = true;
  input.value = '';
  inlineAddState = keepFocus ? { parentId: parentId ?? null } : null;
  renderContractForm();
  if (keepFocus) focusInlineAdd();
  return true;
}

function renderContractInlineAddRow(parentId = null) {
  const row = document.createElement('div');
  row.className = 'inline-add-row active contract-inline-add-row';

  const input = document.createElement('input');
  input.className = 'real-contract-inline-add-input';
  input.placeholder = parentId ? 'بند جدید…' : 'ماده جدید…';

  let ignoreBlur = false;
  const commit = keepFocus => {
    const ok = commitContractInlineAdd('real', parentId, input, keepFocus);
    if (ok) {
      ignoreBlur = true;
      setTimeout(() => { ignoreBlur = false; }, 100);
    }
  };

  input.onkeydown = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      commit(true);
    } else if (event.key === 'Escape') {
      inlineAddState = null;
      renderContractForm();
    }
  };

  input.onblur = () => {
    if (ignoreBlur) return;
    setTimeout(() => {
      if (ignoreBlur || document.activeElement === input) return;
      if (input.value.trim()) commit(false);
    }, 120);
  };

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'x-btn';
  cancel.textContent = '×';
  cancel.onclick = () => {
    inlineAddState = null;
    renderContractForm();
  };

  row.append(input, cancel);
  return row;
}

function renderContractRootInlineAddRow() {
  if (inlineAddState?.parentId === null) {
    const row = renderContractInlineAddRow(null);
    row.classList.add('contract-root-inline-add-row-active');
    const input = row.querySelector('input');
    if (input) input.id = 'realContractRootInlineAddInput';
    setTimeout(() => input?.focus(), 0);
    return row;
  }

  const row = document.createElement('div');
  row.className = 'inline-add-row';
  row.innerHTML = '<span class="plus-circle">' + (helper('svgPlus') || '+') + '</span><span>افزودن ماده</span>';
  row.onclick = () => {
    inlineAddState = { parentId: null };
    renderContractForm();
    focusInlineAdd();
  };
  return row;
}

function renderRealContractItem(item, list, index, isChild = false) {
  const card = document.createElement('div');
  card.className = 'real-contract-item contract-work-item' + (isChild ? ' contract-item-card-child' : '') + (!isChild ? ` contract-group-${index % 2 === 0 ? 'even' : 'odd'}` : '');
  card.dataset.realContractDragId = item.id;
  card.dataset.contractDragId = item.id;

  const row = document.createElement('div');
  row.className = 'real-contract-item-row contract-work-row';

  const grip = document.createElement('span');
  grip.className = 'real-contract-grip contract-work-grip';
  grip.innerHTML = helper('svgGrip') || '⋮⋮';
  grip.title = 'جابه‌جایی';
  grip.onpointerdown = event => contractItemInteractions.attachPointerDrag({
    handle: event.currentTarget,
    list,
    id: item.id,
    kind: 'real',
    state: { items: state.items },
    onDirty: () => { dirty = true; },
    onRender: () => renderContractForm()
  });
  row.appendChild(grip);

  const number = document.createElement('div');
  number.className = 'real-contract-num contract-work-number';
  number.textContent = helper('toPersianDigits', item.number || '') ?? item.number ?? '';
  row.appendChild(number);

  const input = document.createElement('textarea');
  input.className = 'real-contract-text contract-work-input';
  input.value = item.text || '';
  input.placeholder = isChild ? 'متن بند را وارد کنید…' : 'متن ماده را وارد کنید…';
  input.oninput = () => {
    contractItemInteractions.updateItemText(item, input.value, { dirty: true });
    dirty = true;
  };
  row.appendChild(input);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'real-contract-btn danger contract-inline-delete';
  remove.textContent = 'حذف';
  remove.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    contractItemInteractions.removeItem(list, index, { items: state.items, dirty: true });
    dirty = true;
    renderContractForm();
  };
  row.appendChild(remove);
  card.appendChild(row);

  if (!isChild) {
    if (inlineAddState?.parentId === item.id) {
      card.appendChild(renderContractInlineAddRow(item.id));
    } else {
      const addChild = document.createElement('button');
      addChild.type = 'button';
      addChild.className = 'contract-add-child-row';
      addChild.title = 'افزودن بند';
      addChild.innerHTML = helper('svgPlus') || '+';
      addChild.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        inlineAddState = { parentId: item.id };
        renderContractForm();
        focusInlineAdd();
      };
      card.appendChild(addChild);
    }

    const children = document.createElement('div');
    children.className = 'real-contract-child contract-work-child-list';
    (item.children || []).forEach((child, childIndex) => {
      children.appendChild(renderRealContractItem(child, item.children, childIndex, true));
    });
    card.appendChild(children);
  }

  return card;
}

function renderContractForm() {
  const body = document.getElementById('contractFormBody');
  if (!body || !state) return false;

  const project = currentProject();
  if (!project) return false;

  const scrollHost = body.closest('.page-body') || body;
  const savedScroll = scrollHost.scrollTop || 0;
  body.innerHTML = '';

  const contacts = (helper('getContacts', project) || project.contacts || []).filter(contact => !contact.trashed);
  const findContact = id => contacts.find(contact => String(contact.id) === String(id)) || null;
  const activity = helper('findActivityTemplate', state.activityId, project);
  const activityName = activity?.name || activity?.title || '';
  const form = ftCreateRoot(body);

  ftTextRow(form, 'شماره قرارداد', state.contractNo || '', value => { state.contractNo = value; }, {
    readonly: !state.contractNo,
    placeholder: state.contractNo ? '' : 'توسط سیستم تولید می‌شود'
  });
  ftDateRow(form, 'تاریخ تنظیم قرارداد', state.contractDate || helper('todayJalaliStr'), value => { state.contractDate = value; }, { maxToday: true });

  const projectPlace = project.location || project.address || project.projectLocation || project.siteLocation || '';
  if (!state.contractPlace) state.contractPlace = projectPlace;
  ftTextRow(form, 'محل انعقاد قرارداد', state.contractPlace || '', value => { state.contractPlace = value; }, { placeholder: 'پیش‌فرض: محل پروژه' });

  ftSelectRow(form, 'آیتم پروژه', state.projectItemPath || '', () => openContractPicker('projectItem'), { placeholder: 'انتخاب' });
  ftSelectRow(form, 'کارفرما', state.employerId ? contactDisplayName(findContact(state.employerId)) : '', () => openContractPicker('employer'), { placeholder: 'انتخاب' });
  ftSelectRow(form, 'پیمانکار', state.contractorId ? contactDisplayName(findContact(state.contractorId)) : '', () => openContractPicker('contractor'), { placeholder: 'انتخاب' });

  const templates = contractTemplatesDomain.getContractTemplates(project).filter(template => !template.trashed);
  const matchingTemplates = templates.filter(template => String(template.activityId) === String(state.activityId));
  if (state.activityId && matchingTemplates.length > 1) {
    const label = matchingTemplates.find(template => String(template.id) === String(state.templateId))?.title || '';
    ftSelectRow(form, 'قالب قرارداد', label, () => {
      contractPickers.openStaticChoicePicker(
        'انتخاب قالب قرارداد',
        'قالب‌ها',
        matchingTemplates.map(template => ({ value: template.id, label: template.title || 'قالب قرارداد' })),
        state.templateId,
        id => {
          state.templateId = id;
          const template = matchingTemplates.find(item => String(item.id) === String(id));
          if (template) {
            state.items = realContractDomain.cloneTemplateIntoContract(template);
            state.paymentItems = JSON.parse(JSON.stringify(template.paymentItems || []));
          }
          dirty = true;
          renderContractForm();
        }
      );
    }, { placeholder: 'انتخاب' });
  } else if (state.activityId && matchingTemplates.length === 1 && !state.templateId) {
    state.templateId = matchingTemplates[0].id;
    state.items = realContractDomain.cloneTemplateIntoContract(matchingTemplates[0]);
    state.paymentItems = JSON.parse(JSON.stringify(matchingTemplates[0].paymentItems || []));
  }

  ftDateRow(form, 'تاریخ شروع قرارداد', state.startDate || '', value => { state.startDate = value; });
  ftDateRow(form, 'تاریخ پایان قرارداد', state.endDate || '', value => { state.endDate = value; });
  ftNumberRow(form, 'مبلغ کل قرارداد', state.amount, value => {
    const normalized = helper('toEnglishDigits', String(value)) ?? value;
    state.amount = String(normalized).replace(/[^\d]/g, '');
  }, { suffix: 'تومان', maxLen: 16, group: true, placeholder: 'وارد کنید' });
  ftNumberRow(form, 'درصد حسن انجام کار', state.retentionPercent, value => {
    const normalized = helper('toEnglishDigits', String(value)) ?? value;
    state.retentionPercent = String(normalized).replace(/[^\d]/g, '');
  }, { prefix: '٪', maxLen: 3, group: false, placeholder: 'وارد کنید' });

  const retentionAmount = (Number(state.amount) || 0) * (Number(state.retentionPercent) || 0) / 100;
  const netAmount = Math.max(0, (Number(state.amount) || 0) - retentionAmount);
  state.retentionAmount = String(Math.round(retentionAmount || 0));
  state.amountAfterRetention = String(Math.round(netAmount || 0));
  ftCalcRow(form, 'مبلغ حسن انجام کار: ' + (retentionAmount ? (helper('formatCost', retentionAmount) ?? retentionAmount) : '۰') + ' تومان');
  ftCalcRow(form, 'مبلغ قرارداد پس از کسر حسن انجام کار: ' + (netAmount ? (helper('formatCost', netAmount) ?? netAmount) : '۰') + ' تومان');

  const basisOptions = [
    { value: 'پایان قرارداد', label: 'تاریخ پایان قرارداد' },
    { value: 'تحویل موقت', label: 'تحویل موقت' },
    { value: 'تحویل قطعی', label: 'تحویل قطعی' },
    { value: 'تسویه نهایی', label: 'تسویه نهایی' }
  ];
  ftSelectRow(form, 'مبنای شروع مدت نگهداری حسن انجام کار', state.retentionBasis || '', () => {
    contractPickers.openStaticChoicePicker('مبنای شروع نگهداری', 'گزینه‌ها', basisOptions, state.retentionBasis, value => {
      state.retentionBasis = value;
      dirty = true;
      renderContractForm();
    });
  }, { placeholder: 'انتخاب' });

  const durationOptions = ['یک هفته', 'دو هفته', 'سه هفته', 'چهار هفته', 'یک ماه', 'یک ماه و نیم', 'دو ماه', 'دو ماه و نیم', 'سه ماه', 'چهار ماه', 'پنج ماه', 'شش ماه']
    .map(value => ({ value, label: value }));
  ftSelectRow(form, 'مدت نگهداری حسن انجام کار', state.retentionDuration || '', () => {
    contractPickers.openStaticChoicePicker('مدت نگهداری', 'مدت‌ها', durationOptions, state.retentionDuration, value => {
      state.retentionDuration = value;
      dirty = true;
      renderContractForm();
    });
  }, { placeholder: 'انتخاب' });

  paymentStagesModule.renderPaymentStages(body, state, {
    dirty: () => { dirty = true; },
    toEnglishDigits: value => helper('toEnglishDigits', value),
    toPersianDigits: value => helper('toPersianDigits', value),
    openNumpadGeneric: (value, onCommit, opts) => helper('openNumpadGeneric', value, onCommit, opts),
    onDirty: () => { dirty = true; },
    onNumpad: (value, onCommit, opts) => helper('openNumpadGeneric', value, onCommit, opts),
    onRender: () => renderContractForm()
  });

  const clausesHeading = document.createElement('div');
  clausesHeading.className = 'real-contract-section contract-clause-heading';
  clausesHeading.textContent = 'مواد قرارداد';
  body.appendChild(clausesHeading);

  if (!state.items.length) {
    const note = document.createElement('div');
    note.className = 'contract-form-note';
    note.textContent = state.activityId
      ? 'برای این فعالیت هنوز قالب قراردادی ثبت نشده است.'
      : 'پس از انتخاب فعالیت، مواد قرارداد از قالب آن خوانده می‌شوند.';
    body.appendChild(note);
  } else {
    realContractDomain.renumberRealContractItems(state.items);
    const items = document.createElement('div');
    items.className = 'real-contract-items';
    state.items.forEach((item, index) => items.appendChild(renderRealContractItem(item, state.items, index, false)));
    items.appendChild(renderContractRootInlineAddRow());
    body.appendChild(items);
  }

  const previewHeading = document.createElement('div');
  previewHeading.className = 'real-contract-section';
  previewHeading.textContent = 'پیش‌نمایش متن قرارداد';
  body.appendChild(previewHeading);

  const escape = value => helper('escapeHtml', String(value || '')) ?? String(value || '');
  const blank = value => escape(value).trim() || '................................................';
  const persian = value => helper('toPersianDigits', String(value ?? '')) ?? String(value ?? '');

  let clausesHtml = '';
  state.items.forEach((item, index) => {
    clausesHtml += '<div class="doc-clause"><b>' + persian(index + 1) + '.</b> ' + escape(item.text || '........................................................');
    (item.children || []).forEach((child, childIndex) => {
      clausesHtml += '<div class="doc-child"><b>' + persian(`${index + 1}-${childIndex + 1}`) + '.</b> ' + escape(child.text || '........................................................') + '</div>';
    });
    clausesHtml += '</div>';
  });

  let paymentHtml = '';
  (state.paymentStages || []).forEach((stage, index) => {
    const progress = stage.progress || '۰';
    const paymentPercent = stage.paymentPercent || '۰';
    paymentHtml += '<div><b>' + persian(index + 1) + '.</b> پس از ' + persian(progress) + '٪ پیشرفت، ' + persian(paymentPercent) + '٪ از مبلغ قرارداد پرداخت می‌شود' + (stage.description ? ' — ' + escape(stage.description) : '') + '</div>';
  });

  const formattedAmount = state.amount ? (helper('formatCost', state.amount) ?? state.amount) : '................................';
  const formattedRetention = helper('formatCost', retentionAmount) ?? retentionAmount;
  const preview = document.createElement('div');
  preview.className = 'contract-doc-preview';
  preview.innerHTML = '<div class="doc-title">' + escape('قرارداد ' + activityName) + '</div>' +
    '<div class="doc-meta">' +
      '<div>شماره قرارداد: <span class="doc-line">' + blank(state.contractNo) + '</span></div>' +
      '<div>تاریخ تنظیم: <span class="doc-line">' + blank(helper('formatJalaliDisplay', state.contractDate)) + '</span></div>' +
      '<div>تاریخ شروع: <span class="doc-line">' + blank(helper('formatJalaliDisplay', state.startDate)) + '</span></div>' +
      '<div>تاریخ پایان: <span class="doc-line">' + blank(helper('formatJalaliDisplay', state.endDate)) + '</span></div>' +
      '<div>محل انعقاد: <span class="doc-line">' + blank(state.contractPlace) + '</span></div>' +
    '</div>' +
    '<div class="doc-parties">' +
      '<div class="party"><span class="doc-party-label">این قرارداد فی‌مابین کارفرما:</span> ' + blank(state.employerName) + '</div>' +
      '<div class="party"><span class="doc-party-label">و پیمانکار:</span> ' + blank(state.contractorName) + '</div>' +
      '<div class="party">موضوع فعالیت: ' + blank(activityName) + '</div>' +
      '<div class="party">آیتم پروژه: ' + blank(state.projectItemPath || '') + '</div>' +
      '<div class="party">مبلغ کل قرارداد: ' + formattedAmount + ' تومان</div>' +
      '<div class="party">حسن انجام کار: ٪' + persian(state.retentionPercent || '۰') + '، معادل ' + formattedRetention + ' تومان</div>' +
      '<div class="party">مبنای شروع نگهداری حسن انجام کار: ' + blank(state.retentionBasis) + '</div>' +
      '<div class="party">مدت نگهداری: ' + blank(state.retentionDuration) + '</div>' +
    '</div>' +
    '<div class="doc-clauses">' + (clausesHtml || '<div class="doc-clause">........................................................</div>') + '</div>' +
    '<div class="doc-payment"><b>شرایط پرداخت</b>' + (paymentHtml || '<div>........................................................</div>') + '</div>' +
    '<div class="doc-signatures"><div class="signature-box">امضا و اثر انگشت کارفرما<br>................................</div><div class="signature-box">امضا و اثر انگشت پیمانکار<br>................................</div></div>';
  body.appendChild(preview);

  const actions = document.getElementById('contractFormActions');
  if (actions) {
    actions.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'real-contract-savebar';

    const save = document.createElement('button');
    save.className = 'if-save';
    save.textContent = 'ذخیره';
    save.onclick = () => realContractFormModule.save(activeProjectId, false);

    const draft = document.createElement('button');
    draft.className = 'if-draft';
    draft.textContent = 'پیش‌نویس';
    draft.onclick = () => saveDraft();

    const cancel = document.createElement('button');
    cancel.className = 'if-cancel';
    cancel.textContent = 'انصراف';
    cancel.onclick = () => realContractFormModule.close();

    bar.append(save, draft, cancel);
    actions.appendChild(bar);
  }

  const raf = helper('requestAnimationFrame', () => {
    try { scrollHost.scrollTop = savedScroll; } catch {}
  });
  if (raf === undefined && typeof window !== 'undefined') {
    window.requestAnimationFrame?.(() => {
      try { scrollHost.scrollTop = savedScroll; } catch {}
    });
  }
  setTimeout(() => {
    try { scrollHost.scrollTop = savedScroll; } catch {}
  }, 0);

  return true;
}

function saveDraft() {
  try {
    localStorageAdapter.setItem(REAL_CONTRACT_DRAFT_KEY, JSON.stringify(state));
    dirty = false;
    helper('showToast', 'پیش‌نویس ذخیره شد');
    state = null;
    editingId = null;
    inlineAddState = null;
    activeProjectId = null;
    closeFormShell(false);
    return true;
  } catch {
    helper('showToast', 'پیش‌نویس ذخیره نشد');
    return false;
  }
}

export const realContractFormModule = {
  commitContractInlineAdd,
  focusInlineAdd,

  open(id = null, projectId = null) {
    const project = activeProject(projectId);
    if (!project) return false;

    activeProjectId = project.id;
    if (!openFormShell(project.id)) {
      activeProjectId = null;
      return false;
    }

    editingId = id || null;
    state = realContractDomain.makeRealContractDraft(
      id ? realContractDomain.findProjectContract(id, project) : null,
      helper('todayJalaliStr')
    );
    dirty = false;
    inlineAddState = null;

    const title = document.getElementById('contractFormTitle');
    if (title) title.textContent = id ? 'ویرایش قرارداد' : 'قرارداد جدید';

    return renderContractForm();
  },

  render() {
    return !!state && renderContractForm();
  },

  save(projectId = null, silent = false) {
    const project = activeProject(projectId || activeProjectId);
    if (!project || !state) return false;

    const result = saveRealContract(project.id, state, {
      showToast: message => helper('showToast', message),
      todayJalaliStr: () => helper('todayJalaliStr'),
      findActivityTemplate: (id, current) => helper('findActivityTemplate', id, current),
      syncContractPartyData: (draft, current) => realContractDomain.syncContractPartyData(draft, current),
      toEnglishDigits: value => helper('toEnglishDigits', value)
    });

    if (!result.ok) return false;
    state = result.contract;
    dirty = false;
    this.close(false);
    if (!silent) helper('showToast', 'قرارداد ذخیره شد');
    return true;
  },

  requestClose(fromPopState = false, transition = null) {
    // The browser already consumed the form entry before dispatching popstate.
    const formHistoryOwned = window.KarhaContractHistory?.formOwned?.() ?? false;
    if (!dirty) return this.close(fromPopState);

    const restoreHistory = () => {
      if (!fromPopState || formHistoryOwned) return;
      window.KarhaContractHistory?.restoreConsumedForm?.(transition);
    };

    const showExitChoice = (opts) => {
      const fn =
        (typeof window !== 'undefined' && window.KarhaUI?.showIncompleteFormExitChoice) ||
        (typeof window !== 'undefined' && window.showIncompleteFormExitChoice) ||
        (typeof window !== 'undefined' && window.KarhaLegacy?.showIncompleteFormExitChoice);
      if (typeof fn === 'function') return fn(opts);
      return helper('showIncompleteFormExitChoice', opts);
    };

    showExitChoice({
      onYes: () => {
        try { localStorageAdapter.setItem(REAL_CONTRACT_DRAFT_KEY, JSON.stringify(state)); } catch {}
        dirty = false;
        this.close(fromPopState);
      },
      onNo: () => this.close(fromPopState),
      onStay: restoreHistory
    });
    return false;
  },

  saveDraft,

  close(fromPopState = false) {
    state = null;
    dirty = false;
    editingId = null;
    inlineAddState = null;
    activeProjectId = null;
    closeFormShell(fromPopState);
    return true;
  },

  getState() { return state; },
  isDirty() { return dirty; },
  setDirty(value = true) { dirty = !!value; },
  setState(value) { state = value; }
};

export default realContractFormModule;

if (typeof window !== 'undefined') window.KarhaRealContractForm = realContractFormModule;
