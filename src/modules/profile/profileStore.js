import { STORAGE_KEYS } from '../../config/deploymentConfig.js';
/** Phase 8.3 — user profile + signature storage (same key/schema; no migration). */
export const PROFILE_KEY = STORAGE_KEYS.profile;

export function loadProfile({ storage = localStorage } = {}){
  try{ return JSON.parse(storage.getItem(PROFILE_KEY) || '{}') || {}; }catch(e){ return {}; }
}

export function saveProfile(p, { storage = localStorage, onError } = {}){
  try{ storage.setItem(PROFILE_KEY, JSON.stringify(p)); return true; }
  catch(e){ if(typeof onError === 'function') onError(e); return false; }
}

/** فشرده‌سازی امضا: PNG شفاف، عرض حداکثر 600 (behavior-identical to legacy). */
export function compressSignatureFile(file){
  return new Promise((resolve, reject)=>{
    if(!file || !file.type || !file.type.startsWith('image/')){
      reject(new Error('فایل تصویر نیست'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      URL.revokeObjectURL(url);
      const maxW = 600;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if(w > maxW){ h = Math.round(h * (maxW / w)); w = maxW; }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      let dataUrl = canvas.toDataURL('image/png');
      if(dataUrl.length > 180000){
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      }
      resolve(dataUrl);
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error('خواندن تصویر ناموفق')); };
    img.src = url;
  });
}

export function installProfileStore({ windowRef = globalThis } = {}){
  const api = Object.freeze({
    PROFILE_KEY,
    loadProfile: () => loadProfile(),
    saveProfile: (p) => saveProfile(p, { onError(){ windowRef.KarhaUI?.showToast?.('ذخیره مشخصات ممکن نشد'); windowRef.KarhaLegacy?.showToast?.('ذخیره مشخصات ممکن نشد'); } }),
    compressSignatureFile,
  });
  windowRef.KarhaProfile = api;
  return api;
}
