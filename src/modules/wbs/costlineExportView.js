import { assignWorksToBuckets, buildBuckets, collectPlannedWorks, COSTLINE_RANGES, jalaliDayNumber, jalaliFromDay, WEEKDAYS } from '../../domain/wbs/costline.js';
import { firstFundingShortage, fundingCoverage, fundingReceiptsOf, poolReceived, poolRemaining } from '../../domain/wbs/fundingReceipts.js';
import { formatJalaliDisplay, JALALI_MONTHS, todayJalaliStr } from '../../ui/jalali.js';
import { toPersianDigits } from '../../ui/digits.js';
import { installNotebookExportView } from '../notebook/notebookExportView.js';

const ranges = [...COSTLINE_RANGES.slice(0,4), {id:'month2',label:'دوماهه'}, ...COSTLINE_RANGES.slice(4)];
const money = value => new Intl.NumberFormat('fa-IR').format(value);
const date = day => toPersianDigits(jalaliFromDay(day));
const dateParts = day => {
  if(!Number.isFinite(day)) return null;
  const [year,month,dayOfMonth]=jalaliFromDay(day).split('/').map(Number);
  return {year,month,dayOfMonth};
};
const dayAndMonth = ({dayOfMonth,month}) => `${money(dayOfMonth)} ${JALALI_MONTHS[month-1]}`;
function reportDateRange(start,end,{includeYear=true}={}){
  const first=dateParts(start), last=dateParts(end);
  if(!first && !last) return '—';
  const full=parts=>`${dayAndMonth(parts)} ${toPersianDigits(parts.year)}`;
  if(!first || !last || start===end) return includeYear?full(first||last):dayAndMonth(first||last);
  if(first.year!==last.year) return `${full(first)} تا ${full(last)}`;
  const from=first.month===last.month?money(first.dayOfMonth):dayAndMonth(first);
  return `${from} تا ${dayAndMonth(last)}${includeYear?` ${toPersianDigits(last.year)}`:''}`;
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const table = (headers, rows, total) => `<table><thead><tr>${headers.map(value=>`<th>${esc(value)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}${total?`<tr class="cost-total"><th scope="row" colspan="${headers.length-total.length+1}">${esc(total[0])}</th>${total.slice(1).map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`:''}</tbody></table>`;
const costs = (need, allocated) => [money(need),money(allocated),money(Math.max(0,need-allocated))];
const columns = ['موردنیاز (تومان)','تخصیص‌یافته (تومان)','کسری (تومان)'];
const detailColumns = ['موردنیاز در این دوره (تومان)','تخصیص‌یافته در این دوره (تومان)','کسری این دوره (تومان)'];
const workFunding = work => Math.min(work.sliceAmount,work.allocated);

const detailRows = works => works.map(work=>[work.path,work.shortageDay==null?work.text:`${work.text} · شروع کسری این دوره ${reportDateRange(work.shortageDay,null)}`,reportDateRange(jalaliDayNumber(work.start),jalaliDayNumber(work.end)),...costs(work.sliceAmount,workFunding(work))]);

function packageRows(works){
  const packages=new Map();
  for(const work of works){
    const name=work.path.split(' ← ')[0] || 'بدون بستهٔ کاری';
    const totals=packages.get(name) || {need:0,allocated:0};
    totals.need+=work.sliceAmount;
    totals.allocated+=workFunding(work);
    packages.set(name,totals);
  }
  return Array.from(packages,([name,totals])=>[name,...costs(totals.need,totals.allocated)]);
}

const styles = `@page{size:A4 portrait;margin:15mm}
@media print{
  body{padding:0}
  body::before{content:'';position:fixed;inset:-5mm;box-sizing:border-box;border:1px solid #777;pointer-events:none}
}
@media screen{body{padding:10mm 12mm}}
.cost-report h1{text-align:center}
.cost-report .cost-meta{display:flex;justify-content:space-between;gap:12px}
.cost-report .cost-report-range{text-align:left}
.cost-report h2{font-size:16px;margin:14px 0 3px;break-after:avoid}
.cost-report section:not(.cost-packages)>h2:first-child{margin-top:0}
.cost-report h2+table{margin-top:0}.cost-report p{margin:6px 0}
.cost-report table{font-size:11px;table-layout:auto}.cost-report td{overflow-wrap:anywhere}.cost-report th,.cost-report td{padding:4px 6px}
.cost-report .cost-total th,.cost-report .cost-total td{background:#eef3f8;font-weight:700}
.cost-report .cost-details table{border-collapse:separate;border-spacing:0}
.cost-report .cost-details thead th{border-bottom:0}
.cost-report .cost-details .cost-total > *{border-bottom:1px solid #ddd}
.cost-report thead{display:table-header-group}.cost-report tr,.signature{break-inside:avoid}
.cost-report .cost-summary+.cost-summary,.cost-report .cost-appendix{break-before:page}
.cost-report .cost-summary svg+table{margin-top:5mm}
.cost-report svg{width:100%;height:56mm;display:block}.cost-report .cost-legend{font-size:12px}
.cost-report .cost-legend b{color:#0d4484}.cost-report .cost-legend span{color:#496989}
.signature{margin-top:12mm;text-align:left}.signature img{display:block;margin-right:auto;max-width:45mm;max-height:20mm}.signature span{font-size:11px}`;

function chart(buckets,max,sharedYear){
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
<text x="${x}" y="188" text-anchor="middle">${esc(reportDateRange(bucket.startDay,bucket.endDay,{includeYear:!sharedYear}))}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} 195" role="img" aria-label="نمودار برآورد هزینه" font-size="11" fill="#202124">${ticks}${bars}</svg>`;
}

export function costlineDocument(project,{rangeId,originWeekday,start,end,details,receipts}){
  const works=collectPlannedWorks(project.tasks,{includeUndated:true});
  const dated=works.filter(work=>jalaliDayNumber(work.start)!=null);
  const allBuckets=assignWorksToBuckets(buildBuckets({rangeId,originWeekday,works:dated})
    .filter(bucket=>bucket.startDay<=end && bucket.endDay>=start)
    .map(bucket=>({...bucket,startDay:Math.max(start,bucket.startDay),endDay:Math.min(end,bucket.endDay)})),dated);
  const coveredIn=fundingCoverage(project);
  for(const bucket of allBuckets){
    bucket.label=reportDateRange(bucket.startDay,bucket.endDay);
    for(const work of bucket.works){
      work.allocated=coveredIn(work.id,bucket);
      work.shortageDay=firstFundingShortage(work,bucket,work.allocated);
    }
    bucket.allocated=bucket.works.reduce((sum,work)=>sum+workFunding(work),0);
  }
  const buckets=allBuckets.filter(bucket=>bucket.total!==0 || bucket.allocated!==0);
  const need=buckets.reduce((sum,bucket)=>sum+bucket.total,0);
  const allocated=buckets.reduce((sum,bucket)=>sum+bucket.allocated,0);
  const range=ranges.find(item=>item.id===rangeId);
  const title=`<h1>گزارش برآورد هزینه و تأمین بودجه ${esc(project.name)}</h1>
<div class="cost-meta"><p>تاریخ تهیه ${esc(formatJalaliDisplay(todayJalaliStr()))} | ${rangeId==='week2'?'دوره‌های دوهفته‌ای':esc(range?.label)}${range?.days>1 ? ` | مبدأ ${WEEKDAYS[originWeekday]}` : ''}</p>
${Number.isFinite(start)&&Number.isFinite(end)?`<p class="cost-report-range">بازهٔ گزارش ${reportDateRange(start,end)}</p>`:''}</div>`;
  let html=`<article class="nb-export-document cost-report">`;
  const max=Math.max(1,...buckets.map(bucket=>bucket.total));
  let cumulative=0;
  for(let i=0;i<buckets.length;i+=6){
    const group=buckets.slice(i,i+6);
    const year=dateParts(group[0].startDay).year;
    const chartYear=group.every(bucket=>dateParts(bucket.startDay).year===year && dateParts(bucket.endDay).year===year)?year:null;
    const rows=group.map(bucket=>{
      cumulative+=bucket.allocated;
      return [bucket.label,...costs(bucket.total,bucket.allocated),money(cumulative)];
    });
    html+=`<section class="cost-summary">${title}
${i===0?'<h2>جمع بازهٔ انتخاب‌شده</h2>'+table(['بستهٔ کاری',...columns],packageRows(buckets.flatMap(bucket=>bucket.works)),['جمع کل بازه',...costs(need,allocated)]):''}
<p class="cost-legend">محور عمودی به میلیون تومان · <b>آبی تیره: تخصیص‌یافته</b> · <span>آبی روشن: کسری</span></p>
${chartYear?`<p>سال ${toPersianDigits(chartYear)}</p>`:''}
${chart(group,max,chartYear)}
${table(['دوره',...columns,'تخصیص تجمعی (تومان)'],rows,i+group.length===buckets.length?['جمع کل بازه',...costs(need,allocated),money(allocated)]:null)}</section>`;
  }
  if(!buckets.length) html+=title+'<p>در این بازه برآورد دوره‌ای وجود ندارد.</p>';
  if(buckets.length) html+=`<section class="cost-packages"><h2>برآورد هزینه و بودجه‌بندی بر اساس بسته‌های کاری</h2>
${buckets.map(bucket=>`<h2>${bucket.label}</h2>${table(['بستهٔ کاری',...columns],packageRows(bucket.works),['جمع این بازه',...costs(bucket.total,bucket.allocated)])}`).join('')}</section>`;
  const undated=works.filter(work=>jalaliDayNumber(work.start)==null);
  if(undated.length) html+=`<section><h2>برآوردهای بدون تاریخ شروع</h2>${table(['مسیر کار','نام کار','برآورد کل (تومان)'],undated.map(work=>[work.path,work.text,money(work.amount)]))}</section>`;
  if(details && buckets.some(bucket=>bucket.works.length)) html+=`<section class="cost-appendix cost-details"><h2>ریز کارها به تفکیک دوره</h2>${buckets.filter(bucket=>bucket.works.length).map(bucket=>`<h2>${bucket.label}</h2>${table(['مسیر درخت','نام کار','زمان کار',...detailColumns],detailRows(bucket.works),['جمع این دوره',...costs(bucket.total,bucket.allocated)])}`).join('')}</section>`;
  if(receipts) html+=`<section class="cost-appendix"><h2>دریافتی‌های کل پروژه</h2>${table(['شماره','تاریخ','مبلغ (تومان)'],fundingReceiptsOf(project).map((receipt,index)=>[money(index+1),reportDateRange(jalaliDayNumber(receipt.depositDate),null),money(receipt.amount)]))}
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
