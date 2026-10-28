import { contractDocumentMarkup } from './contractDocument.js';
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
import { mountContractPrintPage } from './contractTemplateFormModule.js';

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

  const closePicker = () => {
    if (typeof window?.KarhaSearchTemplate?.close === 'function') window.KarhaSearchTemplate.close(false);
    else helper('closeSearchTemplate', false);
  };
  const addContact = () => {
    closePicker();
    const people = window?.KarhaApp?.modules?.get('people');
    if (typeof people?.openContactForm === 'function') {
      people.openContactForm(null, {
        pickerMode:true,
        ...(kind === 'contractor' ? { activityId: state.activityId } : {}),
        onCreated: created => {
          const item={id:created.id};
          if(kind==='contractor') contractPickers.selectContractor(project.id,state,item);
          else contractPickers.selectEmployer(project.id,state,item);
          pickerChanged();
        }
      });
    } else helper('showToast', 'افزودن مخاطب در دسترس نیست');
  };
  const addActivity = () => {
    closePicker();
    const activities=window?.KarhaApp?.modules?.get('activities');
    activities?.openActivityForm?.({pickerMode:true,onCreated:created=>{
      contractPickers.selectActivity(project.id,state,{id:created.id});
      pickerChanged();
    }});
  };

  if (kind === 'contractor') return contractPickers.openContractorPicker(project.id, state, pickerChanged, addContact);
  if (kind === 'employer') return contractPickers.openEmployerPicker(project.id, state, pickerChanged, addContact);
  if (kind === 'activity') return contractPickers.openActivityPicker(project.id, state, pickerChanged, addActivity);
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
  row.className = 'ctf-add-input-row contract-inline-add-row';

  const input = document.createElement('textarea');
  input.className = 'ctf-inline-input real-contract-inline-add-input';
  input.placeholder = parentId ? 'بند را وارد کنید…' : 'ماده را وارد کنید…';
  input.rows = 1;
  input.wrap = 'soft';
  input.enterKeyHint = 'enter';
  input.onkeydown = event => {
    if (event.key === 'Escape') {
      inlineAddState = null;
      renderContractForm();
    }
  };

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'ctf-inline-confirm';
  confirm.textContent = 'ثبت';
  confirm.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    commitContractInlineAdd('real', parentId, input, false);
  };

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'ctf-inline-cancel';
  cancel.textContent = 'لغو';
  cancel.onclick = () => {
    inlineAddState = null;
    renderContractForm();
  };

  row.append(input, confirm, cancel);
  return row;
}

function renderContractRootInlineAddRow() {
  if (inlineAddState?.parentId === null) {
    const row = renderContractInlineAddRow(null);
    const input = row.querySelector('textarea');
    if (input) input.id = 'realContractRootInlineAddInput';
    setTimeout(() => input?.focus(), 0);
    return row;
  }

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'ctf-add-band';
  add.textContent = '+ افزودن ماده';
  add.onclick = () => {
    inlineAddState = { parentId: null };
    renderContractForm();
    focusInlineAdd();
  };
  return add;
}

function renderRealContractRow(item, list, index, isChild) {
  const row = document.createElement('div');
  row.className = isChild ? 'ctf-row ctf-material-row' : 'ctf-row ctf-band-row';
  if (isChild) {
    row.dataset.realContractDragId = item.id;
    row.dataset.contractDragId = item.id;
  }

  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'ctf-grip';
  grip.innerHTML = helper('svgGrip') || '⋮⋮';
  grip.title = isChild ? 'جابه‌جایی بند' : 'جابه‌جایی ماده';
  grip.onpointerdown = event => contractItemInteractions.attachPointerDrag({
    handle: event.currentTarget,
    list,
    id: item.id,
    kind: 'real',
    state: { items: state.items },
    onDirty: () => { dirty = true; },
    onRender: () => renderContractForm()
  });

  const number = document.createElement('span');
  number.className = 'ctf-num';
  number.textContent = helper('toPersianDigits', item.number || '') ?? item.number ?? '';

  const input = document.createElement('textarea');
  input.className = 'ctf-text';
  input.value = item.text || '';
  input.placeholder = isChild ? 'متن بند را وارد کنید…' : 'عنوان ماده را وارد کنید…';
  input.rows = 1;
  input.wrap = 'soft';
  input.oninput = () => {
    contractItemInteractions.updateItemText(item, input.value, { dirty: true });
    dirty = true;
  };

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'ctf-delete';
  remove.textContent = 'حذف';
  remove.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    contractItemInteractions.removeItem(list, index, { items: state.items, dirty: true });
    dirty = true;
    renderContractForm();
  };

  const actions = document.createElement('div');
  actions.className = isChild ? 'ctf-row-actions ctf-material-actions' : 'ctf-row-actions';
  actions.append(grip, remove);
  row.append(number, input, actions);
  return row;
}

function renderRealContractItem(item, list, index, isChild = false) {
  if (isChild) return renderRealContractRow(item, list, index, true);

  const group = document.createElement('div');
  group.className = 'ctf-group ' + (index % 2 === 0 ? 'ctf-even' : 'ctf-odd');
  group.dataset.realContractDragId = item.id;
  group.dataset.contractDragId = item.id;
  group.appendChild(renderRealContractRow(item, list, index, false));

  const children = item.children || [];
  children.forEach((child, childIndex) => {
    group.appendChild(renderRealContractItem(child, children, childIndex, true));
  });

  if (inlineAddState?.parentId === item.id) {
    group.appendChild(renderContractInlineAddRow(item.id));
  } else {
    const addChild = document.createElement('button');
    addChild.type = 'button';
    addChild.className = 'ctf-add-material';
    addChild.title = 'افزودن بند';
    addChild.innerHTML = '<span>افزودن بند</span><span class="ctf-add-plus">+</span>';
    addChild.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      inlineAddState = { parentId: item.id };
      renderContractForm();
      focusInlineAdd();
    };
    group.appendChild(addChild);
  }

  return group;
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

  if(state.workTaskId) ftTextRow(form,'آیتم پروژه',state.projectItemPath || '',()=>{}, {readonly:true,placeholder:'توسط سیستم انتخاب شده'});
  else ftSelectRow(form, 'آیتم پروژه', state.projectItemPath || '', () => openContractPicker('projectItem'), { placeholder: 'انتخاب' });
  ftSelectRow(form, 'کارفرما', state.employerId ? contactDisplayName(findContact(state.employerId)) : '', () => openContractPicker('employer'), { placeholder: 'انتخاب' });
  ftSelectRow(form, 'پیمانکار', state.contractorId ? contactDisplayName(findContact(state.contractorId)) : '', () => openContractPicker('contractor'), { placeholder: 'انتخاب' });
  ftSelectRow(form, 'فعالیت', activityName, () => openContractPicker('activity'), { placeholder: 'انتخاب' });

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

  const methods = paymentStagesModule.retentionMethods;
  ftSelectRow(form, 'نحوه کسر حسن انجام کار', methods.find(x=>x.value===(state.retentionMethod||'first')).label, () => {
    contractPickers.openStaticChoicePicker('نحوه کسر حسن انجام کار', 'روش‌ها', methods, state.retentionMethod||'first', value => {
      state.retentionMethod=value;
      pickerChanged();
    });
  });
  const count=state.paymentStageCount || Math.min(10,state.paymentStages?.length||1);
  ftSelectRow(form, 'تعداد مراحل پرداخت', helper('toPersianDigits', String(count)) ?? String(count), () => {
    contractPickers.openStaticChoicePicker('تعداد مراحل پرداخت', 'مراحل',
      Array.from({length:10},(_,i)=>({value:String(i+1),label:(helper('toPersianDigits',String(i+1))??String(i+1))+' مرحله'})),
      String(count), value => {
        state.paymentStageCount=Number(value);
        pickerChanged();
      });
  });
  paymentStagesModule.renderPaymentStages(body, state, {onDirty: () => { dirty = true; }});

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
    items.className = 'ctf-groups real-contract-items';
    state.items.forEach((item, index) => items.appendChild(renderRealContractItem(item, state.items, index, false)));
    items.appendChild(renderContractRootInlineAddRow());
    body.appendChild(items);
  }

  const previewHeading = document.createElement('div');
  previewHeading.className = 'real-contract-section';
  previewHeading.textContent = 'پیش‌نمایش متن قرارداد';
  body.appendChild(previewHeading);

  const preview=document.createElement('div');
  preview.className = 'ctf-preview contract-doc-preview contract-real-print-preview';
  preview.innerHTML=contractDocumentMarkup(state,activityName);
  mountContractPrintPage(body, preview, 'contract-real-preview-viewport');

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
    state = realContractDomain.resolveContractDocumentDraft(
      id ? realContractDomain.findProjectContract(id, project) : null,
      project,
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
