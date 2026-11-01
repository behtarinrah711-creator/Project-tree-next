import { rowAmount, syncContractAmount, numericValue, hasPaymentRowData, isUnmeasuredRow } from './contractPricing.js';
import { calculatePaymentStages } from './paymentStagesModule.js';
import { toPersianDigits } from '../../ui/digits.js';
import { formatJalaliDisplay } from '../../ui/jalali.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function contractDocumentMarkup(state,activityName=''){
  state={...state,...(Array.isArray(state.operationRows)?{operationRows:state.operationRows.map(row=>({...row}))}:{}),...(Array.isArray(state.amountRows)?{amountRows:state.amountRows.map(row=>({...row}))}:{})};
  syncContractAmount(state);
  const retentionAmount=(Number(state.amount)||0)*(Number(state.retentionPercent)||0)/100;
  const escape=esc;
  const blank=value=>esc(value).trim()||'................................................';
  const persian=value=>toPersianDigits(String(value??''));
  const formatCost=value=>new Intl.NumberFormat('fa-IR').format(Number(value)||0);

  let clausesHtml = '';
  (state.items||[]).filter(item => item.included !== false).forEach((item, index) => {
    clausesHtml += '<div class="doc-clause"><b>' + persian(index + 1) + '.</b> ' + escape(item.text || '........................................................');
    (item.children || []).filter(child => child.included !== false).forEach((child, childIndex) => {
      clausesHtml += '<div class="doc-child"><b>' + persian(`${index + 1}-${childIndex + 1}`) + '.</b> ' + escape(child.text || '........................................................') + '</div>';
    });
    clausesHtml += '</div>';
  });

  const totalRow=(columns,amount,label='جمع کل عملیات‌ها')=>'<tr class="doc-operations-total"><td colspan="'+columns+'"><b>'+label+'</b></td><td><b>'+formatCost(amount)+'</b></td></tr>';
  const quantityTable=(rows,showTotal=false)=>'<table class="contract-document-quantities contract-document-quantity"><thead><tr>'+['ردیف','شرح عملیات','واحد','مقدار','بهای واحد (تومان)','بهای کل (تومان)'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+(rows||[]).map((row,i)=>'<tr><td>'+persian(i+1)+'</td><td>'+escape(row.description)+'</td><td>'+(row.pricingMode==='agreed'?'—':escape(row.unit))+'</td><td>'+(row.pricingMode==='agreed'?'—':(showTotal && isUnmeasuredRow(row,state)?'پس از متره':persian(row.quantity)))+'</td><td>'+(row.pricingMode==='agreed'?'—':formatCost(row.unitPrice))+'</td><td>'+(showTotal && isUnmeasuredRow(row,state)?'پس از متره':formatCost(rowAmount(row)))+'</td></tr>').join('')+(showTotal?totalRow(5,(rows||[]).filter(row=>!isUnmeasuredRow(row,state)).reduce((sum,row)=>sum+rowAmount(row),0),state.remeasurement?'جمع ردیف‌های با مبلغ مشخص':'جمع کل عملیات‌ها'):'')+'</tbody></table>';
  const agreedTable=rows=>'<table class="contract-document-quantities contract-document-agreed"><thead><tr><th>عملیات</th><th>شرح عملیات</th><th>بهای توافقی (تومان)</th></tr></thead><tbody>'+rows.map((row,i)=>'<tr><td>'+persian(i+1)+'</td><td>'+escape(row.description)+'</td><td>'+formatCost(row.agreedPrice)+'</td></tr>').join('')+totalRow(2,rows.reduce((sum,row)=>sum+Math.round(numericValue(row.agreedPrice)),0))+'</tbody></table>';
  const pricingHtml=Array.isArray(state.operationRows) ? '<div class="doc-pricing"><b>محاسبه مبلغ قرارداد</b>'+quantityTable(state.operationRows,true)+'</div>' : state.amountMethod==='quantity' ? '<div class="doc-pricing"><b>محاسبه مبلغ قرارداد</b>'+quantityTable(state.amountRows,true)+'</div>' : (state.amountMethod==='agreed' && Array.isArray(state.agreedRows) ? '<div class="doc-pricing"><b>محاسبه مبلغ کل قرارداد</b>'+agreedTable(state.agreedRows)+'</div>' : state.amountDescription?'<p>'+escape(state.amountDescription)+'</p>':'');
  let paymentHtml = '';
  const stages=state.paymentMethod ? [] : state.paymentStageCount ? calculatePaymentStages(state) : (state.paymentStages || []);
  stages.forEach((stage, index) => {
    const progress = stage.progress || '۰';
    const paymentPercent = stage.paymentPercent || '۰';
    paymentHtml += '<div><b>' + persian(index + 1) + '.</b> پس از ' + persian(progress) + '٪ پیشرفت، ' + persian(paymentPercent) + '٪ از مبلغ قرارداد پرداخت می‌شود' + (stage.description ? ' — ' + escape(stage.description) : '') + '</div>';
  });

  if(state.paymentMethod==='quantity'){
    const rows=(state.paymentRows||[]).filter(hasPaymentRowData);
    paymentHtml=rows.length?quantityTable(rows):'';
  }

  const hasValue=value=>value!=null && String(value).trim()!=='';
  const formattedAmount = hasValue(state.amount) ? formatCost(state.amount) : blank('');
  const formattedRetention = hasValue(state.amount) && hasValue(state.retentionPercent) ? formatCost(retentionAmount) : blank('');
  const amountText=state.remeasurement
    ? 'با نرخ‌های واحد توافق‌شده و مبلغ نهایی بر اساس مقدار کار تأییدشده'
    : 'به مبلغ کل '+formattedAmount+' تومان';
  const retentionText=Number(state.retentionPercent)>0
    ? ' حسن انجام کار برابر با '+blank(persian(state.retentionPercent))+'٪ '+
      (state.remeasurement?'از مبلغ هر صورت‌وضعیت تأییدشده کسر می‌شود.':'از مبلغ قرارداد، معادل '+formattedRetention+' تومان است.')+
      ' مبنای شروع نگهداری آن '+blank(state.retentionBasis)+' و مدت نگهداری آن '+blank(state.retentionDuration)+' است و پس از تکمیل آخرین صورت‌وضعیت و پایان مدت نگهداری آزاد می‌شود.'
    : '';
  return '<div class="doc-meta doc-contract-meta">' +
      '<div>شماره قرارداد: <bdi>' + blank(state.contractNo) + '</bdi></div>' +
      '<div>تاریخ قرارداد: <bdi>' + blank(formatJalaliDisplay(state.contractDate)) + '</bdi></div>' +
    '</div>' +
    '<div class="doc-title">' + escape(state.title || 'قرارداد ' + activityName) + '</div>' +
    '<p class="doc-parties doc-introduction">این قرارداد در ' + blank(state.contractPlace) +
      ' فی‌مابین ' + blank(state.employerName) + ' به‌عنوان کارفرما و ' + blank(state.contractorName) +
      ' به‌عنوان پیمانکار، با موضوع ' + blank(activityName) + ' در بخش ' + blank(state.projectItemPath) +
      ' پروژه، ' + amountText + '، برای اجرا از تاریخ ' + blank(formatJalaliDisplay(state.startDate)) +
      ' تا تاریخ ' + blank(formatJalaliDisplay(state.endDate)) + ' منعقد گردید.' + retentionText + ' طرفین متعهد به رعایت مفاد زیر هستند.' + (state.remeasurement ? ' مبلغ توافق شده جهت عملیات به شرح جدول زیر می باشد، بدیهی است مبلغ نهایی قرارداد در پایان عملیات پس از مشخص شدن مقدار هر عملیات مشخص می گردد.' : '') + '</p>' +
    pricingHtml +
    '<div class="doc-clauses">' + (clausesHtml || '<div class="doc-clause">........................................................</div>') + '</div>' +
    (paymentHtml ? '<div class="doc-payment"><b>مراحل پرداخت</b>' + paymentHtml + '</div>' : '') +
    '<div class="doc-signatures"><div class="signature-box">امضا و اثر انگشت کارفرما<br>................................</div><div class="signature-box">امضا و اثر انگشت پیمانکار<br>................................</div></div>';
}
