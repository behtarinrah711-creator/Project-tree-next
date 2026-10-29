import { rowAmount, syncContractAmount, numericValue } from './contractPricing.js';
import { calculatePaymentStages, retentionMethods } from './paymentStagesModule.js';
import { toPersianDigits } from '../../ui/digits.js';
import { formatJalaliDisplay } from '../../ui/jalali.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function contractDocumentMarkup(state,activityName=''){
  state={...state};
  syncContractAmount(state);
  const retentionAmount=(Number(state.amount)||0)*(Number(state.retentionPercent)||0)/100;
  const escape=esc;
  const blank=value=>esc(value).trim()||'................................................';
  const persian=value=>toPersianDigits(String(value??''));
  const formatCost=value=>new Intl.NumberFormat('fa-IR').format(Number(value)||0);

  let clausesHtml = '';
  (state.items||[]).forEach((item, index) => {
    clausesHtml += '<div class="doc-clause"><b>' + persian(index + 1) + '.</b> ' + escape(item.text || '........................................................');
    (item.children || []).forEach((child, childIndex) => {
      clausesHtml += '<div class="doc-child"><b>' + persian(`${index + 1}-${childIndex + 1}`) + '.</b> ' + escape(child.text || '........................................................') + '</div>';
    });
    clausesHtml += '</div>';
  });

  const totalRow=(columns,amount)=>'<tr class="doc-operations-total"><td colspan="'+columns+'"><b>جمع کل عملیات‌ها</b></td><td><b>'+formatCost(amount)+'</b></td></tr>';
  const quantityTable=(rows,showTotal=false)=>'<table class="contract-document-quantities"><thead><tr>'+['ردیف','شرح عملیات','واحد','مقدار','بهای واحد (تومان)','بهای کل (تومان)'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+(rows||[]).map((row,i)=>'<tr><td>'+persian(i+1)+'</td><td>'+escape(row.description)+'</td><td>'+escape(row.unit)+'</td><td>'+persian(row.quantity)+'</td><td>'+formatCost(row.unitPrice)+'</td><td>'+formatCost(rowAmount(row))+'</td></tr>').join('')+(showTotal?totalRow(5,(rows||[]).reduce((sum,row)=>sum+rowAmount(row),0)):'')+'</tbody></table>';
  const agreedTable=rows=>'<table class="contract-document-quantities"><thead><tr><th>عملیات</th><th>شرح عملیات</th><th>بهای توافقی (تومان)</th></tr></thead><tbody>'+rows.map((row,i)=>'<tr><td>'+persian(i+1)+'</td><td>'+escape(row.description)+'</td><td>'+formatCost(row.agreedPrice)+'</td></tr>').join('')+totalRow(2,rows.reduce((sum,row)=>sum+Math.round(numericValue(row.agreedPrice)),0))+'</tbody></table>';
  const pricingHtml=state.amountMethod==='quantity' ? '<div class="doc-pricing"><b>محاسبه مبلغ قرارداد</b>'+quantityTable(state.amountRows,true)+'</div>' : (state.amountMethod==='agreed' && Array.isArray(state.agreedRows) ? '<div class="doc-pricing"><b>محاسبه مبلغ کل قرارداد</b>'+agreedTable(state.agreedRows)+'</div>' : state.amountDescription?'<p>'+escape(state.amountDescription)+'</p>':'');
  let paymentHtml = '';
  const stages=state.paymentMethod ? [] : state.paymentStageCount ? calculatePaymentStages(state) : (state.paymentStages || []);
  stages.forEach((stage, index) => {
    const progress = stage.progress || '۰';
    const paymentPercent = stage.paymentPercent || '۰';
    paymentHtml += '<div><b>' + persian(index + 1) + '.</b> پس از ' + persian(progress) + '٪ پیشرفت، ' + persian(paymentPercent) + '٪ از مبلغ قرارداد پرداخت می‌شود' + (stage.description ? ' — ' + escape(stage.description) : '') + '</div>';
  });

  if(state.paymentMethod==='quantity') paymentHtml=quantityTable(state.paymentRows);
  if(state.paymentStageCount || state.paymentMethod){
    paymentHtml += '<div>' + escape(retentionMethods.find(x=>x.value===(state.retentionMethod||'first'))?.label) + '</div>';
    paymentHtml += '<div>مبلغ ' + formatCost(Math.round(retentionAmount)) + ' تومان حسن انجام کار پس از تکمیل آخرین صورت‌وضعیت و سپری‌شدن مدت ' + blank(state.retentionDuration) + ' از ' + blank(state.retentionBasis) + ' آزاد می‌شود.</div>';
  }

  const hasValue=value=>value!=null && String(value).trim()!=='';
  const formattedAmount = hasValue(state.amount) ? formatCost(state.amount) : blank('');
  const formattedRetention = hasValue(state.amount) && hasValue(state.retentionPercent) ? formatCost(retentionAmount) : blank('');
  return '<div class="doc-meta doc-contract-meta">' +
      '<div>شماره قرارداد: <bdi>' + blank(state.contractNo) + '</bdi></div>' +
      '<div>تاریخ قرارداد: <bdi>' + blank(formatJalaliDisplay(state.contractDate)) + '</bdi></div>' +
    '</div>' +
    '<div class="doc-title">' + escape('قرارداد ' + activityName) + '</div>' +
    '<p class="doc-parties doc-introduction">این قرارداد در ' + blank(state.contractPlace) +
      ' فی‌مابین ' + blank(state.employerName) + ' به‌عنوان کارفرما و ' + blank(state.contractorName) +
      ' به‌عنوان پیمانکار، با موضوع ' + blank(activityName) + ' در بخش ' + blank(state.projectItemPath) +
      ' پروژه، به مبلغ کل ' + formattedAmount + ' تومان، برای اجرا از تاریخ ' + blank(formatJalaliDisplay(state.startDate)) +
      ' تا تاریخ ' + blank(formatJalaliDisplay(state.endDate)) + ' منعقد گردید. حسن انجام کار برابر با ' +
      blank(persian(state.retentionPercent)) + '٪ از مبلغ قرارداد، معادل ' + formattedRetention +
      ' تومان است که مبنای شروع نگهداری آن ' + blank(state.retentionBasis) + ' و مدت نگهداری آن ' +
      blank(state.retentionDuration) + ' تعیین می‌شود. طرفین متعهد به رعایت مفاد زیر هستند.</p>' +
    pricingHtml +
    '<div class="doc-clauses">' + (clausesHtml || '<div class="doc-clause">........................................................</div>') + '</div>' +
    '<div class="doc-payment"><b>مراحل پرداخت</b>' + (paymentHtml || '<div>........................................................</div>') + '</div>' +
    '<div class="doc-signatures"><div class="signature-box">امضا و اثر انگشت کارفرما<br>................................</div><div class="signature-box">امضا و اثر انگشت پیمانکار<br>................................</div></div>';
}
