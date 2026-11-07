import { ADDENDUM_TYPES, addendumAmount, addendumReviewers, parentContractOf } from '../../domain/contractAddenda.js';
import { syncContractPartyData } from '../../domain/contractPartyData.js';
import { canCancelContractCompletion, canReviewContract, canRevokeContractApproval } from '../../domain/contractApproval.js';
import { isContractInFinance } from '../../domain/contractHandoff.js';
import { workPath } from '../../domain/wbs/workTaskContractSync.js';
import { projectRepository } from '../../data/projectRepository.js';
import { formatJalaliDisplay, todayJalaliStr } from '../../ui/jalali.js';
import { toEnglishDigits } from '../../ui/digits.js';
import { openSearchPicker } from '../../ui/searchPickerAdapter.js';
import { openConfirm } from '../../ui/confirm.js';
import { closeWbsSheet, fieldRow, openWbsSheet } from '../wbs/wbsSheet.js';
import { currentExecutionActor } from '../wbs/executionActor.js';
import { openStaticChoicePicker } from './contractPickers.js';
import { syncContractAmount } from './contractPricing.js';
import { openContractPreview } from './contractPreviewView.js';
import { openContractExport } from './contractExportView.js';
import { renderContractFinanceReview } from './contractFinanceReviewView.js';
import { renderContractHistory } from './contractHistoryView.js';
import { renderContractProgress } from './contractProgressView.js';
import { renderContractSignedSection } from './contractSignedView.js';
import { saveContractHandoff } from './contractHandoffApi.js';

const toast=message=>window.KarhaUI?.showToast?.(message);
const number=value=>new Intl.NumberFormat('fa-IR').format(value);
const money=value=>number(value)+' تومان';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const writable=project=>{
  const access=window.KarhaSaosaWorkspaceAccess?.[project.id];
  const permissions=access?.permissions||{};
  return !access || access.role==='owner' || ['edit','create','full'].includes(permissions.modules?.contracts ?? permissions.contracts)
    || (!permissions.modules && permissions.edit===true);
};

function button(label,action,style='contract-review-action'){
  const element=document.createElement('button');
  element.type='button';
  element.className=style;
  element.textContent=label;
  element.onclick=()=>action(element);
  return element;
}

function contractLabel(project,contract){
  const contact=project.contacts?.find(row=>!row.trashed && String(row.id)===String(contract.contractorId||contract.contactId));
  const name=[contact?.firstName,contact?.lastName].filter(Boolean).join(' ') || contact?.name || contract.contractorName;
  const activity=project.activityTemplates?.find(row=>String(row.id)===String(contract.activityId));
  const template=project.contractTemplates?.find(row=>String(row.id)===String(contract.templateId));
  return [contract.contractNo,name,activity?.name,contract.title,template?.title,contract.category,contract.categoryName,
    contract.projectItemId ? workPath(project,contract.projectItemId) : '',contract.projectItemPath].filter(Boolean).join(' | ');
}

function pickContract(project,onPick){
  const contracts=(project.contracts||[]).filter(contract=>!contract.trashed && contract.contractNo);
  openSearchPicker({
    title:'انتخاب قرارداد اصلی',listTitle:'قراردادهای پروژه',contextKey:'addendum:'+project.id,
    items:contracts.map(contract=>({id:contract.id,name:contractLabel(project,contract)})),
    showAdd:false,showStar:false,
    normalizeSearch:value=>toEnglishDigits(value||'').normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\s\u200c]/g,'').toLocaleLowerCase('fa'),
    onSelect:item=>{const contract=contracts.find(contract=>String(contract.id)===String(item.id));if(contract)onPick(contract);},
  });
}

function openAddendumForm(project,parent,record,onChanged){
  if(!parent){toast('قرارداد اصلی پیدا نشد');return;}
  const addendum=record || {id:'addendum-'+crypto.randomUUID(),parentContractId:String(parent.id)};
  const draft={type:'extra',contractDate:todayJalaliStr(),endDate:'',note:'',rows:[],...record};
  draft.rows=draft.rows.map(row=>({...row}));
  if(!draft.rows.length)draft.rows.push({});
  let busy=false;
  let sheet;
  const save=async complete=>{
    if(busy)return;
    busy=true;
    try{
      const {type,contractDate,endDate,note,rows}=draft;
      await saveContractHandoff(project.id,addendum,'save_addendum',{type,contractDate,endDate,note,rows,complete,parentContractId:addendum.parentContractId});
      if(sheet.isConnected)closeWbsSheet();
      onChanged();
    }catch(error){toast(error.message);}
    finally{busy=false;}
  };
  sheet=openWbsSheet({
    title:record?'ویرایش الحاقیه':'ثبت الحاقیه',presentation:'stage-create',historyKey:'addendum:'+addendum.id,autoFocus:false,
    body(root){
      const parentInfo=document.createElement('p');
      parentInfo.className='wbs-note';
      parentInfo.textContent=contractLabel(project,parent);
      const reviewerInfo=document.createElement('p');
      reviewerInfo.className='wbs-note';
      const reviewerIds=record?.contractApproverContactIds ?? addendumReviewers(project,parent);
      const names=reviewerIds.map(id=>{
        const contact=project.contacts?.find(contact=>String(contact.id)===id);
        return [contact?.firstName,contact?.lastName].filter(Boolean).join(' ') || contact?.name || 'مخاطب حذف‌شده';
      });
      reviewerInfo.textContent=names.length?'مسئولان تأیید: '+names.join('، '):'بدون مسئول تأیید';
      root.append(parentInfo,reviewerInfo);
      const fields=document.createElement('div');
      const noteField=()=>{
        const input=document.createElement('textarea');
        input.className='wbs-input today-textarea';
        input.value=draft.note;
        input.oninput=()=>{draft.note=input.value;};
        return fieldRow('شرح تغییرات',input);
      };
      const dateField=(label,key)=>{
        const control=button(formatJalaliDisplay(draft[key])||'انتخاب تاریخ',()=>window.KarhaUI?.openJalaliPicker?.(draft[key],date=>{
          draft[key]=date;control.textContent=formatJalaliDisplay(date);
        }),'wbs-input');
        return fieldRow(label,control);
      };
      const paint=()=>{
        fields.replaceChildren();
        if(draft.type==='duration'){
          const old=document.createElement('p');old.className='wbs-note';
          old.textContent='پایان قرارداد اصلی: '+(formatJalaliDisplay(parent.endDate)||'ثبت نشده');
          fields.append(old,dateField('تاریخ پایان جدید','endDate'));
        }
        if(['extra','price'].includes(draft.type)){
          const total=document.createElement('p');total.className='wbs-note';
          const normalized=()=>draft.rows.map(row=>({...row,
            quantity:Number(toEnglishDigits(row.quantity??'')),unitPrice:Number(toEnglishDigits(row.unitPrice??'')),amount:Number(toEnglishDigits(row.amount??'')),
          }));
          const paintTotal=()=>{total.textContent='جمع الحاقیه: '+money(addendumAmount(normalized())||0);};
          draft.rows.forEach((row,index)=>{
            const card=document.createElement('div');card.className='contract-row';
            const title=document.createElement('strong');title.textContent='عملیات '+number(index+1);
            const addField=(label,key,numeric=false)=>{
              const input=document.createElement('input');input.className='wbs-input';input.value=row[key]??'';
              if(numeric)input.inputMode='decimal';
              input.oninput=()=>{row[key]=numeric?toEnglishDigits(input.value):input.value;paintTotal();};
              card.append(fieldRow(label,input));
            };
            card.append(title);
            if(draft.rows.length>1)card.append(button('حذف',()=>{draft.rows.splice(index,1);paint();}));
            addField('شرح عملیات','description');addField('واحد (اختیاری)','unit');
            addField('مقدار','quantity',true);addField('بهای واحد (تومان)','unitPrice',true);
            addField('مبلغ توافقی در صورت خالی بودن واحد (تومان)','amount',true);
            fields.append(card);
          });
          fields.append(button('افزودن ردیف',()=>{draft.rows.push({});paint();}),total);
          paintTotal();
        }
      };
      const type=button(ADDENDUM_TYPES[draft.type],()=>openStaticChoicePicker(
        'نوع الحاقیه','انواع الحاقیه',Object.entries(ADDENDUM_TYPES).map(([value,label])=>({value,label})),draft.type,
        next=>{draft.type=next;type.textContent=ADDENDUM_TYPES[next];paint();},null,{preserveOrder:true}
      ),'wbs-input');
      root.append(fieldRow('نوع الحاقیه',type),dateField('تاریخ الحاقیه','contractDate'),fields,
        noteField(),button('اعلام تکمیل',()=>save(true)));
      paint();
    },
    onSave(){save(false);return false;},
  });
}

function addendumDocument(addendum,parent){
  const {contractNo,parentContractNo,contractDate,note,rows,amount,previousEndDate,endDate}=addendum;
  return '<section class="contract-export-document" dir="rtl">'+
    '<h1 class="doc-title">'+esc(addendum.title)+'</h1>'+
    '<div class="doc-contract-meta" data-contract-number="'+esc(contractNo)+'">شماره الحاقیه: '+esc(contractNo)+
    ' | تاریخ: '+esc(formatJalaliDisplay(contractDate))+' | قرارداد اصلی: '+esc(parentContractNo)+'</div>'+
    '<p>پیمانکار: '+esc(parent?.contractorName||'—')+' | کارفرما: '+esc(parent?.employerName||'—')+'</p>'+
    (note?'<p class="doc-clause">'+esc(note)+'</p>':'')+
    (endDate?'<p>تاریخ پایان قبلی: '+esc(formatJalaliDisplay(previousEndDate)||'—')+' | تاریخ پایان جدید: '+esc(formatJalaliDisplay(endDate))+'</p>':'')+
    (rows||[]).map((row,index)=>'<div class="doc-clause"><b>عملیات '+number(index+1)+'</b> · '+esc(row.description)+
      (row.unit?' · '+number(row.quantity)+' '+esc(row.unit)+' × '+money(row.unitPrice):'')+' · '+money(addendumAmount([row]))+'</div>').join('')+
    (rows?.length?'<p><b>جمع الحاقیه: '+money(amount)+'</b></p>':'')+'</section>';
}

function addendumCard(project,addendum,onChanged,finance){
  const documentAddendum=finance ? addendum.accountingPackage.contract : addendum;
  const frozenParent=addendum.accountingPackage?.contract?.parentDocument;
  const parent=finance?frozenParent:parentContractOf(project,addendum)||frozenParent;
  const row=document.createElement('article');row.className='contract-row';
  const heading=document.createElement('div');heading.className='contract-card-heading';
  const main=document.createElement('div');main.className='contract-main';
  const title=document.createElement('div');title.className='contract-title';title.textContent=addendum.title;
  const meta=document.createElement('div');meta.className='contract-meta';
  meta.textContent=addendum.contractNo+' · قرارداد اصلی '+addendum.parentContractNo+' · '+formatJalaliDisplay(addendum.contractDate);
  main.append(title,meta);heading.append(main);row.append(heading);
  const actions=document.createElement('div');actions.className='contract-workflow-row';
  if(parent)actions.append(button('مشاهده قرارداد اصلی',trigger=>openContractPreview(project,parent,{trigger,frozen:finance || parent===frozenParent})));
  actions.append(button('خروجی الحاقیه',trigger=>openContractExport(project,documentAddendum,{
    trigger,markup:addendumDocument(documentAddendum,parent && !finance ? syncContractPartyData({...parent},project) : parent),
  })));
  if(!finance && addendum.isDraft && writable(project))actions.append(button('ویرایش الحاقیه',()=>openAddendumForm(project,parent,addendum,onChanged)));
  const actor=currentExecutionActor(project);
  let busy=false;
  const review=async(action,reason)=>{
    if(busy)return false;
    busy=true;
    try{await saveContractHandoff(project.id,addendum,action,{reason});onChanged();return true;}
    catch(error){toast(error.message);return false;}finally{busy=false;}
  };
  if(!finance && canReviewContract(addendum,actor))actions.append(button('تأیید الحاقیه',()=>openConfirm('الحاقیه تأیید شود؟',()=>review('approve_addendum'),'تأیید')));
  const returnForEdit=(label,action)=>openWbsSheet({title:label,historyKey:'addendum-return:'+addendum.id,
    body(root){const reason=document.createElement('textarea');reason.name='reason';reason.className='wbs-input today-textarea';root.append(fieldRow('علت برگشت',reason));},
    onSave(root){
      const sheet=root.closest('.overlay');
      review(action,root.querySelector('[name="reason"]').value).then(ok=>{if(ok&&sheet?.isConnected)closeWbsSheet();});
      return false;
    },
  });
  if(!finance){
    if(canRevokeContractApproval(addendum,actor))actions.append(button('لغو تأیید من',()=>returnForEdit('لغو تأیید الحاقیه','revoke_addendum')));
    if(writable(project) && canCancelContractCompletion(addendum))actions.append(button('لغو اعلام تکمیل',()=>returnForEdit('لغو تکمیل الحاقیه','cancel_completion')));
    if(writable(project) && addendum.approvalStatus==='pending' && addendum.submittedBy?.id===actor.id){
      actions.append(button('پس‌گرفتن از تأیید',()=>returnForEdit('پس‌گرفتن الحاقیه از تأیید','withdraw_submission')));
    }
    const reason=addendum.accountingStatus==='rejected'?addendum.financeRejection?.reason:addendum.approvalRejectionReason;
    if(reason && addendum.isDraft){
      const message=document.createElement('p');message.className='contract-rejection-reason';message.textContent=reason;
      actions.append(message);
    }
  }
  row.append(actions,renderContractProgress(document,addendum,project));
  const signed=renderContractSignedSection(project,addendum,{onChanged,finance});
  if(signed)row.append(signed);
  if(finance){
    const original=parent && syncContractAmount(structuredClone(parent));
    const adjustments=(project.contractAddenda||[]).filter(record=>record.parentContractId===addendum.parentContractId
      && isContractInFinance(record) && record.accountingStatus==='accepted').reduce((sum,record)=>sum+record.amount,0);
    const summary=document.createElement('div');summary.className='contract-meta';
    summary.textContent='اثر مالی این الحاقیه: '+money(addendum.amount)+' | جمع الحاقیه‌های تأییدشده: '+money(adjustments);
    if(original!=null && original!=='')summary.textContent+=' | مبلغ اصلی: '+money(Number(original))+' | مبلغ به‌روز: '+money(Number(original)+adjustments);
    row.append(summary,renderContractFinanceReview(project,addendum,{onChanged}));
  }
  row.append(renderContractHistory(document,addendum,{finance}));
  return row;
}

export function renderContractAddenda(body,projectId,{finance=false,onChanged}={}){
  const project=projectRepository.find(projectId);
  if(!project)return;
  const refresh=onChanged||(()=>renderContractAddenda(body,projectId,{finance}));
  const records=(project.contractAddenda||[]).filter(row=>!finance || isContractInFinance(row));
  const section=document.createElement('section');section.className='contract-list';
  if(finance){
    if(!records.length)return;
    const title=document.createElement('h3');title.textContent='الحاقیه‌ها';section.append(title);
  }else{
    body.replaceChildren();
    const header=document.createElement('div');header.className='inner-section-bar';
    const title=document.createElement('h2');title.textContent='الحاقیه‌ها';
    header.append(title);
    if(writable(project)){
      const add=button('+',()=>pickContract(project,parent=>openAddendumForm(project,parent,null,refresh)),'inner-section-action');
      add.setAttribute('aria-label','افزودن الحاقیه');
      header.append(add);
    }
    section.append(header);
  }
  if(!records.length){
    const empty=document.createElement('p');empty.className='contract-empty';empty.textContent='هنوز الحاقیه‌ای ثبت نشده است.';
    section.append(empty);
  }
  for(const record of [...records].sort((a,b)=>b.createdAt-a.createdAt))section.append(addendumCard(project,record,refresh,finance));
  body.append(section);
}
