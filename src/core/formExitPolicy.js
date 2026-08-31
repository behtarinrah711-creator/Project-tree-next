export function stableSerialize(value){
  try{
    return JSON.stringify(value, (_key, v) => {
      if(v && typeof v === 'object' && !Array.isArray(v)){
        const sorted = {};
        Object.keys(v).sort().forEach(k => { sorted[k] = v[k]; });
        return sorted;
      }
      return v;
    });
  }catch{
    return String(value);
  }
}

export function createFormExitSession({
  isNew,
  getState,
  showChoice,
  onSaveDraft,
  onSaveChanges,
  onDiscard,
  onStay,
} = {}){
  let baseline = stableSerialize(typeof getState === 'function' ? getState() : null);
  let forcedDirty = false;
  return {
    captureBaseline(){
      baseline = stableSerialize(typeof getState === 'function' ? getState() : null);
      forcedDirty = false;
    },
    markDirty(){ forcedDirty = true; },
    isDirty(){
      if(forcedDirty) return true;
      if(typeof getState !== 'function') return false;
      return stableSerialize(getState()) !== baseline;
    },
    requestExit(fromPopState = false){
      if(!this.isDirty()){
        onDiscard?.(fromPopState);
        return 'closed';
      }
      const creating = typeof isNew === 'function' ? !!isNew() : false;
      const title = creating ? 'اطلاعات کامل نشده است' : 'تغییرات ذخیره نشده';
      const text = creating ? 'آیا اطلاعات فعلی به‌صورت پیش‌نویس ذخیره شود؟' : 'آیا تغییرات این فرم ذخیره شود؟';
      showChoice?.({
        title,
        text,
        onYes: () => {
          if(creating){
            if(typeof onSaveDraft === 'function') onSaveDraft(fromPopState);
            else onDiscard?.(fromPopState);
            return;
          }
          if(typeof onSaveChanges === 'function') onSaveChanges(fromPopState);
          else onDiscard?.(fromPopState);
        },
        onNo: () => onDiscard?.(fromPopState),
        onStay: () => onStay?.(fromPopState),
      });
      return 'prompt';
    },
  };
}

export default { createFormExitSession, stableSerialize };
