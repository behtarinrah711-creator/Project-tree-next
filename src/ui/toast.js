/** Phase 6.5 — toast primitive (safe, no contract-form coupling). */
export function showToast(msg, { documentRef = document, durationMs = 1600 } = {}){
  const t = documentRef?.getElementById?.('toast');
  if(!t) return;
  t.textContent = String(msg ?? '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), durationMs);
}
