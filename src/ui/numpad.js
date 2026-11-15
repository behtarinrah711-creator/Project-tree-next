/** Phase 8.2 — cost/number numpad primitive. */
import { toEnglishDigits, toPersianDigits, groupWithCommas } from './digits.js';

let numpadBuffer = '';
let numpadOnDone = null;
let numpadOpts = { suffix: ' تومان', maxLen: 13, group: true };
let installed = false;

export function openNumpadGeneric(initial, onDone, opts, { documentRef = document, windowRef = window } = {}){
  numpadOnDone = onDone;
  numpadOpts = Object.assign({ suffix: ' تومان', prefix: '', maxLen: 16, group: true }, opts || {});
  const raw = toEnglishDigits(String(initial==null?'':initial)).replace(numpadOpts.allowDecimal ? /[^\d.]/g : /[^\d]/g,'');
  numpadBuffer = raw;
  let decimal=documentRef.getElementById('numpadDecimal');
  if(!decimal && numpadOpts.allowDecimal){
    decimal=documentRef.createElement('button');
    decimal.id='numpadDecimal';decimal.type='button';decimal.className='numpad-key';decimal.textContent='٫';
    decimal.setAttribute('aria-label','ممیز');
    documentRef.getElementById('numpadBackspace')?.after(decimal);
    decimal.onclick=()=>{
      if(!numpadOpts.allowDecimal || numpadBuffer.includes('.') || numpadBuffer.length>=numpadOpts.maxLen) return;
      numpadBuffer=(numpadBuffer||'0')+'.';updateNumpadDisplay({documentRef});
    };
  }
  if(decimal) decimal.hidden=!numpadOpts.allowDecimal;
  updateNumpadDisplay({ documentRef });
  showNumpadError('', { documentRef });
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
    const [whole,fraction]=numpadBuffer.split('.');
    const shown=(numpadOpts.group ? groupWithCommas(whole) : whole)+(fraction!==undefined?'٫'+fraction:'');
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

function showNumpadError(message, { documentRef = document } = {}){
  let error = documentRef.getElementById('numpadError');
  if(!error){
    error = documentRef.createElement('div');
    error.id = 'numpadError';
    error.className = 'numpad-error';
    documentRef.getElementById('numpadDisplay')?.after(error);
  }
  error.textContent = message || '';
  error.classList.toggle('is-visible', Boolean(message));
}

function applyPastedText(text, { documentRef = document } = {}){
  if(!text) return;
  const cleaned = toEnglishDigits(String(text)).replace(numpadOpts.allowDecimal ? /[^\d.]/g : /[^\d]/g, '');
  if(!cleaned){
    showNumpadError('محتوای قابل‌چسباندن عددی یافت نشد', { documentRef });
    return;
  }
  const max = numpadOpts.maxLen || 16;
  let next = cleaned;
  if(numpadOpts.allowDecimal){
    const parts = next.split('.');
    next = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
  }
  if(next.length > max) next = next.slice(0, max);
  numpadBuffer = next;
  updateNumpadDisplay({ documentRef });
  showNumpadError('', { documentRef });
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
      showNumpadError('', { documentRef });
    };
  });
  const backspace = documentRef.getElementById('numpadBackspace');
  if(backspace) backspace.onclick = ()=>{
    numpadBuffer = numpadBuffer.slice(0, -1);
    updateNumpadDisplay({ documentRef });
    showNumpadError('', { documentRef });
  };
  const pasteBtn = documentRef.getElementById('numpadPasteBtn');
  if(pasteBtn){
    pasteBtn.onclick = async ()=>{
      try{
        const text = await windowRef.navigator.clipboard?.readText?.();
        if(text) applyPastedText(text, { documentRef });
        else showNumpadError('دسترسی به کلیپ‌بورد ممکن نشد. از Ctrl+V استفاده کنید.', { documentRef });
      }catch(_err){
        showNumpadError('دسترسی به کلیپ‌بورد ممکن نشد. از Ctrl+V استفاده کنید.', { documentRef });
      }
    };
  }
  documentRef.addEventListener('paste', event=>{
    if(overlay.classList.contains('hidden')) return;
    const text = event.clipboardData?.getData('text') || '';
    if(!text) return;
    event.preventDefault();
    applyPastedText(text, { documentRef });
  });
  const done = documentRef.getElementById('numpadDoneBtn');
  if(done) done.onclick = ()=>{
    const validationError = typeof numpadOpts.validate === 'function' ? numpadOpts.validate(numpadBuffer) : '';
    if(validationError){
      showNumpadError(validationError, { documentRef });
      return;
    }
    if(numpadOnDone){
      if(numpadOnDone(numpadBuffer) === false) return;
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
