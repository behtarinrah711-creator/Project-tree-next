import { openExecutionBranchFilter, selectableWbsTree, searchExecutionBranches } from './executionBranchFilter.js';
import { paginateCostlinePrint } from './costlinePrintPagination.js';
import { assignWorksToBuckets, buildBuckets, collectPlannedWorks, COSTLINE_RANGES, jalaliDayNumber, jalaliFromDay, sliceShare, scheduledPayments, FUNDING_ROUTES, WEEKDAYS } from '../../domain/wbs/costline.js';
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
function reportDateRange(start,end){
  const first=dateParts(start), last=dateParts(end);
  if(!first && !last) return '—';
  const full=parts=>`${dayAndMonth(parts)} ${toPersianDigits(parts.year)}`;
  if(!first || !last || start===end) return full(first||last);
  if(first.year!==last.year) return `${full(first)} تا ${full(last)}`;
  const from=first.month===last.month?money(first.dayOfMonth):dayAndMonth(first);
  return `${from} تا ${dayAndMonth(last)} ${toPersianDigits(last.year)}`;
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function table(headers, rows, total, routeSummary){
  const totals=total
    ? `<tr class="cost-total"><th scope="row" colspan="${headers.length-total.length+1}">${esc(total[0])}</th>${total.slice(1).map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`
    : '';
  const funding=routeSummary
    ? `<tr class="cost-total"><th scope="row" colspan="3">کسری به تفکیک مسیر (تومان)</th><td colspan="${headers.length-3}">${esc(routeSummary)}</td></tr>`
    : '';
  return `<table><thead><tr>${headers.map(value=>`<th scope="col">${esc(value)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}${totals}${funding}</tbody></table>`;
}
const costs = (need, allocated) => [money(need),money(allocated),money(Math.max(0,need-allocated))];
const columns = ['موردنیاز (تومان)','تخصیص‌یافته (تومان)','کسری (تومان)'];
const detailColumns = ['موردنیاز در این دوره (تومان)','تخصیص‌یافته در این دوره (تومان)','کسری این دوره (تومان)'];
const reportRoutes = [['owner','کارفرما'],['petty','تنخواه'],['','نامشخص']];
const routeLabel = key => reportRoutes.find(([route])=>route===key)?.[1] || 'نامشخص';
const routeText = (routes,value) => routes.map(([key,label])=>`${label} ${money(value(key))}`).join(' · ');
const workFunding = work => Math.min(work.sliceAmount,work.allocated);

const detailRows = works => works.map(work=>[work.path,work.shortageDay==null?work.text:`${work.text} · شروع کسری این دوره ${reportDateRange(work.shortageDay,null)}`,reportDateRange(jalaliDayNumber(work.start),jalaliDayNumber(work.end)),...costs(work.sliceAmount,workFunding(work)),work.routes.length===1?work.routes[0][1]:routeText(work.routes,key=>work.routeNeeds[key])]);

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

const styles = `html,body{margin:0;padding:0}
.cost-report h1{text-align:center}
.cost-report .cost-meta{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #aaa;padding-bottom:4px}
.cost-report .cost-report-range{text-align:left}
.cost-report h2{font-size:16px;margin:14px 0 3px;break-after:avoid}
.cost-report section:not(.cost-packages)>h2:first-child{margin-top:0}
.cost-report h2+table{margin-top:0}.cost-report p{margin:6px 0}
.cost-report table{font-size:11px;table-layout:auto;border-collapse:collapse;width:100%}.cost-report td{overflow-wrap:anywhere}.cost-report th,.cost-report td{padding:4px;border:1px solid #bbb}.cost-report thead th{background:#f3f4f6}
.cost-report .cost-total th,.cost-report .cost-total td{background:#eef3f8;font-weight:700}
.cost-report thead{display:table-header-group}.cost-report tr,.signature{break-inside:avoid}
.signature{margin-top:12mm;text-align:left}.signature img{display:block;margin-right:auto;max-width:45mm;max-height:20mm}.signature span{font-size:11px}`;

function selectedReportBuckets(works,{rangeId,originWeekday,start,end,route=null}){
  const periods=buildBuckets({rangeId,originWeekday,works})
    .filter(bucket=>bucket.startDay<=end && bucket.endDay>=start)
    .map(bucket=>({...bucket,startDay:Math.max(start,bucket.startDay),endDay:Math.min(end,bucket.endDay)}));
  return assignWorksToBuckets(periods,works,route).filter(bucket=>bucket.total>0);
}

function reportBranch(tree,id){
  return id?searchExecutionBranches(tree,'').find(({node})=>node.id===id):null;
}

function worksInBranch(works,branch){
  if(!branch)return works;
  const keys=new Set();
  const include=node=>{keys.add(node.id);node.children.forEach(include);};
  include(branch.node);
  return works.filter(work=>keys.has('branch:'+work.itemId) || keys.has('task:'+work.itemId+':'+work.id));
}

function routeAllocation(work,bucket,covered,route){
  if(route===null)return covered;
  const total=sliceShare(work,bucket);
  if(total<=0)return 0;
  let before=0;
  for(const [key] of FUNDING_ROUTES){
    const through=before+sliceShare(work,bucket,key);
    if(key===route)return Math.floor(covered*through/total)-Math.floor(covered*before/total);
    before=through;
  }
  return 0;
}

export function costlineDocument(project,{rangeId,originWeekday,start,end,overview=true,packages=true,details,receipts,branchId,route=null}){
  const branch=reportBranch(selectableWbsTree(project),branchId);
  const works=worksInBranch(collectPlannedWorks(project.tasks,{includeUndated:true}),branch);
  const dated=works.filter(work=>jalaliDayNumber(work.start)!=null || scheduledPayments(work).length);
  const buckets=selectedReportBuckets(dated,{rangeId,originWeekday,start,end,route});
  const coveredIn=fundingCoverage(project);
  for(const bucket of buckets){
    bucket.label=reportDateRange(bucket.startDay,bucket.endDay);
    for(const work of bucket.works){
      const covered=Math.min(sliceShare(work,bucket),coveredIn(work.id,bucket));
      work.allocated=routeAllocation(work,bucket,covered,route);
      work.routeNeeds=Object.fromEntries(reportRoutes.map(([key])=>[key,route===null || route===key?sliceShare(work,bucket,key):0]));
      work.routes=reportRoutes.filter(([key])=>work.routeNeeds[key]>0);
      work.routeShortages=Object.fromEntries(work.routes.map(([key])=>[key,work.routeNeeds[key]-routeAllocation(work,bucket,covered,key)]));
      work.shortageDay=route===null?firstFundingShortage(work,bucket,work.allocated):null;
    }
    bucket.allocated=bucket.works.reduce((sum,work)=>sum+workFunding(work),0);
    bucket.routeShortage=key=>bucket.works.reduce((sum,work)=>sum+(work.routeShortages[key]||0),0);
  }
  const need=buckets.reduce((sum,bucket)=>sum+bucket.total,0);
  const allocated=buckets.reduce((sum,bucket)=>sum+bucket.allocated,0);
  const range=ranges.find(item=>item.id===rangeId);
  const scope=[branch?.path.join(' ← '),route!==null?routeLabel(route):''].filter(Boolean);
  const title=`<h1>گزارش برآورد هزینه و تأمین بودجه ${esc(project.name)}</h1>
<div class="cost-meta"><p>تاریخ تهیه ${esc(formatJalaliDisplay(todayJalaliStr()))} | ${rangeId==='week2'?'دوره‌های دوهفته‌ای':esc(range?.label)}${range?.days>1 ? ` | مبدأ ${WEEKDAYS[originWeekday]}` : ''}</p>
${Number.isFinite(start)&&Number.isFinite(end)?`<p class="cost-report-range">بازهٔ گزارش ${reportDateRange(start,end)}</p>`:''}</div>
${scope.length?`<p>${esc(scope.join(' · '))}</p>`:''}`;
  let html=`<article class="nb-export-document cost-report">`;
  const totalShortage=key=>buckets.reduce((sum,bucket)=>sum+bucket.routeShortage(key),0);
  const summaryRoutes=reportRoutes.filter(([key])=>key!=='' || totalShortage(key)>0);
  const shortageCells=getAmount=>summaryRoutes.map(([key])=>money(getAmount(key)));
  if(overview && buckets.length){
    let cumulative=0;
    const rows=buckets.map(bucket=>{
      cumulative+=bucket.allocated;
      return [bucket.label,...costs(bucket.total,bucket.allocated),...shortageCells(bucket.routeShortage),money(cumulative)];
    });
    html+=`<section class="cost-summary">${title}
<h2>جمع بازهٔ انتخاب‌شده</h2>
${table(['بستهٔ کاری',...columns],packageRows(buckets.flatMap(bucket=>bucket.works)),['جمع کل بازه',...costs(need,allocated)])}
<h2>بودجه‌بندی دوره‌ای · کسری به تفکیک مسیر</h2>
${table(['دوره',...columns,...summaryRoutes.map(([,label])=>label+' (تومان)'),'تخصیص تجمعی (تومان)'],rows,['جمع کل بازه',...costs(need,allocated),...shortageCells(totalShortage),money(allocated)])}</section>`;
  }
  if(!overview || !buckets.length) html+=title;
  if((overview || details) && !buckets.length) html+='<p>در این بازه برآورد دوره‌ای وجود ندارد.</p>';
  if(packages && buckets.length && (!overview || buckets.length>1)) html+=`<section class="cost-packages">
${buckets.map(bucket=>`<h2>${bucket.label} | تفکیک بسته های کاری</h2>${table(['بستهٔ کاری',...columns],packageRows(bucket.works),['جمع این بازه',...costs(bucket.total,bucket.allocated)])}`).join('')}</section>`;
  const undated=works.filter(work=>jalaliDayNumber(work.start)==null && (route===null || (work.fundingRoute||'')===route))
    .map(work=>({...work,amount:work.amount-scheduledPayments(work).reduce((sum,payment)=>sum+payment.amount,0)}))
    .filter(work=>work.amount>0);
  if((overview || details) && undated.length) html+=`<section><h2>برآوردهای بدون تاریخ شروع</h2>${table(['مسیر کار','نام کار','برآورد کل (تومان)','مسیر پرداخت'],undated.map(work=>[work.path,work.text,money(work.amount),routeLabel(work.fundingRoute)]))}</section>`;
  if(details && buckets.some(bucket=>bucket.works.length)) html+=`<section class="cost-appendix cost-details">${buckets.filter(bucket=>bucket.works.length).map(bucket=>`<h2>${bucket.label} | لیست کارها</h2>${table(['مسیر درخت','نام کار','زمان کار',...detailColumns,'مسیر پرداخت'],detailRows(bucket.works),['جمع این دوره',...costs(bucket.total,bucket.allocated),''],routeText(summaryRoutes,bucket.routeShortage))}`).join('')}</section>`;
  if(receipts && !branch && route===null) html+=`<section class="cost-appendix"><h2>دریافتی‌های کل پروژه</h2>${table(['شماره','تاریخ','مبلغ (تومان)'],fundingReceiptsOf(project).map((receipt,index)=>[money(index+1),reportDateRange(jalaliDayNumber(receipt.depositDate),null),money(receipt.amount)]))}
${table(['مجموع دریافتی (تومان)','ماندهٔ تخصیص‌نیافته (تومان)'],[[money(poolReceived(project)),money(poolRemaining(project))]])}</section>`;
  return html+'</article>';
}

let view, controls;

export async function openCostlineExport(project,{rangeId,originWeekday,trigger,branch:initialBranch}){
  const { getContractPageStyles }=await import('../contracts/contractTemplateFormModule.js');
  if(!view){
    const source=document.getElementById('notebookExportPage');
    if(!source) return false;
    const page=source.cloneNode(true);
    page.id='costlineExportPage';
    page.innerHTML=page.innerHTML.replaceAll('notebookExport','costlineExport');
    page.querySelector('.export-note-wrap').hidden=true;
    for(const id of ['costlineExportNumbered','costlineExportCost']){
      page.querySelector('#'+id).closest('label').classList.add('hidden');
    }
    const options=page.querySelector('.export-options');
    const sections=document.createElement('template');
    sections.innerHTML=`<label><input type="checkbox" data-overview> خلاصه و جدول بودجه‌بندی</label>
<label><input type="checkbox" data-packages> تفکیک بسته های کاری <small data-package-hint>اطلاعات این دوره در جدول جمع بازه آمده است.</small></label>
<label><input type="checkbox" data-details> لیست کارها</label>
<label><input type="checkbox" data-receipts> دریافتی ها</label>`;
    options.prepend(sections.content);
    controls=document.createElement('div');
    controls.className='export-options';
    controls.innerHTML=`<label>از تاریخ <button type="button" data-start></button></label>
<label>تا تاریخ <button type="button" data-end></button></label>
<label>مقیاس <select data-range>${ranges.map(range=>`<option value="${range.id}">${range.label}</option>`).join('')}</select></label>
<label>مبدأ دورهٔ پرداخت <select data-origin>${WEEKDAYS.map((day,index)=>`<option value="${index}">${day}</option>`).join('')}</select></label>
<label>مرحله <button type="button" data-branch></button></label>
<label>مسیر تأمین <select data-route><option value="all">همه مسیرها</option>${FUNDING_ROUTES.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>`;
    options.after(controls);
    const back=document.createElement('button');
    back.type='button';
    back.className='inner-section-back';
    back.textContent='بازگشت';
    back.onclick=()=>view.close();
    page.querySelector('.page-head').prepend(back);
    document.body.appendChild(page);
    view=installNotebookExportView({
      idPrefix:'costlineExport', historyKey:'costline-export', pdfOnly:true, extraStyles:getContractPageStyles()+styles,
      preparePrint:paginateCostlinePrint,
      documentBuilder:({project,settings})=>costlineDocument(project,settings()),
    });
  }
  const works=collectPlannedWorks(project.tasks);
  const full=buildBuckets({rangeId,originWeekday,works});
  const startButton=controls.querySelector('[data-start]'), endButton=controls.querySelector('[data-end]');
  const range=controls.querySelector('[data-range]'), origin=controls.querySelector('[data-origin]');
  const branchButton=controls.querySelector('[data-branch]'), route=controls.querySelector('[data-route]');
  const tree=selectableWbsTree(project);
  let branch=reportBranch(tree,initialBranch);
  branchButton.onclick=()=>openExecutionBranchFilter(project,tree,id=>{branch=reportBranch(tree,id);paint();},branch?.node);
  route.value='all';
  route.onchange=()=>paint();
  const options=controls.previousElementSibling;
  const overview=options.querySelector('[data-overview]');
  const packages=options.querySelector('[data-packages]');
  const details=options.querySelector('[data-details]'), receipts=options.querySelector('[data-receipts]');
  const packageHint=options.querySelector('[data-package-hint]');
  let packagePreference=true;
  packages.onchange=()=>{packagePreference=packages.checked;};
  let start=full[0]?.startDay ?? -Infinity, end=full.at(-1)?.endDay ?? Infinity;
  const selection=()=>({rangeId:range.value,originWeekday:Number(origin.value),start,end,overview:overview.checked,branchId:branch?.node.id,route:route.value==='all'?null:route.value});
  const paint=()=>{
    startButton.textContent=Number.isFinite(start)?date(start):'انتخاب کنید';
    endButton.textContent=Number.isFinite(end)?date(end):'انتخاب کنید';
    origin.disabled=!(ranges.find(item=>item.id===range.value)?.days>1);
    const current=selection();
    branchButton.textContent=branch?.path.join(' ← ') || 'همه مراحل';
    receipts.disabled=Boolean(branch) || current.route!==null;
    if(receipts.disabled)receipts.checked=false;
    const scopedWorks=worksInBranch(works,branch);
    const count=selectedReportBuckets(scopedWorks,current).length;
    packages.disabled=count===0 || (count===1 && overview.checked);
    packages.checked=!packages.disabled && packagePreference;
    packageHint.classList.toggle('hidden',count!==1 || !overview.checked);
  };
  const selectDate=(value,apply)=>window.KarhaUI?.openJalaliPicker?.(Number.isFinite(value)?jalaliFromDay(value):'',next=>{
    const day=jalaliDayNumber(next);
    if(day!=null) apply(day);
    paint();
  });
  startButton.onclick=()=>selectDate(start,day=>{start=day;end=Math.max(end,day);});
  endButton.onclick=()=>selectDate(end,day=>{end=day;start=Math.min(start,day);});
  range.value=rangeId;origin.value=String(originWeekday);
  range.onchange=paint;origin.onchange=paint;overview.onchange=paint;overview.checked=true;details.checked=false;receipts.checked=false;paint();
  return view.open({title:'خروجی برآورد هزینه | '+project.name,project,
    settings:()=>({...selection(),packages:!packages.disabled && packages.checked,details:details.checked,receipts:receipts.checked}),
  },{trigger});
}
