import { openSearchPicker } from '../../ui/searchPickerAdapter.js';

export function closeWbsSheet(){
  document.getElementById('wbsSheetOverlay')?.remove();
}

export function openWbsSheet({ title, body, onSave, saveLabel = 'ذخیره' } = {}){
  closeWbsSheet();
  const overlay = document.createElement('div');
  overlay.id = 'wbsSheetOverlay';
  overlay.className = 'overlay wbs-sheet-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', title || 'جزئیات');
  overlay.innerHTML = `
    <div class="sheet wbs-sheet">
      <div class="sheet-head">
        <button type="button" class="close-btn" aria-label="بستن">×</button>
        <span class="sheet-caption"></span>
        <button type="button" class="wbs-sheet-save">${saveLabel}</button>
      </div>
      <div class="sheet-body"></div>
    </div>
  `;
  overlay.querySelector('.sheet-caption').textContent = title || '';
  const bodyEl = overlay.querySelector('.sheet-body');
  if(typeof body === 'function') body(bodyEl);
  else if(body) bodyEl.append(body);
  overlay.querySelector('.close-btn').addEventListener('click', closeWbsSheet);
  overlay.addEventListener('click', ev => { if(ev.target === overlay) closeWbsSheet(); });
  overlay.querySelector('.wbs-sheet-save').addEventListener('click', () => {
    const ok = onSave ? onSave(bodyEl) : true;
    if(ok !== false) closeWbsSheet();
  });
  document.body.appendChild(overlay);
  bodyEl.querySelector('input,textarea,select')?.focus();
  return overlay;
}

export function fieldRow(label, control){
  const wrap = document.createElement('label');
  wrap.className = 'wbs-field';
  const cap = document.createElement('span');
  cap.className = 'wbs-field-label';
  cap.textContent = label;
  wrap.append(cap, control);
  return wrap;
}

export function textInput(value = '', attrs = {}){
  const input = document.createElement('input');
  input.type = attrs.type || 'text';
  input.className = 'wbs-input';
  input.value = value ?? '';
  if(attrs.placeholder) input.placeholder = attrs.placeholder;
  if(attrs.name) input.name = attrs.name;
  return input;
}

export function liveLineTotal(quantity, unitCost){
  return (Number(quantity) || 0) * (Number(unitCost) || 0);
}

export function bindLiveTotal(qtyInput, costInput, totalEl, prefix = 'جمع: '){
  const paint = () => {
    if(totalEl) totalEl.textContent = prefix + liveLineTotal(qtyInput?.value, costInput?.value);
  };
  qtyInput?.addEventListener('input', paint);
  costInput?.addEventListener('input', paint);
  paint();
  return paint;
}

export function activityDisplayName(activity){
  if(!activity) return '';
  return activity.name || activity.title || activity.text || activity.id;
}

export function openActivitySearchPicker(items, onSelect){
  return openSearchPicker({
    title: 'انتخاب فعالیت',
    listTitle: 'فعالیت‌ها',
    selectedTitle: 'فعالیت‌های منتخب',
    contextKey: 'wbs-work-activity',
    items: (items || []).map(item => ({
      id: item.id,
      name: activityDisplayName(item),
    })),
    showStar: false,
    showAdd: false,
    onSelect: item => onSelect?.(item.id),
  });
}

export function renderAttachedActivities(host, {
  attached = [],
  catalog = [],
  onDetach,
  onAdd,
} = {}){
  host.replaceChildren();
  host.className = 'wbs-field wbs-activity-editor';
  const label = document.createElement('span');
  label.className = 'wbs-field-label';
  label.textContent = 'فعالیت‌ها';
  host.appendChild(label);
  if(!attached.length){
    const empty = document.createElement('div');
    empty.className = 'wbs-note';
    empty.textContent = 'فعالیتی متصل نیست';
    host.appendChild(empty);
  }
  attached.forEach(id => {
    const row = document.createElement('div');
    row.className = 'wbs-activity-row';
    const name = document.createElement('span');
    name.textContent = activityDisplayName(catalog.find(item => String(item.id) === String(id))) || String(id);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'wbs-activity-remove';
    remove.setAttribute('aria-label', 'حذف فعالیت');
    remove.textContent = 'حذف';
    remove.addEventListener('click', () => onDetach?.(id));
    row.append(name, remove);
    host.appendChild(row);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'wbs-choice';
  add.textContent = '+ افزودن فعالیت';
  add.addEventListener('click', () => onAdd?.());
  host.appendChild(add);
  return host;
}

export function selectInput(options, value = ''){
  const select = document.createElement('select');
  select.className = 'wbs-input';
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if(String(opt.value) === String(value)) option.selected = true;
    select.appendChild(option);
  });
  return select;
}
