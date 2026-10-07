import { contactRepository } from '../../data/contactRepository.js';
import { projectRepository } from '../../data/projectRepository.js';
import { WORK_TYPES } from '../../domain/wbs/normalize.js';
import { workTaskApi } from '../../domain/wbs/workTaskApi.js';
import { TASK_PRIORITIES, isTaskComplete } from '../../domain/wbs/workTaskModel.js';
import { formatJalaliDisplay } from '../../ui/jalali.js';
import { toEnglishDigits } from '../../ui/digits.js';
import { openSearchPicker } from '../../ui/searchPickerAdapter.js';
import { openNumpadGeneric } from '../../ui/numpad.js';
import { isExpanded, toggleExpanded } from './wbsExpandState.js';
import { closeWbsSheet, fieldRow, openWbsSheet } from './wbsSheet.js';
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

function optionButton({ name, value, options }){
  const root=document.createElement('div');root.className='wbs-task-option-select';
  const input=document.createElement('input');input.type='hidden';input.name=name;input.value=String(value ?? '');
  const button=document.createElement('button');button.type='button';button.className='wbs-input wbs-task-option-trigger';
  const label=document.createElement('span');
  const arrow=document.createElement('span');arrow.className='wbs-task-option-arrow';arrow.textContent='⌄';
  const menu=document.createElement('div');menu.className='wbs-task-option-menu';menu.setAttribute('role','listbox');
  const close=()=>{menu.classList.remove('open');button.classList.remove('open');};
  const paint=()=>{label.textContent=options.find(item=>String(item.id)===input.value)?.name || 'انتخاب کنید';};
  options.forEach(item=>{
    const option=document.createElement('button');option.type='button';option.className='wbs-task-option-item';
    option.textContent=item.name;option.dataset.value=String(item.id);
    option.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();input.value=String(item.id);paint();close();});
    menu.appendChild(option);
  });
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const opening=!menu.classList.contains('open');document.querySelectorAll('.wbs-task-option-menu.open').forEach(open=>open.classList.remove('open'));document.querySelectorAll('.wbs-task-option-trigger.open').forEach(open=>open.classList.remove('open'));if(opening){menu.classList.add('open');button.classList.add('open');}});
  button.append(label,arrow);root.append(input,button,menu);paint();return root;
}

function numericButton(name, value, { money=false }={}){
  const button=document.createElement('button');
  button.type='button';button.name=name;button.className='wbs-input wbs-inline-number';button.dataset.value=String(value ?? 0);
  const paint=()=>{button.textContent=`${new Intl.NumberFormat('fa-IR').format(Number(button.dataset.value)||0)}${money?' تومان':''}`;};
  button.addEventListener('click',()=>openNumpadGeneric(button.dataset.value,raw=>{
    button.dataset.value=toEnglishDigits(String(raw)).replace(/[^\d.]/g,'');paint();
  },{group:money,suffix:money?' تومان':'',maxLen:16}));
  paint();return button;
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

function taskForm({ projectId, work, task = null, onChanged, readOnly=false, canDelete=true }){
  const editing = Boolean(task);
  const documentRef = document;
  const contractor = linkedContractor(projectId, work.id);
  let titleEditor;
  const overlay=openWbsSheet({
    title:'کار:', presentation:'stage-create', autoFocus:false,
    saveLabel:'ذخیره',readOnly,
    body(root){
      const type=optionButton({name:'taskType',value:task?.type || work.type || WORK_TYPES[0],options:WORK_TYPES.map(value=>({id:value,name:value}))});
      root.appendChild(fieldRow('نوع کار',type));
      root.appendChild(dateField(documentRef, 'taskStart', 'تاریخ شروع', task?.scheduleStart || ''));
      root.appendChild(dateField(documentRef, 'taskEnd', 'تاریخ پایان', task?.scheduleEnd || ''));
      const priority=optionButton({name:'taskPriority',value:task?.priority || 'normal',options:TASK_PRIORITIES.map(value=>({id:value,name:PRIORITY_LABELS[value]}))});
      root.appendChild(fieldRow('درجه اهمیت',priority));

      const contacts = contactRepository.list(projectId).filter(contact => contact && !contact.trashed);
      const assignee = documentRef.createElement('button');
      assignee.type = 'button'; assignee.name = 'taskAssignee'; assignee.className = 'wbs-input';
      assignee.dataset.value = task?.assigneeContactId || '';
      const paintAssignee = () => {
        const selected = contacts.find(contact => String(contact.id) === String(assignee.dataset.value));
        assignee.textContent = selected ? contactName(selected) : 'انتخاب مسئول پیگیری';
      };
      assignee.addEventListener('click', () => openSearchPicker({
        title:'انتخاب مسئول پیگیری', listTitle:'مخاطبین', selectedTitle:'مسئول پیگیری منتخب',
        contextKey:`wbs-task-assignee:${work.id}`,
        items:contacts.map(contact => ({ id:contact.id, name:contactName(contact) })),
        showStar:false, showAdd:false,
        onSelect:selected => { assignee.dataset.value = String(selected.id); paintAssignee(); },
      }));
      paintAssignee();
      root.appendChild(fieldRow('مسئول پیگیری', assignee));

      const approver=documentRef.createElement('button');
      approver.type='button';approver.name='taskApprover';approver.className='wbs-input';approver.dataset.value=task?.approvalContactId || '';
      const paintApprover=()=>{const selected=contacts.find(contact=>String(contact.id)===String(approver.dataset.value));approver.textContent=selected?contactName(selected):'انتخاب مسئول تأیید';};
      approver.addEventListener('click',()=>openSearchPicker({title:'انتخاب مسئول تأیید',listTitle:'مخاطبین',selectedTitle:'مسئول تأیید منتخب',contextKey:`wbs-task-approver:${work.id}`,items:[{id:'',name:'بدون مسئول تأیید'},...contacts.map(contact=>({id:contact.id,name:contactName(contact)}))],showStar:false,showAdd:false,onSelect:selected=>{approver.dataset.value=String(selected.id);paintApprover();}}));
      paintApprover();
      root.appendChild(fieldRow('مسئول تأیید',approver));

      if(contractor){
        const note = documentRef.createElement('div');
        note.className = 'wbs-note';
        note.textContent = `پیمانکار از قرارداد خوانده می‌شود: ${contactName(contractor)}`;
        root.appendChild(note);
      }
      root.appendChild(fieldRow('وزن',numericButton('taskWeight',task?.weight || 1)));
      root.appendChild(fieldRow('مبلغ',numericButton('taskAmount',task?.amount || 0,{money:true})));
      const dependency = predecessorField({ documentRef, project:projectRepository.find(projectId), consumerId:task?.id || `new:${work.id}`, initial:task?.dependencies || task?.predecessorIds || [] });
      root.appendChild(dependency.element); root._taskDependency = dependency;

      if(editing && !readOnly){
        if(canDelete){
          const remove = documentRef.createElement('button');
          remove.type = 'button'; remove.className = 'wbs-info-row is-danger wbs-task-delete'; remove.textContent = 'حذف کار';
          remove.addEventListener('click', () => {
            const perform = () => { workTaskApi.remove(projectId, work.id, task.id); closeWbsSheet(); onChanged?.(); };
            if(typeof documentRef.defaultView?.KarhaUI?.openConfirm === 'function') documentRef.defaultView.KarhaUI.openConfirm('این کار حذف شود؟', perform, 'حذف');
            else if(documentRef.defaultView?.confirm?.('این کار حذف شود؟')) perform();
          });
          root.appendChild(remove);
        }
      }
    },
    onSave(root){
      const dependencyCheck = root._taskDependency?.validate();
      if(dependencyCheck && !dependencyCheck.ok){
        documentRef.defaultView?.KarhaUI?.showToast?.(dependencyCheck.code === 'cycle' ? 'وابستگی دوری مجاز نیست' : 'انتخاب پیش‌نیاز تکراری یا نامعتبر است');
        return false;
      }
      const draft = {
        title:(titleEditor.textContent || '').trim(),
        type:root.querySelector('[name="taskType"]').value,
        scheduleStart:root.querySelector('[name="taskStart"]').dataset.value,
        scheduleEnd:root.querySelector('[name="taskEnd"]').dataset.value,
        priority:root.querySelector('[name="taskPriority"]').value,
        assigneeContactId:root.querySelector('[name="taskAssignee"]').dataset.value,
        approvalContactId:root.querySelector('[name="taskApprover"]').dataset.value,
        contractorContactId:'',
        weight:Number(root.querySelector('[name="taskWeight"]').dataset.value),
        amount:Number(root.querySelector('[name="taskAmount"]').dataset.value) || 0,
        predecessorIds:root._taskDependency?.value() || [],
        dependencies:root._taskDependency?.relations() || [],
      };
      const result = editing
        ? workTaskApi.update(projectId, work.id, task.id, draft)
        : workTaskApi.create(projectId, work.id, draft);
      if(!result.ok){
        documentRef.defaultView?.KarhaUI?.showToast?.(result.code === 'dates'
          ? 'تاریخ پایان باید برابر یا بعد از تاریخ شروع باشد'
          : result.code === 'approver' ? 'مسئول تأیید را انتخاب کنید'
          : 'اطلاعات کار را کامل و معتبر وارد کنید');
        return false;
      }
      if(!editing && !isExpanded(projectId, work.id)) toggleExpanded(projectId, work.id);
      onChanged?.();
      return true;
    },
  });
  titleEditor=documentRef.createElement('span');titleEditor.className='wbs-stage-edit-title';titleEditor.contentEditable=readOnly?'false':'true';titleEditor.setAttribute('role','textbox');titleEditor.setAttribute('aria-label','عنوان کار');titleEditor.textContent=task?.title || '';titleEditor.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});overlay.querySelector('.sheet-caption').append(' ',titleEditor);
}

export function openCreateWorkTaskSheet(options){ taskForm(options); }

let activeTaskDragCleanup = null;

export function bindTaskReorder(group, row, { projectId, workId, taskId, onChanged, documentRef = document }){
  const grip = row.querySelector('.wbs-grip');
  if(!grip) return;
  grip.addEventListener('pointerdown', event => {
    if(event.button === 2) return;
    event.preventDefault(); event.stopPropagation();
    activeTaskDragCleanup?.();
    const rows = () => Array.from(group.querySelectorAll(':scope > .wbs-work-task'));
    const startRows = rows();
    if(startRows.length < 2) return;
    const initialIds = startRows.map(item => String(item.dataset.taskId));
    const pointerId = event.pointerId;
    const eventTarget = documentRef.defaultView || documentRef;
    const indicator = documentRef.createElement?.('span') || null;
    if(indicator){
      indicator.className = 'wbs-task-drop-indicator';
      group.appendChild(indicator);
    }
    let moved = false;
    let finished = false;
    row.classList.add('is-dragging');
    const move = ev => {
      if(ev.pointerId !== pointerId) return;
      ev.preventDefault?.();
      moved = true;
      const others = rows().filter(item => item !== row);
      let before = null;
      for(const candidate of others){
        const rect = candidate.getBoundingClientRect();
        if(ev.clientY < rect.top + rect.height / 2){ before = candidate; break; }
      }
      if(before){
        group.insertBefore(row, before);
      }else if(others.length){
        group.appendChild(row);
      }
      if(indicator){
        group.insertBefore(indicator, before || row);
        indicator.classList.add('is-visible');
      }
    };
    const cleanup = () => {
      if(finished) return false;
      finished = true;
      eventTarget.removeEventListener('pointermove', move, true);
      eventTarget.removeEventListener('pointerup', end, true);
      eventTarget.removeEventListener('pointercancel', end, true);
      if(eventTarget !== documentRef){
        documentRef.removeEventListener('pointermove', move);
        documentRef.removeEventListener('pointerup', end);
        documentRef.removeEventListener('pointercancel', end);
      }
      documentRef.defaultView?.removeEventListener('blur', end);
      documentRef.removeEventListener('visibilitychange', onVisibilityChange);
      if(grip.hasPointerCapture?.(pointerId)){
        try{ grip.releasePointerCapture(pointerId); }catch(_error){}
      }
      row.classList.remove('is-dragging');
      indicator?.remove();
      if(activeTaskDragCleanup === cleanup) activeTaskDragCleanup = null;
      return true;
    };
    const end = ev => {
      if(ev?.pointerId != null && ev.pointerId !== pointerId) return;
      if(!cleanup()) return;
      const orderedIds = rows().map(item => String(item.dataset.taskId));
      const changed = moved && orderedIds.some((id, index) => id !== initialIds[index]);
      if(!changed) return;
      const result = workTaskApi.reorder(projectId, workId, orderedIds);
      onChanged?.(result);
    };
    const onVisibilityChange = () => {
      if(documentRef.visibilityState === 'hidden') end();
    };
    activeTaskDragCleanup = cleanup;
    eventTarget.addEventListener('pointermove', move, { capture:true, passive:false });
    eventTarget.addEventListener('pointerup', end, true);
    eventTarget.addEventListener('pointercancel', end, true);
    if(eventTarget !== documentRef){
      documentRef.addEventListener('pointermove', move);
      documentRef.addEventListener('pointerup', end);
      documentRef.addEventListener('pointercancel', end);
    }
    documentRef.defaultView?.addEventListener('blur', end);
    documentRef.addEventListener('visibilitychange', onVisibilityChange);
    try{ grip.setPointerCapture(event.pointerId); }catch(_error){}
  });
}

export function renderWorkTasks({ documentRef = document, projectId, work, view, onChanged, readOnly=false, canDelete=true }){
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
      <span class="wbs-grip" aria-label="جابجایی کار" role="button">⋮⋮</span>
      <span class="wbs-task-connector" aria-hidden="true"></span>
      <span class="wbs-task-content">
        <span class="wbs-task-main"><span class="wbs-type-chip ${TYPE_CLASSES.get(task.type) || 'type-7'}">${escapeHtml(task.type || '؟')}</span><span class="wbs-task-title">${escapeHtml(task.title)}</span></span>
        <span class="wbs-task-secondary">${contact ? `<span class="wbs-task-assignee">${escapeHtml(contactName(contact))}</span>` : ''}${contractor ? `<span class="wbs-task-contractor">${escapeHtml(contactName(contractor))}</span>` : ''}<span class="wbs-task-priority priority-${task.priority}">${escapeHtml(PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.normal)}</span>${view === 'progress' ? `<span class="wbs-task-progress">٪${new Intl.NumberFormat('fa-IR').format(task.progress || 0)}</span>` : ''}${view === 'estimate' ? `<span class="wbs-task-cost">${new Intl.NumberFormat('fa-IR').format(task.amount || 0)} تومان</span>` : ''}</span>
      </span>`;
    row.addEventListener('click', event => {
      if(event.target.closest('.wbs-grip')) return;
      taskForm({ projectId, work, task, onChanged, readOnly, canDelete });
    });
    group.appendChild(row);
    if(!readOnly) bindTaskReorder(group, row, { projectId, workId:work.id, taskId:task.id, onChanged, documentRef });
  });
  return group;
}
