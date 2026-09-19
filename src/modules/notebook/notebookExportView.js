import { loadProfile } from '../profile/profileStore.js';
import { showToast } from '../../ui/toast.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);

export function flattenNotebookItems(items, parents = [], rows = []){
  for(const item of items || []){
    if(item.trashed || item.done) continue;
    const path = parents.map(parent => parent.text);
    rows.push({ key:item.id, item, depth:parents.length, path });
    flattenNotebookItems(item.children || [], parents.concat(item), rows);
  }
  return rows;
}

function numbering(rows){
  const counters=[];
  return new Map(rows.map(row => {
    counters.length=row.depth+1;
    counters[row.depth]=(counters[row.depth] || 0)+1;
    for(let i=row.depth+1;i<counters.length;i++) counters[i]=0;
    return [row.key,counters.join('.')];
  }));
}

export function installNotebookExportView({documentRef=globalThis.document,windowRef=globalThis.window}={}){
  const page=documentRef?.getElementById?.('notebookExportPage');
  if(!page) return {open(){return false;}};
  let list=null, selected=new Set(), returnFocus=null;
  const els=()=>({
    title:documentRef.getElementById('notebookExportTitle'), toolbar:documentRef.getElementById('notebookExportToolbar'),
    body:documentRef.getElementById('notebookExportBody'), numbered:documentRef.getElementById('notebookExportNumbered'),
    cost:documentRef.getElementById('notebookExportCost'), signature:documentRef.getElementById('notebookExportSignature'),
    signatureHint:documentRef.getElementById('notebookExportSignatureHint'), note:documentRef.getElementById('notebookExportNote'),
    close:documentRef.getElementById('closeNotebookExportPage'),
  });
  const rows=()=>flattenNotebookItems(list?.items || []);
  const close=()=>{
    page.classList.add('hidden');
    if(/^#\/notebook\/export/i.test(String(windowRef.location?.hash||''))) windowRef.location.hash='#/notebook';
    else returnFocus?.focus?.();
  };
  const notify=message=>showToast(message,{documentRef});

  function selectedRows(){return rows().filter(row=>selected.has(row.key));}
  function buildDocument(){
    const e=els(), chosen=selectedRows(), nums=numbering(chosen), showCost=!!e.cost?.checked;
    let total=0;
    const body=chosen.map(row=>{
      const amount=Number(row.item.cost)||0; total+=showCost?amount:0;
      const mark=e.numbered?.checked?esc(nums.get(row.key)):'□';
      return `<tr><td class="mark">${mark}</td><td class="title" style="padding-right:${row.depth*18+6}px">${esc(row.item.text)}</td>${showCost?`<td class="cost">${money(amount)} <small>تومان</small></td>`:''}</tr>`;
    }).join('');
    const profile=loadProfile(), includeSignature=!!e.signature?.checked;
    const signature=includeSignature&&profile.name&&profile.signature?`<div class="signature"><img src="${profile.signature}" alt="امضا"><span>${esc(profile.name)}</span></div>`:'';
    const note=String(e.note?.value||'').trim();
    return `<section class="nb-export-document" dir="rtl"><header><h1>${esc(list.title)}</h1><time>${new Intl.DateTimeFormat('fa-IR').format(new Date())}</time></header><table><thead><tr><th></th><th>مورد</th>${showCost?'<th class="cost">هزینه</th>':''}</tr></thead><tbody>${body}${showCost?`<tr class="total"><td></td><td>جمع کل</td><td class="cost">${money(total)} <small>تومان</small></td></tr>`:''}</tbody></table>${note?`<p class="note">${esc(note)}</p>`:''}${signature}</section>`;
  }
  const documentStyles=`body{font-family:Vazirmatn,Tahoma,sans-serif;color:#202124;margin:0;padding:14mm;direction:rtl}.nb-export-document header{display:flex;justify-content:space-between;align-items:start;margin-bottom:18px}.nb-export-document h1{font-size:21px;margin:0}.nb-export-document time{font-size:12px;color:#666}.nb-export-document table{width:100%;border-collapse:collapse}.nb-export-document th,.nb-export-document td{padding:8px 6px;border-bottom:1px solid #ddd;text-align:right}.nb-export-document th{border-bottom:2px solid #333;color:#666;font-size:12px}.nb-export-document .mark{width:42px;text-align:center}.nb-export-document .cost{text-align:left;white-space:nowrap}.nb-export-document small{font-size:10px;color:#666}.nb-export-document .total td{font-weight:700;border-top:2px solid #333}.nb-export-document .note{white-space:pre-wrap;margin-top:24px;padding-top:14px;border-top:1px solid #ddd}.nb-export-document .signature{margin-top:30px;text-align:left;display:flex;flex-direction:column;align-items:flex-start}.nb-export-document .signature img{max-width:180px;max-height:75px;object-fit:contain}.nb-export-document .signature span{font-size:11px;color:#666}`;

  function printPdf(){
    if(!selected.size){notify('حداقل یک مورد را انتخاب کنید');return;}
    const popup=windowRef.open?.('','_blank');
    if(!popup){notify('پنجره چاپ توسط مرورگر مسدود شد');return;}
    popup.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(list.title)}</title><style>@page{margin:0}${documentStyles}</style></head><body>${buildDocument()}<script>onload=()=>setTimeout(()=>print(),250)<\/script></body></html>`);
    popup.document.close();
  }
  async function saveJpeg(){
    if(!selected.size){notify('حداقل یک مورد را انتخاب کنید');return;}
    if(typeof windowRef.html2canvas!=='function'){notify('ابزار ساخت تصویر آماده نیست');return;}
    const capture=documentRef.createElement('div');
    capture.className='nb-export-capture';
    capture.innerHTML=`<style>${documentStyles}</style>${buildDocument()}`;
    documentRef.body.appendChild(capture);
    try{
      const canvas=await windowRef.html2canvas(capture,{scale:2,backgroundColor:'#fff',useCORS:true,logging:false,windowWidth:800});
      const link=documentRef.createElement('a'); link.href=canvas.toDataURL('image/jpeg',.92); link.download=`${list.title||'notebook'}.jpg`; link.click();
      notify('تصویر JPEG ذخیره شد');
    }catch(error){console.error(error);notify('ساخت تصویر ناموفق بود');}finally{capture.remove();}
  }
  function render(){
    const e=els(), all=rows(), allOn=all.length>0&&all.every(row=>selected.has(row.key));
    e.toolbar.replaceChildren();
    const selectAll=documentRef.createElement('label');selectAll.className='export-check-all-wrap';selectAll.innerHTML=`<input type="checkbox" ${allOn?'checked':''}> انتخاب همه`;
    selectAll.querySelector('input').onchange=event=>{selected=event.target.checked?new Set(all.map(row=>row.key)):new Set();render();};
    const actions=documentRef.createElement('div');actions.className='export-actions';
    const pdf=documentRef.createElement('button');pdf.className='export-pdf-btn';pdf.textContent='PDF';pdf.onclick=printPdf;
    const jpeg=documentRef.createElement('button');jpeg.className='export-jpg-btn';jpeg.textContent='JPEG';jpeg.onclick=saveJpeg;
    actions.append(pdf,jpeg);e.toolbar.append(selectAll,actions);
    e.body.innerHTML=all.length?all.map(row=>`<label class="export-row ${row.depth?'sub':''}" style="--export-depth:${row.depth}"><input type="checkbox" data-export-key="${esc(row.key)}" ${selected.has(row.key)?'checked':''}><span>${esc(row.item.text)}</span>${e.cost.checked&&row.item.cost!=null?`<span class="row-cost">${money(row.item.cost)} <small>تومان</small></span>`:''}</label>`).join(''):'<div class="mgmt-empty">مورد بازی برای خروجی وجود ندارد.</div>';
    e.body.querySelectorAll('[data-export-key]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.exportKey):selected.delete(input.dataset.exportKey);render();});
  }
  function open(nextList,{trigger=null}={}){
    if(!nextList)return false; list=nextList;returnFocus=trigger;selected=new Set(rows().map(row=>row.key));
    const e=els(), profile=loadProfile();e.title.textContent=`خروجی: ${list.title}`;e.numbered.checked=false;e.cost.checked=false;e.signature.checked=false;e.signature.disabled=!(profile.name&&profile.signature);e.signatureHint.textContent=e.signature.disabled?'برای امضا: منو ← ثبت مشخصات':'';e.note.value='';
    e.numbered.onchange=render;e.cost.onchange=render;e.close.onclick=close;page.classList.remove('hidden');render();return true;
  }
  return {open,close,render,printPdf,saveJpeg};
}
