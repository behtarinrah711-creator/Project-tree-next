export function normalizePaymentStages(stages){
  return (Array.isArray(stages)?stages:[]).map(x=>({
    id:x.id || ('ps_'+Date.now()+'_'+Math.random().toString(36).slice(2,7)),
    progress:x.progress??'',
    paymentPercent:x.paymentPercent??'',
    description:x.description||''
  }));
}

export function addPaymentStage(state){
  state.paymentStages=normalizePaymentStages(state.paymentStages);
  state.paymentStages.push({
    id:'ps_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
    progress:'',paymentPercent:'',description:''
  });
  return state.paymentStages[state.paymentStages.length-1];
}

export function removePaymentStage(state,index){
  if(!Array.isArray(state?.paymentStages)) return false;
  if(index<0 || index>=state.paymentStages.length) return false;
  state.paymentStages.splice(index,1);
  return true;
}

export function updatePaymentStage(stage,field,value){
  if(!stage)return false;
  if(field==='progress'||field==='paymentPercent'){
    const n=Math.min(100,Math.max(0,Number(value)||0));
    stage[field]=n;
  }else if(field==='description'){
    stage.description=String(value??'');
  }else return false;
  return true;
}

export function renderPaymentStages(body,state,{onDirty,onNumpad,onRender}={}){
  const sec=document.createElement('div');
  sec.className='real-contract-section';
  sec.textContent='شرایط پرداخت';
  body.appendChild(sec);

  const note=document.createElement('div');
  note.className='contract-form-note';
  note.textContent='پرداخت‌ها بر اساس درصد پیشرفت پروژه تعریف می‌شوند.';
  body.appendChild(note);

  const list=document.createElement('div');
  list.className='contract-payment-stages';

  state.paymentStages=normalizePaymentStages(state.paymentStages);
  state.paymentStages.forEach((x,i)=>{
    const row=document.createElement('div');
    row.className='contract-payment-stage';

    const progress=document.createElement('button');
    progress.type='button';
    progress.className='contract-payment-percent-btn';
    progress.textContent=x.progress!==''&&x.progress!=null
      ? String(x.progress)+'٪':'پیشرفت ٪';
    progress.onclick=()=>{
      const commit=raw=>{updatePaymentStage(x,'progress',raw);onDirty?.();onRender?.();};
      if(onNumpad) onNumpad(x.progress||'',commit,{suffix:'٪',maxLen:3,group:false});
      else commit(x.progress||'');
    };

    const pay=document.createElement('button');
    pay.type='button';
    pay.className='contract-payment-percent-btn';
    pay.textContent=x.paymentPercent!==''&&x.paymentPercent!=null
      ? String(x.paymentPercent)+'٪':'پرداخت ٪';
    pay.onclick=()=>{
      const commit=raw=>{updatePaymentStage(x,'paymentPercent',raw);onDirty?.();onRender?.();};
      if(onNumpad) onNumpad(x.paymentPercent||'',commit,{suffix:'٪',maxLen:3,group:false});
      else commit(x.paymentPercent||'');
    };

    const desc=document.createElement('input');
    desc.type='text';
    desc.placeholder='توضیح شرط پرداخت';
    desc.value=x.description||'';
    desc.oninput=()=>{x.description=desc.value;onDirty?.();};

    const del=document.createElement('button');
    del.type='button';
    del.className='contract-payment-del';
    del.textContent='حذف';
    del.onclick=()=>{removePaymentStage(state,i);onDirty?.();onRender?.();};

    row.append(progress,pay,desc,del);
    list.appendChild(row);
  });

  body.appendChild(list);

  const add=document.createElement('button');
  add.type='button';
  add.className='real-contract-add';
  add.textContent='+ افزودن مرحله پرداخت';
  add.onclick=()=>{addPaymentStage(state);onDirty?.();onRender?.();};
  body.appendChild(add);
}
