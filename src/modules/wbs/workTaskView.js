import { contactRepository } from '../../data/contactRepository.js';
import { projectRepository } from '../../data/projectRepository.js';
import { WORK_TYPES } from '../../domain/wbs/normalize.js';
import { workTaskApi } from '../../domain/wbs/workTaskApi.js';
import { todayApi } from '../../domain/wbs/todayApi.js';
import { TASK_PRIORITIES, isTaskComplete } from '../../domain/wbs/workTaskModel.js';
import { formatJalaliDisplay } from '../../ui/jalali.js';
import { toEnglishDigits } from '../../ui/digits.js';
import { openSearchPicker } from '../../ui/searchPickerAdapter.js';
import { isExpanded, toggleExpanded } from './wbsExpandState.js';
import { closeWbsSheet, fieldRow, openWbsSheet, selectInput, textInput } from './wbsSheet.js';
import { predecessorField } from './predecessorField.js';

const PRIORITY_LABELS = Object.freeze({ low:'کم', normal:'عادی', high:'زیاد' });
const TYPE_CLASSES = new Map([
  ['اجرا','type-1'], ['خرید','type-2'], ['نیروی کار','type-3'], ['پیمانکار','type-4'],
  ['کرایه','type-5'], ['خدمات','type-6'], ['پیگیری','type-7'],
]);

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
}

function contactName(contact){
  return [contact?.type, contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim()
    || contact?.name || 'مخاطب';
}

function linkedContractForWork(projectId, workId){
  return (projectRepository.find(projectId)?.contracts || [])
    .find(contract => !contract.trashed && String(contract.projectItemId || '') === String(workId));
}

function linkedContractor(projectId, workId){
  const contract = linkedContractForWork(projectId, workId);
  if(!contract) return null;
  return contactRepository.get(projectId, contract.contractorId || contract.contactId) || null;
}

function currentActor(){
  const user = window.firebase?.auth?.()?.currentUser || null;
  return { id:user?.uid || 'guest', name:user?.displayName || user?.email || 'کاربر' };
}

function dateField(documentRef, name, label, value){
  const button = documentRef.createElement('button');
  button.type = 'button'; button.name = name; button.className = 'wbs-input wbs-date-input';
  button.dataset.value = value || '';
  const paint = () => { button.textContent = button.dataset.value ? formatJalaliDisplay(button.dataset.value) : 'انتخاب تاریخ'; };
  button.addEventListener('click', () => documentRef.defaultView?.KarhaUI?.openJalaliPicker?.(button.dataset.value, next => {
    button.dataset.value = next; paint();
  }));
  paint();
  return fieldRow(label, button);
}

function taskForm({ projectId, work, task = null, onChanged }){
  const editing = Boolean(task);
  const documentRef = document;
  const contractor = linkedContractor(projectId, work.id);
  openWbsSheet({
    title:editing ? 'ویرایش کار' : 'ساخت کار',
    saveLabel:'ذخیره',
    body(root){
      root.appendChild(fieldRow('عنوان', textInput(task?.title || '', { name:'taskTitle', required:true })));
      root.appendChild(fieldRow('نوع کار', selectInput(WORK_TYPES.map(value => ({ value, label:value })), task?.type || work.type || WORK_TYPES[0])));
      root.lastChild.querySelector('select').name = 'taskType';
      root.appendChild(dateField(documentRef, 'taskStart', 'تاریخ شروع', task?.scheduleStart || ''));
      root.appendChild(dateField(documentRef, 'taskEnd', 'تاریخ پایان', task?.scheduleEnd || ''));
      root.appendChild(fieldRow('درجه اهمیت', selectInput(TASK_PRIORITIES.map(value => ({ value, label:PRIORITY_LABELS[value] })), task?.priority || 'normal')));
      root.lastChild.querySelector('select').name = 'taskPriority';

      const contacts = contactRepository.list(projectId).filter(contact => contact && !contact.trashed);
      const assignee = documentRef.createElement('button');
      assignee.type = 'button'; assignee.name = 'taskAssignee'; assignee.className = 'wbs-input';
      assignee.dataset.value = task?.assigneeContactId || '';
      const paintAssignee = () => {
        const selected = contacts.find(contact => String(contact.id) === String(assignee.dataset.value));
        assignee.textContent = selected ? contactName(selected) : 'انتخاب مسئول';
      };
      assignee.addEventListener('click', () => openSearchPicker({
        title:'انتخاب مسئول', listTitle:'مخاطبین', selectedTitle:'مسئول منتخب',
        contextKey:`wbs-task-assignee:${work.id}`,
        items:contacts.map(contact => ({ id:contact.id, name:contactName(contact) })),
        showStar:false, showAdd:false,
        onSelect:selected => { assignee.dataset.value = String(selected.id); paintAssignee(); },
      }));
      paintAssignee();
      root.appendChild(fieldRow('مسئول', assignee));

      if(contractor){
        const note = documentRef.createElement('div');
        note.className = 'wbs-note';
        note.textContent = `پیمانکار از قرارداد خوانده می‌شود: ${contactName(contractor)}`;
        root.appendChild(note);
      }
      root.appendChild(fieldRow('وزن', textInput(String(task?.weight || 1), { name:'taskWeight', type:'number', min:'0.01', step:'0.01', required:true })));
      root.appendChild(fieldRow('پیشرفت ٪', textInput(String(task?.progress || 0), { name:'taskProgress', type:'number', min:'0', max:'100', step:'1' })));
      root.appendChild(fieldRow('مبلغ', textInput(String(task?.amount || 0), { name:'taskAmount', type:'number', min:'0', step:'1' })));
      const dependency = predecessorField({ documentRef, project:projectRepository.find(projectId), consumerId:task?.id || `new:${work.id}`, initial:task?.dependencies || task?.predecessorIds || [] });
      root.appendChild(dependency.element); root._taskDependency = dependency;

      if(editing){
        const completion = documentRef.createElement('button');
        completion.type = 'button';
        completion.className = 'wbs-primary-action is-secondary wbs-task-completion-action';
        const pending = task.completionState === 'pending_approval';
        completion.textContent = isTaskComplete(task) ? 'تأیید شده' : (pending ? 'در انتظار تأیید' : 'ارسال برای تأیید');
        completion.disabled = isTaskComplete(task) || pending;
        completion.addEventListener('click', () => {
          todayApi.markComplete(projectId, { kind:'task', id:task.id, workId:work.id }, currentActor());
          closeWbsSheet(); onChanged?.();
        });
        root.appendChild(completion);
        const remove = documentRef.createElement('button');
        remove.type = 'button'; remove.className = 'wbs-primary-action is-secondary wbs-task-delete'; remove.textContent = 'حذف Task';
        remove.addEventListener('click', () => {
          const perform = () => { workTaskApi.remove(projectId, work.id, task.id); closeWbsSheet(); onChanged?.(); };
          if(typeof documentRef.defaultView?.KarhaUI?.openConfirm === 'function') documentRef.defaultView.KarhaUI.openConfirm('این Task حذف شود؟', perform, 'حذف');
          else if(documentRef.defaultView?.confirm?.('این Task حذف شود؟')) perform();
        });
        root.appendChild(remove);
      }
    },
    onSave(root){
      const dependencyCheck = root._taskDependency?.validate();
      if(dependencyCheck && !dependencyCheck.ok){
        documentRef.defaultView?.KarhaUI?.showToast?.(dependencyCheck.code === 'cycle' ? 'وابستگی دوری مجاز نیست' : 'انتخاب پیش‌نیاز تکراری یا نامعتبر است');
        return false;
      }
      const draft = {
        title:root.querySelector('[name="taskTitle"]').value.trim(),
        type:root.querySelector('[name="taskType"]').value,
        scheduleStart:root.querySelector('[name="taskStart"]').dataset.value,
        scheduleEnd:root.querySelector('[name="taskEnd"]').dataset.value,
        priority:root.querySelector('[name="taskPriority"]').value,
        assigneeContactId:root.querySelector('[name="taskAssignee"]').dataset.value,
        contractorContactId:'',
        weight:Number(toEnglishDigits(root.querySelector('[name="taskWeight"]').value)),
        progress:Number(toEnglishDigits(root.querySelector('[name="taskProgress"]').value)) || 0,
        amount:Number(toEnglishDigits(root.querySelector('[name="taskAmount"]').value)) || 0,
        predecessorIds:root._taskDependency?.value() || [],
        dependencies:root._taskDependency?.relations() || [],
      };
      const result = editing
        ? workTaskApi.update(projectId, work.id, task.id, draft)
        : workTaskApi.create(projectId, work.id, draft);
      if(!result.ok){
        documentRef.defaultView?.KarhaUI?.showToast?.(result.code === 'dates'
          ? 'تاریخ پایان باید برابر یا بعد از تاریخ شروع باشد'
          : 'اطلاعات کار را کامل و معتبر وارد کنید');
        return false;
      }
      if(!editing && !isExpanded(projectId, work.id)) toggleExpanded(projectId, work.id);
      onChanged?.();
      return true;
    },
  });
}

export function openCreateWorkTaskSheet(options){ taskForm(options); }

function bindTaskReorder(group, row, { projectId, workId, taskId, onChanged }){
  const grip = row.querySelector('.wbs-task-grip');
  if(!grip) return;
  grip.addEventListener('pointerdown', event => {
    if(event.button === 2) return;
    event.preventDefault(); event.stopPropagation();
    const rows = () => Array.from(group.querySelectorAll(':scope > .wbs-work-task'));
    const startRows = rows();
    if(startRows.length < 2) return;
    row.classList.add('is-dragging');
    const move = ev => {
      const others = rows().filter(item => item !== row);
      let before = null;
      for(const candidate of others){
        const rect = candidate.getBoundingClientRect();
        if(ev.clientY < rect.top + rect.height / 2){ before = candidate; break; }
      }
      if(before) group.insertBefore(row, before); else group.appendChild(row);
    };
    const end = () => {
      documentRef.removeEventListener('pointermove', move);
      documentRef.removeEventListener('pointerup', end);
      documentRef.removeEventListener('pointercancel', end);
      row.classList.remove('is-dragging');
      const orderedIds = rows().map(item => item.dataset.taskId);
      const result = workTaskApi.reorder(projectId, workId, orderedIds);
      if(!result.ok) onChanged?.();
      else onChanged?.();
    };
    documentRef.addEventListener('pointermove', move);
    documentRef.addEventListener('pointerup', end, { once:true });
    documentRef.addEventListener('pointercancel', end, { once:true });
    try{ grip.setPointerCapture(event.pointerId); }catch(_error){}
  });
}

export function renderWorkTasks({ documentRef = document, projectId, work, view, onChanged }){
  const tasks = workTaskApi.list(projectId, work.id);
  if(!tasks.length) return null;
  const contractor = linkedContractor(projectId, work.id);
  const group = documentRef.createElement('div');
  group.className = 'wbs-work-tasks';
  group.setAttribute('role', 'list');
  tasks.forEach(task => {
    const complete = isTaskComplete(task);
    const contact = task.assigneeContactId ? contactRepository.get(projectId, task.assigneeContactId) : null;
    const row = documentRef.createElement('button');
    row.type = 'button';
    row.className = 'wbs-work-task' + (complete ? ' is-complete' : '');
    row.dataset.taskId = task.id;
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <span class="wbs-task-grip" aria-label="جابجایی کار" role="button">⋮⋮</span>
      <span class="wbs-task-connector" aria-hidden="true"></span>
      <span class="wbs-task-content">
        <span class="wbs-task-main"><span class="wbs-type-chip ${TYPE_CLASSES.get(task.type) || 'type-7'}">${escapeHtml(task.type || '؟')}</span><span class="wbs-task-title">${escapeHtml(task.title)}</span></span>
        <span class="wbs-task-secondary">${contact ? `<span class="wbs-task-assignee">${escapeHtml(contactName(contact))}</span>` : ''}${contractor ? `<span class="wbs-task-contractor">${escapeHtml(contactName(contractor))}</span>` : ''}<span class="wbs-task-priority priority-${task.priority}">${escapeHtml(PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.normal)}</span>${view === 'progress' ? `<span class="wbs-task-progress">٪${new Intl.NumberFormat('fa-IR').format(task.progress || 0)}</span>` : ''}${view === 'estimate' ? `<span class="wbs-task-cost">${new Intl.NumberFormat('fa-IR').format(task.amount || 0)} تومان</span>` : ''}</span>
      </span>`;
    row.addEventListener('click', event => {
      if(event.target.closest('.wbs-task-grip')) return;
      taskForm({ projectId, work, task, onChanged });
    });
    group.appendChild(row);
    bindTaskReorder(group, row, { projectId, workId:work.id, taskId:task.id, onChanged });
  });
  return group;
}
