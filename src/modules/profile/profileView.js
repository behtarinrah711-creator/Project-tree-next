/** Profile UI extracted from legacyApp — store stays in profileStore.js. */
import { loadProfile, saveProfile, compressSignatureFile } from './profileStore.js';

export function installProfileView({ windowRef = globalThis, documentRef = null } = {}){
  if(windowRef.KarhaProfileView) return windowRef.KarhaProfileView;
  documentRef = documentRef || windowRef.document || null;
  if(!documentRef || typeof documentRef.getElementById !== 'function'){
    const api = Object.freeze({
      openProfilePage(){}, closeProfilePage(){}, renderProfilePage(){},
    });
    windowRef.KarhaProfileView = api;
    return api;
  }

  let profileDraft = null;

  function toast(msg){
    try{
      if(windowRef.KarhaUI?.showToast) return windowRef.KarhaUI.showToast(msg);
      if(windowRef.KarhaLegacy?.showToast) return windowRef.KarhaLegacy.showToast(msg);
      if(typeof windowRef.showToast === 'function') return windowRef.showToast(msg);
    }catch(e){}
  }
  function call(name, ...args){
    if(typeof windowRef[name] === 'function') return windowRef[name](...args);
    if(typeof windowRef.KarhaLegacy?.[name] === 'function') return windowRef.KarhaLegacy[name](...args);
  }

  function closeProfilePage(fromPopState=false){
    profileDraft = null;
    const page = documentRef.getElementById('profilePage');
    if(page) page.classList.add('hidden');
    // openProfilePage always pushed menu-root history
    if(typeof windowRef.closeMenuRootPage === 'function'){
      windowRef.closeMenuRootPage(fromPopState);
      return;
    }
    call('updateWorkspaceContextBar');
    const active = documentRef.querySelector('.bottom-nav-item.active');
    if(active && active.id === 'bottomProjectsBtn') call('enterProjectsSurface');
    else call('refreshCurrentFooterPage');
  }

  function openProfilePage(){
    call('closeBottomPages');
    call('enterWorkspaceSurface');
    call('ensureHomeSelection');
    call('setBottomNavActive', 'Projects');
    call('pushMenuRootHistory', 'profile');
    profileDraft = {...loadProfile()};
    const page = documentRef.getElementById('profilePage');
    if(page) page.classList.remove('hidden');
    call('updateWorkspaceContextBar');
    renderProfilePage();
  }

  function renderProfilePage(){
    const body = documentRef.getElementById('profilePageBody');
    if(!body) return;
    body.innerHTML = '';
    const prof = {...(profileDraft || loadProfile())};

    const nameField = documentRef.createElement('div');
    nameField.className = 'profile-field';
    nameField.innerHTML = '<label for="profileNameInput">نام و نام خانوادگی</label>';
    const nameInp = documentRef.createElement('input');
    nameInp.type = 'text';
    nameInp.id = 'profileNameInput';
    nameInp.placeholder = 'مثلاً علی رضایی';
    nameInp.value = prof.name || '';
    nameInp.oninput = ()=>{
      if(!profileDraft) profileDraft = {...loadProfile()};
      profileDraft.name = nameInp.value;
      nameInp.classList.remove('is-invalid');
    };
    nameField.appendChild(nameInp);
    body.appendChild(nameField);

    const abbrField = documentRef.createElement('div');
    abbrField.className = 'profile-field';
    abbrField.innerHTML = '<label for="profileAbbrInput">اختصار فرستنده <span class="required-mark">*</span></label>';
    const abbrInp = documentRef.createElement('input');
    abbrInp.type = 'text';
    abbrInp.id = 'profileAbbrInput';
    abbrInp.placeholder = 'مثلاً م.احمدی';
    abbrInp.value = prof.senderAbbr || '';
    abbrInp.oninput = ()=>{
      if(!profileDraft) profileDraft = {...loadProfile()};
      profileDraft.senderAbbr = abbrInp.value;
      abbrInp.classList.remove('is-invalid');
    };
    abbrField.appendChild(abbrInp);
    const abbrHint = documentRef.createElement('div');
    abbrHint.className = 'profile-field-hint';
    abbrHint.textContent = 'این مقدار از شما گرفته و در شماره نامه ذخیره می‌شود. نمونه: ۴۰۵۰۵۲۱ / م.احمدی / ۰۱';
    abbrField.appendChild(abbrHint);
    body.appendChild(abbrField);

    const sigField = documentRef.createElement('div');
    sigField.className = 'profile-field';
    sigField.innerHTML = '<label>تصویر امضا</label>';
    const wrap = documentRef.createElement('div');
    wrap.className = 'sig-preview-wrap';
    const preview = documentRef.createElement('div');
    preview.className = 'sig-preview' + (prof.signature ? '' : ' empty');
    if(prof.signature){
      const im = documentRef.createElement('img');
      im.src = prof.signature;
      im.alt = 'امضا';
      preview.appendChild(im);
    } else {
      preview.textContent = 'هنوز امضایی آپلود نشده';
    }
    wrap.appendChild(preview);
    const actions = documentRef.createElement('div');
    actions.className = 'sig-actions';
    const fileInp = documentRef.createElement('input');
    fileInp.type = 'file';
    fileInp.accept = 'image/*';
    fileInp.className = 'hidden';
    const upBtn = documentRef.createElement('button');
    upBtn.className = 'restore-btn';
    upBtn.type = 'button';
    upBtn.textContent = prof.signature ? 'تعویض تصویر' : 'آپلود امضا';
    upBtn.onclick = ()=> fileInp.click();
    fileInp.onchange = async ()=>{
      const f = fileInp.files && fileInp.files[0];
      if(!f) return;
      try{
        toast('در حال آماده‌سازی تصویر…');
        const dataUrl = await compressSignatureFile(f);
        if(!profileDraft) profileDraft = {...loadProfile()};
        profileDraft.signature = dataUrl;
        renderProfilePage();
        toast('امضا آماده ذخیره است');
      }catch(err){
        toast(err.message || 'خطا در آپلود');
      }
    };
    actions.appendChild(upBtn);
    actions.appendChild(fileInp);
    if(prof.signature){
      const delBtn = documentRef.createElement('button');
      delBtn.className = 'perm-del-btn';
      delBtn.type = 'button';
      delBtn.textContent = 'حذف امضا';
      delBtn.onclick = ()=>{
        if(!profileDraft) profileDraft = {...loadProfile()};
        delete profileDraft.signature;
        renderProfilePage();
        toast('حذف امضا آماده ذخیره است');
      };
      actions.appendChild(delBtn);
    }
    wrap.appendChild(actions);
    const tip = documentRef.createElement('div');
    tip.className = 'profile-signature-tip';
    tip.textContent = 'تصویر به‌صورت خودکار کوچک و فشرده می‌شود. ترجیحاً امضا روی زمینه سفید یا شفاف.';
    wrap.appendChild(tip);
    sigField.appendChild(wrap);
    body.appendChild(sigField);
  }

  function saveFromUi(){
    const nameInp = documentRef.getElementById('profileNameInput');
    const abbrInp = documentRef.getElementById('profileAbbrInput');
    const name = (nameInp?.value || '').trim();
    const senderAbbr = (abbrInp?.value || '').trim();
    if(!senderAbbr){
      if(abbrInp){ abbrInp.focus(); abbrInp.classList.add('is-invalid'); }
      toast('اختصار فرستنده را وارد کنید');
      return;
    }
    const p = {...(profileDraft || loadProfile()), name, senderAbbr};
    saveProfile(p, { onError(){ toast('ذخیره مشخصات ممکن نشد'); } });
    profileDraft = {...p};
    toast('مشخصات ذخیره شد');
    closeProfilePage(false);
  }

  const drawerBtn = documentRef.getElementById('drawerProfileBtn');
  if(drawerBtn) drawerBtn.onclick = ()=>{ call('closeDrawer'); openProfilePage(); };
  const cancelBtn = documentRef.getElementById('profileCancelBtn');
  if(cancelBtn) cancelBtn.onclick = ()=> closeProfilePage(false);
  const saveBtn = documentRef.getElementById('profileSaveBtn');
  if(saveBtn) saveBtn.onclick = saveFromUi;

  const api = Object.freeze({ openProfilePage, closeProfilePage, renderProfilePage });
  windowRef.KarhaProfileView = api;
  return api;
}

export default { installProfileView };
