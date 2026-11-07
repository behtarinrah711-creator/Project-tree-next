import { ADDENDUM_TYPES, addendumAmount, addendumReviewers, parentContractOf } from '../../src/domain/contractAddenda.js';
import { transitionContractApproval } from '../../src/domain/contractApproval.js';
import { jalaliMonthLength } from '../../src/ui/jalali.js';

const fail=message=>({ok:false,message});
const text=(value,max)=>String(value??'').trim().slice(0,max);
const validDate=value=>{
  if(!/^\d{4}\/\d{2}\/\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('/').map(Number);
  return year>=1200 && year<=1600 && month>=1 && month<=12 && day>=1 && day<=jalaliMonthLength(year,month);
};

export function saveAddendumDraft(project,current,body,actor,id,at){
  const parent=parentContractOf(project,current||body);
  if(!parent?.contractNo)return fail('ابتدا یک قرارداد شماره‌دار انتخاب کنید');
  if(current && (!current.isDraft || current.signedAt))return fail('الحاقیه در حال ویرایش نیست');
  const type=body.type, note=text(body.note,4000), contractDate=text(body.contractDate,10), endDate=text(body.endDate,10);
  if(!Object.hasOwn(ADDENDUM_TYPES,type)||!validDate(contractDate))return fail('نوع و تاریخ الحاقیه را مشخص کنید');
  if(type==='duration' && (!validDate(endDate) || (parent.endDate && endDate<=parent.endDate)))return fail('تاریخ پایان جدید باید بعد از تاریخ پایان قرارداد باشد');
  if(type==='other' && !note)return fail('شرح تغییر را وارد کنید');
  const monetary=type==='extra'||type==='price';
  const rows=[];
  if(monetary){
    if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>40)return fail('بین یک تا چهل ردیف عملیات وارد کنید');
    for(const row of body.rows){
      const description=text(row?.description,500),unit=text(row?.unit,30);
      const quantity=Number(row?.quantity),unitPrice=Number(row?.unitPrice),amount=Number(row?.amount);
      const total=unit ? Math.round(quantity*unitPrice) : amount;
      if(!description || !Number.isSafeInteger(total) || !total || (type==='extra' && total<0) ||
        (unit && (!Number.isFinite(quantity)||quantity<=0||!Number.isSafeInteger(unitPrice))))return fail('شرح و مبلغ یا مقدار و بهای واحد همهٔ عملیات را معتبر وارد کنید');
      rows.push(unit?{description,unit,quantity,unitPrice}:{description,amount});
    }
  }
  const amount=addendumAmount(rows);
  if(!Number.isSafeInteger(amount))return fail('جمع مبلغ الحاقیه نامعتبر است');
  const reviewers=current?.contractApproverContactIds ?? addendumReviewers(project,parent);
  const sequence=current?.sequence ?? Math.max(0,...(project.contractAddenda||[]).filter(row=>row.parentContractId===String(parent.id)).map(row=>row.sequence||0))+1;
  const next={
    ...current,id,parentContractId:String(parent.id),parentContractNo:parent.contractNo,sequence,
    contractNo:current?.contractNo || parent.contractNo+'-A'+String(sequence).padStart(2,'0'),
    type,title:'الحاقیه '+ADDENDUM_TYPES[type],contractDate,endDate:type==='duration'?endDate:'',
    previousEndDate:type==='duration'?parent.endDate||'':'',note,rows,amount,
    contractApproverContactIds:reviewers,updatedAt:at,createdAt:current?.createdAt??at,
    status:'draft',isDraft:true,
  };
  if(!body.complete)return {ok:true,contract:next};
  Object.assign(next,{status:'final',isDraft:false,completedAt:at,approvalStatus:reviewers.length?null:'approved'});
  return reviewers.length ? transitionContractApproval(next,'submit',actor,{approverIds:reviewers,at}) : {ok:true,contract:next};
}
