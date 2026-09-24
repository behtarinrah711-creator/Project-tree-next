import { projectRepository } from '../../data/projectRepository.js';
import { getSession } from '../../core/session.js';
import { appRouter } from '../../core/router.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import {
  ACCESS_LEVELS, EDITABLE_MEMBER_STATUSES, MEMBER_STATUSES, PROJECT_ROLES, canManageProjectRoles,
  createMember, isValidIranianMobile, normalizePermissions, permissionGroups, permissionModules,
} from './roleManagementDomain.js';
import { smsInvitationAdapter } from './smsInvitationAdapter.js';

export function createRoleManagementModule({
  repository=projectRepository,
  sessionProvider=getSession,
  router=appRouter,
  smsAdapter=smsInvitationAdapter,
  markProjectDirty=markDirty,
  persistProjects=persist,
  documentRef=globalThis.document,
}={}){
  let activeSheet=null;
  let routeCloseBound=false;
  const windowRef=documentRef?.defaultView || globalThis.window;

  function save(projectId, updater){
    const updated=repository.updateProject(projectId,current=>updater({...current,projectMembers:[...(current.projectMembers || [])]}));
    if(updated){ markProjectDirty(projectId);persistProjects(); }
    return updated;
  }

  function closeSheet(){ activeSheet?.remove?.();activeSheet=null; }

  function openMemberSheet(projectId, registry, existing=null){
    closeSheet();
    const overlay=documentRef.createElement('div');overlay.className='role-sheet-backdrop';overlay.dataset.roleSheet='';
    const sheet=documentRef.createElement('section');sheet.className='role-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-labelledby','roleSheetTitle');
    const form=documentRef.createElement('form');form.className='role-member-form';form.noValidate=true;
    form.innerHTML=`<header><button type="button" data-close aria-label="بستن">×</button><h2 id="roleSheetTitle">${existing?'ویرایش عضو':'افزودن عضو'}</h2><button type="submit">ذخیره</button></header>`;
    const fields=documentRef.createElement('div');fields.className='role-form-fields';
    const field=(label,name,type='text',required=false)=>{const wrap=documentRef.createElement('label');wrap.textContent=label;const input=documentRef.createElement('input');input.name=name;input.type=type;input.required=required;input.value=existing?.[name] || '';wrap.appendChild(input);fields.appendChild(wrap);return input;};
    const mobile=field('شماره موبایل','mobile','tel',true);mobile.inputMode='numeric';mobile.dir='ltr';mobile.placeholder='09123456789';
    field('نام (اختیاری)','firstName');field('نام خانوادگی (اختیاری)','lastName');

    const popupField=(label,name,items,current)=>{
      const wrap=documentRef.createElement('label');wrap.className='role-popup-field';
      const caption=documentRef.createElement('span');caption.className='role-field-label';caption.textContent=label;wrap.appendChild(caption);
      const root=documentRef.createElement('div');root.className='role-custom-select';
      const input=documentRef.createElement('input');input.type='hidden';input.name=name;input.value=current;
      const trigger=documentRef.createElement('button');trigger.type='button';trigger.className='role-custom-select-trigger';
      const value=documentRef.createElement('span');value.textContent=items.find(item=>item.id===current)?.label || items[0]?.label || '';
      const arrow=documentRef.createElement('span');arrow.className='role-custom-select-arrow';arrow.textContent='⌄';
      trigger.append(value,arrow);
      const menu=documentRef.createElement('div');menu.className='role-custom-select-menu';menu.setAttribute('role','listbox');
      const closeMenu=()=>{menu.classList.remove('open');trigger.classList.remove('open');};
      items.forEach(item=>{
        const option=documentRef.createElement('button');option.type='button';option.className='role-custom-select-option';option.textContent=item.label;option.dataset.value=item.id;
        option.onclick=event=>{event.preventDefault();event.stopPropagation();input.value=item.id;value.textContent=item.label;closeMenu();};
        menu.appendChild(option);
      });
      trigger.onclick=event=>{event.preventDefault();event.stopPropagation();const opening=!menu.classList.contains('open');form.querySelectorAll('.role-custom-select-menu.open').forEach(open=>open.classList.remove('open'));form.querySelectorAll('.role-custom-select-trigger.open').forEach(open=>open.classList.remove('open'));if(opening){menu.classList.add('open');trigger.classList.add('open');}};
      root.append(input,trigger,menu);wrap.appendChild(root);fields.appendChild(wrap);
      return input;
    };

    popupField('نقش','role',PROJECT_ROLES,existing?.role || PROJECT_ROLES[0].id);
    if(existing && existing.status !== 'invited'){
      popupField('وضعیت','status',EDITABLE_MEMBER_STATUSES,existing.status === 'inactive' ? 'inactive' : 'active');
    }

    const permissionTitle=documentRef.createElement('h3');permissionTitle.textContent='دسترسی ماژول‌ها';fields.appendChild(permissionTitle);
    const permissions=normalizePermissions(existing?.permissions,registry);
    permissionGroups(registry).forEach(group=>{
      const groupTitle=documentRef.createElement('h4');groupTitle.className='role-permission-group-title';groupTitle.textContent=group.label;fields.appendChild(groupTitle);
      group.modules.forEach(module=>popupField(module.label,`permission:${module.id}`,ACCESS_LEVELS,permissions[module.id]));
    });
    const hint=documentRef.createElement('p');hint.className='role-form-hint';hint.textContent='حذف اطلاعات هر ماژول فقط با «دسترسی کامل» مجاز است. مدیریت نقش‌ها قابل واگذاری نیست.';fields.appendChild(hint);
    const error=documentRef.createElement('p');error.className='role-form-error';error.setAttribute('role','alert');fields.appendChild(error);
    form.appendChild(fields);sheet.appendChild(form);overlay.appendChild(sheet);documentRef.body.appendChild(overlay);activeSheet=overlay;
    const close=()=>closeSheet();form.querySelector('[data-close]').onclick=close;
    overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    form.addEventListener('click',event=>{if(!event.target.closest?.('.role-custom-select')){form.querySelectorAll('.role-custom-select-menu.open').forEach(open=>open.classList.remove('open'));form.querySelectorAll('.role-custom-select-trigger.open').forEach(open=>open.classList.remove('open'));}});
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const data=new FormData(form);if(!isValidIranianMobile(data.get('mobile'))){error.textContent='شماره موبایل معتبر وارد کنید.';return;}
      const permissionValues=Object.fromEntries(permissionModules(registry).map(module=>[module.id,data.get(`permission:${module.id}`)]));
      const values={mobile:data.get('mobile'),firstName:data.get('firstName'),lastName:data.get('lastName'),role:data.get('role'),permissions:permissionValues};
      let member;
      if(existing){
        const status=existing.status === 'invited' ? 'invited' : (data.get('status') || existing.status);
        member={...existing,...values,status,permissions:normalizePermissions(permissionValues,registry)};
      }else member=createMember(values,{registry});
      save(projectId,project=>({...project,projectMembers:existing
        ? project.projectMembers.map(item=>item.id===existing.id?member:item)
        : [...project.projectMembers,member]}));
      if(!existing && smsAdapter.configured) void smsAdapter.sendInvitation({projectId,member});
      close();render(projectId,registry);
    });
    mobile.focus?.();
  }

  function render(projectId,registry){
    const body=documentRef.getElementById('roleManagementPageBody');if(!body)return;
    body.replaceChildren();const project=repository.find(projectId);
    if(!canManageProjectRoles(project,sessionProvider())){
      const denied=documentRef.createElement('div');denied.className='role-access-denied';denied.textContent='مدیریت نقش‌ها فقط برای مالک یا سازنده پروژه در دسترس است.';body.appendChild(denied);return;
    }
    const members=project.projectMembers || [];
    if(!members.length){const empty=documentRef.createElement('div');empty.className='role-empty';empty.textContent='هنوز عضوی به پروژه دعوت نشده است.';body.appendChild(empty);}
    const roleMap=new Map(PROJECT_ROLES.map(item=>[item.id,item.label]));const statusMap=new Map(MEMBER_STATUSES.map(item=>[item.id,item.label]));
    members.forEach(member=>{const row=documentRef.createElement('button');row.type='button';row.className='role-member-row';const name=[member.firstName,member.lastName].filter(Boolean).join(' ') || member.mobile;row.innerHTML=`<span class="role-member-main"><strong></strong><small></small></span><span class="role-status"></span><span class="workspace-option-arrow">›</span>`;row.querySelector('strong').textContent=name;row.querySelector('small').textContent=`${member.mobile} · ${roleMap.get(member.role) || member.role}`;row.querySelector('.role-status').textContent=statusMap.get(member.status) || member.status;row.onclick=()=>openMemberSheet(projectId,registry,member);body.appendChild(row);});
  }

  return {
    id:'role-management',title:'مدیریت نقش‌ها',assignablePermission:false,
    mount({projectId,registry}={}){
      const project=repository.find(projectId);
      if(!canManageProjectRoles(project,sessionProvider())){router.navigate(projectId,'people',{replace:true});return {projectId,moduleId:'people',denied:true};}
      if(!routeCloseBound && windowRef?.addEventListener){
        windowRef.addEventListener('karha:workspace-route-synced',event=>{if(event?.detail?.moduleId!=='role-management')closeSheet();});
        routeCloseBound=true;
      }
      const back=documentRef.getElementById('closeRoleManagementPage');if(back)back.onclick=()=>windowRef?.KarhaBrowserHistory?.back?.();
      const add=documentRef.getElementById('addProjectMember');if(add)add.onclick=()=>openMemberSheet(projectId,registry);
      render(projectId,registry);return {projectId,moduleId:'role-management'};
    },
    render,
    closeSheet,
  };
}

export default createRoleManagementModule();
