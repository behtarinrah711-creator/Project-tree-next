import { toPersianDigits } from '../../ui/digits.js';
import { formatJalaliDisplay } from '../../ui/jalali.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function contractDocumentMarkup(state,activityName=''){
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

  let paymentHtml = '';
  (state.paymentStages || []).forEach((stage, index) => {
    const progress = stage.progress || '۰';
    const paymentPercent = stage.paymentPercent || '۰';
    paymentHtml += '<div><b>' + persian(index + 1) + '.</b> پس از ' + persian(progress) + '٪ پیشرفت، ' + persian(paymentPercent) + '٪ از مبلغ قرارداد پرداخت می‌شود' + (stage.description ? ' — ' + escape(stage.description) : '') + '</div>';
  });

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
    '<div class="doc-clauses">' + (clausesHtml || '<div class="doc-clause">........................................................</div>') + '</div>' +
    '<div class="doc-payment"><b>شرایط پرداخت</b>' + (paymentHtml || '<div>........................................................</div>') + '</div>' +
    '<div class="doc-signatures"><div class="signature-box">امضا و اثر انگشت کارفرما<br>................................</div><div class="signature-box">امضا و اثر انگشت پیمانکار<br>................................</div></div>';
}
