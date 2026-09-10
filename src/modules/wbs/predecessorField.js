import { flattenDependencyCandidates, validatePredecessors } from '../../domain/wbs/scheduling.js';
import { openSearchPicker } from '../../ui/searchPickerAdapter.js';

function label(row){
  const kind = row.kind === 'stage' ? 'بسته' : (row.kind === 'workTask' ? 'Task' : 'Work');
  return `${kind} — ${row.title}`;
}

export function predecessorField({ documentRef = document, project, consumerId, initial = [] } = {}){
  const root = documentRef.createElement('div'); root.className = 'wbs-field wbs-predecessor-field';
  const caption = documentRef.createElement('span'); caption.className = 'wbs-field-label'; caption.textContent = 'پیش‌نیاز';
  const selected = new Set((initial || []).map(String));
  const candidates = flattenDependencyCandidates(project?.tasks || []).filter(row => row.id !== String(consumerId));
  const chips = documentRef.createElement('div'); chips.className = 'wbs-predecessor-list';
  const add = documentRef.createElement('button'); add.type = 'button'; add.className = 'wbs-choice'; add.textContent = '+ افزودن پیش‌نیاز';
  const paint = () => {
    chips.replaceChildren();
    [...selected].forEach(id => {
      const row = candidates.find(item => item.id === id); if(!row) return;
      const chip = documentRef.createElement('div'); chip.className = 'wbs-activity-row';
      const text = documentRef.createElement('span'); text.textContent = label(row);
      const remove = documentRef.createElement('button'); remove.type = 'button'; remove.className = 'wbs-activity-remove'; remove.textContent = 'حذف';
      remove.addEventListener('click', () => { selected.delete(id); paint(); }); chip.append(text, remove); chips.appendChild(chip);
    });
  };
  add.addEventListener('click', () => openSearchPicker({
    title:'انتخاب پیش‌نیاز', listTitle:'فعالیت‌ها', selectedTitle:'پیش‌نیاز منتخب', contextKey:`wbs-predecessor:${consumerId}`,
    items:candidates.filter(row => !selected.has(row.id)).map(row => ({ id:row.id, name:label(row) })), showStar:false, showAdd:false,
    onSelect:item => { selected.add(String(item.id)); paint(); },
  }));
  root.append(caption, chips, add); paint();
  return {
    element:root,
    value:() => [...selected],
    validate:() => validatePredecessors(project?.tasks || [], consumerId, [...selected]),
  };
}
