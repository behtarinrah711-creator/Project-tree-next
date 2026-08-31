/** Phase 8.2 — confirm dialog primitive. Binds once via installConfirmBindings. */
let confirmCallback = null;
let installed = false;

export function openConfirm(text, onOk, okLabel, { documentRef = document } = {}){
  const textEl = documentRef.getElementById('confirmText');
  const okBtn = documentRef.getElementById('confirmOkBtn');
  const overlay = documentRef.getElementById('confirmOverlay');
  if(textEl) textEl.textContent = text;
  if(okBtn) okBtn.textContent = okLabel || 'تایید';
  confirmCallback = onOk;
  if(overlay) overlay.classList.remove('hidden');
}

export function closeConfirm({ documentRef = document } = {}){
  const overlay = documentRef.getElementById('confirmOverlay');
  if(overlay) overlay.classList.add('hidden');
  confirmCallback = null;
}

export function installConfirmBindings({ documentRef } = {}){
  if(!documentRef) return;
  if(installed) return;
  const cancel = documentRef.getElementById('confirmCancelBtn');
  const overlay = documentRef.getElementById('confirmOverlay');
  const ok = documentRef.getElementById('confirmOkBtn');
  if(!cancel || !overlay || !ok) return;
  installed = true;
  cancel.onclick = () => closeConfirm({ documentRef });
  overlay.onclick = (e) => { if(e.target && e.target.id === 'confirmOverlay') closeConfirm({ documentRef }); };
  ok.onclick = () => {
    const cb = confirmCallback;
    closeConfirm({ documentRef });
    if(cb) cb();
  };
}
