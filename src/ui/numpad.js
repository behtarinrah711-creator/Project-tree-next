/** Phase 8.2 — cost/number numpad primitive. */
import { toEnglishDigits, toPersianDigits, groupWithCommas } from './digits.js';

let numpadBuffer = '';
let numpadOnDone = null;
let numpadOpts = { suffix: ' تومان', maxLen: 13, group: true };
let installed = false;

export function openNumpadGeneric(initial, onDone, opts, { documentRef = document, windowRef = window } = {}){
  numpadOnDone = onDone;
  numpadOpts = Object.assign({ suffix: ' تومان', prefix: '', maxLen: 16, group: true }, opts || {});
  const raw = toEnglishDigits(String(initial==null?'':initial)).replace(/[^\d]/g,'');
  numpadBuffer = raw;
  updateNumpadDisplay({ documentRef });
  const overlay = documentRef.getElementById('numpadOverlay');
  if(overlay) overlay.classList.remove('hidden');
  windowRef.KarhaChildHistory?.open('numpad');
}

export function closeNumpad(fromPopState=false, { documentRef = document, windowRef = window } = {}){
  const overlay = documentRef.getElementById('numpadOverlay');
  if(overlay) overlay.classList.add('hidden');
  numpadOnDone = null;
  windowRef.KarhaChildHistory?.consume('numpad',{fromPopState});
}

function updateNumpadDisplay({ documentRef = document } = {}){
  const el = documentRef.getElementById('numpadDisplay');
  if(!el) return;
  if(numpadBuffer === ''){
    el.textContent = 'وارد کنید…';
    el.classList.add('empty');
    el.style.direction = '';
  } else {
    const shown = numpadOpts.group ? groupWithCommas(numpadBuffer) : numpadBuffer;
    el.textContent = (numpadOpts.prefix || '') + toPersianDigits(shown) + (numpadOpts.suffix || '');
    el.classList.remove('empty');
    if(numpadOpts.prefix === '٪'){
      el.style.direction = 'ltr';
      el.style.unicodeBidi = 'isolate';
    } else {
      el.style.direction = '';
    }
  }
}

export function installNumpadBindings({ documentRef, windowRef = globalThis } = {}){
  if(!documentRef) return;
  if(installed) return;
  const overlay = documentRef.getElementById('numpadOverlay');
  if(!overlay) return;
  installed = true;
  documentRef.querySelectorAll('.numpad-key[data-d]').forEach(btn=>{
    btn.onclick = ()=>{
      if(numpadBuffer.length >= (numpadOpts.maxLen||13)) return;
      numpadBuffer += btn.dataset.d;
      updateNumpadDisplay({ documentRef });
    };
  });
  const backspace = documentRef.getElementById('numpadBackspace');
  if(backspace) backspace.onclick = ()=>{
    numpadBuffer = numpadBuffer.slice(0, -1);
    updateNumpadDisplay({ documentRef });
  };
  const done = documentRef.getElementById('numpadDoneBtn');
  if(done) done.onclick = ()=>{
    if(numpadOnDone){
      numpadOnDone(numpadBuffer);
      closeNumpad(false, { documentRef, windowRef });
      return;
    }
    closeNumpad(false, { documentRef, windowRef });
  };
  const cancel = documentRef.getElementById('numpadCancelBtn');
  if(cancel) cancel.onclick = () => closeNumpad(false, { documentRef, windowRef });
  overlay.onclick = (e)=>{
    if(e.target && e.target.id === 'numpadOverlay') closeNumpad(false, { documentRef, windowRef });
  };
  windowRef.KarhaChildHistory?.register('numpad',{onPop:()=>closeNumpad(true,{documentRef,windowRef})});
}
