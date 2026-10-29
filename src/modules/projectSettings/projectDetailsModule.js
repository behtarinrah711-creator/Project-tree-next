import { projectRepository } from '../../data/projectRepository.js';
import { appRouter } from '../../core/router.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { openSearchPicker } from '../../ui/searchPickerAdapter.js';
import { openJalaliPicker, formatJalaliDisplay } from '../../ui/jalali.js';
import { isProjectOwner } from './index.js';
import {
  PROJECT_TYPES, PROJECT_CURRENCIES, projectProvinces, projectCities,
  projectDetailsDraft, updateProjectDetails,
} from './projectDetailsDomain.js';

function contactName(contact){
  return [contact.type, contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || contact.name || 'بدون نام';
}

export default {
  id: 'project-details', title: 'مشخصات پروژه', route: 'project-details',
  mount({ projectId }){
    const body = document.getElementById('projectDetailsPageBody');
    const project = projectRepository.find(projectId);
    if(!body || !project) return { projectId, moduleId:this.id };
    const canEdit = isProjectOwner(projectId);
    const draft = projectDetailsDraft(project);
    const form = document.createElement('form');
    form.className = 'form-template';
    const error = document.createElement('div');
    error.className = 'role-access-denied';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const back = document.getElementById('closeProjectDetailsPage');
    back.onclick = () => appRouter.navigate(projectId, 'people');
    const save = document.getElementById('saveProjectDetails');
    save.hidden = !canEdit;
    const saveDetails = event => {
      event?.preventDefault();
      if(!isProjectOwner(projectId)) return;
      try {
        projectRepository.updateProject(projectId, current => updateProjectDetails(current, draft));
        markDirty(projectId);
        persist();
        appRouter.navigate(projectId, 'people');
        window.KarhaLegacy?.renderAll?.();
      } catch(err){
        error.textContent = err.message;
        error.hidden = false;
      }
    };
    save.onclick = saveDetails;
    form.onsubmit = saveDetails;

    function textField(label, key, multiline = false){
      const row = document.createElement('label');
      row.className = 'ft-row ft-stack';
      const title = document.createElement('span');
      title.className = 'ft-label'; title.textContent = label;
      const input = document.createElement(multiline ? 'textarea' : 'input');
      input.className = 'ft-input'; input.value = draft[key];
      input.setAttribute('aria-label', label);
      input.name = key; input.disabled = !canEdit;
      if(key === 'name') input.required = true;
      if(multiline) input.rows = 3;
      input.oninput = () => { draft[key] = input.value; };
      row.append(title, input); form.appendChild(row);
    }
    function selectField(label, display, onOpen, disabled = false){
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'ft-row ft-tap';
      row.disabled = !canEdit || disabled;
      row.setAttribute('aria-label', label);
      const title = document.createElement('span');
      title.className = 'ft-label'; title.textContent = label;
      const value = document.createElement('span');
      value.className = 'ft-value' + (display ? '' : ' ft-placeholder');
      value.textContent = display || 'انتخاب';
      row.append(title, value); row.onclick = onOpen;
      form.appendChild(row);
    }
    function picker(label, items, apply){
      openSearchPicker({ title:label, listTitle:label, contextKey:'project-details-' + label,
        items, resourceType:'other', showAdd:false, showStar:false, preserveOrder:true,
        onSelect: item => { apply(item); render(); },
      });
    }
    function render(){
      form.replaceChildren();
      textField('نام پروژه', 'name');
      const codeRow = document.createElement('label'); codeRow.className = 'ft-row';
      const codeTitle = document.createElement('span'); codeTitle.className = 'ft-label'; codeTitle.textContent = 'شناسه پروژه';
      const code = document.createElement('input'); code.className = 'ft-input'; code.readOnly = true;
      code.setAttribute('aria-label', 'شناسه پروژه'); code.dir = 'ltr';
      code.value = projectRepository.find(projectId)?.contractProjectCode || '';
      code.placeholder = 'پس از همگام‌سازی ساخته می‌شود';
      codeRow.append(codeTitle, code); form.appendChild(codeRow);
      const provinces = projectProvinces();
      selectField('انتخاب استان', provinces.find(item => item.id === draft.provinceId)?.name,
        () => picker('انتخاب استان', provinces, item => {
          if(draft.provinceId !== item.id) draft.cityId = '';
          draft.provinceId = item.id;
        }));
      const cities = projectCities(draft.provinceId);
      selectField('انتخاب شهر', cities.find(item => item.id === draft.cityId)?.name,
        () => picker('انتخاب شهر', cities, item => { draft.cityId = item.id; }), !draft.provinceId);
      selectField('انتخاب نوع پروژه', draft.projectType,
        () => picker('انتخاب نوع پروژه', PROJECT_TYPES.map(name => ({ id:name, name })), item => { draft.projectType = item.id; }));
      textField('آدرس پروژه', 'address', true);
      selectField('واحد ارزی پروژه', draft.currency,
        () => picker('واحد ارزی پروژه', PROJECT_CURRENCIES.map(name => ({ id:name, name })), item => { draft.currency = item.id; }));
      textField('توضیحات پروژه (اختیاری)', 'description', true);
      const contacts = (projectRepository.find(projectId)?.contacts || []).filter(item => !item.trashed);
      const employer = contacts.find(item => String(item.id) === draft.employerId);
      selectField('انتخاب کارفرمای پروژه', employer && contactName(employer),
        () => picker('انتخاب کارفرمای پروژه', contacts.map(item => ({ id:String(item.id), name:contactName(item) })).sort((a,b) => a.name.localeCompare(b.name, 'fa')), item => { draft.employerId = item.id; }));
      selectField('تاریخ شروع پروژه', draft.startDate && formatJalaliDisplay(draft.startDate),
        () => openJalaliPicker(draft.startDate, value => { draft.startDate = value; render(); }));
      form.appendChild(error);
    }
    render();
    body.replaceChildren(form);
    return { projectId, moduleId:this.id };
  },
};
