import { assignWorksToBuckets, buildBuckets, collectPlannedWorks, COSTLINE_RANGES, jalaliDayNumber, jalaliFromDay, WEEKDAYS } from '../../domain/wbs/costline.js';
import { allocationsOf, fundingReceiptsOf, poolReceived, poolRemaining } from '../../domain/wbs/fundingReceipts.js';
import { toPersianDigits } from '../../ui/digits.js';
import { installNotebookExportView } from '../notebook/notebookExportView.js';

const ranges = [...COSTLINE_RANGES.slice(0,4), {id:'month2',label:'دوماهه'}, ...COSTLINE_RANGES.slice(4)];
const money = value => new Intl.NumberFormat('fa-IR').format(value);
const date = day => toPersianDigits(jalaliFromDay(day));
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const table = (headers, rows) => `<table><thead><tr>${headers.map(value=>`<th>${esc(value)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const costs = (need, allocated) => [money(need),money(allocated),money(Math.max(0,need-allocated))];
const columns = ['موردنیاز (تومان)','تخصیص‌یافته (تومان)','کسری (تومان)'];
const styles = `@page{size:A4 landscape}body{padding:10mm 12mm}.cost-report h2{font-size:16px;margin:8px 0}.cost-report p{margin:6px 0}
.cost-report table{font-size:11px;table-layout:auto}.cost-report td{overflow-wrap:anywhere}.cost-report th,.cost-report td{padding:4px 6px}
.cost-report thead{display:table-header-group}.cost-report tr,.signature{break-inside:avoid}
.cost-report .cost-summary+.cost-summary,.cost-report .cost-appendix{break-before:page}
.cost-report svg{width:100%;height:56mm;display:block}.cost-report .cost-legend{font-size:12px}
.cost-report .cost-legend b{color:#0d4484}.cost-report .cost-legend span{color:#496989}
.signature{margin-top:12mm;text-align:left}.signature img{display:block;margin-right:auto;max-width:45mm;max-height:20mm}.signature span{font-size:11px}`;

function chart(buckets,max){
  const width=900, step=820/buckets.length, base=168;
  const ticks=[0,.25,.5,.75,1].map(ratio=>{
    const y=base-ratio*140;
    return `<path d="M64 ${y}H890" stroke="#ddd"/><text x="59" y="${y+4}" text-anchor="end">${money(Math.round(max*ratio/1000000*100)/100)}</text>`;
  }).join('');
  const bars=buckets.map((bucket,index)=>{
    const x=64+step*(buckets.length-index-.5);
    const need=140*bucket.total/max, funded=140*bucket.allocated/max;
    return `<rect x="${x-19}" y="${base-need}" width="38" height="${need}" fill="#8ca9c8"/>
<rect x="${x-19}" y="${base-funded}" width="38" height="${funded}" fill="#0d4484"/>
<text x="${x}" y="188" text-anchor="middle">${esc(bucket.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} 195" role="img" aria-label="نمودار برآورد هزینه" font-size="11" fill="#202124">${ticks}${bars}</svg>`;
}

export function costlineDocument(project,{rangeId,originWeekday,start,end,details,receipts}){
  const works=collectPlannedWorks(project.tasks,{includeUndated:true});
  const dated=works.filter(work=>jalaliDayNumber(work.start)!=null);
  const buckets=assignWorksToBuckets(buildBuckets({rangeId,originWeekday,works:dated})
    .filter(bucket=>bucket.startDay<=end && bucket.endDay>=start)
    .map(bucket=>({...bucket,startDay:Math.max(start,bucket.startDay),endDay:Math.min(end,bucket.endDay)})),dated);
  const allocations=new Map();
  for(const row of allocationsOf(project)){
    const key=String(row.taskId);
    if(!allocations.has(key)) allocations.set(key,[]);
    allocations.get(key).push(row);
  }
  for(const bucket of buckets){
    bucket.label=`${date(bucket.startDay)} تا ${date(bucket.endDay)}`;
    for(const work of bucket.works){
      work.allocated=(allocations.get(String(work.id))||[]).reduce((sum,row)=>{
        const day=row.day;
        return day!=null && day>=bucket.startDay && day<=bucket.endDay ? sum+row.amount : sum;
      },0);
    }
    bucket.allocated=bucket.works.reduce((sum,work)=>sum+Math.min(work.sliceAmount,work.allocated),0);
  }
  const need=buckets.reduce((sum,bucket)=>sum+bucket.total,0);
  const allocated=buckets.reduce((sum,bucket)=>sum+bucket.allocated,0);
  const range=ranges.find(item=>item.id===rangeId);
  const title=`<h1>گزارش برآورد هزینه و تأمین بودجه | ${esc(project.name)}</h1>
<p>تاریخ تهیه ${new Intl.DateTimeFormat('fa-IR').format(new Date())} | ${esc(range?.label)}${range?.days>1 ? ` | مبدأ ${WEEKDAYS[originWeekday]}` : ''}${Number.isFinite(start)&&Number.isFinite(end)?` | ${date(start)} تا ${date(end)}`:''}</p>`;
  let html=`<article class="nb-export-document cost-report">`;
  const max=Math.max(1,...buckets.map(bucket=>bucket.total));
  for(let i=0;i<buckets.length;i+=6){
    const group=buckets.slice(i,i+6);
    html+=`<section class="cost-summary">${title}
${i===0?table(columns,[costs(need,allocated)]):''}
<p class="cost-legend">محور عمودی به میلیون تومان · <b>آبی تیره: تخصیص‌یافته</b> · <span>آبی روشن: کسری</span></p>
${chart(group,max)}
${table(['دوره',...columns],group.map(bucket=>[bucket.label,...costs(bucket.total,bucket.allocated)]))}</section>`;
  }
  if(!buckets.length) html+=title+'<p>در این بازه برآورد دوره‌ای وجود ندارد.</p>';
  const undated=works.filter(work=>jalaliDayNumber(work.start)==null);
  if(undated.length) html+=`<section><h2>برآوردهای بدون تاریخ شروع</h2>${table(['مسیر کار','نام کار','برآورد کل (تومان)'],undated.map(work=>[work.path,work.text,money(work.amount)]))}</section>`;
  if(details && buckets.some(bucket=>bucket.works.length)) html+=`<section class="cost-appendix"><h2>ریز کارها به تفکیک دوره</h2>${buckets.filter(bucket=>bucket.works.length).map(bucket=>`<h2>${bucket.label}</h2>${table(['مسیر درخت','نام کار','زمان کار',...columns],bucket.works.map(work=>[work.path,work.text,toPersianDigits([work.start,work.end].filter(Boolean).join(' تا ')),...costs(work.sliceAmount,Math.min(work.sliceAmount,work.allocated))]))}`).join('')}</section>`;
  if(receipts) html+=`<section class="cost-appendix"><h2>دریافتی‌های کل پروژه</h2>${table(['شماره','تاریخ','مبلغ (تومان)'],fundingReceiptsOf(project).map((receipt,index)=>[money(index+1),toPersianDigits(receipt.depositDate||'—'),money(receipt.amount)]))}
<p>مجموع دریافتی ${money(poolReceived(project))} تومان · ماندهٔ تخصیص‌نیافته ${money(poolRemaining(project))} تومان</p></section>`;
  return html+'</article>';
}

let view, controls;

export function openCostlineExport(project,{rangeId,originWeekday,trigger}){
  if(!view){
    const source=document.getElementById('notebookExportPage');
    if(!source) return false;
    const page=source.cloneNode(true);
    page.id='costlineExportPage';
    page.innerHTML=page.innerHTML.replaceAll('notebookExport','costlineExport');
    page.querySelector('.export-note-wrap').hidden=true;
    controls=document.createElement('div');
    controls.className='export-options';
    controls.innerHTML=`<label>از تاریخ <button type="button" data-start></button></label>
<label>تا تاریخ <button type="button" data-end></button></label>
<label>مقیاس <select data-range>${ranges.map(range=>`<option value="${range.id}">${range.label}</option>`).join('')}</select></label>
<label>مبدأ دورهٔ پرداخت <select data-origin>${WEEKDAYS.map((day,index)=>`<option value="${index}">${day}</option>`).join('')}</select></label>
<label><input type="checkbox" data-details> ریز کارها</label><label><input type="checkbox" data-receipts> دریافتی‌ها</label>`;
    page.querySelector('.export-options').after(controls);
    const back=document.createElement('button');
    back.type='button';
    back.className='inner-section-back';
    back.textContent='بازگشت';
    back.onclick=()=>view.close();
    page.querySelector('.page-head').prepend(back);
    document.body.appendChild(page);
    view=installNotebookExportView({
      idPrefix:'costlineExport', historyKey:'costline-export', pdfOnly:true, extraStyles:styles,
      documentBuilder:({project,settings})=>costlineDocument(project,settings()),
    });
  }
  const works=collectPlannedWorks(project.tasks);
  const full=buildBuckets({rangeId,originWeekday,works});
  const startButton=controls.querySelector('[data-start]'), endButton=controls.querySelector('[data-end]');
  const range=controls.querySelector('[data-range]'), origin=controls.querySelector('[data-origin]');
  const details=controls.querySelector('[data-details]'), receipts=controls.querySelector('[data-receipts]');
  let start=full[0]?.startDay ?? -Infinity, end=full.at(-1)?.endDay ?? Infinity;
  const paint=()=>{
    startButton.textContent=Number.isFinite(start)?date(start):'انتخاب کنید';
    endButton.textContent=Number.isFinite(end)?date(end):'انتخاب کنید';
    origin.disabled=!(ranges.find(item=>item.id===range.value)?.days>1);
  };
  const selectDate=(value,apply)=>window.KarhaUI?.openJalaliPicker?.(Number.isFinite(value)?jalaliFromDay(value):'',next=>{
    const day=jalaliDayNumber(next);
    if(day!=null) apply(day);
    paint();
  });
  startButton.onclick=()=>selectDate(start,day=>{start=day;end=Math.max(end,day);});
  endButton.onclick=()=>selectDate(end,day=>{end=day;start=Math.min(start,day);});
  range.value=rangeId;origin.value=String(originWeekday);
  range.onchange=paint;details.checked=false;receipts.checked=false;paint();
  return view.open({title:'خروجی برآورد هزینه | '+project.name,project,
    settings:()=>({rangeId:range.value,originWeekday:Number(origin.value),start,end,details:details.checked,receipts:receipts.checked}),
  },{trigger});
}
