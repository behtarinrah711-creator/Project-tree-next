import { STORAGE_KEYS } from '../../config/deploymentConfig.js';
/** Export / PDF / JPEG UI extracted from legacyApp. Notes store: exportNotesStore.js */
import { loadExportNotes, saveExportNote, getExportNote } from './exportNotesStore.js';

export function installExportView({ windowRef = globalThis, documentRef = null } = {}){
  if(windowRef.KarhaExportView) return windowRef.KarhaExportView;
  documentRef = documentRef || windowRef.document || null;
  if(!documentRef || typeof documentRef.getElementById !== 'function'){
    const api = Object.freeze({ openExportPage(){}, renderExportPage(){}, generateProjectPdf(){}, generateProjectJpeg(){} });
    windowRef.KarhaExportView = api;
    return api;
  }

  function toast(msg){
    try{
      if(windowRef.KarhaUI?.showToast) return windowRef.KarhaUI.showToast(msg);
      if(windowRef.KarhaLegacy?.showToast) return windowRef.KarhaLegacy.showToast(msg);
      if(typeof windowRef.showToast === 'function') return windowRef.showToast(msg);
    }catch(e){}
  }
  function call(name, ...args){
    if(typeof windowRef[name] === 'function') return windowRef[name](...args);
    if(typeof windowRef.KarhaLegacy?.[name] === 'function') return windowRef.KarhaLegacy[name](...args);
  }
  function findProject(id){ return call('findProject', id); }
  function isPendingDeleted(...a){ return call('isPendingDeleted', ...a) || false; }
  function formatCost(n){ return call('formatCost', n) ?? String(n||''); }
  function escapeHtml(s){ return call('escapeHtml', s) ?? String(s||''); }
  function toPersianDigits(s){ return call('toPersianDigits', s) ?? String(s||''); }
  function loadProfile(){
    if(windowRef.KarhaProfile?.loadProfile) return windowRef.KarhaProfile.loadProfile();
    return call('loadProfile') || {};
  }
  function enterProjectsSurface(){ call('enterProjectsSurface'); }
  function enterWorkspaceSurface(){ call('enterWorkspaceSurface'); }

let exportPid = null;
let exportSelected = new Set(); // keys: "t:"+tid or "s:"+tid+":"+sid
let exportShowCost = false;
let exportMarkMode = 'square'; // 'square' | 'number' — number فقط آیکون والد را عوض می‌کند

/* Phase 8.5: notes store owned by src/modules/export/exportNotesStore.js; export UI still legacy */
const EXPORT_NOTES_KEY = STORAGE_KEYS.exportNotes;
function loadExportNotes(){
  if(window.KarhaExportNotes?.loadExportNotes) return window.KarhaExportNotes.loadExportNotes();
  try{ return JSON.parse(localStorage.getItem(EXPORT_NOTES_KEY) || '{}') || {}; }catch(e){ return {}; }
}
function saveExportNote(pid, text){
  if(window.KarhaExportNotes?.saveExportNote) return window.KarhaExportNotes.saveExportNote(pid, text);
  const all = loadExportNotes();
  if(text && text.trim()) all[pid] = text;
  else delete all[pid];
  try{ localStorage.setItem(EXPORT_NOTES_KEY, JSON.stringify(all)); }catch(e){}
}
function getExportNote(pid){
  if(window.KarhaExportNotes?.getExportNote) return window.KarhaExportNotes.getExportNote(pid);
  return loadExportNotes()[pid] || '';
}

documentRef.getElementById('closeExportPage').onclick = ()=>{
  documentRef.getElementById('exportPage').classList.add('hidden');
  enterProjectsSurface();
};

function openExportPage(pid){
  const p = findProject(pid);
  if(!p) return;
  enterWorkspaceSurface();
  exportPid = pid;
  exportSelected = new Set();
  exportShowCost = false;
  exportMarkMode = 'square';
  // پیش‌فرض: همه موارد انتخاب
  p.tasks.forEach(t=>{
    if(t.trashed || isPendingDeleted('task', pid, t.id) || t.done) return;
    exportSelected.add('t:'+t.id);
    t.subtasks.forEach(s=>{
      if(s.trashed || isPendingDeleted('sub', pid, t.id, s.id) || s.done) return;
      exportSelected.add('s:'+t.id+':'+s.id);
    });
  });
  documentRef.getElementById('exportPageTitle').textContent = 'خروجی: ' + p.name;
  const noteInp = documentRef.getElementById('exportNoteInput');
  if(noteInp){
    noteInp.value = getExportNote(pid);
    noteInp.oninput = ()=> saveExportNote(pid, noteInp.value);
  }
  // سه چک‌باکس گزینه — پیش‌فرض خاموش
  const numCb = documentRef.getElementById('exportNumberedCb');
  const costCb = documentRef.getElementById('exportCostCb');
  const sigCb = documentRef.getElementById('exportIncludeSig');
  const sigHint = documentRef.getElementById('exportSigHint');
  if(numCb){ numCb.checked = false; numCb.onchange = ()=>{ exportMarkMode = numCb.checked ? 'number' : 'square'; }; }
  if(costCb){ costCb.checked = false; costCb.onchange = ()=>{ exportShowCost = costCb.checked; renderExportPage(); }; }
  const prof = loadProfile();
  if(sigCb){
    const canSig = !!(prof.name && prof.signature);
    sigCb.checked = false;
    sigCb.disabled = !canSig;
    if(sigHint) sigHint.textContent = canSig ? '' : 'برای امضا: منو → ثبت مشخصات';
  }
  documentRef.getElementById('exportPage').classList.remove('hidden');
  renderExportPage();
}

function renderExportPage(){
  const p = findProject(exportPid);
  if(!p) return;
  const toolbar = documentRef.getElementById('exportToolbar');
  const body = documentRef.getElementById('exportPageBody');
  toolbar.innerHTML = '';
  body.innerHTML = '';

  // همگام‌سازی وضعیت از چک‌باکس‌های ثابت
  const numCb = documentRef.getElementById('exportNumberedCb');
  const costCb = documentRef.getElementById('exportCostCb');
  if(numCb) exportMarkMode = numCb.checked ? 'number' : 'square';
  if(costCb) exportShowCost = costCb.checked;

  const allKeys = [];
  p.tasks.forEach(t=>{
    if(t.trashed || isPendingDeleted('task', exportPid, t.id) || t.done) return;
    allKeys.push('t:'+t.id);
    t.subtasks.forEach(s=>{
      if(s.trashed || isPendingDeleted('sub', exportPid, t.id, s.id) || s.done) return;
      allKeys.push('s:'+t.id+':'+s.id);
    });
  });
  const allChecked = allKeys.length > 0 && allKeys.every(k => exportSelected.has(k));

  // راست: فقط چک‌باکس انتخاب همه (آبی درشت)
  const allWrap = documentRef.createElement('label');
  allWrap.className = 'export-check-all-wrap';
  const allCb = documentRef.createElement('input');
  allCb.type = 'checkbox';
  allCb.checked = allChecked;
  allCb.onchange = ()=>{
    if(allCb.checked) allKeys.forEach(k => exportSelected.add(k));
    else exportSelected.clear();
    renderExportPage();
  };
  allWrap.appendChild(allCb);
  allWrap.appendChild(documentRef.createTextNode('همه'));
  toolbar.appendChild(allWrap);

  // چپ: PDF و JPEG
  const actionsWrap = documentRef.createElement('div');
  actionsWrap.className = 'export-actions';
  const pdfBtn = documentRef.createElement('button');
  pdfBtn.className = 'export-pdf-btn';
  pdfBtn.textContent = 'PDF';
  pdfBtn.onclick = ()=> generateProjectPdf();
  actionsWrap.appendChild(pdfBtn);
  const jpgBtn = documentRef.createElement('button');
  jpgBtn.className = 'export-jpg-btn';
  jpgBtn.textContent = 'JPEG';
  jpgBtn.onclick = ()=> generateProjectJpeg();
  actionsWrap.appendChild(jpgBtn);
  toolbar.appendChild(actionsWrap);

  if(exportShowCost){
    let sum = 0;
    p.tasks.forEach(t=>{
      if(t.trashed || isPendingDeleted('task', exportPid, t.id) || t.done) return;
      if(exportSelected.has('t:'+t.id)) sum += parseFloat(t.cost)||0;
      t.subtasks.forEach(s=>{
        if(s.trashed || isPendingDeleted('sub', exportPid, t.id, s.id) || s.done) return;
        if(exportSelected.has('s:'+t.id+':'+s.id)) sum += parseFloat(s.cost)||0;
      });
    });
    const sumEl = documentRef.createElement('div');
    sumEl.className = 'export-summary';
    sumEl.innerHTML = '<span>جمع موارد انتخاب‌شده</span><span class="cost-sum-val"><span class="cost-unit">تومان</span> '+formatCost(sum)+'</span>';
    body.appendChild(sumEl);
  }

  const tasks = p.tasks.filter(t => !t.trashed && !isPendingDeleted('task', exportPid, t.id) && !t.done);
  if(!tasks.length){
    body.appendChild(elFromHtml('<div class="mgmt-empty">مورد باز (ناتمام) برای خروجی نیست.</div>'));
    return;
  }

  tasks.forEach(t=>{
    const tKey = 't:'+t.id;
    const row = documentRef.createElement('div');
    row.className = 'export-row' + (t.done ? ' done' : '');
    const cb = documentRef.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'exp-check';
    cb.checked = exportSelected.has(tKey);
    cb.onchange = ()=>{
      if(cb.checked){
        exportSelected.add(tKey);
        t.subtasks.forEach(s=>{
          if(!s.trashed && !isPendingDeleted('sub', exportPid, t.id, s.id) && !s.done)
            exportSelected.add('s:'+t.id+':'+s.id);
        });
      } else {
        exportSelected.delete(tKey);
        t.subtasks.forEach(s=> exportSelected.delete('s:'+t.id+':'+s.id));
      }
      renderExportPage();
    };
    row.appendChild(cb);
    const bodyEl = documentRef.createElement('div');
    bodyEl.className = 'exp-body';
    const title = documentRef.createElement('div');
    title.className = 'exp-title';
    title.textContent = t.text;
    bodyEl.appendChild(title);
    row.appendChild(bodyEl);
    if(exportShowCost){
      const c = documentRef.createElement('span');
      c.className = 'row-cost';
      c.innerHTML = '<span class="cost-unit">تومان</span> '+formatCost(Number(t.cost)||0);
      row.appendChild(c);
    }
    body.appendChild(row);

    t.subtasks.filter(s => !s.trashed && !isPendingDeleted('sub', exportPid, t.id, s.id) && !s.done).forEach(s=>{
      const sKey = 's:'+t.id+':'+s.id;
      const srow = documentRef.createElement('div');
      srow.className = 'export-row sub' + (s.done ? ' done' : '');
      const scb = documentRef.createElement('input');
      scb.type = 'checkbox';
      scb.className = 'exp-check';
      scb.checked = exportSelected.has(sKey);
      scb.onchange = ()=>{
        if(scb.checked) exportSelected.add(sKey);
        else exportSelected.delete(sKey);
        renderExportPage();
      };
      srow.appendChild(scb);
      const sbody = documentRef.createElement('div');
      sbody.className = 'exp-body';
      const st = documentRef.createElement('div');
      st.className = 'exp-title';
      st.textContent = s.text;
      sbody.appendChild(st);
      srow.appendChild(sbody);
      if(exportShowCost && s.cost){
        const c = documentRef.createElement('span');
        c.className = 'row-cost';
        c.innerHTML = '<span class="cost-unit">تومان</span> '+formatCost(s.cost);
        srow.appendChild(c);
      }
      body.appendChild(srow);
    });
  });
}

function generateProjectPdf(){
  const p = findProject(exportPid);
  if(!p) return;
  if(!exportSelected.size){
    toast('حداقل یک مورد را انتخاب کنید');
    return;
  }
  const numCb = documentRef.getElementById('exportNumberedCb');
  const costCb = documentRef.getElementById('exportCostCb');
  if(numCb) exportMarkMode = numCb.checked ? 'number' : 'square';
  if(costCb) exportShowCost = costCb.checked;

  function amountHtml(n){
    if(n===null || n===undefined || n==='' || Number(n)===0) return '';
    // مثل تب پروژه: تومان سمت چپ + JetBrains Mono
    return '<span class="row-cost"><span class="cost-unit">تومان</span> '+formatCost(n)+'</span>';
  }

  // only incomplete items
  const tasks = p.tasks.filter(t => !t.trashed && !isPendingDeleted('task', exportPid, t.id) && !t.done);
  let rowsHtml = '';
  let total = 0;

  let parentNum = 0;
  tasks.forEach(t=>{
    const tKey = 't:'+t.id;
    const tOn = exportSelected.has(tKey);
    const subs = t.subtasks.filter(s => !s.trashed && !isPendingDeleted('sub', exportPid, t.id, s.id) && !s.done);
    const anySubOn = subs.some(s => exportSelected.has('s:'+t.id+':'+s.id));

    if(!tOn && !anySubOn) return;

    if(tOn){
      if(exportShowCost) total += parseFloat(t.cost)||0;
      const costCell = exportShowCost
        ? '<td class="cost-cell">'+amountHtml(t.cost!=null?t.cost:0)+'</td>'
        : '';
      // شماره فقط آیکون والد را عوض می‌کند؛ فرزندان همیشه □
      let markCell;
      if(exportMarkMode === 'number'){
        parentNum += 1;
        markCell = '<td class="mark parent-num">'+toPersianDigits(String(parentNum))+'</td>';
      } else {
        markCell = '<td class="mark parent-mark">■</td>';
      }
      rowsHtml += '<tr>'
        + markCell
        + '<td class="title parent-title">'+escapeHtml(t.text)+'</td>'
        + costCell + '</tr>';
    } else if(anySubOn){
      let markCell;
      if(exportMarkMode === 'number'){
        parentNum += 1;
        markCell = '<td class="mark parent-num">'+toPersianDigits(String(parentNum))+'</td>';
      } else {
        markCell = '<td class="mark parent-mark">■</td>';
      }
      rowsHtml += '<tr class="context">'
        + markCell
        + '<td class="title parent-title">'+escapeHtml(t.text)+'</td>'
        + (exportShowCost?'<td class="cost-cell"></td>':'') + '</tr>';
    }

    subs.forEach(s=>{
      if(!exportSelected.has('s:'+t.id+':'+s.id)) return;
      if(exportShowCost) total += parseFloat(s.cost)||0;
      const costCell = exportShowCost
        ? '<td class="cost-cell">'+(s.cost!=null&&s.cost!==''?amountHtml(s.cost):'')+'</td>'
        : '';
      rowsHtml += '<tr class="sub">'
        + '<td class="mark child-mark" style="padding-right:28px;">□</td>'
        + '<td class="title child-title">'+escapeHtml(s.text)+'</td>'
        + costCell + '</tr>';
    });
  });

  const dateStr = new Date().toLocaleDateString('fa-IR');
  const costHeader = exportShowCost
    ? '<th class="cost-head">مبلغ</th>'
    : '';
  const totalRow = exportShowCost
    ? '<tr class="total-row"><td></td><td class="title">جمع کل</td><td class="cost-cell">'+amountHtml(total)+'</td></tr>'
    : '';
  const noteText = ((documentRef.getElementById('exportNoteInput') && documentRef.getElementById('exportNoteInput').value) || '').trim();
  saveExportNote(exportPid, noteText);
  const noteHtml = noteText
    ? '<div class="pdf-note">'+escapeHtml(noteText).replace(/\n/g,'<br>')+'</div>'
    : '';
  const prof = loadProfile();
  const wantSig = documentRef.getElementById('exportIncludeSig') && documentRef.getElementById('exportIncludeSig').checked;
  const sigHtml = (wantSig && prof.signature && prof.name)
    ? '<div class="pdf-sig"><img src="'+prof.signature+'" alt="امضا"><div class="pdf-sig-name">'+escapeHtml(prof.name)+'</div></div>'
    : '';

  const doc = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><title>${escapeHtml(p.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  @page { margin: 14mm; }
  body { font-family: 'IRANYekan', IRANYekan, Vazirmatn, Tahoma, sans-serif; color: #202124; margin: 0; padding: 8px 4px; }
  .pdf-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  h1 { font-size: 20px; margin: 0; font-weight: 700; flex: 1; text-align: right; }
  .meta { font-size: 12px; color: #5f6368; margin: 0; flex-shrink: 0; text-align: left; direction: rtl; white-space: nowrap; }
  .pdf-note { margin-top: 22px; padding-top: 14px; border-top: 1px solid #e8eaed; font-size: 13.5px; line-height: 1.7; color: #00075D; white-space: pre-wrap; }
  .pdf-sig { margin-top: 28px; text-align: left; direction: ltr; }
  .pdf-sig img { max-width: 180px; max-height: 70px; object-fit: contain; display: block; margin-left: 0; }
  .pdf-sig-name { margin-top: 4px; font-size: 11px; font-weight: 500; color: #5f6368; text-align: left; direction: rtl; unicode-bidi: isolate; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: right; padding: 8px 6px; border-bottom: 2px solid #202124; font-size: 12px; color: #5f6368; font-weight: 600; }
  th.cost-head { text-align: left; direction: ltr; unicode-bidi: isolate; }
  th.cost-head .unit { font-weight: 500; margin-right: 4px; }
  td { padding: 7px 6px; vertical-align: top; border-bottom: 1px solid #e8eaed; }
  td.mark { width: 36px; text-align: center; font-size: 14px; line-height: 1.4; color: #202124; }
  td.parent-mark { font-size: 13px; }
  td.parent-num {
    font-family: 'IRANYekan', IRANYekan, Vazirmatn, Tahoma, sans-serif;
    font-size: 16px; font-weight: 700; color: #202124;
    text-align: center; width: 40px;
  }
  td.child-mark { font-size: 14px; color: #5f6368; padding-right: 28px; }
  td.title { font-size: 14px; line-height: 1.45; }
  td.parent-title { font-weight: 700; }
  td.child-title { font-size: 13.5px; padding-right: 28px; color: #3c4043; }
  td.cost-cell { text-align: left; white-space: nowrap; }
  .row-cost {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12.5px;
    font-weight: 600;
    color: #202124;
    direction: ltr;
    unicode-bidi: isolate;
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
  }
  .row-cost .cost-unit {
    font-family: 'IRANYekan', IRANYekan, Vazirmatn, Tahoma, sans-serif;
    font-size: 10px;
    font-weight: 500;
    color: #5f6368;
  }
  tr.total-row .row-cost { font-size: 14px; }
  tr.done td.title { color: #5f6368; text-decoration: line-through; }
  tr.context td.title { color: #5f6368; font-weight: 600; }
  tr.total-row td {
    border-bottom: none;
    border-top: 2px solid #202124;
    padding-top: 12px;
    font-weight: 700;
  }
  tr.total-row .amount { font-size: 16px; color: #202124; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }

  /* ---------- صورت وضعیت ---------- */
  .st-form{padding:0 0 90px;}
  .st-row{
    padding:14px 16px;background:var(--surface);border-bottom:1px solid var(--divider);
    min-height:52px;display:flex;align-items:center;
  }
  .st-row input.st-inp, .st-row textarea.st-inp{
    width:100%;border:none;outline:none;background:transparent;font-family:inherit;
    font-size:15px;color:var(--text);text-align:right;direction:rtl;
  }
  .st-row input.st-inp::placeholder, .st-row textarea.st-inp::placeholder{color:#b0b3b8;}
  .st-row textarea.st-inp{resize:none;min-height:44px;line-height:1.5;padding:0;}
  .st-row.st-tap{cursor:pointer;}
  .st-row .st-val{width:100%;font-size:15px;color:var(--text);text-align:right;}
  .st-row .st-val.placeholder{color:#b0b3b8;}
  .st-section-title{padding:12px 16px 4px;font-size:12px;color:var(--text-dim);background:var(--bg);}
  .st-pay-block{padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--divider);}
  .st-pay-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;font-size:14px;color:var(--text);}
  .st-pay-line input[type="text"]{
    flex:1;min-width:120px;border:none;border-bottom:1px solid var(--divider);outline:none;
    background:transparent;font-family:inherit;font-size:14px;padding:6px 4px;color:var(--text);
  }
  .st-pay-line label.chk{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--text);cursor:pointer;}
  .st-pay-line input[type="checkbox"]{width:18px;height:18px;accent-color:var(--green);}
  .st-save-bar{
    position:sticky;bottom:0;padding:12px 16px;background:var(--bg);
    border-top:1px solid var(--divider);display:flex;gap:10px;
  }
  .st-save-bar button{
    flex:1;border:none;border-radius:12px;padding:14px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;
  }
  .st-save-bar .st-save{background:var(--green);color:#fff;}
  .st-save-bar .st-export{background:#202124;color:#fff;}
  .jalali-pop{
    position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:80;display:flex;align-items:center;justify-content:center;padding:20px;
  }
  .jalali-pop.hidden{display:none;}
  .jalali-box{
    background:#fff;border-radius:14px;padding:14px 12px 16px;width:min(320px,100%);
    box-shadow:0 12px 40px rgba(0,0,0,.18);
  }
  .jalali-head{display:flex;align-items:center;justify-content:space-between;direction:ltr;margin-bottom:10px;color:var(--green);font-weight:700;font-size:15px;} .jalali-head span{direction:rtl;}
  .jalali-head button{border:none;background:transparent;color:var(--green);font-size:18px;cursor:pointer;padding:4px 10px;}
  .jalali-week{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:12px;color:var(--text-dim);margin-bottom:6px;}
  .jalali-days{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;}
  .jalali-days button{
    border:none;background:transparent;font-family:inherit;font-size:14px;padding:8px 0;border-radius:50%;cursor:pointer;color:var(--text);
  }
  .jalali-days button.today{font-weight:700;}
  .jalali-days button.selected{background:var(--green);color:#fff;}
  .jalali-days button.muted{color:#c4c7c5;pointer-events:none;}
  .st-list-row{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--divider);background:var(--surface);}
  .st-list-row .st-list-body{flex:1;min-width:0;}
  .st-list-row .st-list-title{font-size:15px;font-weight:600;color:var(--text);}
  .st-list-row .st-list-meta{font-size:12px;color:var(--text-dim);margin-top:3px;}

</style><meta name="karha-build" content="210">
</head><body>
  <div class="pdf-top">
    <h1>${escapeHtml(p.name)}</h1>
    <div class="meta">تاریخ: ${dateStr}</div>
  </div>
  <table>
    <thead><tr>
      <th style="width:28px;"></th>
      <th>مورد</th>
      ${costHeader}
    </tr></thead>
    <tbody>${rowsHtml}${totalRow}</tbody>
  </table>
  ${noteHtml}
  ${sigHtml}
  <script>
    window.onload = function(){
      setTimeout(function(){ window.print(); }, 450);
    };
  <\/script>


<!-- status form save action fixed: bottom above footer -->
<!-- VERSION 134 -->




<\/body><\/html>`;

  const w = window.open('', '_blank');
  if(!w){
    toast('اجازهٔ باز شدن پنجره را بدهید');
    return;
  }
  w.document.open();
  w.document.write(doc);
  w.document.close();
}

/** یک تصویر JPEG بلند از کل محتوای خروجی */
async function generateProjectJpeg(){
  const p = findProject(exportPid);
  if(!p) return;
  if(!exportSelected.size){
    toast('حداقل یک مورد را انتخاب کنید');
    return;
  }
  const numCb = documentRef.getElementById('exportNumberedCb');
  const costCb = documentRef.getElementById('exportCostCb');
  if(numCb) exportMarkMode = numCb.checked ? 'number' : 'square';
  if(costCb) exportShowCost = costCb.checked;
  if(typeof windowRef.html2canvas !== 'function'){
    toast('بارگذاری ابزار تصویر ناموفق بود — اینترنت را بررسی کنید');
    return;
  }

  function amountHtml(n){
    if(n===null || n===undefined || n==='' || Number(n)===0) return '';
    return '<span class="row-cost"><span class="cost-unit">تومان</span> '+formatCost(n)+'</span>';
  }
  const tasks = p.tasks.filter(t => !t.trashed && !isPendingDeleted('task', exportPid, t.id) && !t.done);
  let rowsHtml = '';
  let total = 0;
  let parentNum = 0;
  tasks.forEach(t=>{
    const tKey = 't:'+t.id;
    const tOn = exportSelected.has(tKey);
    const subs = t.subtasks.filter(s => !s.trashed && !isPendingDeleted('sub', exportPid, t.id, s.id) && !s.done);
    const anySubOn = subs.some(s => exportSelected.has('s:'+t.id+':'+s.id));
    if(!tOn && !anySubOn) return;
    if(tOn){
      if(exportShowCost) total += parseFloat(t.cost)||0;
      const costCell = exportShowCost ? '<td class="cost-cell">'+amountHtml(t.cost!=null?t.cost:0)+'</td>' : '';
      let markCell;
      if(exportMarkMode === 'number'){ parentNum += 1; markCell = '<td class="mark parent-num">'+toPersianDigits(String(parentNum))+'</td>'; }
      else markCell = '<td class="mark parent-mark">■</td>';
      rowsHtml += '<tr>'+markCell+'<td class="title parent-title">'+escapeHtml(t.text)+'</td>'+costCell+'</tr>';
    } else if(anySubOn){
      let markCell;
      if(exportMarkMode === 'number'){ parentNum += 1; markCell = '<td class="mark parent-num">'+toPersianDigits(String(parentNum))+'</td>'; }
      else markCell = '<td class="mark parent-mark">■</td>';
      rowsHtml += '<tr class="context">'+markCell+'<td class="title parent-title">'+escapeHtml(t.text)+'</td>'+(exportShowCost?'<td class="cost-cell"></td>':'')+'</tr>';
    }
    subs.forEach(s=>{
      if(!exportSelected.has('s:'+t.id+':'+s.id)) return;
      if(exportShowCost) total += parseFloat(s.cost)||0;
      const costCell = exportShowCost ? '<td class="cost-cell">'+(s.cost!=null&&s.cost!==''?amountHtml(s.cost):'')+'</td>' : '';
      rowsHtml += '<tr class="sub"><td class="mark child-mark" style="padding-right:28px;">□</td><td class="title child-title">'+escapeHtml(s.text)+'</td>'+costCell+'</tr>';
    });
  });
  const dateStr = new Date().toLocaleDateString('fa-IR');
  const costHeader = exportShowCost ? '<th class="cost-head">مبلغ</th>' : '';
  const totalRow = exportShowCost ? '<tr class="total-row"><td></td><td class="title">جمع کل</td><td class="cost-cell">'+amountHtml(total)+'</td></tr>' : '';
  const noteText = ((documentRef.getElementById('exportNoteInput') && documentRef.getElementById('exportNoteInput').value) || '').trim();
  saveExportNote(exportPid, noteText);
  const noteHtml = noteText ? '<div class="pdf-note">'+escapeHtml(noteText).replace(/\n/g,'<br>')+'</div>' : '';
  const prof = loadProfile();
  const wantSig = documentRef.getElementById('exportIncludeSig') && documentRef.getElementById('exportIncludeSig').checked;
  const sigHtml = (wantSig && prof.signature && prof.name)
    ? '<div class="pdf-sig"><img src="'+prof.signature+'" alt="امضا"><div class="pdf-sig-name">'+escapeHtml(prof.name)+'</div></div>'
    : '';

  const wrap = documentRef.createElement('div');
  wrap.id = 'jpegExportCapture';
  wrap.setAttribute('dir', 'rtl');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;padding:28px 24px;background:#fff;color:#202124;font-family:Vazirmatn,Tahoma,sans-serif;box-sizing:border-box;z-index:-1;';
  wrap.innerHTML = `
    <style>
      #jpegExportCapture .pdf-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;}
      #jpegExportCapture h1{font-size:22px;margin:0;font-weight:700;flex:1;text-align:right;}
      #jpegExportCapture .meta{font-size:13px;color:#5f6368;margin:0;white-space:nowrap;}
      #jpegExportCapture table{width:100%;border-collapse:collapse;}
      #jpegExportCapture th{text-align:right;padding:8px 6px;border-bottom:2px solid #202124;font-size:12px;color:#5f6368;}
      #jpegExportCapture th.cost-head{text-align:left;}
      #jpegExportCapture td{padding:8px 6px;vertical-align:top;border-bottom:1px solid #e8eaed;font-size:14px;}
      #jpegExportCapture td.mark{width:40px;text-align:center;}
      #jpegExportCapture td.parent-num{font-size:16px;font-weight:700;}
      #jpegExportCapture td.parent-title{font-weight:700;}
      #jpegExportCapture td.child-title{font-size:13.5px;padding-right:28px;color:#3c4043;}
      #jpegExportCapture td.cost-cell{text-align:left;white-space:nowrap;}
      #jpegExportCapture .row-cost{font-family:JetBrains Mono,monospace;font-size:12.5px;font-weight:600;direction:ltr;unicode-bidi:isolate;display:inline-flex;gap:4px;align-items:baseline;}
      #jpegExportCapture .cost-unit{font-family:Vazirmatn,Tahoma,sans-serif;font-size:10px;font-weight:500;color:#5f6368;}
      #jpegExportCapture tr.total-row td{border-bottom:none;border-top:2px solid #202124;padding-top:12px;font-weight:700;}
      #jpegExportCapture .pdf-note{margin-top:22px;padding-top:14px;border-top:1px solid #e8eaed;font-size:13.5px;line-height:1.7;color:#00075D;white-space:pre-wrap;}
      #jpegExportCapture .pdf-sig{margin-top:28px;text-align:left;direction:ltr;}
      #jpegExportCapture .pdf-sig img{max-width:180px;max-height:70px;object-fit:contain;display:block;}
      #jpegExportCapture .pdf-sig-name{margin-top:4px;font-size:11px;font-weight:500;color:#5f6368;text-align:left;direction:rtl;unicode-bidi:isolate;}
    
  /* ---------- صورت وضعیت ---------- */
  .st-form{padding:0 0 90px;}
  .st-row{
    padding:14px 16px;background:var(--surface);border-bottom:1px solid var(--divider);
    min-height:52px;display:flex;align-items:center;
  }
  .st-row input.st-inp, .st-row textarea.st-inp{
    width:100%;border:none;outline:none;background:transparent;font-family:inherit;
    font-size:15px;color:var(--text);text-align:right;direction:rtl;
  }
  .st-row input.st-inp::placeholder, .st-row textarea.st-inp::placeholder{color:#b0b3b8;}
  .st-row textarea.st-inp{resize:none;min-height:44px;line-height:1.5;padding:0;}
  .st-row.st-tap{cursor:pointer;}
  .st-row .st-val{width:100%;font-size:15px;color:var(--text);text-align:right;}
  .st-row .st-val.placeholder{color:#b0b3b8;}
  .st-section-title{padding:12px 16px 4px;font-size:12px;color:var(--text-dim);background:var(--bg);}
  .st-pay-block{padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--divider);}
  .st-pay-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;font-size:14px;color:var(--text);}
  .st-pay-line input[type="text"]{
    flex:1;min-width:120px;border:none;border-bottom:1px solid var(--divider);outline:none;
    background:transparent;font-family:inherit;font-size:14px;padding:6px 4px;color:var(--text);
  }
  .st-pay-line label.chk{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--text);cursor:pointer;}
  .st-pay-line input[type="checkbox"]{width:18px;height:18px;accent-color:var(--green);}
  .st-save-bar{
    position:sticky;bottom:0;padding:12px 16px;background:var(--bg);
    border-top:1px solid var(--divider);display:flex;gap:10px;
  }
  .st-save-bar button{
    flex:1;border:none;border-radius:12px;padding:14px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;
  }
  .st-save-bar .st-save{background:var(--green);color:#fff;}
  .st-save-bar .st-export{background:#202124;color:#fff;}
  .jalali-pop{
    position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:80;display:flex;align-items:center;justify-content:center;padding:20px;
  }
  .jalali-pop.hidden{display:none;}
  .jalali-box{
    background:#fff;border-radius:14px;padding:14px 12px 16px;width:min(320px,100%);
    box-shadow:0 12px 40px rgba(0,0,0,.18);
  }
  .jalali-head{display:flex;align-items:center;justify-content:space-between;direction:ltr;margin-bottom:10px;color:var(--green);font-weight:700;font-size:15px;} .jalali-head span{direction:rtl;}
  .jalali-head button{border:none;background:transparent;color:var(--green);font-size:18px;cursor:pointer;padding:4px 10px;}
  .jalali-week{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:12px;color:var(--text-dim);margin-bottom:6px;}
  .jalali-days{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;}
  .jalali-days button{
    border:none;background:transparent;font-family:inherit;font-size:14px;padding:8px 0;border-radius:50%;cursor:pointer;color:var(--text);
  }
  .jalali-days button.today{font-weight:700;}
  .jalali-days button.selected{background:var(--green);color:#fff;}
  .jalali-days button.muted{color:#c4c7c5;pointer-events:none;}
  .st-list-row{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--divider);background:var(--surface);}
  .st-list-row .st-list-body{flex:1;min-width:0;}
  .st-list-row .st-list-title{font-size:15px;font-weight:600;color:var(--text);}
  .st-list-row .st-list-meta{font-size:12px;color:var(--text-dim);margin-top:3px;}

</style>
    <div class="pdf-top"><h1>${escapeHtml(p.name)}</h1><div class="meta">تاریخ: ${dateStr}</div></div>
    <table><thead><tr><th style="width:28px;"></th><th>مورد</th>${costHeader}</tr></thead>
    <tbody>${rowsHtml}${totalRow}</tbody></table>
    ${noteHtml}${sigHtml}`;
  documentRef.body.appendChild(wrap);

  toast('در حال ساخت تصویر…');
  try{
    // صبر کوتاه برای لود فونت/تصویر امضا
    await new Promise(r => setTimeout(r, 200));
    const canvas = await windowRef.html2canvas(wrap, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: 800
    });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const a = documentRef.createElement('a');
    const safeName = (p.name || 'export').replace(/[\/:*?"<>|]/g, '_').slice(0, 40);
    a.href = dataUrl;
    a.download = safeName + '.jpg';
    documentRef.body.appendChild(a);
    a.click();
    a.remove();
    toast('تصویر JPEG ذخیره شد');
  }catch(err){
    console.error(err);
    toast('ساخت تصویر ناموفق بود');
  }finally{
    wrap.remove();
  }
}


function escapeHtml(str){
  return String(str||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}




  const api = Object.freeze({
    openExportPage,
    renderExportPage,
    generateProjectPdf: typeof generateProjectPdf === 'function' ? generateProjectPdf : async function(){},
    generateProjectJpeg: typeof generateProjectJpeg === 'function' ? generateProjectJpeg : async function(){},
  });
  windowRef.KarhaExportView = api;
  // also expose for legacy thin shims
  windowRef.openExportPage = openExportPage;
  return api;
}

export default { installExportView };
