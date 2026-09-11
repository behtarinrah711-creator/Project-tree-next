import { flattenDependencyCandidates, validatePredecessors } from '../../domain/wbs/scheduling.js';
import { openSearchPicker } from '../../ui/searchPickerAdapter.js';

const RELATION_TYPES = Object.freeze(['FS','SS','FF']);

function label(row){
  const kind = row.kind === 'stage' ? 'بسته' : (row.kind === 'workTask' ? 'Task' : 'Work');
  return `${kind} — ${row.title}`;
}

function normalizeRelations(initial){
  return (Array.isArray(initial) ? initial : []).map(value => {
    if(value && typeof value === 'object'){
      return {
        predecessorId:String(value.predecessorId || value.id || ''),
        type:RELATION_TYPES.includes(value.type) ? value.type : 'FS',
        lagDays:Number.isFinite(Number(value.lagDays)) ? Number(value.lagDays) : 0,
      };
    }
    return { predecessorId:String(value || ''), type:'FS', lagDays:0 };
  }).filter(row => row.predecessorId);
}

export function predecessorField({ documentRef = document, project, consumerId, initial = [] } = {}){
  const root = documentRef.createElement('div'); root.className = 'wbs-field wbs-predecessor-field';
  const caption = documentRef.createElement('span'); caption.className = 'wbs-field-label'; caption.textContent = 'پیش‌نیاز';
  const relations = new Map(normalizeRelations(initial).map(row => [row.predecessorId, row]));
  const candidates = flattenDependencyCandidates(project?.tasks || []).filter(row => row.id !== String(consumerId));
  const chips = documentRef.createElement('div'); chips.className = 'wbs-predecessor-list';
  const add = documentRef.createElement('button'); add.type = 'button'; add.className = 'wbs-choice'; add.textContent = '+ افزودن پیش‌نیاز';

  const paint = () => {
    chips.replaceChildren();
    [...relations.values()].forEach(relation => {
      const row = candidates.find(item => item.id === relation.predecessorId); if(!row) return;
      const chip = documentRef.createElement('div'); chip.className = 'wbs-activity-row wbs-predecessor-row';

      const text = documentRef.createElement('span');
      text.className = 'wbs-predecessor-name';
      text.textContent = label(row);

      const type = documentRef.createElement('select');
      type.className = 'wbs-predecessor-type';
      RELATION_TYPES.forEach(value => {
        const option = documentRef.createElement('option');
        option.value = value; option.textContent = value;
        type.appendChild(option);
      });
      type.value = relation.type;
      type.setAttribute('aria-label', 'نوع رابطه');
      type.addEventListener('change', () => { relation.type = type.value; });

      const lag = documentRef.createElement('label');
      lag.className = 'wbs-predecessor-lag';
      const lagText = documentRef.createElement('span'); lagText.textContent = 'Lag';
      const lagInput = documentRef.createElement('input');
      lagInput.type = 'number'; lagInput.step = '1'; lagInput.value = String(relation.lagDays || 0);
      lagInput.setAttribute('aria-label', 'Lag روز');
      lagInput.addEventListener('input', () => { relation.lagDays = Number(lagInput.value) || 0; });
      lag.append(lagText, lagInput);

      const remove = documentRef.createElement('button');
      remove.type = 'button'; remove.className = 'wbs-activity-remove'; remove.textContent = 'حذف';
      remove.addEventListener('click', () => { relations.delete(relation.predecessorId); paint(); });

      chip.append(text, type, lag, remove);
      chips.appendChild(chip);
    });
  };

  add.addEventListener('click', () => openSearchPicker({
    title:'انتخاب پیش‌نیاز', listTitle:'فعالیت‌ها', selectedTitle:'پیش‌نیاز منتخب', contextKey:`wbs-predecessor:${consumerId}`,
    items:candidates.filter(row => !relations.has(row.id)).map(row => ({ id:row.id, name:label(row) })), showStar:false, showAdd:false,
    onSelect:item => {
      const id = String(item.id);
      relations.set(id, { predecessorId:id, type:'FS', lagDays:0 });
      paint();
    },
  }));

  root.append(caption, chips, add); paint();
  return {
    element:root,
    value:() => [...relations.keys()],
    relations:() => [...relations.values()].map(row => ({ ...row })),
    validate:() => validatePredecessors(project?.tasks || [], consumerId, [...relations.keys()]),
  };
}
