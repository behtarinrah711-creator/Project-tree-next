/** Phase 8.2 — global incomplete-form exit choice overlay. */
export function showIncompleteFormExitChoice({ onYes, onNo, onStay, onDismiss, documentRef } = {}){
  const doc = documentRef || (typeof document !== 'undefined' ? document : null);
  if(!doc || !doc.body) return false;
  const existing = doc.querySelector('.global-incomplete-exit-choice');
  if(existing) return true;

  const windowRef = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const transient = windowRef?.KarhaChildHistory;
  const transientKey = 'incomplete-exit-choice';
  const ov = doc.createElement('div');
  ov.className = 'contact-exit-choice global-incomplete-exit-choice hidden';
  ov.innerHTML = '<div class="contact-exit-card"><div class="contact-exit-title">اطلاعات کامل نشده است</div><div class="contact-exit-text">آیا اطلاعات فعلی به‌صورت پیش‌نویس ذخیره شود؟</div><div class="contact-exit-actions"><button type="button" class="mini-btn primary" data-exit="yes">بله</button><button type="button" class="mini-btn ghost" data-exit="no">خیر</button></div></div>';
  doc.body.appendChild(ov);

  const close = () => { if(ov.isConnected) ov.remove(); };
  const reveal = () => ov.classList.remove('hidden');
  const dismissWithAction = action => {
    if(transient?.isTransientOpen?.(transientKey)){
      transient.dismissTransient(transientKey,{after:()=>{ close(); action?.(); }});
      return;
    }
    close();
    action?.();
  };

  // Expose one internal dismissal hook so feature-specific prompt adapters can
  // change button semantics without bypassing the canonical transient layer.
  ov.__karhaDismissWithAction = dismissWithAction;

  const presented = transient?.presentTransient?.(transientKey,{
    onReady: reveal,
    onDismiss:()=>{
      close();
      if(typeof onDismiss==='function') onDismiss();
    }
  });
  // Fallback environments without canonical child history still get a usable
  // dialog. In the real app the overlay is revealed only after its transient
  // history entry is current, so a visible prompt always owns the next Back.
  if(presented !== true) reveal();

  ov.querySelector('[data-exit="yes"]').onclick = () => dismissWithAction(onYes);
  ov.querySelector('[data-exit="no"]').onclick = () => dismissWithAction(onNo);
  ov.addEventListener('pointerdown', e => {
    if(e.target !== ov) return;
    if(transient?.isTransientOpen?.(transientKey)){
      dismissWithAction(onDismiss);
      return;
    }
    close();
    if(onStay) onStay();
  });
  return true;
}
