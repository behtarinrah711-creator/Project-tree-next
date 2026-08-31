/* Generic workspace forms/dialogs. History is delegated to KarhaChildHistory. */
/* ---------- generic mini prompt dialog (replaces window.prompt) ---------- */
let miniPromptCallback = null;
let miniPromptMode = 'generic';

function updateCreateProjectPageUI(){
  const title = document.getElementById('createPageTitle');
  const label = document.getElementById('createNameLabel');
  const input = document.getElementById('createPageInput');
  const confirmBtn = document.getElementById('createPageConfirmBtn');
  if(title) title.textContent = 'ساخت پروژه جدید';
  if(label) label.textContent = 'نام پروژه جدید';
  if(input) input.placeholder = 'مثلاً «پروژه زیتون»';
  if(confirmBtn){
    confirmBtn.disabled = false;
  }
}

/* Global form helpers. New forms should call these instead of inventing local behavior. */
function isFormEmptyValue(value){
  if(value==null) return true;
  if(typeof value==='string') return value.trim()==='';
  if(Array.isArray(value)) return value.length===0;
  return false;
}
function formHasAnyUserInput(root){
  if(!root) return false;
  const fields=root.querySelectorAll('input, textarea, select');
  for(const el of fields){
    if(el.type==='button' || el.type==='submit' || el.type==='hidden') continue;
    // Checked radio/checkbox controls that are merely the form's initial/default
    // selection must NOT make a brand-new untouched form look dirty. They count
    // only after the user has actually changed/touched them.
    if(el.type==='checkbox' || el.type==='radio'){
      if(el.checked && el.dataset.userTouched==='true') return true;
      continue;
    }
    if(!isFormEmptyValue(el.value)) return true;
  }
  // File/image pickers and dynamically selected chips count as input too.
  if(root.querySelector('.contact-selected-activity:not(:empty), .contact-image-card')) return true;
  return false;
}

// Mark choice controls only when the user actually interacts with them.
// This is global so every current and future form gets the same behavior.
document.addEventListener('change', e=>{
  const el=e.target;
  if(!el || (el.type!=='checkbox' && el.type!=='radio')) return;
  el.dataset.userTouched='true';
}, true);
function setInternalFormMode(active){
  document.body.classList.toggle('global-form-mode',!!active);
  const footer=document.querySelector('.bottom-nav');
  if(footer) footer.classList.toggle('global-form-footer-hidden',!!active);
}

/* Global exit guard for incomplete forms. Only two choices are shown. */
function showIncompleteFormExitChoice(opts={}){
  if(window.KarhaUI?.showIncompleteFormExitChoice) return window.KarhaUI.showIncompleteFormExitChoice(opts);
  // classic helper() may resolve window[name] first
  const {onYes,onNo,onStay}=opts;
  const existing=document.querySelector('.global-incomplete-exit-choice');
  if(existing) return;
  const ov=document.createElement('div');
  ov.className='contact-exit-choice global-incomplete-exit-choice';
  ov.innerHTML='<div class="contact-exit-card"><div class="contact-exit-title">اطلاعات کامل نشده است</div><div class="contact-exit-text">آیا اطلاعات فعلی به‌صورت پیش‌نویس ذخیره شود؟</div><div class="contact-exit-actions"><button type="button" class="mini-btn primary" data-exit="yes">بله</button><button type="button" class="mini-btn ghost" data-exit="no">خیر</button></div></div>';
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  ov.querySelector('[data-exit="yes"]').onclick=()=>{close();if(onYes) onYes();};
  ov.querySelector('[data-exit="no"]').onclick=()=>{close();if(onNo) onNo();};
  ov.addEventListener('pointerdown',e=>{if(e.target===ov && onStay){close();onStay();}});
}
try{ window.showIncompleteFormExitChoice = showIncompleteFormExitChoice; }catch(e){}


function formRequiredComplete(root){
  if(!root) return false;
  const required=root.querySelectorAll('[data-required="true"]');
  for(const el of required){
    if(el.type==='checkbox' || el.type==='radio'){ if(el.checked) continue; return false; }
    if(!String(el.value||'').trim()) return false;
  }
  return true;
}

function openCreatePage(){
  const input = document.getElementById('createPageInput');
  if(input) input.value = '';
  updateCreateProjectPageUI();
  document.getElementById('createPage').classList.remove('hidden');
  // ثبت یک وضعیت در History تا دکمه Back گوشی ابتدا از صفحه ساخت به هوم برگردد.
  window.KarhaChildHistory?.open('create-project');
  setTimeout(()=>{ if(input) input.focus(); }, 80);
}

function closeCreatePage(fromPopState=false){
  document.getElementById('createPage').classList.add('hidden');
  window.KarhaChildHistory?.consume('create-project',{fromPopState});
}
window.KarhaChildHistory?.register('create-project',{onPop:()=>closeCreatePage(true),onRestore:()=>openCreatePage()});
window.KarhaChildHistory?.register('menu-root',{onPop:()=>closeMenuRootPage(true)});

document.getElementById('closeCreatePage').onclick = closeCreatePage;
document.getElementById('createPageCancelBtn').onclick = closeCreatePage;
document.getElementById('createPageConfirmBtn').onclick = ()=>{
  const input = document.getElementById('createPageInput');
  const name = input ? input.value.trim() : '';
  if(!name){
    if(input) input.focus();
    return;
  }
  closeCreatePage();
  addProject(name);
};

document.getElementById('createPageInput').onkeydown = (e)=>{
  if(e.key==='Enter'){ e.preventDefault(); document.getElementById('createPageConfirmBtn').click(); }
};

/* ---------- generic mini prompt dialog (rename and other small prompts) ---------- */
function openMiniPrompt(title, placeholder, onConfirm, mode='generic', initialValue=''){
  miniPromptCallback = onConfirm;
  miniPromptMode = mode;
  document.getElementById('promptTitle').textContent = title;
  const input = document.getElementById('promptInput');
  input.value = initialValue || '';
  input.placeholder = placeholder || '';
  const confirmBtn=document.getElementById('promptConfirmBtn');
  const nextBtn=document.getElementById('promptConfirmNextBtn');
  if(confirmBtn){
    const isActivityNew = mode==='activity-new';
    confirmBtn.classList.toggle('hidden', isActivityNew);
    confirmBtn.setAttribute('aria-hidden', isActivityNew ? 'true' : 'false');
    confirmBtn.disabled = isActivityNew;
  }
  if(nextBtn){
    const isActivityNew = mode==='activity-new';
    nextBtn.classList.toggle('hidden', !isActivityNew);
    nextBtn.setAttribute('aria-hidden', isActivityNew ? 'false' : 'true');
  }
  document.getElementById('promptOverlay').classList.remove('hidden');
  setTimeout(()=> input.focus(), 0);
}
function closeMiniPrompt(){ document.getElementById('promptOverlay').classList.add('hidden'); }
document.getElementById('promptCancelBtn').onclick = closeMiniPrompt;
function submitMiniPrompt(keepOpen=false){
  const val = document.getElementById('promptInput').value;
  if(!String(val||'').trim()){ document.getElementById('promptInput').focus(); return; }
  if(miniPromptCallback) miniPromptCallback(val, keepOpen);
}
document.getElementById('promptConfirmBtn').onclick = ()=>{
  const keepOpen=miniPromptMode==='activity-new' ? false : false;
  const val=document.getElementById('promptInput').value;
  closeMiniPrompt();
  if(miniPromptCallback) miniPromptCallback(val, false);
};
document.getElementById('promptConfirmNextBtn').onclick = ()=>{
  const val=document.getElementById('promptInput').value;
  if(!String(val||'').trim()){ document.getElementById('promptInput').focus(); return; }
  if(miniPromptCallback) miniPromptCallback(val, true);
};
document.getElementById('promptInput').onkeydown = (e)=>{
  if(e.key==='Enter'){
    e.preventDefault();
    if(miniPromptMode==='activity-new') document.getElementById('promptConfirmNextBtn').click();
    else document.getElementById('promptConfirmBtn').click();
  }
};
document.getElementById('promptOverlay').onclick = (e)=>{
  if(e.target.id==='promptOverlay') closeMiniPrompt();
};

/* ---------- custom numpad (Phase 8.2: owned by src/ui/numpad.js via KarhaUI) ---------- */
function openNumpadGeneric(initial, onDone, opts){
  if(window.KarhaUI?.openNumpadGeneric) return window.KarhaUI.openNumpadGeneric(initial, onDone, opts);
}
function closeNumpad(fromPopState=false){
  if(window.KarhaUI?.closeNumpad) return window.KarhaUI.closeNumpad(fromPopState);
}
/* DOM binds + popstate installed by installUiPrimitives */
