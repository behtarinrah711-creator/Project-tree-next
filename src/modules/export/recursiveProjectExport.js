const state={pid:null,selected:new Set(),showCost:false,markMode:'square'};

function legacy(name,...args){
  const w=window;
  if(typeof w.KarhaLegacy?.[name]==='function') return w.KarhaLegacy[name](...args);
  if(typeof w[name]==='function') return w[name](...args);
}
function findProject(id){ return legacy('findProject',id); }
function pending(pid,rootId,item){ return !!legacy('isPendingDeleted',item===rootId?'task':'sub',pid,rootId,item); }
function formatCost(value){ return legacy('formatCost',value) ?? String(value||''); }
function escapeHtml(value){
  const delegated=legacy('escapeHtml',value);
  if(delegated!==undefined) return delegated;
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toPersianDigits(value){ return legacy('toPersianDigits',value) ?? String(value??''); }
function toast(message){ legacy('showToast',message); }
function profile(){ return window.KarhaProfile?.loadProfile?.() || legacy('loadProfile') || {}; }

function key(path){ return 'i:'+path.map(String).join('/'); }
function visible(item,pid,rootId){ return !!item && !item.done && !item.trashed && !pending(pid,rootId,item.id); }
function flattenProject(project,pid){
  const rows=[];
  const visit=(items,depth,rootId,path)=>{
    (items||[]).forEach(item=>{
      const rid=rootId ?? item.id;
      if(!visible(item,pid,rid)) return;
      const itemPath=[...path,item.id];
      rows.push({item,depth,rootId:rid,path:itemPath,key:key(itemPath)});
      visit(item.subtasks,depth+1,rid,itemPath);
    });
  };
  visit(project?.tasks||[],0,null,[]);
  return rows;
}
function descendantKeys(rows,row){
  const prefix=row.path.map(String);
  return rows.filter(candidate=>candidate.path.length>=row.path.length && prefix.every((id,index)=>String(candidate.path[index])===id)).map(candidate=>candidate.key);
}
function hasSelectedDescendant(rows,row){
  const prefix=row.path.map(String);
  return rows.some(candidate=>candidate.path.length>row.path.length && prefix.every((id,index)=>String(candidate.path[index])===id) && state.selected.has(candidate.key));
}

function loadNote(pid){
  try{ return window.KarhaExportNotes?.getExportNote?.(pid) || ''; }catch{return '';}
}
function saveNote(pid,text){ try{ window.KarhaExportNotes?.saveExportNote?.(pid,text); }catch{} }

function openRecursiveProjectExport(pid){
  const project=findProject(pid);
  if(!project) return;
  legacy('enterWorkspaceSurface');
  state.pid=pid;
  state.showCost=false;
  state.markMode='square';
  state.selected=new Set(flattenProject(project,pid).map(row=>row.key));
  const title=document.getElementById('exportPageTitle');
  if(title) title.textContent='خروجی: '+project.name;
  const note=document.getElementById('exportNoteInput');
  if(note){ note.value=loadNote(pid); note.oninput=()=>saveNote(pid,note.value); }
  const numbered=document.getElementById('exportNumberedCb');
  const cost=document.getElementById('exportCostCb');
  const signature=document.getElementById('exportIncludeSig');
  const signatureHint=document.getElementById('exportSigHint');
  if(numbered){ numbered.checked=false; numbered.onchange=()=>{state.markMode=numbered.checked?'number':'square';}; }
  if(cost){ cost.checked=false; cost.onchange=()=>{state.showCost=cost.checked;renderRecursiveProjectExport();}; }
  if(signature){
    const p=profile(); const can=!!(p.name&&p.signature);
    signature.checked=false; signature.disabled=!can;
    if(signatureHint) signatureHint.textContent=can?'':'برای امضا: منو → ثبت مشخصات';
  }
  document.getElementById('exportPage')?.classList.remove('hidden');
  renderRecursiveProjectExport();
}

function renderRecursiveProjectExport(){
  const project=findProject(state.pid); if(!project) return;
  const rows=flattenProject(project,state.pid);
  const toolbar=document.getElementById('exportToolbar');
  const body=document.getElementById('exportPageBody');
  if(!toolbar||!body) return;
  toolbar.innerHTML=''; body.innerHTML='';
  const numbered=document.getElementById('exportNumberedCb');
  const cost=document.getElementById('exportCostCb');
  if(numbered) state.markMode=numbered.checked?'number':'square';
  if(cost) state.showCost=cost.checked;

  const allWrap=document.createElement('label'); allWrap.className='export-check-all-wrap';
  const all=document.createElement('input'); all.type='checkbox'; all.checked=rows.length>0&&rows.every(row=>state.selected.has(row.key));
  all.onchange=()=>{ state.selected=all.checked?new Set(rows.map(row=>row.key)):new Set(); renderRecursiveProjectExport(); };
  allWrap.append(all,document.createTextNode('همه')); toolbar.appendChild(allWrap);
  const actions=document.createElement('div'); actions.className='export-actions';
  const pdf=document.createElement('button'); pdf.className='export-pdf-btn'; pdf.textContent='PDF'; pdf.onclick=generateRecursivePdf;
  const jpg=document.createElement('button'); jpg.className='export-jpg-btn'; jpg.textContent='JPEG'; jpg.onclick=generateRecursiveJpeg;
  actions.append(pdf,jpg); toolbar.appendChild(actions);

  if(state.showCost){
    const sum=rows.reduce((total,row)=>total+(state.selected.has(row.key)?(parseFloat(row.item.cost)||0):0),0);
    const el=document.createElement('div'); el.className='export-summary';
    el.innerHTML='<span>جمع موارد انتخاب‌شده</span><span class="cost-sum-val"><span class="cost-unit">تومان</span> '+formatCost(sum)+'</span>';
    body.appendChild(el);
  }
  if(!rows.length){ const empty=document.createElement('div'); empty.className='mgmt-empty'; empty.textContent='مورد باز (ناتمام) برای خروجی نیست.'; body.appendChild(empty); return; }

  rows.forEach(row=>{
    const el=document.createElement('div');
    el.className='export-row'+(row.depth?' sub':'');
    el.dataset.exportDepth=String(row.depth);
    const cb=document.createElement('input'); cb.type='checkbox'; cb.className='exp-check'; cb.checked=state.selected.has(row.key);
    cb.onchange=()=>{
      descendantKeys(rows,row).forEach(k=>cb.checked?state.selected.add(k):state.selected.delete(k));
      renderRecursiveProjectExport();
    };
    const b=document.createElement('div'); b.className='exp-body';
    const title=document.createElement('div'); title.className='exp-title'; title.textContent=row.item.text||''; b.appendChild(title);
    el.append(cb,b);
    if(state.showCost&&row.item.cost){ const c=document.createElement('span'); c.className='row-cost'; c.innerHTML='<span class="cost-unit">تومان</span> '+formatCost(row.item.cost); el.appendChild(c); }
    body.appendChild(el);
  });
}

function selectedRowsWithContext(project){
  const rows=flattenProject(project,state.pid);
  return rows.filter(row=>state.selected.has(row.key)||hasSelectedDescendant(rows,row));
}
function amountHtml(n){
  if(n===null||n===undefined||n===''||Number(n)===0) return '';
  return '<span class="row-cost"><span class="cost-unit">تومان</span> '+formatCost(n)+'</span>';
}
function buildRows(project){
  const rows=selectedRowsWithContext(project);
  let html='',total=0,parentNum=0;
  rows.forEach(row=>{
    const selected=state.selected.has(row.key);
    if(selected&&state.showCost) total+=parseFloat(row.item.cost)||0;
    let mark='□';
    if(row.depth===0){
      if(state.markMode==='number'){ parentNum++; mark=toPersianDigits(String(parentNum)); }
      else mark='■';
    }
    const indent=row.depth*22;
    const context=!selected;
    const costCell=state.showCost?'<td class="cost-cell">'+(selected?amountHtml(row.item.cost):'')+'</td>':'';
    html+='<tr'+(context?' class="context"':'')+'><td class="mark" style="padding-right:'+indent+'px">'+mark+'</td><td class="title'+(row.depth===0?' parent-title':'')+'" style="padding-right:'+indent+'px">'+escapeHtml(row.item.text||'')+'</td>'+costCell+'</tr>';
  });
  return {html,total};
}
function sharedMeta(project){
  const note=((document.getElementById('exportNoteInput')?.value)||'').trim(); saveNote(state.pid,note);
  const p=profile(); const want=!!document.getElementById('exportIncludeSig')?.checked;
  return {
    date:new Date().toLocaleDateString('fa-IR'),
    note:note?'<div class="pdf-note">'+escapeHtml(note).replace(/\n/g,'<br>')+'</div>':'',
    sig:(want&&p.signature&&p.name)?'<div class="pdf-sig"><img src="'+p.signature+'" alt="امضا"><div class="pdf-sig-name">'+escapeHtml(p.name)+'</div></div>':'',
  };
}
function exportStyles(){ return `
body{font-family:Vazirmatn,Tahoma,sans-serif;color:#202124;margin:0;padding:8px 4px} .pdf-top{display:flex;justify-content:space-between;gap:12px;margin-bottom:16px} h1{font-size:20px;margin:0} .meta{font-size:12px;color:#5f6368;white-space:nowrap} table{width:100%;border-collapse:collapse} th{text-align:right;padding:8px 6px;border-bottom:2px solid #202124;font-size:12px;color:#5f6368} td{padding:7px 6px;vertical-align:top;border-bottom:1px solid #e8eaed} td.mark{width:36px;text-align:center} td.title{font-size:14px} td.parent-title{font-weight:700} td.cost-cell{text-align:left;white-space:nowrap}.row-cost{font-family:JetBrains Mono,monospace;font-size:12.5px;font-weight:600;direction:ltr;display:inline-flex;gap:4px}.cost-unit{font-family:Vazirmatn,Tahoma,sans-serif;font-size:10px;color:#5f6368}.context td.title{color:#5f6368}.total-row td{border-top:2px solid #202124;border-bottom:0;font-weight:700}.pdf-note{margin-top:22px;padding-top:14px;border-top:1px solid #e8eaed;font-size:13.5px;line-height:1.7;color:#00075D}.pdf-sig{margin-top:28px;text-align:left;direction:ltr}.pdf-sig img{max-width:180px;max-height:70px}.pdf-sig-name{font-size:11px;color:#5f6368;direction:rtl}`; }

function generateRecursivePdf(){
  const project=findProject(state.pid); if(!project||!state.selected.size){toast('حداقل یک مورد را انتخاب کنید');return;}
  const numbered=document.getElementById('exportNumberedCb'),cost=document.getElementById('exportCostCb');
  if(numbered) state.markMode=numbered.checked?'number':'square'; if(cost) state.showCost=cost.checked;
  const built=buildRows(project),meta=sharedMeta(project);
  const total=state.showCost?'<tr class="total-row"><td></td><td>جمع کل</td><td class="cost-cell">'+amountHtml(built.total)+'</td></tr>':'';
  const costHead=state.showCost?'<th>مبلغ</th>':'';
  const doc='<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><title>'+escapeHtml(project.name)+'</title><link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet"><style>@page{margin:14mm}'+exportStyles()+'</style></head><body><div class="pdf-top"><h1>'+escapeHtml(project.name)+'</h1><div class="meta">تاریخ: '+meta.date+'</div></div><table><thead><tr><th></th><th>مورد</th>'+costHead+'</tr></thead><tbody>'+built.html+total+'</tbody></table>'+meta.note+meta.sig+'<script>window.onload=function(){setTimeout(function(){window.print()},450)}<\/script></body></html>';
  const w=window.open('','_blank'); if(!w){toast('اجازهٔ باز شدن پنجره را بدهید');return;} w.document.open();w.document.write(doc);w.document.close();
}
async function generateRecursiveJpeg(){
  const project=findProject(state.pid); if(!project||!state.selected.size){toast('حداقل یک مورد را انتخاب کنید');return;}
  if(typeof window.html2canvas!=='function'){toast('بارگذاری ابزار تصویر ناموفق بود — اینترنت را بررسی کنید');return;}
  const numbered=document.getElementById('exportNumberedCb'),cost=document.getElementById('exportCostCb');
  if(numbered) state.markMode=numbered.checked?'number':'square'; if(cost) state.showCost=cost.checked;
  const built=buildRows(project),meta=sharedMeta(project);
  const total=state.showCost?'<tr class="total-row"><td></td><td>جمع کل</td><td class="cost-cell">'+amountHtml(built.total)+'</td></tr>':'';
  const costHead=state.showCost?'<th>مبلغ</th>':'';
  const wrap=document.createElement('div'); wrap.id='recursiveJpegExportCapture'; wrap.dir='rtl';
  wrap.innerHTML='<style>#recursiveJpegExportCapture{position:fixed;left:-9999px;top:0;width:800px;padding:28px 24px;background:#fff;color:#202124;box-sizing:border-box;z-index:-1}'+exportStyles()+'</style><div class="pdf-top"><h1>'+escapeHtml(project.name)+'</h1><div class="meta">تاریخ: '+meta.date+'</div></div><table><thead><tr><th></th><th>مورد</th>'+costHead+'</tr></thead><tbody>'+built.html+total+'</tbody></table>'+meta.note+meta.sig;
  document.body.appendChild(wrap); toast('در حال ساخت تصویر…');
  try{ await new Promise(r=>setTimeout(r,200)); const canvas=await window.html2canvas(wrap,{scale:2,backgroundColor:'#ffffff',useCORS:true,allowTaint:true,logging:false,windowWidth:800}); const a=document.createElement('a'); a.href=canvas.toDataURL('image/jpeg',0.92); a.download=(project.name||'export').replace(/[\\/:*?"<>|]/g,'_').slice(0,40)+'.jpg'; document.body.appendChild(a);a.click();a.remove();toast('تصویر JPEG ذخیره شد'); }catch(error){console.error(error);toast('ساخت تصویر ناموفق بود');}finally{wrap.remove();}
}

function install(){
  const original=window.KarhaExportView;
  const api=Object.freeze({...original,openExportPage:openRecursiveProjectExport,renderExportPage:renderRecursiveProjectExport,generateProjectPdf:generateRecursivePdf,generateProjectJpeg:generateRecursiveJpeg});
  window.KarhaExportView=api;
  window.openExportPage=openRecursiveProjectExport;
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('.mgmt-icon-btn[title="خروجی PDF"]');
    if(!button) return;
    const pid=button.closest('.mgmt-row')?.dataset?.dragId;
    if(!pid) return;
    event.preventDefault(); event.stopImmediatePropagation(); openRecursiveProjectExport(pid);
  },true);
}

if(typeof window!=='undefined'){
  if(window.KarhaExportView) install();
  else if(typeof window.addEventListener==='function') window.addEventListener('karha:ready',install,{once:true});
}

export {flattenProject,openRecursiveProjectExport,renderRecursiveProjectExport,generateRecursivePdf,generateRecursiveJpeg};
