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
  const linkedContract = (projectRepository.find(projectId)?.contracts || []).find(contract => !contract.trashed && String(contract.projectItemId || '') === String(work.id));
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
      root.appendChild(fieldRow('مسئول', selectInput([
        { value:'', label:'—' }, ...contacts.map(contact => ({ value:String(contact.id), label:contactName(contact) })),
      ], task?.assigneeContactId || '')));
      root.lastChild.querySelector('select').name = 'taskAssignee';
      if(linkedContract){
        const contractor = contactRepository.get(projectId, linkedContract.contractorId || linkedContract.contactId);
        const note = documentRef.createElement('div'); note.className = 'wbs-note'; note.textContent = `پیمانکار از قرارداد خوانده می‌شود: ${contactName(contractor) || 'ثبت‌شده در قرارداد'}`; root.appendChild(note);
      }else{
        const contractor = documentRef.createElement('button');
        contractor.type = 'button'; contractor.name = 'taskContractor'; contractor.className = 'wbs-input';
        contractor.dataset.value = task?.contractorContactId || '';
        const paintContractor = () => {
          const selected = contacts.find(contact => String(contact.id) === String(contractor.dataset.value));
          contractor.textContent = selected ? contactName(selected) : 'انتخاب پیمانکار';
        };
        contractor.addEventListener('click', () => openSearchPicker({
          title:'انتخاب پیمانکار', listTitle:'مخاطبین', selectedTitle:'پیمانکار منتخب',
          contextKey:`wbs-task-contractor:${work.id}`,
          items:contacts.map(contact => ({ id:contact.id, name:contactName(contact) })),
          showStar:false, showAdd:false,
          onSelect:selected => { contractor.dataset.value = String(selected.id); paintContractor(); },
        }));
        paintContractor();
        root.appendChild(fieldRow('پیمانکار', contractor));
      }
      root.appendChild(fieldRow('وزن', textInput(String(task?.weight || 1), { name:'taskWeight', type:'number', min:'0.01', step:'0.01', required:true })));

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
      }
    },
    onSave(root){
      const draft = {
        title:root.querySelector('[name="taskTitle"]').value.trim(),
        type:root.querySelector('[name="taskType"]').value,
        scheduleStart:root.querySelector('[name="taskStart"]').dataset.value,
        scheduleEnd:root.querySelector('[name="taskEnd"]').dataset.value,
        priority:root.querySelector('[name="taskPriority"]').value,
        assigneeContactId:root.querySelector('[name="taskAssignee"]').value,
        contractorContactId:linkedContract ? '' : (root.querySelector('[name="taskContractor"]')?.dataset.value || ''),
        weight:Number(toEnglishDigits(root.querySelector('[name="taskWeight"]').value)),
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

export function renderWorkTasks({ documentRef = document, projectId, work, view, onChanged }){
  const tasks = workTaskApi.list(projectId, work.id);
  if(!tasks.length) return null;
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
      <span class="wbs-task-connector" aria-hidden="true"></span>
      <span class="wbs-task-content">
        <span class="wbs-task-main"><span class="wbs-type-chip ${TYPE_CLASSES.get(task.type) || 'type-7'}">${escapeHtml(task.type || '؟')}</span><span class="wbs-task-title">${escapeHtml(task.title)}</span></span>
        <span class="wbs-task-secondary">${contact ? `<span class="wbs-task-assignee">${escapeHtml(contactName(contact))}</span>` : ''}<span class="wbs-task-priority priority-${task.priority}">${escapeHtml(PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.normal)}</span>${view === 'progress' ? `<span class="wbs-task-progress">${complete ? '٪۱۰۰' : '٪۰'}</span>` : ''}</span>
      </span>`;
    row.addEventListener('click', () => taskForm({ projectId, work, task, onChanged }));
    group.appendChild(row);
  });
  return group;
}
