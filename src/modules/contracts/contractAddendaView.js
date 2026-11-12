import { ADDENDUM_TYPES, addendumAmount, addendumReviewers, canDeleteAddendumRecord, canDeleteContractAddenda, canEditAddendumRecord, canEditContractAddenda, parentContractOf } from '../../domain/contractAddenda.js';
import { syncContractPartyData } from '../../domain/contractPartyData.js';
import { approvedContractContactIds, contractApproverIds, contractApprovalState, canCancelContractCompletion, canRevokeContractApproval, REJECTION_MIN_LENGTH } from '../../domain/contractApproval.js';
import { isAddendumVisibleInFinance } from '../../domain/contractHandoff.js';
import { projectRepository } from '../../data/projectRepository.js';
import { formatJalaliDisplay, todayJalaliStr } from '../../ui/jalali.js';
import { toEnglishDigits } from '../../ui/digits.js';
import { openSearchPicker } from '../../ui/searchPickerAdapter.js';
import { openConfirm } from '../../ui/confirm.js';
import { closeWbsSheet, fieldRow, openWbsSheet } from '../wbs/wbsSheet.js';
import { currentExecutionActor } from '../wbs/executionActor.js';
import { openStaticChoicePicker } from './contractPickers.js';
import { contactApi } from '../../domain/contactApi.js';
import { activityApi } from '../../domain/activityApi.js';
import { contractCreatedParts, contractProjectPath, normalizeContractSearch, renderContractCardHeading, renderContractReviewRow, renderContractStatusRow } from './contractsModule.js';
import { ftAmountSummary, ftNumberRow, ftSelectRow, renderContractSavebar } from './realContractFormModule.js';
import { makeQuantityRow, renderQuantityRows, rowAmount, syncContractAmount } from './contractPricing.js';
import { addendumDocumentMarkup } from './contractDocument.js';
import { openContractPreview } from './contractPreviewView.js';
import { openContractExport } from './contractExportView.js';
import { renderContractFinanceReview } from './contractFinanceReviewView.js';
import { canCreateAddendumFromContract } from '../../domain/contractAddenda.js';
import { renderContractHistory } from './contractHistoryView.js';
import { renderContractProgress, renderContractProgressCircle } from './contractProgressView.js';
import { renderContractSignedSection } from './contractSignedView.js';
import { openContractReasonSheet } from './contractReasonSheet.js';
import { saveContractHandoff } from './contractHandoffApi.js';

const toast=message=>window.KarhaUI?.showToast?.(message);
const number=value=>new Intl.NumberFormat('fa-IR').format(value);
const money=value=>number(value)+' تومان';
const confirmCompletion=(hasReviewer,onConfirm)=>openConfirm(
  hasReviewer?'آیا الحاقیه تکمیل است و برای تأیید ارسال شود؟':'آیا الحاقیه تکمیل است؟',onConfirm,'بله'
);
function reviewerName(project,id){
  const contact=project.contacts?.find(person=>String(person.id)===String(id));
  return [contact?.firstName,contact?.lastName].filter(Boolean).join(' ') || contact?.name || 'مخاطب حذف‌شده';
}

const writable=project=>canEditContractAddenda(window.KarhaSaosaWorkspaceAccess?.[project.id]);
const pickFixed=(title,listTitle,options,current,onPick)=>openStaticChoicePicker(title,listTitle,options,current,onPick,null,{preserveOrder:true});
const newOperation=()=>({...makeQuantityRow(),pricingMode:'agreed',agreedPrice:''});

function button(label,action,style='contract-review-action'){
  const element=document.createElement('button');
  element.type='button';
  element.className=style;
  element.textContent=label;
  element.onclick=()=>action(element);
  return element;
}

function contractPickerItem(project,contract){
  const contact=contactApi.lookup(project.id,contract.contractorId||contract.contactId);
  const person=[contact?.firstName,contact?.lastName].filter(Boolean).join(' ') || contact?.name || contract.contractorName || 'بدون پیمانکار';
  const activity=activityApi.lookup(project.id,contract.activityId);
  const activityName=activity?.name || activity?.title || contract.documentActivityName || 'بدون فعالیت';
  const template=project.contractTemplates?.find(row=>String(row.id)===String(contract.templateId));
  const path=contractProjectPath(project,contract);
  const pathParts=path.split(' ← ').filter(Boolean);
  const work=pathParts.pop() || contract.workTaskTitle || activityName;
  const name=person+' | '+work;
  const detailLines=[contract.contractNo+' | '+activityName,pathParts.join(' ← ')].filter(Boolean);
  return {id:contract.id,name,detailLines,
    searchText:[name,contract.contractNo,activityName,path,contract.title,template?.title,contract.category,contract.categoryName].filter(Boolean).join(' | ')};
}

export function openAddendumPicker(projectId,onChanged){
  const project=projectRepository.find(projectId);
  if(!project || !writable(project))return;
  const contracts=(project.contracts||[]).filter(contract=>!contract.trashed && contract.contractNo);
  openSearchPicker({
    title:'انتخاب قرارداد',listTitle:'قراردادهای پروژه',contextKey:'addendum:'+project.id,
    items:contracts.map(contract=>contractPickerItem(project,contract)),
    showAdd:false,showStar:false,normalizeSearch:normalizeContractSearch,
    onSelect:item=>{
      const openForm=()=>{
        if(window.KarhaRoute?.moduleId!=='contract-addenda' || String(window.KarhaRoute.projectId)!==String(projectId))return;
        const current=projectRepository.find(projectId);
        const contract=current && parentContractOf(current,{parentContractId:item.id});
        if(contract && writable(current))openAddendumForm(current,contract,null,onChanged);
      };
      // The picker closes its history entry before opening the form.
      const history=window.KarhaChildHistory;
      if(history?.currentTraversalTransaction?.())history.afterNextPop(openForm);
      else openForm();
    },
  });
}

function openAddendumForm(project,parent,record,onChanged){
  if(!parent){toast('قرارداد اصلی پیدا نشد');return;}
  const addendum=record || {id:'addendum-'+crypto.randomUUID(),parentContractId:String(parent.id)};
  const reviewerIds=addendumReviewers(project,parent);
  const draft={type:'extra',contractDate:todayJalaliStr(),endDate:'',note:'',rows:[],...record};
  const priceRows=draft.type==='price' && draft.rows.length ? draft.rows.map(row=>({...row})) : [{}];
  const operations=draft.type==='extra' && draft.rows.length ? draft.rows.map(row=>({
    ...makeQuantityRow(),...row,pricingMode:row.pricingMode || (row.unit?'quantity':'agreed'),
    agreedPrice:row.amount ?? '',
  })) : [newOperation()];
  let dirty=false;
  let busy=false;
  let sheet;
  const save=async complete=>{
    if(busy)return;
    busy=true;
    try{
      const {type,contractDate,endDate,note}=draft;
      const rows=type==='extra' ? operations.map(({pricingMode,description,unit,quantity,unitPrice,agreedPrice})=>
        pricingMode==='quantity' ? {pricingMode,description,unit,quantity,unitPrice} : {pricingMode,description,amount:agreedPrice}
      ) : priceRows;
      await saveContractHandoff(project.id,addendum,'save_addendum',{type,contractDate,endDate,note,rows,complete,parentContractId:addendum.parentContractId});
      dirty=false;
      if(sheet.isConnected)closeWbsSheet();
      onChanged();
    }catch(error){toast(error.message);}
    finally{busy=false;}
  };
  const requestClose=()=>{
    if(busy)return;
    if(!dirty){closeWbsSheet();return;}
    window.KarhaUI?.showIncompleteFormExitChoice?.({onYes:()=>save(false),onNo:()=>closeWbsSheet()});
  };
  const header=renderContractCardHeading(project,parent,{onExport:trigger=>openContractExport(project,parent,{trigger})});
  const footer=document.createElement('div');
  footer.className='contract-addendum-actions';
  footer.append(renderContractSavebar({onSave:()=>save(false),onComplete:()=>confirmCompletion(reviewerIds.some(Boolean),()=>save(true)),onCancel:requestClose}));
  sheet=openWbsSheet({
    title:record?'ویرایش الحاقیه':'ثبت الحاقیه',presentation:'stage-create',historyKey:'addendum:'+addendum.id,autoFocus:false,
    header,footer,requestClose,hasUnsavedChanges:()=>dirty || busy,
    body(root){
      root.classList.add('contract-form-body','form-template');
      const reviewerInfo=document.createElement('p');
      reviewerInfo.className='wbs-note';
      const names=reviewerIds.map(id=>reviewerName(project,id));
      reviewerInfo.textContent=names.length?'مسئولان تأیید: '+names.join('، '):'بدون مسئول تأیید';
      const fields=document.createElement('div');
      const noteField=()=>{
        const input=document.createElement('textarea');
        input.className='wbs-input today-textarea';
        input.value=draft.note;
        input.oninput=()=>{draft.note=input.value;dirty=true;};
        return fieldRow('شرح تغییرات',input);
      };
      const dateField=(label,key)=>{
        const control=button(formatJalaliDisplay(draft[key])||'انتخاب تاریخ',()=>window.KarhaUI?.openJalaliPicker?.(draft[key],date=>{
          draft[key]=date;dirty=true;control.textContent=formatJalaliDisplay(date);
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
        if(draft.type==='extra'){
          const change=()=>{dirty=true;paint();};
          renderQuantityRows(fields,operations,{
            operations:true,mixed:true,allowRemeasurement:false,newPricingMode:'agreed',
            selectRow:ftSelectRow,pick:pickFixed,onChange:change,onDirty:()=>{dirty=true;},
            numberRow:(parent,label,value,onChange,opts)=>ftNumberRow(parent,label,value,onChange,{...opts,onCommit:change}),
          });
          ftAmountSummary(fields,'جمع مبلغ الحاقیه',operations.reduce((total,row)=>total+rowAmount(row),0));
        }
        if(draft.type==='price'){
          const total=document.createElement('p');total.className='wbs-note';
          const normalized=()=>priceRows.map(row=>({...row,
            quantity:Number(toEnglishDigits(row.quantity??'')),unitPrice:Number(toEnglishDigits(row.unitPrice??'')),amount:Number(toEnglishDigits(row.amount??'')),
          }));
          const paintTotal=()=>{total.textContent='جمع الحاقیه: '+money(addendumAmount(normalized())||0);};
          priceRows.forEach((row,index)=>{
            const card=document.createElement('div');card.className='contract-row';
            const title=document.createElement('strong');title.textContent='عملیات '+number(index+1);
            const addField=(label,key,numeric=false)=>{
              const input=document.createElement('input');input.className='wbs-input';input.value=row[key]??'';
              if(numeric)input.inputMode='decimal';
              input.oninput=()=>{row[key]=numeric?toEnglishDigits(input.value):input.value;dirty=true;paintTotal();};
              card.append(fieldRow(label,input));
            };
            card.append(title);
            if(priceRows.length>1)card.append(button('حذف',()=>{priceRows.splice(index,1);dirty=true;paint();}));
            addField('شرح عملیات','description');addField('واحد (اختیاری)','unit');
            addField('مقدار','quantity',true);addField('بهای واحد (تومان)','unitPrice',true);
            addField('مبلغ توافقی در صورت خالی بودن واحد (تومان)','amount',true);
            fields.append(card);
          });
          fields.append(button('افزودن ردیف',()=>{priceRows.push({});dirty=true;paint();}),total);
          paintTotal();
        }
      };
      const type=button(ADDENDUM_TYPES[draft.type],()=>openStaticChoicePicker(
        'نوع الحاقیه','انواع الحاقیه',Object.entries(ADDENDUM_TYPES).map(([value,label])=>({value,label})),draft.type,
        next=>{draft.type=next;dirty=true;type.textContent=ADDENDUM_TYPES[next];paint();},null,{preserveOrder:true}
      ),'wbs-input');
      root.append(fieldRow('نوع الحاقیه',type),dateField('تاریخ الحاقیه','contractDate'),fields,reviewerInfo,noteField());
      paint();
    },
  });
  sheet.classList.add('contract-addendum-form');
}

export function renderAddendumCard(project,addendum,onChanged,finance=false,approval,{nested=false}={}){
  const documentAddendum=finance ? addendum.accountingPackage.contract : addendum;
  const frozenParent=addendum.accountingPackage?.contract?.parentDocument;
  const parent=finance?frozenParent:parentContractOf(project,addendum)||frozenParent;
  const documentParent=()=>parent && !finance && parent!==frozenParent
    ? syncContractPartyData({...parent},project) : parent;
  const row=document.createElement('article');row.className='contract-row';
  const preview=trigger=>openContractPreview(project,documentAddendum,{
    trigger,addendum:{parent:documentParent()},
    signedFiles:finance?addendum.accountingPackage.signedFiles:null,
  });
  const headerContract={...parent,contractNo:addendum.contractNo,createdAt:addendum.createdAt};
  const actor=currentExecutionActor(project);
  let busy=false;
  const review=async(action,reason)=>{
    if(busy)return false;
    busy=true;
    try{await saveContractHandoff(project.id,latestAddendum(),action,{reason});onChanged();return true;}
    catch(error){toast(error.message);return false;}finally{busy=false;}
  };
  const latestAddendum=()=>projectRepository.find(project.id)?.contractAddenda?.find(record=>record.id===addendum.id) || addendum;
  const openProgress=event=>{
    event?.stopPropagation();
    openWbsSheet({title:'وضعیت الحاقیه',showSave:false,reuseHistoryOnReplace:true,historyKey:'addendum-status:'+addendum.id,
      body(root){
        root.classList.add('contract-status-sheet');
        renderDetails(root,latestAddendum());
      },
    });
  };
  const heading=renderContractCardHeading(project,headerContract,approval?null:{
    onEdit:!finance && parent && writable(project) && (nested || canEditAddendumRecord(addendum))
      ? ()=>{
        const record=latestAddendum();
        if(!canEditAddendumRecord(record))return toast('الحاقیه در وضعیت فعلی قابل ویرایش نیست');
        openAddendumForm(project,parent,record,onChanged);
      } : undefined,
    onDelete:!finance && (nested || canDeleteAddendumRecord(addendum)) && canDeleteContractAddenda(window.KarhaSaosaWorkspaceAccess?.[project.id])
      ? ()=>{
        if(!canDeleteAddendumRecord(latestAddendum()))return toast('الحاقیه در وضعیت فعلی قابل حذف نیست');
        openConfirm('الحاقیه '+addendum.contractNo+' حذف شود؟',()=>review('delete_addendum'),'حذف');
      } : undefined,
    onExport:trigger=>openContractExport(project,documentAddendum,{
      trigger,markup:'<section class="contract-export-document" dir="rtl">'+
        addendumDocumentMarkup(documentAddendum,documentParent())+'</section>',
    }),
  },{
    titlePrefix:'الحاقیه',
    onPreview:preview,
    progress:nested?renderContractProgressCircle(document,addendum,project,openProgress):null,
  });
  if(nested){
    heading.className+=' contract-card-heading--nested-addendum';
    const main=heading.children[0];
    const serial=/[-]A(\d+)$/i.exec(addendum.contractNo || '');
    main.children[0].textContent=serial?'الحاقیه شماره '+number(Number(serial[1])):'الحاقیه';
    main.children[1].dir='rtl';
    main.children[1].textContent=addendum.rows?.find(item=>item.description?.trim())?.description || ADDENDUM_TYPES[addendum.type] || 'الحاقیه قرارداد';
    const date=document.createElement('div');date.className='contract-meta contract-number';
    date.dir='rtl';
    const contractDate=formatJalaliDisplay(addendum.contractDate) || contractCreatedParts(addendum.createdAt)?.date;
    date.textContent=[money(addendum.amount ?? addendumAmount(addendum.rows)),contractDate].filter(Boolean).join(' | ');
    main.append(date);
    heading.children[2].hidden=true;
  }
  row.append(heading);
  if(approval){
    row.append(renderContractReviewRow(addendum,{...approval,preview}),renderContractProgress(document,addendum,project));
    return row;
  }
  function renderDetails(root,addendum){
    const toolbar=renderContractStatusRow(addendum,{showBadge:!finance || ['accepted','rejected'].includes(addendum.accountingStatus)});
    const actions=finance?toolbar:renderContractStatusRow(addendum,{showBadge:false});
    if(!finance && !nested)toolbar.className='contract-addendum-toolbar';
    if(finance){
      actions.className+=' contract-workflow-row--signed-addendum';
      renderContractSignedSection(project,addendum,{finance,inlineActions:actions});
    }
    if(parent)toolbar.append(button('مشاهده قرارداد اصلی',trigger=>openContractPreview(project,parent,{trigger,frozen:finance || parent===frozenParent})));
    const returnForEdit=(label,action)=>openWbsSheet({title:label,historyKey:'addendum-return:'+addendum.id,
      body(root){const reason=document.createElement('textarea');reason.name='reason';reason.className='wbs-input today-textarea';root.append(fieldRow('علت برگشت',reason));},
      onSave(root){
        const sheet=root.closest('.overlay');
        review(action,root.querySelector('[name="reason"]').value).then(ok=>{if(ok&&sheet?.isConnected)closeWbsSheet();});
        return false;
      },
    });
    const signed=finance?null:renderContractSignedSection(project,addendum,{onChanged,attachmentActions:toolbar,onReturn:nested?openProgress:null});
    if(!finance){
      if(writable(project) && canRevokeContractApproval(addendum,actor))actions.append(button('لغو تأیید من',()=>returnForEdit('لغو تأیید الحاقیه','revoke_addendum')));
      if(writable(project) && canCancelContractCompletion(addendum))toolbar.append(button('لغو اعلام تکمیل',()=>returnForEdit('لغو تکمیل الحاقیه','cancel_completion'),'contract-review-action danger'));
      if(writable(project) && addendum.approvalStatus==='pending' && addendum.submittedBy?.id===actor.id){
        toolbar.append(button('× پس گرفتن از مسئول تأیید',()=>openContractReasonSheet({
          title:'پس گرفتن الحاقیه از مسئول تأیید',
          historyKey:'withdraw-addendum-review:'+addendum.id,
          fieldLabel:'دلیل پس گرفتن از مسئول تأیید (الزامی)',
          minLength:REJECTION_MIN_LENGTH,
          submit:reason=>review('withdraw_submission',reason),
        }),'contract-review-action danger'));
      }
      const reason=addendum.accountingStatus==='rejected'?addendum.financeRejection?.reason:addendum.approvalRejectionReason;
      if(reason && addendum.isDraft){
        const message=document.createElement('p');message.className='contract-rejection-reason';message.textContent=reason;
        actions.append(message);
      }
    }
    root.append(toolbar);
    if(!finance){
      if(actions.children.length)root.append(actions);
      root.append(renderContractProgress(document,addendum,project));
      const reviewers=contractApproverIds(addendum);
      if(reviewers.length && ['pending','approved'].includes(contractApprovalState(addendum))){
        const approved=new Set(approvedContractContactIds(addendum));
        const list=document.createElement('ul');list.className='contract-meta contract-addendum-reviewers';
        list.setAttribute('aria-label','وضعیت تأیید مسئولان الحاقیه');
        for(const id of reviewers){
          const item=document.createElement('li');
          item.textContent=reviewerName(project,id)+' · '+(approved.has(id)?'تأیید کرد':'در انتظار تأیید');
          list.append(item);
        }
        root.append(list);
      }
      if(signed)root.append(signed);
    }
    if(finance){
      const original=parent && syncContractAmount(structuredClone(parent));
      const adjustments=(project.contractAddenda||[]).filter(record=>record.parentContractId===addendum.parentContractId
        && isAddendumVisibleInFinance(record) && record.accountingStatus==='accepted').reduce((sum,record)=>sum+record.amount,0);
      const summary=document.createElement('div');summary.className='contract-meta';
      summary.textContent='اثر مالی این الحاقیه: '+money(documentAddendum.amount ?? addendum.amount)+' | جمع الحاقیه‌های تأییدشده: '+money(adjustments);
      if(original!=null && original!=='')summary.textContent+=' | مبلغ اصلی: '+money(Number(original))+' | مبلغ به‌روز: '+money(Number(original)+adjustments);
      root.append(summary,renderContractFinanceReview(project,addendum,{onChanged}));
    }
    root.append(renderContractHistory(document,addendum,{finance}));
  }
  if(!nested)renderDetails(row,addendum);
  return row;
}

export function renderContractAddendaRow(project,contract){
  const records=source=>(source.contractAddenda||[]).filter(addendum=>!addendum.trashed
    && String(addendum.parentContractId)===String(contract.id));
  const canCreate=canCreateAddendumFromContract(contract,project) && writable(project);
  if(!canCreate && !records(project).length)return null;

  const row=document.createElement('section');row.className='contract-addenda-row';
  row.onclick=event=>event.stopPropagation();
  const toolbar=document.createElement('div');toolbar.className='contract-addenda-row-toolbar';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='contract-review-action contract-addenda-toggle';
  const list=document.createElement('div');list.className='contract-addenda-children';list.hidden=true;
  const refresh=(source=projectRepository.find(project.id) || project)=>{
    const addenda=records(source);
    toggle.textContent='الحاقیه‌ها ('+number(addenda.length)+')';
    toggle.setAttribute('aria-expanded',String(!list.hidden));
    if(list.hidden)return;
    list.replaceChildren(...addenda.sort((a,b)=>b.createdAt-a.createdAt)
      .map(addendum=>renderAddendumCard(source,addendum,()=>refresh(),false,undefined,{nested:true})));
    if(!addenda.length){
      const empty=document.createElement('p');empty.className='contract-meta';empty.textContent='هنوز الحاقیه‌ای ثبت نشده است.';
      list.appendChild(empty);
    }
  };
  toggle.onclick=()=>{list.hidden=!list.hidden;refresh();};
  toolbar.appendChild(toggle);
  if(canCreate){
    toolbar.appendChild(button('ایجاد الحاقیه',()=>openAddendumForContract(project.id,contract.id,()=>{
      if(row.isConnected){list.hidden=false;refresh();}
    }),'contract-review-action contract-addendum-create'));
  }
  row.append(toolbar,list);
  refresh(project);
  return row;
}

export function openAddendumForContract(projectId,contractId,onChanged=()=>{}){
  const project=projectRepository.find(projectId);
  if(!project || !writable(project))return;
  const contract=parentContractOf(project,{parentContractId:contractId});
  if(!canCreateAddendumFromContract(contract,project)){
    toast('ابتدا همهٔ مراحل تأیید قرارداد را کامل کنید');
    return;
  }
  openAddendumForm(project,contract,null,onChanged);
}

export function renderContractAddenda(body,projectId,{finance=false,onChanged}={}){
  const project=projectRepository.find(projectId);
  if(!project)return;
  const refresh=onChanged||(()=>renderContractAddenda(body,projectId,{finance}));
  const records=(project.contractAddenda||[]).filter(row=>!row.trashed && (!finance || isAddendumVisibleInFinance(row)));
  const section=document.createElement('section');section.className=finance?'contract-list':'contract-list contract-addenda-list';
  if(finance){
    if(!records.length)return;
    const title=document.createElement('h3');title.textContent='الحاقیه‌ها';section.append(title);
  }else body.replaceChildren();
  if(!records.length){
    const empty=document.createElement('p');empty.className='contract-empty';empty.textContent='هنوز الحاقیه‌ای ثبت نشده است.';
    section.append(empty);
  }
  for(const record of [...records].sort((a,b)=>b.createdAt-a.createdAt))section.append(renderAddendumCard(project,record,refresh,finance));
  body.append(section);
}
