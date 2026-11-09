import { rowAmount, syncContractAmount, numericValue, hasPaymentRowData, isUnmeasuredRow } from './contractPricing.js';
import { calculatePaymentStages } from './paymentStagesModule.js';
import { toPersianDigits } from '../../ui/digits.js';
import { formatJalaliDisplay } from '../../ui/jalali.js';
import {ADDENDUM_TYPES} from '../../domain/contractAddenda.js';
import {planContractAnnexes} from './contractDocumentLayout.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const persian=value=>toPersianDigits(String(value??''));
const formatCost=value=>new Intl.NumberFormat('fa-IR').format(Number(value)||0);
const blank=value=>esc(value).trim()||'................................................';

const totalRow=(columns,amount,label='جمع کل عملیات‌ها')=>'<tr class="doc-operations-total"><td colspan="'+columns+'"><b>'+label+'</b></td><td><b>'+formatCost(amount)+'</b></td></tr>';
function quantityTable(rows=[],showTotal=false,state={}){
  const columns=['ردیف','شرح عملیات','واحد','مقدار','بهای واحد (تومان)','بهای کل (تومان)'];
  const body=(rows||[]).map((row,index)=>{
    const agreed=row.pricingMode==='agreed';
    const unmeasured=showTotal && isUnmeasuredRow(row,state);
    return '<tr><td>'+persian(index+1)+'</td><td>'+esc(row.description)+'</td>'+
      '<td>'+(agreed?'—':esc(row.unit))+'</td><td>'+(agreed?'—':unmeasured?'پس از متره':persian(row.quantity))+'</td>'+
      '<td>'+(agreed?'—':formatCost(row.unitPrice))+'</td><td>'+(unmeasured?'پس از متره':formatCost(rowAmount(row)))+'</td></tr>';
  }).join('');
  const total=showTotal?totalRow(5,(rows||[]).filter(row=>!isUnmeasuredRow(row,state)).reduce((sum,row)=>sum+rowAmount(row),0),
    state.remeasurement?'جمع ردیف‌های با مبلغ مشخص':'جمع کل عملیات‌ها'):'';
  return '<table class="contract-document-quantities contract-document-quantity"><thead><tr>'+
    columns.map(column=>'<th>'+column+'</th>').join('')+'</tr></thead><tbody>'+body+total+'</tbody></table>';
}
const agreedTable=rows=>'<table class="contract-document-quantities contract-document-agreed"><thead><tr><th>عملیات</th><th>شرح عملیات</th><th>بهای توافقی (تومان)</th></tr></thead><tbody>'+rows.map((row,i)=>'<tr><td>'+persian(i+1)+'</td><td>'+esc(row.description)+'</td><td>'+formatCost(row.agreedPrice)+'</td></tr>').join('')+totalRow(2,rows.reduce((sum,row)=>sum+Math.round(numericValue(row.agreedPrice)),0))+'</tbody></table>';

function documentMeta(kind,number,date,{addendum=false}={}){
  return '<div class="doc-meta doc-contract-meta" data-contract-number="'+esc(number||'')+'"'+(addendum?' data-document-kind="addendum"':'')+'>'+
    '<div>شماره '+kind+': <bdi>'+blank(number)+'</bdi></div>'+
    '<div>تاریخ '+kind+': <bdi>'+blank(formatJalaliDisplay(date))+'</bdi></div></div>';
}

export function addendumDocumentMarkup(addendum,parent){
  const {contractNo,parentContractNo,contractDate,note,rows,previousEndDate,endDate}=addendum;
  const operations=(rows||[]).map(row=>({
    ...row,pricingMode:row.pricingMode || (row.unit?'quantity':'agreed'),agreedPrice:row.amount ?? row.agreedPrice,
  }));
  const title=addendum.title || ['الحاقیه',ADDENDUM_TYPES[addendum.type]].filter(Boolean).join(' ');
  return documentMeta('الحاقیه',contractNo,contractDate,{addendum:true})+
    '<div class="doc-title">'+esc(title)+'</div>'+
    '<p class="doc-parties doc-introduction">قرارداد اصلی: <bdi>'+blank(parentContractNo||parent?.contractNo)+'</bdi>'+
    ' | پیمانکار: '+blank(parent?.contractorName)+' | کارفرما: '+blank(parent?.employerName)+'</p>'+
    (note?'<p class="doc-clause">'+esc(note)+'</p>':'')+
    (endDate?'<p>تاریخ پایان قبلی: '+blank(formatJalaliDisplay(previousEndDate))+
      ' | تاریخ پایان جدید: '+blank(formatJalaliDisplay(endDate))+'</p>':'')+
    (operations.length?'<div class="doc-pricing"><b>محاسبه مبلغ الحاقیه</b>'+quantityTable(operations,true)+'</div>':'');
}

export function contractDocumentMarkup(state,activityName=''){
  state={...state,...(Array.isArray(state.operationRows)?{operationRows:state.operationRows.map(row=>({...row}))}:{}),...(Array.isArray(state.amountRows)?{amountRows:state.amountRows.map(row=>({...row}))}:{})};
  syncContractAmount(state);
  const retentionAmount=(Number(state.amount)||0)*(Number(state.retentionPercent)||0)/100;
  const escape=esc;

  let clausesHtml = '';
  (state.items||[]).filter(item => item.included !== false).forEach((item, index) => {
    clausesHtml += '<div class="doc-clause"><b>' + persian(index + 1) + '.</b> ' + escape(item.text || '........................................................');
    (item.children || []).filter(child => child.included !== false).forEach((child, childIndex) => {
      clausesHtml += '<div class="doc-child"><b>' + persian(`${index + 1}-${childIndex + 1}`) + '.</b> ' + escape(child.text || '........................................................') + '</div>';
    });
    clausesHtml += '</div>';
  });

  const pricingHtml=Array.isArray(state.operationRows) ? '<div class="doc-pricing"><b>محاسبه مبلغ قرارداد</b>'+quantityTable(state.operationRows,true,state)+'</div>' : state.amountMethod==='quantity' ? '<div class="doc-pricing"><b>محاسبه مبلغ قرارداد</b>'+quantityTable(state.amountRows,true,state)+'</div>' : (state.amountMethod==='agreed' && Array.isArray(state.agreedRows) ? '<div class="doc-pricing"><b>محاسبه مبلغ کل قرارداد</b>'+agreedTable(state.agreedRows)+'</div>' : state.amountDescription?'<p>'+escape(state.amountDescription)+'</p>':'');
  let paymentHtml = '';
  const stages=state.paymentMethod ? [] : state.paymentStageCount ? calculatePaymentStages(state) : (state.paymentStages || []);
  stages.forEach((stage, index) => {
    const progress = stage.progress || '۰';
    const paymentPercent = stage.paymentPercent || '۰';
    paymentHtml += '<div><b>' + persian(index + 1) + '.</b> پس از ' + persian(progress) + '٪ پیشرفت، ' + persian(paymentPercent) + '٪ از مبلغ قرارداد پرداخت می‌شود' + (stage.description ? ' — ' + escape(stage.description) : '') + '</div>';
  });

  if(state.paymentMethod==='quantity'){
    const rows=(state.paymentRows||[]).filter(hasPaymentRowData);
    paymentHtml=rows.length?quantityTable(rows,false,state):'';
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
  const documents=state.contractorDocuments||[];
  const annexPages=[];
  const detail=value=>escape(value).trim()||'—';
  let documentNumber=0;
  for(const page of planContractAnnexes(documents,state.contractorDocumentImages)){
    const photos=page.map(({sourceIndex:index,portrait,rotated,row,column})=>{
      const file=documents[index],image=state.contractorDocumentImages?.[index];
      const src=image?.dataUrl || (typeof file==='string'?file:'');
      const safe=/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(src);
      const position=portrait?' contract-document-photo--portrait contract-document-photo--'+(column===1?'left':'right'):' contract-document-photo--landscape contract-document-row-'+row;
      const width=Number(image?.width || file?.width),height=Number(image?.height || file?.height);
      const alt=escape(image?.name||file.name||'مدرک پیمانکار');
      // Swap the viewport dimensions before rotating; fit the whole image without cropping.
      const portraitRatio=photo=>{
        const item=documents[photo.sourceIndex],decoded=state.contractorDocumentImages?.[photo.sourceIndex];
        const w=Number(decoded?.width || item?.width),h=Number(decoded?.height || item?.height);
        return photo.rotated?h/w:w/h;
      };
      const pairRatio=Math.max(...page.filter(photo=>photo.portrait).map(portraitRatio));
      const ratio=rotated?height/width:width/height;
      const offset=column===2?pairRatio-ratio:0;
      const picture=portrait
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 '+pairRatio+' 1" preserveAspectRatio="'+(column===1?'xMinYMid':'xMaxYMid')+' meet" role="img" aria-label="'+alt+'"><image href="'+escape(src)+'" x="'+(rotated?0:offset)+'" width="'+(rotated?1:ratio)+'" height="'+(rotated?ratio:1)+'"'+(rotated?' transform="translate('+offset+' 1) rotate(-90)"':'')+'/></svg>'
        : Number.isFinite(width) && width>0 && Number.isFinite(height) && height>0
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="'+alt+'"><image href="'+escape(src)+'" width="'+width+'" height="'+height+'"/></svg>'
          : '<img src="'+escape(src)+'" alt="'+alt+'">';
      return '<figure class="contract-document-photo'+position+'"><div class="contract-document-image-box">'+
        (safe?picture:'<p>'+(state.contractorDocumentsError?'دریافت مدرک انجام نشد؛ دوباره تلاش کنید.':'در حال دریافت مدرک…')+'</p>')+
        '</div><figcaption>تصویر مدرک '+persian(++documentNumber)+'</figcaption></figure>';
    }).join('');
    annexPages.push('<section class="contract-document-attachment" data-contract-number="'+escape(state.contractNo||'')+'">'+
      '<header class="contract-document-annex-header"><h3>پیوست '+persian(annexPages.length+1)+' — مدارک پیمانکار</h3>'+
      '<div class="contract-document-annex-meta"><div>پروژه: '+detail(state.projectName)+'</div><div>شماره قرارداد: <bdi>'+detail(state.contractNo)+'</bdi></div>'+
      '<div>پیمانکار: '+detail(state.contractorName)+'</div><div>تاریخ قرارداد: '+detail(formatJalaliDisplay(state.contractDate))+'</div>'+
      '<div class="contract-document-annex-subject">موضوع / فعالیت: '+detail(activityName)+'</div></div></header>'+
      '<div class="contract-document-photo-grid">'+photos+'</div></section>');
  }
  return documentMeta('قرارداد',state.contractNo,state.contractDate)+
    '<div class="doc-title">' + escape(state.title || 'قرارداد ' + activityName) + '</div>' +
    '<p class="doc-parties doc-introduction">این قرارداد در ' + blank(state.contractPlace) +
      ' فی‌مابین ' + blank(state.employerName) + ' به‌عنوان کارفرما و ' + blank(state.contractorName) +
      ' به‌عنوان پیمانکار، با موضوع ' + blank(activityName) + ' در بخش ' + blank(state.projectItemPath) +
      ' پروژه، ' + amountText + '، برای اجرا از تاریخ ' + blank(formatJalaliDisplay(state.startDate)) +
      ' تا تاریخ ' + blank(formatJalaliDisplay(state.endDate)) + ' منعقد گردید.' + retentionText + ' طرفین متعهد به رعایت مفاد زیر هستند.' + (state.remeasurement ? ' مبلغ توافق شده جهت عملیات به شرح جدول زیر می باشد، بدیهی است مبلغ نهایی قرارداد در پایان عملیات پس از مشخص شدن مقدار هر عملیات مشخص می گردد.' : '') + '</p>' +
    pricingHtml +
    '<div class="doc-clauses">' + (clausesHtml || '<div class="doc-clause">........................................................</div>') + '</div>' +
    (paymentHtml ? '<div class="doc-payment"><b>مراحل پرداخت</b>' + paymentHtml + '</div>' : '') +
    annexPages.join('');
}
