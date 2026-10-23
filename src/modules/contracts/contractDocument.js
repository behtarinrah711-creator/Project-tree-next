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

  const formattedAmount = state.amount ? formatCost(state.amount) : '................................';
  const formattedRetention = formatCost(retentionAmount);
  return '<div class="doc-title">' + escape('قرارداد ' + activityName) + '</div>' +
    '<div class="doc-meta">' +
      '<div>شماره قرارداد: <span class="doc-line">' + blank(state.contractNo) + '</span></div>' +
      '<div>تاریخ تنظیم: <span class="doc-line">' + blank(formatJalaliDisplay(state.contractDate)) + '</span></div>' +
      '<div>تاریخ شروع: <span class="doc-line">' + blank(formatJalaliDisplay(state.startDate)) + '</span></div>' +
      '<div>تاریخ پایان: <span class="doc-line">' + blank(formatJalaliDisplay(state.endDate)) + '</span></div>' +
      '<div>محل انعقاد: <span class="doc-line">' + blank(state.contractPlace) + '</span></div>' +
    '</div>' +
    '<div class="doc-parties">' +
      '<div class="party"><span class="doc-party-label">این قرارداد فی‌مابین کارفرما:</span> ' + blank(state.employerName) + '</div>' +
      '<div class="party"><span class="doc-party-label">و پیمانکار:</span> ' + blank(state.contractorName) + '</div>' +
      '<div class="party">موضوع فعالیت: ' + blank(activityName) + '</div>' +
      '<div class="party">آیتم پروژه: ' + blank(state.projectItemPath || '') + '</div>' +
      '<div class="party">مبلغ کل قرارداد: ' + formattedAmount + ' تومان</div>' +
      '<div class="party">حسن انجام کار: ٪' + persian(state.retentionPercent || '۰') + '، معادل ' + formattedRetention + ' تومان</div>' +
      '<div class="party">مبنای شروع نگهداری حسن انجام کار: ' + blank(state.retentionBasis) + '</div>' +
      '<div class="party">مدت نگهداری: ' + blank(state.retentionDuration) + '</div>' +
    '</div>' +
    '<div class="doc-clauses">' + (clausesHtml || '<div class="doc-clause">........................................................</div>') + '</div>' +
    '<div class="doc-payment"><b>شرایط پرداخت</b>' + (paymentHtml || '<div>........................................................</div>') + '</div>' +
    '<div class="doc-signatures"><div class="signature-box">امضا و اثر انگشت کارفرما<br>................................</div><div class="signature-box">امضا و اثر انگشت پیمانکار<br>................................</div></div>';
}
