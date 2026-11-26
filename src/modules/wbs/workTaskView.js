import { projectResponsibleIds } from '../projectSettings/projectDetailsDomain.js';
import { responsibleContactPicker } from '../../ui/responsibleContactPicker.js';
import {flattenDependencyCandidates,jalaliDayNumber,requiredScheduleStart,scheduleDate,scheduleRangeOf} from '../../domain/wbs/scheduling.js';
import {confirmSaosaWorkspaceSave,isSaosaHost,saosaWorkspaceSaveDiagnostic} from '../../cloud/saosaWorkspaceSync.js';
import {findInTree} from '../../domain/wbs/normalize.js';
import {mountFileUploader} from '../files/fileUploader.js';
import {uid} from '../../data/projectFactories.js';
import { approvalLabels, contractApprovalState } from '../../domain/contractApproval.js';
import { isContractInFinance } from '../../domain/contractHandoff.js';
import { contactRepository } from '../../data/contactRepository.js';
import { activityRepository } from '../../data/activityRepository.js';
import { projectRepository } from '../../data/projectRepository.js';
import { FOLLOW_UP_WORK_TYPE, ODD_JOB_TYPES, WORK_TYPES, WORK_TYPE_TOGGLES, taskCostOf } from '../../domain/wbs/normalize.js';
import { workTaskApi } from '../../domain/wbs/workTaskApi.js';
import { TASK_PRIORITIES, activeWorkTasks, executionApproverIds, isTaskComplete } from '../../domain/wbs/workTaskModel.js';
import { formatJalaliWithWeekday } from '../../ui/jalali.js';
import { toEnglishDigits } from '../../ui/digits.js';
import { openSearchPicker } from '../../ui/searchPickerAdapter.js';
import { openNumpadGeneric } from '../../ui/numpad.js';
import {selectableWbsTree,openExecutionBranchFilter} from './executionBranchFilter.js';
import { isExpanded, toggleExpanded } from './wbsExpandState.js';
import { closeWbsSheet, fieldRow, openWbsSheet } from './wbsSheet.js';
import { openWorkCreationSheet } from './workCreationSheet.js';
import { predecessorField } from './predecessorField.js';

const PRIORITY_LABELS = Object.freeze({ low:'بحرانی', normal:'عادی', high:'مهم' });
const TYPE_CLASSES = new Map([
  ['پیمانکار','type-1'], ['خرید','type-2'], ['نیروی کار','type-3'], ['حمل و نقل','type-4'],
  ['خدمات','type-5'], ['پیگیری','type-6'], ['ماشین آلات','type-7'],
  ['کرایه','type-8'], ['سایر','type-9'],
]);
const COUNTERPARTY_LABELS = Object.freeze({
  'پیمانکار':'پیمانکار',
  'خرید':'فروشنده',
  'نیروی کار':'شخص',
  'حمل و نقل':'راننده',
  'خدمات':'ارائه‌دهنده',
  'ماشین آلات':'شخص',
  'کرایه':'اجاره‌دهنده',
});

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
}

function contactName(contact){
  return [contact?.type, contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim()
    || contact?.name || 'مخاطب';
}

function linkedContractForWork(projectId, workId, taskId=''){
  return (projectRepository.find(projectId)?.contracts || [])
    .find(contract => !contract.trashed
      && String(contract.projectItemId || '') === String(workId)
      && (!taskId || String(contract.workTaskId || '') === String(taskId)));
}

function clearSelection(control,label,clear,hasValue){
  const wrap=document.createElement('div');wrap.className='wbs-clearable-value';
  const button=document.createElement('button');button.type='button';button.className='wbs-selection-clear';
  button.textContent='×';button.setAttribute('aria-label','پاک کردن '+label);
  const paint=()=>{
    button.hidden=!hasValue() || control.disabled;
    wrap.classList.toggle('has-clear',!button.hidden);
  };
  button.onclick=event=>{event.preventDefault();event.stopPropagation();clear();paint();(control.matches('button')?control:control.querySelector('button'))?.focus();};
  wrap.append(control,button);
  return {wrap,paint};
}

function optionButton({ name, value, options, onChange, placeholder = 'انتخاب کنید', clearLabel }){
  const root=document.createElement('div');root.className='wbs-task-option-select';
  const input=document.createElement('input');input.type='hidden';input.name=name;input.value=String(value ?? '');
  const button=document.createElement('button');button.type='button';button.className='wbs-input wbs-task-option-trigger';
  const label=document.createElement('span');
  const arrow=document.createElement('span');arrow.className='wbs-task-option-arrow';arrow.textContent='⌄';
  const menu=document.createElement('div');menu.className='wbs-task-option-menu';menu.setAttribute('role','listbox');
  const close=()=>{menu.classList.remove('open');button.classList.remove('open');};
  let clear;
  const paint=()=>{label.textContent=options.find(item=>String(item.id)===input.value)?.name || placeholder;clear?.paint();};
  options.forEach(item=>{
    const option=document.createElement('button');option.type='button';option.className='wbs-task-option-item';
    option.textContent=item.name;option.dataset.value=String(item.id);
    option.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();input.value=String(item.id);paint();close(); if(onChange) onChange(input.value);});
    menu.appendChild(option);
  });
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const opening=!menu.classList.contains('open');document.querySelectorAll('.wbs-task-option-menu.open').forEach(open=>open.classList.remove('open'));document.querySelectorAll('.wbs-task-option-trigger.open').forEach(open=>open.classList.remove('open'));if(opening){menu.classList.add('open');button.classList.add('open');}});
  button.append(label,arrow);root.append(input,button,menu);
  root.setOption=value=>{input.value=value;paint();};
  if(clearLabel){
    clear=clearSelection(root,clearLabel,()=>{input.value='';close();onChange?.('');paint();},()=>Boolean(input.value));
    clear.wrap.addEventListener('focusin',paint);
  }
  paint();return clear?.wrap||root;
}

function numericButton(name, value, { money=false, suffix='', onChange }={}){
  const button=document.createElement('button');
  button.type='button';button.name=name;button.className='wbs-input wbs-inline-number';button.dataset.value=String(value ?? 0);
  const paint=()=>{button.textContent=`${new Intl.NumberFormat('fa-IR').format(Number(button.dataset.value)||0)}${money?' تومان':suffix}`;};
  button.addEventListener('click',()=>{
    openNumpadGeneric('',raw=>{
      if(raw==='')return;
      button.dataset.value=toEnglishDigits(String(raw)).replace(/[^\d.]/g,'');paint();onChange?.(Number(button.dataset.value));
    },{group:money,allowDecimal:name==='taskWeight',suffix:money?' تومان':suffix,maxLen:onChange?5:16});
  });
  paint();return button;
}

function dateField(documentRef, name, label, value, onChange){
  const button = documentRef.createElement('button');
  button.type = 'button'; button.name = name; button.className = 'wbs-input wbs-date-input';
  button.dataset.value = value || '';
  const selection=clearSelection(button,label,()=>{button.dataset.value='';paint();onChange?.();},()=>Boolean(button.dataset.value));
  const paint = () => { button.textContent = button.dataset.value ? formatJalaliWithWeekday(button.dataset.value) : 'انتخاب کنید';selection.paint(); };
  button.repaintDate=paint;
  button.addEventListener('click', () => documentRef.defaultView?.KarhaUI?.openJalaliPicker?.(button.dataset.value, next => {
    button.dataset.value = next; paint(); onChange?.();
  }));
  paint();
  return fieldRow(label, selection.wrap);
}

function renderToggles(container, type, task, {contractLocked=false}={}){
  container.innerHTML = '';
  const toggles = (WORK_TYPE_TOGGLES[type] || []).filter(toggle=>type!=='پیمانکار' || toggle.key!=='hasProgressReport');
  if(!toggles.length) return;
  const row = document.createElement('div');
  row.className = 'wbs-toggles-row';
  toggles.forEach(toggle => {
    const label = document.createElement('label');
    label.className = 'wbs-toggle-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = toggle.key;
    checkbox.checked = Boolean(task?.[toggle.key]);
    if(toggle.key==='hasContract' && contractLocked){
      checkbox.disabled=true;
      checkbox.title='برای برداشتن تیک، ابتدا خود قرارداد را حذف کنید';
    }
    const text = document.createElement('span');
    text.textContent = toggle.key==='hasContract' && type==='پیمانکار'?'ایجاد قرارداد':toggle.label;
    label.append(checkbox, text);
    row.appendChild(label);
  });
  container.appendChild(row);
}

function renderCounterparty(container, { type, contacts, activities, value, onSelect, workId, documentRef }){
  container.replaceChildren();
  const label = COUNTERPARTY_LABELS[type];
  if(!label) return;
  const button = documentRef.createElement('button');
  button.type = 'button'; button.name = 'taskCounterparty'; button.className = 'wbs-input';
  button.dataset.value = value || '';
  const select = id => {button.dataset.value=String(id);onSelect(button.dataset.value);paint();};
  const selection=clearSelection(button,label,()=>select(''),()=>type==='پیمانکار' && Boolean(button.dataset.value));
  const paint = () => {
    const selected = contacts.find(contact => String(contact.id) === String(button.dataset.value));
    button.textContent = selected ? contactName(selected) : type === 'پیمانکار' ? 'انتخاب کنید' : `انتخاب ${label}`;
    selection.paint();
  };
  button.addEventListener('click', () => openSearchPicker({
    title:`انتخاب ${label}`, listTitle:'مخاطبین', selectedTitle:`${label} منتخب`,
    contextKey:`wbs-task-counterparty:${workId}`,
    items:[
      ...(type === 'پیمانکار' && button.dataset.value ? [{id:'',name:'حذف انتخاب پیمانکار'}] : []),
      ...contacts.map(contact => {
        const name = contactName(contact);
        if(type !== 'پیمانکار' || !Array.isArray(contact.activities)) return { id:contact.id, name };
        const activityNames = contact.activities
          .map(id => activities.find(activity => String(activity.id) === String(id))?.name)
          .filter(Boolean);
        return { id:contact.id, name:activityNames.length ? `${name} (${activityNames.join('، ')})` : name };
      }),
    ],
    resourceType:'contact', showStar:false, showAdd:true,
    onAdd:()=>{
      window.KarhaSearchTemplate?.close(false);
      window.KarhaApp?.modules?.get('people')?.openContactForm?.(null,{pickerMode:true,onCreated:created=>{
        contacts.push(created);select(created.id);
      }});
    },
    onSelect:selected=>select(selected.id),
  }));
  paint();
  container.appendChild(fieldRow(label, selection.wrap));
}

function renderActivity(container,{activities,value,onSelect,workId,documentRef}){
  const button=documentRef.createElement('button');
  button.type='button';button.name='taskActivity';button.className='wbs-input';button.dataset.value=value || '';
  const select=id=>{button.dataset.value=String(id);onSelect(button.dataset.value);paint();};
  const selection=clearSelection(button,'فعالیت',()=>select(''),()=>Boolean(button.dataset.value));
  const paint=()=>{
    const selected=activities.find(activity=>String(activity.id)===String(button.dataset.value));
    button.textContent=selected?.name || 'انتخاب کنید';
    selection.paint();
  };
  button.addEventListener('click',()=>openSearchPicker({
    title:'انتخاب فعالیت',listTitle:'فعالیت‌ها',selectedTitle:'فعالیت منتخب',
    contextKey:`wbs-task-activity:${workId}`,
    items:[{id:'',name:'بدون فعالیت'},...activities.map(activity=>({id:activity.id,name:activity.name||'فعالیت'}))],
    resourceType:'activity',showStar:false,showAdd:true,
    onAdd:()=>{
      window.KarhaSearchTemplate?.close(false);
      window.KarhaApp?.modules?.get('activities')?.openActivityForm?.({pickerMode:true,onCreated:created=>{
        activities.push(created);select(created.id);
      }});
    },
    onSelect:selected=>select(selected.id),
  }));
  paint();container.appendChild(fieldRow('فعالیت',selection.wrap));
}

function taskForm({ projectId, work, task = null, onChanged, readOnly=false, canDelete=true, saveStandalone }){
  const editing = Boolean(task);
  const subwork=task?.isSubwork===true;
  const documentRef = document;
  const linkedContract=task ? linkedContractForWork(projectId,work.id,task.id) : null;
  const contractor=linkedContract ? contactRepository.get(projectId,linkedContract.contractorId || linkedContract.contactId) : null;
  let titleEditor;
  let saving=false;
  const overlay=openWbsSheet({
    title:subwork?'زیرکار:':'کار:', presentation:'stage-create', autoFocus:false,
    historyKey:`wbs-work-task:${projectId}:${task?.id || work.id}`,
    saveLabel:'ذخیره',readOnly,
    body(root){
      root.classList.add('wbs-compact-task-form');
      const section=text=>{
        const heading=documentRef.createElement('h3');
        heading.className='wbs-task-form-section';heading.textContent=text;
        root.append(heading);
      };
      if(!subwork)section('مشخصات کار');
      const contacts = contactRepository.list(projectId).filter(contact => contact && !contact.trashed);
      const projectDefaults=projectRepository.find(projectId);
      const defaults=role=>task?[]:projectResponsibleIds(projectDefaults,role);
      const activities=activityRepository.list(projectId).filter(activity=>activity && !activity.trashed);
      let counterpartyContactId = task?.counterpartyContactId ?? contractor?.id ?? '';
      let activityId=task?.activityId || '';
      const togglesContainer = documentRef.createElement('div');
      togglesContainer.className = 'wbs-toggles-container';
      const contractSummary = documentRef.createElement('div');
      contractSummary.className = 'wbs-note';
      const paintContractSummary = () => {
        const checkbox = togglesContainer.querySelector('[name="hasContract"]');
        contractSummary.hidden = !checkbox?.checked;
        if(!checkbox?.checked){
          contractSummary.textContent = '';
          return;
        }
        if(!linkedContract){
          contractSummary.textContent = 'قرارداد هنوز ایجاد نشده';
          return;
        }
        const state = contractApprovalState(linkedContract);
        const status = linkedContract.accountingStatus === 'accepted' ? 'تأیید شده توسط بخش مالی'
          : isContractInFinance(linkedContract) ? 'ارسال شده به مالی'
          : state === 'approved' && linkedContract.signedAt ? 'امضا شده'
          : state === 'ready' ? 'تکمیل شده' : approvalLabels[state];
        const number = linkedContract.contractNo ? `شماره قرارداد ${linkedContract.contractNo}` : 'در انتظار شماره قرارداد';
        contractSummary.textContent = `${number} · ${status}`;
      };
      togglesContainer.addEventListener('change', paintContractSummary);
      const counterpartyContainer = documentRef.createElement('div');
      counterpartyContainer.className = 'wbs-counterparty-container';
      const activityContainer=documentRef.createElement('div');
      const amountContainer=documentRef.createElement('div');
      let amount=taskCostOf(task);
      let paintContractApprovers=()=>{};
      let paintTemplate=()=>{};
      const renderTypeFields = val => {
        renderToggles(togglesContainer, val, task,{
          contractLocked:Boolean(linkedContract && !(linkedContract.isDraft || linkedContract.status==='draft')),
        });
        paintContractSummary();
        renderCounterparty(counterpartyContainer, {
          type:val, contacts, activities, value:counterpartyContactId, workId:work.id, documentRef,
          onSelect:value => { counterpartyContactId = value; },
        });
        amount=amountContainer.querySelector('[name="taskAmount"]')?.dataset.value ?? amount;
        activityContainer.replaceChildren();
        amountContainer.replaceChildren();
        if(val !== FOLLOW_UP_WORK_TYPE){
          renderActivity(activityContainer,{activities,value:activityId,workId:work.id,documentRef,onSelect:value=>{activityId=value;}});
          amountContainer.appendChild(fieldRow('مبلغ',numericButton('taskAmount',amount,{money:true})));
        }
        paintContractApprovers();
        paintTemplate();
      };
      const initialType=task?.type || '';
      const type=optionButton({name:'taskType',value:initialType,clearLabel:'نوع کار',options:WORK_TYPES.map(value=>({id:value,name:value})), onChange:renderTypeFields});
      if(!subwork)root.appendChild(fieldRow('نوع کار',type));
      if(!subwork)root.append(togglesContainer, contractSummary);
      if(!subwork)root.appendChild(counterpartyContainer);
      if(!subwork)renderTypeFields(initialType);
      else amountContainer.append(fieldRow('مبلغ',numericButton('taskAmount',amount,{money:true})));
      if(!subwork)root.appendChild(activityContainer);
      const templateContainer=documentRef.createElement('div');
      const templateButton=documentRef.createElement('button');templateButton.type='button';templateButton.name='taskContractTemplate';templateButton.className='wbs-input';
      templateButton.dataset.value=task?.contractTemplateId || linkedContract?.templateId || '';
      templateButton.disabled=Boolean(linkedContract && !(linkedContract.isDraft || linkedContract.status==='draft'));
      const templates=()=> (projectRepository.find(projectId)?.contractTemplates || []).filter(t=>!t.trashed);
      paintTemplate=()=>{
        templateContainer.hidden=!togglesContainer.querySelector('[name="hasContract"]')?.checked;
        templateButton.textContent=templates().find(t=>String(t.id)===templateButton.dataset.value)?.title || 'انتخاب قالب قرارداد';
      };
      templateButton.addEventListener('click',()=>openSearchPicker({
        title:'انتخاب قالب قرارداد',listTitle:'قالب‌های قرارداد',selectedTitle:'قالب منتخب',
        contextKey:`wbs-task-contract-template:${work.id}`,resourceType:'other',showStar:false,showAdd:false,
        items:[{id:'',name:'بدون قالب'},...templates().map(t=>({id:t.id,name:t.title || 'قالب قرارداد'}))],
        onSelect:selected=>{templateButton.dataset.value=String(selected.id);paintTemplate();}
      }));
      templateContainer.appendChild(fieldRow('قالب قرارداد',templateButton));if(!subwork)root.appendChild(templateContainer);
      togglesContainer.addEventListener('change',paintTemplate);paintTemplate();

      const preferredMode=editing?(task.scheduleMode||'manual'):'';
      let scheduleModeTouched=false;
      let duration=task?.scheduleDuration||0;
      let selectedEnd=task?.scheduleEnd||'';
      let manualStart=task?.scheduleStart||'',manualEnd=selectedEnd;
      let wasAutomatic=preferredMode==='auto';
      const sourceItems=new Map(flattenDependencyCandidates(projectRepository.find(projectId)?.tasks)
        .map(row=>[row.id,row.kind==='workTask'?{...row.item,kind:'workTask'}:row.item]));
      const mode=optionButton({name:'taskScheduleMode',value:preferredMode||'manual',clearLabel:'روش زمان‌بندی',
        options:[{id:'manual',name:'دستی'},{id:'auto',name:'خودکار براساس پیش‌نیاز'}],
        onChange:()=>{scheduleModeTouched=true;updateSchedule('mode');}});
      const startRow=dateField(documentRef,'taskStart','تاریخ شروع',task?.scheduleStart||'',()=>updateSchedule('start'));
      const endRow=dateField(documentRef,'taskEnd','تاریخ پایان',selectedEnd,()=>{
        selectedEnd=end.dataset.value;updateSchedule('end');
      });
      const start=startRow.querySelector('button'),end=endRow.querySelector('button');
      const durationButton=numericButton('taskDuration',duration,{suffix:' روز',onChange:value=>{
        duration=value;updateSchedule('duration');
      }});
      const manualDates=documentRef.createElement('div');
      const calculatedDates=documentRef.createElement('div');
      calculatedDates.className='wbs-calculated-dates';
      calculatedDates.hidden=true;
      calculatedDates.setAttribute('aria-live','polite');
      const warning=documentRef.createElement('p');
      warning.className='wbs-sheet-hint';
      warning.setAttribute('role','status');
      const lookup=id=>scheduleRangeOf(sourceItems.get(id));
      const setDate=(button,value)=>{
        button.dataset.value=value||'';
        button.repaintDate();
      };
      function updateSchedule(trigger){
        const relations=root._taskDependency?.relations()||[];
        if(!editing && !scheduleModeTouched)mode.querySelector('.wbs-task-option-select').setOption(relations.length?'auto':'manual');
        const auto=mode.querySelector('input').value==='auto';
        if(auto && !wasAutomatic){
          manualStart=start.dataset.value;
          manualEnd=end.dataset.value;
        }
        if(!auto && wasAutomatic){
          setDate(start,manualStart);
          setDate(end,manualEnd);
        }
        wasAutomatic=auto;
        const dates=auto?calculatedDates:manualDates;
        if(startRow.parentNode!==dates)dates.append(startRow,endRow);
        calculatedDates.hidden=!auto;
        start.disabled=auto;
        let first=jalaliDayNumber(start.dataset.value),last=jalaliDayNumber(end.dataset.value);
        if(auto){
          if((trigger==='end'||(!duration && selectedEnd)) && selectedEnd){
            const limit=jalaliDayNumber(selectedEnd);
            const bounds=relations.map(link=>{
              const range=lookup(link.predecessorId);
              if(!range)return null;
              if(link.type==='FF')return limit>=range.end+link.lagDays?undefined:null;
              return (link.type==='SS'?range.start:range.end+1)+link.lagDays;
            });
            const starts=bounds.filter(Number.isFinite);
            if(starts.length && !bounds.includes(null) && limit>=Math.max(...starts))duration=limit-Math.max(...starts)+1;
            else if(trigger==='end')duration=0;
          }
          first=requiredScheduleStart({dependencies:relations},Math.max(1,duration),lookup);
          setDate(start,first===null?'':scheduleDate(first));
          setDate(end,first!==null && duration>0?scheduleDate(first+duration-1):'');
          warning.textContent=first===null?(subwork && relations.length?'تاریخ‌ها پس از زمان‌بندی پیش‌نیاز محاسبه می‌شوند.':'برای زمان‌بندی خودکار، پیش‌نیاز را انتخاب کنید.')
            :duration<=0?'مدت را وارد کنید یا تاریخ پایان معتبر انتخاب کنید.':'';
        }else{
          if((trigger==='duration'||(trigger==='start' && last===null)) && first!==null && duration>0){
            last=first+duration-1;setDate(end,scheduleDate(last));
          }else duration=first!==null && last!==null && last>=first?last-first+1:0;
          const bound=requiredScheduleStart({dependencies:relations},Math.max(1,duration),lookup);
          warning.textContent=first!==null && bound!==null && first<bound?'تاریخ شروع با پیش‌نیاز تداخل دارد.':'';
        }
        end.disabled=auto && duration>0;
        start.repaintDate();end.repaintDate();
        durationButton.dataset.value=String(duration);
        durationButton.textContent=duration?new Intl.NumberFormat('fa-IR').format(duration)+' روز':'وارد کردن مدت';
      }
      const priority=optionButton({name:'taskPriority',value:task?.priority || 'normal',clearLabel:'درجه اهمیت',options:TASK_PRIORITIES.map(value=>({id:value,name:PRIORITY_LABELS[value]}))});
      if(!subwork)root.append(fieldRow('درجه اهمیت',priority));
      section('زمان‌بندی');
      if(!saveStandalone)root.append(fieldRow('روش زمان‌بندی',mode));
      manualDates.append(startRow,endRow);
      root.append(manualDates);
      if(!saveStandalone)root.append(fieldRow('مدت انجام کار',durationButton),warning);
      if(!saveStandalone){
        const dependency = predecessorField({ documentRef, project:projectRepository.find(projectId), consumerId:task?.id || `new:${work.id}`, excludeIds:subwork?[String(work.id),String(task.parentTaskId||'')]:[], initial:task?(task.dependencies?.length?task.dependencies:task.predecessorIds||[])
          :!activeWorkTasks(work).length?(work.dependencies?.length?work.dependencies:work.predecessorIds||[]):[], onChange:()=>updateSchedule('dependency') });
        root.append(dependency.element,calculatedDates);
        root._taskDependency=dependency;
      }
      if(!subwork)section('مسئولان');

      let assigneeIds=task?.assigneeContactIds ?? (task?.assigneeContactId?[String(task.assigneeContactId)]:defaults('followUp'));
      if(!subwork)root.append(fieldRow('مسئول پیگیری کار',responsibleContactPicker({
        contacts,ids:assigneeIds,label:'مسئول پیگیری کار',contextKey:'wbs-task-assignee:'+work.id,
        readOnly,onChange:ids=>{assigneeIds=ids;},
      })));
      root._assigneeIds=()=>assigneeIds;
      let financeIds=task?.financeContactIds ?? defaults('finance');
      if(!subwork)root.append(fieldRow('مسئول مالی',responsibleContactPicker({
        contacts,ids:financeIds,label:'مسئول مالی',contextKey:'wbs-task-finance:'+work.id,
        readOnly,onChange:ids=>{financeIds=ids;},
      })));
      root._financeIds=()=>financeIds;

      const approvers=documentRef.createElement('div');
      let approverIds=task?executionApproverIds(task):defaults('workApproval');
      const approversLocked=readOnly || task?.completionState==='pending_approval';
      const paintApprovers=()=>{
        approvers.replaceChildren();
        for(const id of approverIds){
          const person=contacts.find(contact=>String(contact.id)===id);
          const row=documentRef.createElement('div');row.className='wbs-contract-approver';
          const name=documentRef.createElement('span');name.textContent=person?contactName(person):'مخاطب حذف‌شده';
          name.title=name.textContent;
          const remove=documentRef.createElement('button');remove.type='button';remove.textContent='×';
          remove.disabled=approversLocked;
          remove.setAttribute('aria-label','برداشتن '+name.textContent);
          remove.onclick=()=>{approverIds=approverIds.filter(value=>value!==id);paintApprovers();};
          row.append(name,remove);approvers.append(row);
        }
        const add=documentRef.createElement('button');add.type='button';add.name='taskApprover';add.className='wbs-input';
        add.disabled=approversLocked;add.textContent=approverIds.length?'+ افزودن مسئول تأیید':'انتخاب کنید';
        add.classList.toggle('wbs-approver-add-inline',approverIds.length>0);
        add.onclick=()=>openSearchPicker({
          title:'انتخاب مسئول تأیید',listTitle:'مخاطبین',contextKey:`wbs-task-approver:${work.id}`,
          items:contacts.filter(contact=>!approverIds.includes(String(contact.id))).map(contact=>({id:contact.id,name:contactName(contact)})),
          resourceType:'contact',showStar:false,showAdd:false,
          onSelect:selected=>{approverIds=[...new Set([...approverIds,String(selected.id)])];paintApprovers();},
        });
        approvers.append(add);
      };
      paintApprovers();
      if(!subwork)root.append(fieldRow('مسئولان تأیید کار',approvers));
      root._executionApproverIds=()=>approverIds;

      const contractApprovers=documentRef.createElement('div');
      let contractApproverContactIds=[...(task?.contractApproverContactIds ?? defaults('contractApproval'))];
      const reviewersLocked=['pending','approved'].includes(linkedContract?.approvalStatus);
      paintContractApprovers=()=>{
        contractApprovers.replaceChildren();
        if(!togglesContainer.querySelector('[name="hasContract"]')?.checked)return;
        const controls=documentRef.createElement('div');
        contractApproverContactIds.forEach(id=>{
          const selected=contacts.find(contact=>String(contact.id)===String(id));
          const row=documentRef.createElement('div');row.className='wbs-contract-approver';
          const name=documentRef.createElement('span');name.textContent=selected?contactName(selected):'مخاطب حذف‌شده';
          const remove=documentRef.createElement('button');remove.type='button';remove.textContent='×';remove.disabled=reviewersLocked;
          remove.setAttribute('aria-label','برداشتن مسئول تأیید قرارداد');
          remove.addEventListener('click',()=>{contractApproverContactIds=contractApproverContactIds.filter(value=>value!==id);paintContractApprovers();});
          row.append(name,remove);controls.appendChild(row);
        });
        const select=documentRef.createElement('button');select.type='button';select.className='wbs-input';select.disabled=reviewersLocked;
        select.textContent=contractApproverContactIds.length?'افزودن مسئول تأیید قرارداد':'انتخاب مسئول تأیید قرارداد';
        select.addEventListener('click',()=>openSearchPicker({
          title:'انتخاب مسئول تأیید قرارداد',listTitle:'مخاطبین',selectedTitle:'مسئول تأیید قرارداد',
          contextKey:`wbs-contract-approvers:${work.id}`,
          items:contacts.filter(contact=>!contractApproverContactIds.includes(String(contact.id))).map(contact=>({id:contact.id,name:contactName(contact)})),
          resourceType:'contact',showStar:false,showAdd:false,
          onSelect:selected=>{const id=String(selected.id);if(!contractApproverContactIds.includes(id))contractApproverContactIds.push(id);paintContractApprovers();}
        }));
        controls.appendChild(select);contractApprovers.appendChild(fieldRow('مسئول تأیید قرارداد',controls));
      };
      togglesContainer.addEventListener('change',paintContractApprovers);
      if(!subwork)root.appendChild(contractApprovers);paintContractApprovers();
      root._contractApproverIds=()=>contractApproverContactIds;

      if(!subwork && contractor){
        const note = documentRef.createElement('div');
        note.className = 'wbs-note';
        note.textContent = `پیمانکار از قرارداد خوانده می‌شود: ${contactName(contractor)}`;
        root.appendChild(note);
      }
      if(subwork)root.append(fieldRow('درجه اهمیت',priority));
      root.append(amountContainer,fieldRow('وزن',numericButton('taskWeight',task?.weight || 1)));
      if(!saveStandalone)updateSchedule('initial');

      if(editing && !readOnly){
        if(canDelete){
          const remove = documentRef.createElement('button');
          remove.type = 'button'; remove.className = 'wbs-task-delete';
          remove.textContent=subwork?'حذف زیرکار':'حذف کار';
          remove.addEventListener('click', () => {
            requestPlanningTaskDelete({documentRef,projectId,workId:work.id,taskId:task.id,onChanged:()=>{
              closeWbsSheet();
              onChanged?.();
            }});
          });
          root.appendChild(remove);
        }
      }
    },
    onSave(root){
      if(saving)return false;
      const dependencyCheck = root._taskDependency?.validate();
      if(dependencyCheck && !dependencyCheck.ok){
        documentRef.defaultView?.KarhaUI?.showToast?.(dependencyCheck.code === 'cycle' ? 'وابستگی دوری مجاز نیست' : 'انتخاب پیش‌نیاز تکراری یا نامعتبر است');
        return false;
      }
      const draft = {
        title:(titleEditor.textContent || '').trim(),
        type:(root.querySelector('[name="taskType"]')?.value ?? task?.type ?? ''),
        scheduleStart:root.querySelector('[name="taskStart"]').dataset.value,
        scheduleEnd:root.querySelector('[name="taskEnd"]').dataset.value,
        ...(!saveStandalone?{scheduleMode:root.querySelector('[name="taskScheduleMode"]').value||'manual',
          scheduleDuration:Number(root.querySelector('[name="taskDuration"]').dataset.value)}:{}),
        priority:root.querySelector('[name="taskPriority"]').value||'normal',
        assigneeContactIds:root._assigneeIds(),
        financeContactIds:root._financeIds(),
        assigneeContactId:root._assigneeIds()[0] || '',
        activityId:root.querySelector('[name="taskActivity"]')?.dataset.value || '',
        contractTemplateId:root.querySelector('[name="taskContractTemplate"]')?.dataset.value || '',
        counterpartyContactId:root.querySelector('[name="taskCounterparty"]')?.dataset.value || '',
        executionApproverContactIds:root._executionApproverIds(),
        contractApproverContactIds:root._contractApproverIds(),
        contractorContactId:'',
        weight:Number(root.querySelector('[name="taskWeight"]').dataset.value),
        amount:Number(root.querySelector('[name="taskAmount"]')?.dataset.value) || 0,
        predecessorIds:root._taskDependency?.value() || [],
        dependencies:root._taskDependency?.relations() || [],
        hasContract:!!root.querySelector('[name="hasContract"]')?.checked,
        hasProgressReport:(root.querySelector('[name="taskType"]')?.value ?? task?.type ?? '')==='پیمانکار'
          ?Boolean(task?.type==='پیمانکار' && task.hasProgressReport):!!root.querySelector('[name="hasProgressReport"]')?.checked,
        hasInvoice:!!root.querySelector('[name="hasInvoice"]')?.checked,
        hasPreInvoice:!!root.querySelector('[name="hasPreInvoice"]')?.checked,
        hasLaborPayroll:!!root.querySelector('[name="hasLaborPayroll"]')?.checked,
        isRental:!!root.querySelector('[name="isRental"]')?.checked,
      };
      if(draft.scheduleMode==='auto' && (!draft.scheduleDuration || !draft.predecessorIds.length || (!subwork && (!draft.scheduleStart || !draft.scheduleEnd)))){
        root.querySelector('.wbs-sheet-hint')?.scrollIntoView?.({block:'nearest'});
        return false;
      }
      const result = saveStandalone ? saveStandalone(draft) : editing
        ? workTaskApi.update(projectId, work.id, task.id, draft)
        : workTaskApi.create(projectId, work.id, draft);
      if(!result.ok){
        documentRef.defaultView?.KarhaUI?.showToast?.(result.code === 'dates'
          ? 'تاریخ پایان باید برابر یا بعد از تاریخ شروع باشد'
          : result.code === 'automatic_schedule' ? 'برای زمان‌بندی خودکار، پیش‌نیاز تاریخ‌دار و مدت معتبر لازم است'
          : result.code === 'contract_locked' ? 'برای برداشتن تیک قرارداد، ابتدا خود قرارداد را حذف کنید'
          : result.code === 'approver' ? 'مسئول تأیید را انتخاب کنید'
          : 'اطلاعات کار را کامل و معتبر وارد کنید');
        return false;
      }
      if(editing && !saveStandalone && isSaosaHost()){
        saving=true;
        const button=overlay.querySelector('.wbs-sheet-save');
        button.disabled=true;
        button.textContent='در حال ذخیره…';
        void confirmSaosaWorkspaceSave().then(snapshot=>{
          if(!snapshot)throw new Error(saosaWorkspaceSaveDiagnostic() || 'save_response_unavailable');
          const project=snapshot?.projects?.find(row=>String(row.id)===String(projectId));
          const confirmed=findInTree(project?.tasks||[],work.id)?.item.workTasks?.find(row=>String(row.id)===String(task.id));
          if(!confirmed || confirmed.updatedAt!==result.task.updatedAt)throw new Error('HTTP 200 · work_edit_not_confirmed');
          if(overlay.isConnected)closeWbsSheet();
          onChanged?.();
        }).catch(error=>{
          window.KarhaUI?.showToast?.('ذخیره در سرور تأیید نشد ('+error.message+'). دوباره تلاش کنید.');
        }).finally(()=>{
          saving=false;
          button.disabled=false;
          button.textContent='ذخیره';
        });
        return false;
      }
      if(!saveStandalone && !editing && !isExpanded(projectId, work.id)) toggleExpanded(projectId, work.id);
      onChanged?.();
      return true;
    },
  });
  overlay.classList.add('wbs-task-form-overlay');
  titleEditor=documentRef.createElement('span');titleEditor.className='wbs-stage-edit-title';titleEditor.contentEditable=readOnly?'false':'true';titleEditor.setAttribute('role','textbox');titleEditor.setAttribute('aria-label',subwork?'عنوان زیرکار':'عنوان کار');titleEditor.textContent=task?.title || '';titleEditor.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});overlay.querySelector('.sheet-caption').append(' ',titleEditor);
}

export async function openStandaloneWorkSheet({projectId,onChanged,saveStandalone,existing=null}){
  const id=existing?.id || 'oddjob-'+uid();
  const invoices=[...(existing?.invoices||[])];
  const {ftSelectRow,ftNumberRow}=await import('../contracts/realContractFormModule.js');
  const {openStaticChoicePicker}=await import('../contracts/contractPickers.js');
  const draft={
    oddJobType:existing?.oddJobType||ODD_JOB_TYPES[0],
    assigneeContactId:existing?.assigneeContactId||'',
    priority:existing?.priority||'normal',
    scheduleStart:existing?.scheduleStart||existing?.dueDate||'',
    scheduleEnd:existing?.scheduleEnd||existing?.dueDate||'',
    expenseApproverContactId:existing?.expenseApproverContactId||'',
    amount:existing?.amount??'',
    title:existing?.title||'',
    description:existing?.description||'',
    linkedWbsId:existing?.linkedWbsId||'',
  };
  const types=ODD_JOB_TYPES;
  const toast=message=>window.KarhaUI?.showToast?.(message);
  const invoiceTypes=new Set(['خرید فوری','خدمات و تعمیر','حمل']);
  const photoLabel=()=>invoiceTypes.has(draft.oddJobType)?'افزودن عکس فاکتور':'اضافه کردن عکس';
  let uploader;
  const sheet=openWbsSheet({
    title:existing?'ویرایش خرده کار':'ثبت خرده کار',presentation:'stage-create',autoFocus:false,historyKey:'oddjob:'+id,
    body(root){
      root.classList.add('form-template','contract-form-body');
      const fields=document.createElement('div');
      const attachment=document.createElement('div');
      root.append(fields,attachment);
      const paint=()=>{
        fields.replaceChildren();
        const textRow=(label,key)=>{
          const row=document.createElement('label');row.className='ft-row';
          const caption=document.createElement('span');caption.className='ft-label';caption.textContent=label;
          const input=document.createElement('input');input.className='ft-input';input.value=draft[key]||'';
          input.classList.add('oddjob-inline-text-value');
          input.placeholder='وارد کنید';input.oninput=()=>{draft[key]=input.value;};
          row.append(caption,input);fields.append(row);
        };
        const update=(key,value)=>{draft[key]=value;paint();};
        const choice=(label,key,options)=>ftSelectRow(fields,label,options.find(option=>option.value===draft[key])?.label,
          ()=>openStaticChoicePicker(label,'گزینه‌ها',options,draft[key],value=>update(key,value),null,{preserveOrder:true}));
        const person=(label,key)=>{
          const contacts=contactRepository.list(projectId).filter(contact=>!contact.trashed);
          const selected=contacts.find(contact=>String(contact.id)===draft[key]);
          ftSelectRow(fields,label,selected?contactName(selected):'',()=>openSearchPicker({
            title:'انتخاب '+label,listTitle:'مخاطبین',selectedTitle:label+' منتخب',
            contextKey:'oddjob:'+projectId+':'+key,resourceType:'contact',showStar:false,showAdd:false,
            items:[{id:'',name:'بدون '+label},...contacts.map(contact=>({id:contact.id,name:contactName(contact)}))],
            onSelect:contact=>update(key,String(contact.id||'')),
          }));
        };
        textRow('عنوان','title');
        textRow('شرح کوتاه','description');
        const project=projectRepository.find(projectId);
        if(project){
          const tree=selectableWbsTree(project);
          const find=(node,id)=>node.id===id?node:node.children.map(child=>find(child,id)).find(Boolean);
          const selected=draft.linkedWbsId?find(tree,draft.linkedWbsId):null;
          const row=document.createElement('div');row.className='execution-details-filter-row';
          const pick=document.createElement('button');pick.type='button';pick.className='execution-details-filter-picker';
          const label=document.createElement('span');label.textContent='ارتباط با درخت پروژه';
          const value=document.createElement('span');value.textContent=selected?.title||'انتخاب مرحله یا کار';
          value.className=selected?'execution-details-filter-value':'is-placeholder';
          pick.append(label,value);
          pick.onclick=()=>openExecutionBranchFilter(project,tree,id=>update('linkedWbsId',id),selected,{selectionMode:true});
          row.append(pick);
          if(selected){
            const clear=document.createElement('button');clear.type='button';clear.className='execution-details-filter-clear';clear.textContent='×';
            clear.setAttribute('aria-label','حذف ارتباط با '+selected.title);
            clear.onclick=()=>update('linkedWbsId','');row.append(clear);
          }
          fields.append(row);
        }
        choice('نوع کار','oddJobType',types.map(value=>({value,label:value})));
        person('مسئول پیگیری','assigneeContactId');
        choice('درجه اهمیت','priority',Object.entries(PRIORITY_LABELS).map(([value,label])=>({value,label})));
        ftSelectRow(fields,'تاریخ شروع',formatJalaliWithWeekday(draft.scheduleStart),()=>window.KarhaUI?.openJalaliPicker?.(
          draft.scheduleStart,value=>update('scheduleStart',value)),{placeholder:'انتخاب تاریخ'});
        ftSelectRow(fields,'تاریخ پایان',formatJalaliWithWeekday(draft.scheduleEnd),()=>window.KarhaUI?.openJalaliPicker?.(
          draft.scheduleEnd,value=>update('scheduleEnd',value)),{placeholder:'انتخاب تاریخ'});
        person('مسئول تأیید','expenseApproverContactId');
        ftNumberRow(fields,'مبلغ',draft.amount,value=>{draft.amount=toEnglishDigits(String(value)).replace(/[^\d]/g,'');},
          {suffix:'تومان',onCommit:paint});
        const action=attachment.querySelector('.filepond--label-action');
        if(action)action.textContent=photoLabel();
      };
      paint();
      uploader=mountFileUploader(attachment,{projectId,recordId:id,category:'oddjob-invoices',files:invoices,label:photoLabel(),buttonLabel:true,onError:toast});
    },
    onSave(){
      if(uploader?.isBusy()){toast('ابتدا بارگذاری عکس را تمام کنید');return false;}
      const result=saveStandalone({...draft,id,amount:Number(draft.amount)||0,invoices});
      if(!result.ok){toast('اطلاعات خرده‌کار را کامل و معتبر وارد کنید');return false;}
      onChanged?.();
      return true;
    },
  });
  const observer=new MutationObserver(()=>{
    if(sheet.isConnected)return;
    uploader?.destroy();observer.disconnect();
  });
  observer.observe(document.body,{childList:true});
}

export function requestPlanningTaskDelete({documentRef,projectId,workId,taskId,onChanged}){
  const perform = () => {
    const result = workTaskApi.remove(projectId, workId, taskId);
    const showToast = documentRef.defaultView?.KarhaUI?.showToast;
    if(!result.ok){
      showToast?.(result.message || (result.code === 'not_found' ? 'این کار در درخت پروژه پیدا نشد' : 'حذف کار انجام نشد'));
      return;
    }
    onChanged?.();
    showToast?.('کار از درخت پروژه حذف شد');
  };
  if(typeof documentRef.defaultView?.KarhaUI?.openConfirm === 'function') documentRef.defaultView.KarhaUI.openConfirm('این کار از برنامه پروژه حذف شود؟', perform, 'حذف');
  else if(documentRef.defaultView?.confirm?.('این کار از برنامه پروژه حذف شود؟')) perform();
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
    const moving=row.parentElement?.classList.contains('wbs-task-branch')?row.parentElement:row;
    const rows = () => Array.from(group.querySelectorAll(':scope > .wbs-task-branch, :scope > .wbs-work-task'));
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
      const others = rows().filter(item => item !== moving);
      let before = null;
      for(const candidate of others){
        const rect = candidate.getBoundingClientRect();
        if(ev.clientY < rect.top + rect.height / 2){ before = candidate; break; }
      }
      if(before){
        group.insertBefore(moving, before);
      }else if(others.length){
        group.appendChild(moving);
      }
      if(indicator){
        group.insertBefore(indicator, before || moving);
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

export function treeWorkTypeChip(type){
  return type ? `<span class="wbs-type-chip ${TYPE_CLASSES.get(type) || 'type-7'}">${escapeHtml(type)}</span>` : '';
}

export function renderWorkTasks({ documentRef = document, projectId, work, view, onChanged, readOnly=false, canDelete=true, treeDepth=null }){
  const treeLayout = treeDepth !== null;
  const tasks = workTaskApi.list(projectId, work.id);
  if(!tasks.length) return null;
  const group = documentRef.createElement('div');
  group.className = 'wbs-work-tasks';
  group.setAttribute('role', 'list');
  const renderTask=(task,target,depth)=>{
    const children=tasks.filter(child=>child.parentTaskId===task.id);
    const expanded=isExpanded(projectId,task.id);
    const complete = isTaskComplete(task);
    const isContractorTask = task.type === 'پیمانکار';
    const contractor = !treeLayout && isContractorTask ? contactRepository.get(projectId, task.counterpartyContactId ?? task.contractorContactId) : null;
    const contact = !treeLayout && task.assigneeContactId ? contactRepository.get(projectId, task.assigneeContactId) : null;
    const details = treeLayout ? '' :
      `${isContractorTask ? `<span class="wbs-task-contractor">${contractor && !contractor.trashed ? escapeHtml(contactName(contractor)) : 'بدون پیمانکار'}</span>` : ''}${contact ? `<span class="wbs-task-assignee">${escapeHtml(contactName(contact))}</span>` : ''}${task.isSubwork?'':`<span class="wbs-task-priority priority-${task.priority}">${escapeHtml(PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.normal)}</span>`}`;
    const row = documentRef.createElement('button');
    row.type = 'button';
    row.className = 'wbs-work-task' + (complete ? ' is-complete' : '');
    row.dataset.taskId = task.id;
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      ${treeLayout && readOnly ? '' : '<span class="wbs-grip" aria-label="جابجایی کار" role="button">⋮⋮</span>'}
      <span class="wbs-task-connector" aria-hidden="true"></span>
      <span class="wbs-task-content">
        <span class="wbs-task-main">${treeLayout || task.isSubwork?'':`<span class="wbs-type-chip ${TYPE_CLASSES.get(task.type) || 'type-7'}">${escapeHtml(task.type || '؟')}</span>`}<span class="wbs-task-title">${escapeHtml(task.title)}</span>${treeLayout && !task.isSubwork ? treeWorkTypeChip(task.type) : ''}</span>
        <span class="wbs-task-secondary">${details}${view === 'progress' ? `<span class="wbs-task-progress">٪${new Intl.NumberFormat('fa-IR').format(task.progress || 0)}</span>` : ''}${view === 'estimate' && task.type !== FOLLOW_UP_WORK_TYPE ? `<span class="wbs-task-cost">${new Intl.NumberFormat('fa-IR').format(taskCostOf(task))} تومان</span>` : ''}</span>
      </span>`;
    row.addEventListener('click', event => {
      if(event.target.closest('.wbs-grip')) return;
      taskForm({ projectId, work, task, onChanged, readOnly, canDelete });
    });
    const branch=documentRef.createElement('div');
    branch.className='wbs-task-branch';
    branch.dataset.taskId=task.id;
    if(treeLayout){
      branch.className += ' wbs-tree-level-' + Math.min(8,depth);
      const continuation = documentRef.createElement('span');
      continuation.className = 'wbs-tree-continuation';
      continuation.setAttribute('aria-hidden','true');
      branch.appendChild(continuation);
    }
    const controls=documentRef.createElement('div');
    controls.className='wbs-task-branch-controls';
    if(children.length){
      const arrow=documentRef.createElement('button');
      arrow.type='button';arrow.className='wbs-chev';arrow.textContent=expanded?'▾':'◂';
      arrow.setAttribute('aria-label',expanded?'بستن زیرکارها':'باز کردن زیرکارها');
      arrow.setAttribute('aria-expanded',String(expanded));
      arrow.onclick=()=>{toggleExpanded(projectId,task.id);onChanged?.();};
      controls.append(arrow);
    }
    if(!task.isSubwork && !readOnly && !complete && task.type!=='خرید' && view!=='estimate' && view!=='progress'){
      const add=documentRef.createElement('button');
      add.type='button';add.className='wbs-add';add.textContent='+';
      add.setAttribute('aria-label','افزودن زیرکار');
      add.onclick=()=>openWorkCreationSheet({projectId,stage:work,parentTask:task,subwork:true,onChanged});
      branch.append(add);
    }
    if(treeLayout && !children.length)controls.innerHTML='<span class="wbs-chev-spacer" aria-hidden="true"></span>';
    if(controls.childElementCount)branch.append(controls);
    branch.append(row);target.append(branch);
    if(expanded && children.length){
      const nested=documentRef.createElement('div');
      nested.className='wbs-work-tasks wbs-subwork-list';
      for(const child of children)renderTask(child,nested,depth+1);
      branch.append(nested);
    }
    if(!readOnly)bindTaskReorder(target,row,{projectId,workId:work.id,taskId:task.id,onChanged,documentRef});
  };
  tasks.filter(task=>!task.parentTaskId).forEach(task=>renderTask(task,group,treeDepth));
  return group;
}
