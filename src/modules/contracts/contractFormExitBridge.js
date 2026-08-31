import { STORAGE_KEYS } from '../../config/deploymentConfig.js';
import { createFormExitSession } from '../../core/formExitPolicy.js';
import { projectContext } from '../../core/projectContext.js';
import { contractApi } from '../../domain/contractApi.js';

let installed = false;
const LEGACY_DRAFT_KEY = STORAGE_KEYS.realContractDraft;

function setEditMode(documentRef, mode){
  const page = documentRef.getElementById('contractFormPage');
  if(!page) return;
  page.dataset.contractMode = mode;
  if(mode === 'saved') page.dataset.contractEditing = 'true';
  else delete page.dataset.contractEditing;
}

function runAfterPromptDismiss(overlay, action){
  if(typeof overlay?.__karhaDismissWithAction === 'function'){
    overlay.__karhaDismissWithAction(action);
  }else{
    overlay?.remove?.();
    action?.();
  }
}

function projectIdForForm(){
  return projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
}

function rerenderContracts(windowRef, projectId){
  const render = () => {
    const module = windowRef.KarhaApp?.modules?.get?.('contracts');
    if(typeof module?.render === 'function'){
      module.render(projectId);
      return;
    }
    windowRef.KarhaLegacy?.renderContractsPage?.();
  };
  if(typeof windowRef.setTimeout === 'function') windowRef.setTimeout(render, 0);
  else queueMicrotask(render);
}

function patchExitPrompt({windowRef, form, mode}){
  const documentRef = windowRef.document;
  const overlay = documentRef.querySelector('.global-incomplete-exit-choice');
  if(!overlay) return false;

  const title = overlay.querySelector('.contact-exit-title');
  const text = overlay.querySelector('.contact-exit-text');
  const yes = overlay.querySelector('[data-exit="yes"]');
  const no = overlay.querySelector('[data-exit="no"]');

  if(mode === 'saved'){
    if(title) title.textContent = 'تغییرات ذخیره نشده';
    if(text) text.textContent = 'آیا تغییرات این قرارداد ذخیره شود؟';
  }else{
    if(title) title.textContent = 'قرارداد تکمیل نشده';
    if(text) text.textContent = 'آیا اطلاعات فعلی به‌صورت پیش‌نویس ذخیره شود؟';
  }

  if(yes){
    yes.onclick = () => runAfterPromptDismiss(overlay, () => {
      if(mode === 'saved') form.save(null, false);
      else form.saveDraft?.();
    });
  }

  if(no){
    no.onclick = () => runAfterPromptDismiss(overlay, () => form.close(false));
  }
  return true;
}

export function installContractFormExitBridge({windowRef = window} = {}){
  if(installed) return true;
  const form = windowRef.KarhaRealContractForm;
  if(!form) return false;
  installed = true;

  const documentRef = windowRef.document;
  const originalOpen = form.open.bind(form);
  const originalRequestClose = form.requestClose.bind(form);
  const originalClose = form.close.bind(form);
  const originalSetDirty = form.setDirty.bind(form);
  const originalSave = form.save.bind(form);

  let mode = 'new';
  let exitSession = null;

  const childOpen = id => {
    const el = documentRef?.getElementById?.(id);
    return !!(el && !el.classList.contains('hidden'));
  };
  const hasBlockingChild = () => childOpen('searchTemplatePage') || childOpen('numpadOverlay') || childOpen('jalaliPop');
  const hasPendingChanges = () => !!exitSession?.isDirty?.() || !!form.isDirty?.();

  form.open = function(id = null, projectId = null){
    const opened = originalOpen(id, projectId);
    if(!opened) return opened;

    const current = form.getState?.();
    mode = !id ? 'new' : (current?.status === 'draft' || current?.isDraft ? 'draft' : 'saved');
    setEditMode(documentRef, mode);
    exitSession = createFormExitSession({
      isNew: () => mode !== 'saved',
      getState: () => form.getState?.(),
    });
    exitSession.captureBaseline();
    return opened;
  };

  form.requestClose = function(fromPopState = false, transition = null){
    if(hasBlockingChild()) return false;

    const changed = hasPendingChanges();
    if(changed) originalSetDirty(true);

    const result = originalRequestClose(fromPopState, transition);
    if(changed && result === false) patchExitPrompt({windowRef, form, mode});
    return result;
  };

  form.shouldPreflightExit = function(){
    return !hasBlockingChild() && hasPendingChanges();
  };

  form.saveDraft = function(){
    const state = form.getState?.();
    const projectId = projectIdForForm();
    if(!state || !projectId) return false;
    const result = contractApi.saveDraft(projectId, state);
    if(!result.ok){
      windowRef.KarhaLegacy?.showToast?.(result.message || 'پیش‌نویس ذخیره نشد');
      return false;
    }
    try{ windowRef.localStorage?.removeItem?.(LEGACY_DRAFT_KEY); }catch{}
    windowRef.KarhaLegacy?.showToast?.('پیش‌نویس ذخیره شد');
    mode = 'draft';
    form.close(false);
    rerenderContracts(windowRef, projectId);
    return true;
  };

  form.save = function(projectId = null, silent = false){
    const state = form.getState?.();
    const targetProjectId = projectId || projectIdForForm();
    const expectedId = state?.id || null;
    if(state){
      state.status = 'final';
      state.isDraft = false;
    }

    // Suppress the legacy success toast until persistence has been verified.
    const saved = originalSave(targetProjectId, true);
    if(!saved) return false;

    const persisted = expectedId && targetProjectId
      ? contractApi.get(targetProjectId, expectedId)
      : null;
    if(!persisted || persisted.status !== 'final' || persisted.trashed){
      windowRef.KarhaLegacy?.showToast?.('ذخیره قرارداد تایید نشد');
      return false;
    }

    try{ windowRef.localStorage?.removeItem?.(LEGACY_DRAFT_KEY); }catch{}
    rerenderContracts(windowRef, targetProjectId);
    if(!silent) windowRef.KarhaLegacy?.showToast?.('قرارداد ذخیره شد');
    return true;
  };

  form.close = function(fromPopState = false){
    mode = 'new';
    exitSession = null;
    setEditMode(documentRef, mode);
    return originalClose(fromPopState);
  };

  form.getLifecycleMode = () => mode;
  return true;
}

export default { installContractFormExitBridge };
