import {mountFileUploader} from '../files/fileUploader.js';
import {openContractReasonSheet} from './contractReasonSheet.js';
import {canDeleteContractDocument} from '../../domain/contractHandoff.js';
import {renderInlineContractReject} from './contractReasonSheet.js';
import {openContractPreview} from './contractPreviewView.js';
import {statementWorkRows,resolveStatementWork} from '../../domain/statementWork.js';
import { projectRepository } from '../../data/projectRepository.js';
import { canReviewContract, canEditAdvanceRequest, hasAdvanceSubmission, contractApproverIds } from '../../domain/contractApproval.js';
import { accountStatements, approvedStatement, statementAccount, statementAddenda, contractStatementTotals, finalStatementSummary, statementAmounts, statementsFor, contractAdvanceDeductionBalance, advanceDeductionFromPercent, contractAdvanceRows } from '../../domain/contractStatements.js';
import { canWriteProjectModule } from '../roleManagement/permissionState.js';
import { currentExecutionActor } from '../wbs/executionActor.js';
import { fieldRow, openWbsSheet, closeWbsSheet } from '../wbs/wbsSheet.js';
import { todayJalaliStr, formatJalaliDisplay, openJalaliPicker } from '../../ui/jalali.js';
import { makeQuantityRow, numericValue, renderQuantityRows, rowAmount } from './contractPricing.js';
import { ftAmountSummary, ftNumberRow, ftSelectRow } from './realContractFormModule.js';
import { openStaticChoicePicker } from './contractPickers.js';
import { saveContractHandoff } from './contractHandoffApi.js';
import { contractProjectPath, contractRowData, renderContractCardHeading } from './contractsModule.js';
import { contractProgressSteps, renderContractWorkflowPanel, renderContractProgressCircle } from './contractProgressView.js';
import { openContractHistory, renderContractHistory } from './contractHistoryView.js';
import { contractDisplayTitle } from './contractTitle.js';
import { openContractExport } from './contractExportView.js';
import { openConfirm } from '../../ui/confirm.js';
import { canDeleteContractAddenda } from '../../domain/contractAddenda.js';
import { openContractSignedUpload, renderContractSignedSection } from './contractSignedView.js';

const format=new Intl.NumberFormat('fa-IR');
const money=value=>value===null?'تعیین نشده':format.format(value)+' تومان';
const toast=message=>window.KarhaLegacy?.showToast?.(message);
const element=(tag,classes='',text='')=>{
  const node=document.createElement(tag);
  if(classes)node.className=classes;
  if(text)node.textContent=text;
  return node;
};
const button=(text,action,classes='contract-review-action')=>{
  const node=element('button',classes,text);
  node.type='button';
  node.onclick=event=>{event.stopPropagation();action(node);};
  return node;
};
const financeScope=projectId=>{
  const permissions=window.KarhaSaosaWorkspaceAccess?.[projectId]?.permissions||{};
  return Object.hasOwn(permissions.modules||permissions,'accounting-statements')?'accounting-statements':'accounting';
};
const currentProject=project=>projectRepository.find(project.id)||project;
export const statementTypes=[['interim','موقت'],['final','قطعی'],['retention-release','آزاد کردن حسن انجام کار'],['advance','پیش‌پرداخت']];
const statementTitle=record=>record.statementType==='advance'?'درخواست پرداخت پیش‌پرداخت شمارهٔ '+format.format(record.sequence||1):record.statementType==='retention-release'?'آزاد کردن حسن انجام کار':record.statementType==='final'?'صورت‌وضعیت قطعی':'صورت‌وضعیت موقت شماره '+format.format(record.sequence||1);

function table(rows){
  const node=element('table','contract-financial-table');
  const body=element('tbody');
  for(const [label,value] of rows){
    const row=element('tr'),heading=element('th','',label);
    heading.scope='row';
    row.append(heading,element('td','',value));
    body.append(row);
  }
  node.append(body);
  return node;
}

export function renderContractFinancialSummary(project,contract){
  const totals=contractStatementTotals(project,contract,{combined:true});
  const summary=element('div','contract-financial-groups');
  function group(title,rows){
    const card=element('section','contract-financial-group');
    const ledger=element('table','contract-financial-table');
    const body=element('tbody');
    for(const [label,value] of rows){
      const row=element('tr'),name=element('th','',label);
      name.scope='row';
      row.append(name,element('td','summary-amount',value==null?'تعیین نشده':format.format(value)),element('td','summary-unit',value?'تومان':''));
      body.append(row);
    }
    ledger.append(body);
    card.append(element('h3','',title),ledger);
    summary.append(card);
  }
  group('خلاصه مالی',[
    ['مبلغ به‌روز قرارداد',totals.total],
    ['مبلغ اولیه قرارداد',totals.original],
    ['جمع الحاقیه‌های نهایی‌شده',totals.adjustments],
    ['حسن انجام کار کل با احتساب الحاقیه‌ها',totals.estimatedRetention],
    ['خالص کل در صورت تکمیل',totals.total===null?null:totals.total-totals.estimatedRetention],
  ]);
  group('صورت‌وضعیت‌ها و پرداخت‌ها',[
    ['کارکرد تأییدشده',totals.gross],
    ['مانده حسن انجام کار',totals.retained],
    ['حسن انجام کار آزادشده',totals.released],
    ['پرداخت ثبت‌شده',totals.paid],
    ['مانده برای صورت‌وضعیت',totals.remaining],
    ['مانده پرداخت پیمانکار',totals.payable],
  ]);
  return summary;
}

function input(label,type,value=''){
  const node=element('input','wbs-input');
  node.type=type;
  node.value=value;
  return {node,row:fieldRow(label,node)};
}

function operationSummary(rows){
  return table(rows.map(row=>{
    const source=row.sourceSequence?'موقت '+format.format(row.sourceSequence):formatJalaliDisplay(row.sourceDate);
    return [[source,row.description].filter(Boolean).join(' · '),money(rowAmount(row))];
  }));
}

export function openStatementForm(project,contract,onChanged,record=null,type='interim',selectedId=''){
  const source=currentProject(project);
  const addenda=statementAddenda(source,contract);
  let addendumId=record?.addendumId || selectedId;
  let account,totals,final,workRows,entries;
  function selectAccount(){
    account=statementAccount(contract,addenda.find(item=>item.id===addendumId));
    totals=contractStatementTotals(source,account);
    final=finalStatementSummary(source,account);
    workRows=statementWorkRows(account,accountStatements(source,account).filter(approvedStatement));
    entries=workRows.map(row=>({...record?.workEntries?.find(item=>item.key===row.key),key:row.key}));
  }
  selectAccount();
  const workEntries=()=>entries.filter(entry=>entry.raw?.trim() || entry.value!=null).map(({key,method,raw,value})=>({
    key,method,value:raw===undefined?value:/^[\d۰-۹٠-٩,٬.٫]+$/.test(raw.trim())?numericValue(raw):null,
  }));
  let saving=false;
  const documentRecord=record||{id:'statement-'+crypto.randomUUID(),statementType:type};
  const operations=record?.operations?.length
    ? record.operations.map(row=>({...makeQuantityRow(),...row}))
    : [{...makeQuantityRow(),pricingMode:'quantity'}];
  if(record && !record.operations?.length){
    Object.assign(operations[0],{description:record.note||'کارکرد صورت‌وضعیت',pricingMode:'agreed',agreedPrice:record.statementType==='final'?record.cumulativeAmount:record.stageAmount});
  }
  const statementType=documentRecord.statementType;
  const advanceRows=statementType==='advance'?contractAdvanceRows(source,contract,record?.id):[];
  const payableAdvanceRows=advanceRows.filter(row=>row.balance>0);
  let advanceRow=payableAdvanceRows.find(row=>row.key===record?.advanceRow?.key) ||
    (payableAdvanceRows.length===1?payableAdvanceRows[0]:null);
  let advanceAmount=advanceRow?record?.statementAmount ?? '':'';
  const {paid:paidAdvance,available:availableAdvance}=contractAdvanceDeductionBalance(source,contract.id,record?.id);
  let deductionPercent=record?.advanceDeductionPercent;
  const legacyDeduction=record?.advanceDeduction||0;
  const deductionAmount=()=>addendumId?0:deductionPercent===undefined
    ? legacyDeduction
    : advanceDeductionFromPercent(paidAdvance,deductionPercent);
  const label=statementType==='advance'?'پرداخت پیش‌پرداخت':statementType==='retention-release'?'آزاد کردن حسن انجام کار'
    :(record?'اصلاح':'ایجاد')+' صورت‌وضعیت '+statementTypes.find(([value])=>value===statementType)[1];
  let date=record?.date||todayJalaliStr();
  const sheet=openWbsSheet({
    title:label,historyKey:'statement-form:'+contract.id,autoFocus:statementType!=='advance',
    body(root){
      const contractInfo=contractRowData(project.id,contract);
      const identity=element('div','contract-statement-identity');
      identity.append(element('strong','',contractInfo.title),element('div','',contractInfo.number));
      const dateField=element('div','form-template');
      const paintDate=()=>{
        dateField.replaceChildren();
        ftSelectRow(dateField,statementType==='advance'?'تاریخ درخواست':'تاریخ صورت‌وضعیت',formatJalaliDisplay(date),()=>openJalaliPicker(date,next=>{date=next;paintDate();}));
      };
      paintDate();
      const note=element('textarea','wbs-input');
      note.name='note';note.value=record?.note||'';
      const fields=element('div','contract-form-body');
      const calculation=element('div');
      const refresh=()=>{
        fields.replaceChildren();
        if(statementType==='advance'){
          if(!advanceRows.length){
            fields.append(element('p','contract-meta','جدول پیش‌پرداخت در قرارداد ردیفی ندارد'));
            return;
          }
          for(const row of advanceRows){
            const title='پیش‌پرداخت '+format.format(row.number);
            fields.append(table([[title,row.description||'—'],['مبلغ قراردادی',money(row.total)],
              ['موعد یا شرط پرداخت',row.dueText||'—'],['مانده قابل درخواست',money(row.balance)]]));
          }
          if(payableAdvanceRows.length>1){
            const choices=payableAdvanceRows.map(row=>({value:row.key,label:'پیش‌پرداخت '+format.format(row.number)}));
            ftSelectRow(fields,'ردیف پرداخت',choices.find(choice=>choice.value===advanceRow?.key)?.label||'انتخاب کنید',()=>
              openStaticChoicePicker('ردیف پرداخت','پیش‌پرداخت‌های قرارداد',choices,advanceRow?.key,key=>{
                advanceRow=payableAdvanceRows.find(row=>row.key===key);
                advanceAmount='';
                refresh();
              }));
          }
          if(advanceRow){
            const amounts=element('div','form-template contract-advance-amounts');
            const requested=ftNumberRow(amounts,'مبلغ درخواستی',advanceAmount,value=>{
              advanceAmount=value;
            },{suffix:'تومان',onCommit:refresh});
            requested.classList.add('contract-advance-requested');
            const remaining=advanceRow.balance-numericValue(advanceAmount);
            if(remaining<0){
              amounts.append(element('p','wbs-note','مبلغ درخواستی از مانده قابل درخواست بیشتر است.'));
            }else{
              ftAmountSummary(amounts,'مانده پس از این درخواست',remaining);
            }
            fields.append(amounts);
          }
          return;
        }
        if(statementType==='final'){
          if(final.operations.length)fields.append(operationSummary(final.operations));
          calculation.replaceChildren(table([
            ['جمع عملیات موقت تأییدشده',money(final.gross)],
            ['حسن انجام کار',money(final.retention)],
            ['خالص صورت‌وضعیت‌های موقت',money(final.net)],
            ['خالص لازم برای صدور قطعی',money(final.target)],
          ]));
          if(!final.ready)calculation.append(element('p','wbs-note','برای صدور قطعی، صورت‌وضعیت‌های موقت تأییدشده باید تمام کارکرد قرارداد را پوشش دهند.'));
          return;
        }
        if(statementType==='interim'){
          const update=()=>{
            const resolved=resolveStatementWork(workRows,workEntries());
            const gross=(resolved||[]).reduce((sum,row)=>sum+rowAmount(row),0);
            const result=statementAmounts(totals,account,gross,'interim');
            const deduction=deductionAmount();
            const valid=deduction!==null && deduction<=availableAdvance && deduction<=result.netAmount;
            calculation.replaceChildren(table([
              ['جمع کارکرد عملیات',money(gross)],['حسن انجام کار',money(result.retentionAmount)],
              ...(!addendumId && paidAdvance?[
                ['پیش‌پرداخت واریزشده',money(paidAdvance)],['مانده قابل کسر',money(availableAdvance)],
              ]:[]),
            ]));
            if(!addendumId && availableAdvance){
              const editor=element('div','form-template');
              ftNumberRow(editor,'درصد کسر پیش‌پرداخت این دوره',deductionPercent??'',value=>{
                deductionPercent=numericValue(value);
              },{suffix:'٪',allowDecimal:true,placeholder:'وارد کنید',onCommit:update});
              calculation.append(editor);
            }
            calculation.append(table([
              ['کسر پیش‌پرداخت این دوره',deduction===null?'—':money(deduction)],
              ['خالص قابل پرداخت',valid?money(result.netAmount-deduction):'—'],
            ]));
            if(!valid)calculation.append(element('p','wbs-note','مبلغ کسر باید در محدوده مانده پیش‌پرداخت و مبلغ قابل پرداخت باشد.'));
            if(workEntries().length && !resolved)calculation.append(element('p','wbs-note','کارکرد را در محدوده مانده هر ردیف وارد کنید.'));
          };
          for(const [index,row] of workRows.entries()){
            const entry=entries[index];
            entry.method ||= row.measured?'quantity':'amount';
            const card=element('div','contract-quantity-row contract-statement-operation form-template');
            card.append(element('h3','contract-statement-operation-title',row.description||'عملیات '+format.format(index+1)));
            const display=value=>row.measured?format.format(value)+' '+(row.unit||''):money(value);
            card.append(table([
              [row.measured?'بهای واحد قرارداد':'مبلغ توافقی قرارداد',money(numericValue(row.measured?row.unitPrice:row.agreedPrice))],
              ['کارکرد قبلی',display(row.previous)],
              ['مانده ردیف',row.limit===null?'تعیین نشده':display(Math.max(0,row.limit-row.previous))],
            ]));
            const equivalent=element('div','contract-statement-operation-result');
            const item=workEntries().find(item=>item.key===row.key);
            const operation=item && resolveStatementWork([row],[item])?.[0];
            if(operation && row.measured)equivalent.append(element('span','',display(operation.quantity)+' | '));
            equivalent.append(element('strong','',money(operation?rowAmount(operation):0)));
            if(row.measured && row.limit!==null){
              const choices=element('div','ft-row contract-operation-method');
              for(const [method,label] of [['quantity','مقدار'],['percent','درصد']]){
                const choice=element('label');
                const radio=element('input');radio.type='radio';radio.name='statement-method-'+index;
                radio.checked=entry.method===method;
                radio.onchange=()=>{entry.method=method;entry.raw='';entry.value=null;refresh();};
                choice.append(radio,document.createTextNode(label));choices.append(choice);
              }
              card.append(choices);
            }
            const percent=entry.method==='percent';
            ftNumberRow(card,percent?'درصد این دوره از کل ردیف':'کارکرد این دوره',entry.raw??entry.value??'',raw=>{
              entry.raw=raw;entry.value=null;
            },{
              suffix:percent?'٪':row.measured?row.unit:'تومان',
              allowDecimal:row.measured,
              placeholder:percent?'درصد انجام‌شده':row.measured?'مقدار انجام‌شده':'مبلغ کار انجام‌شده',
              onCommit:refresh,
            });
            card.append(equivalent);fields.append(card);
          }
          if(!workRows.length)fields.append(element('p','wbs-note','عملیاتی در قرارداد ثبت نشده است.'));
          update();
          return;
        }
        renderQuantityRows(fields,operations,{
          operations:true,mixed:true,allowRemeasurement:false,
          selectRow:ftSelectRow,pick:openStaticChoicePicker,onDirty:()=>{},onChange:refresh,
          numberRow:(parent,label,value,onChange,opts)=>ftNumberRow(parent,label,value,onChange,{...opts,onCommit:refresh}),
        });
        const value=operations.reduce((sum,row)=>sum+rowAmount(row),0);
        ftAmountSummary(fields,'مبلغ کل صورت‌وضعیت',value);
        const result=statementAmounts(totals,account,value,statementType);
        calculation.replaceChildren(table(statementType==='retention-release'?[
          ['مانده حسن انجام کار پیش از آزادسازی',money(totals.retained)],
          ['مبلغ قابل آزادسازی در این سند',money(result.netAmount)],
        ]:[
          ['کارکرد قبلی',money(totals.gross)],
          ['مانده قبل از ثبت',money(totals.remaining)],
          ['کارکرد تا امروز',money(result.cumulativeAmount)],
          ['حسن انجام کار این سند',money(result.retentionAmount)],
          ['خالص این صورت‌وضعیت',money(result.netAmount)],
        ]));
      };
      root.classList.add('contract-statement-form');
      const target=element('select','wbs-input');
      for(const [id,title] of [['','قرارداد اصلی'],...addenda.map(item=>[item.id,item.contractNo||'الحاقیه'])]){
        const option=element('option','',title);option.value=id;target.append(option);
      }
      target.value=addendumId;
      target.disabled=!!record;
      target.onchange=()=>{addendumId=target.value;selectAccount();refresh();};
      root.append(identity,...(statementType==='advance'?[]:[fieldRow('مربوط به',target)]),dateField,fields,fieldRow('توضیحات اختیاری',note),calculation);
      refresh();
    },
    onSave(root){
      if(saving)return false;
      const value=name=>root.querySelector('[name="'+name+'"]').value.trim();
      const type=statementType;
      if(type==='final' && !final.ready){toast('شرایط صدور صورت‌وضعیت قطعی تکمیل نشده است');return false;}
      if(type==='interim'){
        const resolved=resolveStatementWork(workRows,workEntries());
        if(!resolved){toast('کارکرد عملیات قرارداد را معتبر وارد کنید');return false;}
        const gross=resolved.reduce((sum,row)=>sum+rowAmount(row),0);
        const net=statementAmounts(totals,account,gross,'interim').netAmount;
        const deduction=deductionAmount();
        if(deduction===null || deduction>availableAdvance || deduction>net){
          toast('کسر پیش‌پرداخت را در محدوده مانده و مبلغ قابل پرداخت وارد کنید');
          return false;
        }
      }
      if(type==='retention-release' && (!operations.length || operations.some(row=>!row.description.trim() || !rowAmount(row) || (row.pricingMode==='quantity' && !row.unit)))){toast('شرح و مبلغ عملیات را کامل کنید');return false;}
      const requestedAmount=numericValue(advanceAmount);
      if(type==='advance' && (!advanceRow || !Number.isSafeInteger(requestedAmount) || requestedAmount<=0 || requestedAmount>advanceRow.balance)){
        toast('ردیف پیش‌پرداخت را انتخاب کنید و مبلغ را در محدوده مانده آن وارد کنید');
        return false;
      }
      saving=true;
      saveContractHandoff(project.id,documentRecord,'save_statement',{contractId:contract.id,addendumId,statementType:type,date,...(type==='interim'?{workEntries:workEntries(),advanceDeduction:deductionAmount(),advanceDeductionPercent:addendumId?undefined:deductionPercent}:type==='advance'?{amount:requestedAmount,advanceRowKey:advanceRow.key}:type==='final'?{}:{operations}),note:value('note')})
        .then(()=>{if(root.isConnected)closeWbsSheet();onChanged();})
        .catch(error=>toast(error.message)).finally(()=>{saving=false;});
      return false;
    },
  });
  sheet.classList.add('contract-addendum-form');
}

function statementPreviewContent(project,contract,record){
  const title=statementTitle(record);
    const documentNode=element('section','contract-export-document');
    documentNode.dir='rtl';
    if(record.statementType==='advance'){
      const row=record.advanceRow;
      documentNode.dataset.documentKind='advance';
      const summary=element('div','contract-advance-print');
      const heading=element('h2');
      heading.append(element('strong','',title+' — '+contractDisplayTitle(project,contract)));
      const path=contractProjectPath(project,contract);
      documentNode.append(heading);
      if(path)documentNode.append(element('p','','مسیر قرارداد · '+path));
      documentNode.append(summary);
      const total=Number(contract.amount);
      const contractAmount=contract.amount!=null && contract.amount!=='' && Number.isFinite(total) && !contract.remeasurement
        ? money(total):'مبلغ قطعی تعیین نشده';
      const detail=table([
        ['شماره قرارداد',contract.contractNo||'—'],
        ['تاریخ درخواست',formatJalaliDisplay(record.date)||'—'],
        ['مبلغ کل قرارداد',contractAmount],
        ...(row?[
          ['ردیف قرارداد',format.format(row.number)],['شرح پیش‌پرداخت',row.description||'—'],
          ['موعد یا شرط پرداخت',row.dueText||'—'],['مبلغ پیش‌پرداخت طبق قرارداد',money(row.total)],
        ]:[]),
        ['مبلغ درخواستی این نوبت',money(record.statementAmount||0)],['پرداخت‌شده',money(record.paidAmount||0)],
        ['وضعیت تأیید',!hasAdvanceSubmission(record)?'ارسال نشده':record.approvalStatus==='approved'?'تأیید شده':record.approvalStatus==='pending'?'در انتظار تأیید':'ارسال نشده'],
        ['وضعیت مالی',approvedStatement(record)?'تأیید شده':record.accountingStatus==='sent'?'در انتظار تأیید':record.accountingStatus==='rejected'?'برگشت خورده':'ارسال نشده'],
        ...(record.note?[['توضیحات',record.note]]:[]),
      ]);
      detail.classList.add('contract-document-quantities');
      summary.append(detail);
      return documentNode;
    }
    documentNode.append(element('h2','',title),element('p','',contract.contractNo||''),element('p','',formatJalaliDisplay(record.date)||''),
      operationSummary(record.operations||[]),table([['کارکرد این سند',money(record.statementAmount??record.stageAmount??0)],['کارکرد تجمعی',money(record.cumulativeAmount||0)],['حسن انجام کار',money(record.retentionAmount||0)],['کسر پیش‌پرداخت',money(record.advanceDeduction||0)],['خالص قابل پرداخت',money(record.netAmount??record.approvedAmount??record.stageAmount??0)],['پرداخت‌شده',money(record.paidAmount||0)]]));
    return documentNode;
  }

function openAdvanceStep(project,contract,record,onChanged,{finance=false,approval,step,openSheet=openWbsSheet}={}){
  const steps=contractProgressSteps(record,project);
  const active=step || steps.find(item=>!item.done) || steps.at(-1);
  const writable=!finance && !approval && canWriteProjectModule(project.id,'contracts');
  const financeWritable=finance && canWriteProjectModule(project.id,financeScope(project.id));
  const current=steps.find(item=>!item.done)?.id;
  const paid=Number(record.paidAmount||0);
  const remaining=Math.max(0,Number(record.netAmount)-paid);
  const paymentStatus=paid===0?'پرداخت‌نشده':remaining?'پرداخت جزئی':'پرداخت کامل';
  let pending=false;
  const run=async(action,options={})=>{
    if(pending)return false;
    pending=true;
    try{
      const updated=await saveContractHandoff(project.id,record,action,options);
      onChanged();
      const source=currentProject(project);
      openAdvanceStep(source,contract,updated,onChanged,{finance,approval,openSheet,
        step:action==='approve_finance'?undefined:contractProgressSteps(updated,source).find(item=>item.id===active.id)});
      return true;
    }catch(error){toast(error.message);return false;}
    finally{pending=false;}
  };
  const showReason=(title,action)=>openContractReasonSheet({
    title,historyKey:action+':'+record.id,fieldLabel:'دلیل (الزامی)',submit:reason=>run(action,{reason}),
  });
  const uploaders=[];
  openSheet({title:active.label,showSave:false,autoFocus:false,historyKey:'statement:'+record.id,reuseHistoryOnReplace:true,
    onClose:()=>uploaders.forEach(uploader=>uploader.destroy()),
    body(root){
      root.classList.add('contract-status-sheet','contract-history-sheet','contract-advance-stage-sheet');
      const showHistory=options=>{
        const details=renderContractHistory(document,record,{compact:true,...options});
        details.open=true;
        details.querySelector('summary').hidden=true;
        if(details.querySelector('.contract-history-entry'))root.append(details);
        return details;
      };
      const showStatus=(status,person)=>{
        const card=element('div','contract-history-entry');
        const heading=element('div','contract-history-entry-heading');
        heading.append(element('div','contract-history-event',status));
        if(person)heading.append(element('div','contract-history-actor',person));
        card.append(heading);root.append(card);
      };
      const actionButton=(label,action,variant='')=>button(label,action,'contract-review-action'+(variant?' '+variant:''));
      if(active.id==='created')showHistory({actions:['create']});
      if(active.id==='advance-submit'){
        showHistory({actions:['submit','withdraw_submission']});
        if(writable && current===active.id)root.append(actionButton('ارسال جهت تأیید',()=>run('submit_advance')));
        if(writable && record.approvalStatus==='pending' && hasAdvanceSubmission(record) &&
          record.submittedBy?.id===currentExecutionActor(project)?.id){
          root.append(actionButton('پس گرفتن از تأیید',()=>showReason('پس گرفتن از تأیید','withdraw_advance'),'danger'));
        }
      }
      if(active.id==='approved'){
        showHistory({actions:['approve','reject','revoke']});
        if(record.approvalStatus==='pending' && hasAdvanceSubmission(record)){
          const approvedIds=(record.approvedContactIds||[]).map(String);
          for(const id of contractApproverIds(record).filter(id=>!approvedIds.includes(id))){
            const person=project.contacts?.find(contact=>String(contact.id)===id);
            const name=[person?.firstName,person?.lastName].filter(Boolean).join(' ') || person?.name || person?.title || 'مسئول تأیید';
            showStatus('در انتظار تأیید',name);
          }
          if(approval?.action){
            root.append(actionButton(approval.action.textContent,()=>approval.action.click()));
            if(approval.reject)root.append(renderInlineContractReject(approval.reject,onChanged));
          }
        }
      }
      if(active.id==='finance'){
        showHistory({actions:['send_finance','withdraw_finance']});
        if(writable && current===active.id)root.append(actionButton('ارسال به مالی',()=>run('send_finance'),'success'));
        if(writable && record.accountingStatus==='sent'){
          root.append(actionButton('پس گرفتن از مالی',()=>showReason('پس گرفتن از مالی','withdraw_finance'),'danger'));
        }
      }
      if(active.id==='finance-approved'){
        showHistory({actions:['approve_finance','reject_finance','revoke_finance']});
        if(record.accountingStatus==='sent'){
          showStatus('در انتظار تأیید مالی');
          if(financeWritable)root.append(actionButton('تأیید مالی',()=>run('approve_finance')),
            actionButton('برگشت برای اصلاح',()=>showReason('برگشت پیش‌پرداخت','reject_finance'),'danger'));
        }
      }
      if(active.id==='paid'){
        root.append(table([['وضعیت پرداخت',paymentStatus],['پرداخت‌شده',money(paid)],['مانده پرداخت',money(remaining)]]));
        const attach=(root,files,readOnly)=>mountFileUploader(root,{projectId:project.id,recordId:record.id,
          category:'advance-receipts',files,readOnly,onError:toast,label:'افزودن فیش پرداخت',buttonLabel:true});
        for(const payment of record.payments||[]){
          const entry=showHistory({payment}).querySelector('.contract-history-entry');
          if(payment.receipts?.length){
            const container=element('section');entry.append(container);
            uploaders.push(attach(container,payment.receipts,true));
          }
        }
        if(financeWritable && approvedStatement(record) && remaining){
          const form=element('div','form-template'),files=[];
          root.append(form);
          let amountValue='';
          const repaint=()=>{
            form.replaceChildren();
            ftNumberRow(form,'مبلغ واریز',amountValue,value=>{amountValue=value;},{suffix:'تومان',onCommit:repaint});
          };
          repaint();
          const container=element('section');root.append(container);
          const uploader=attach(container,files,false);uploaders.push(uploader);
          root.append(button('ثبت پرداخت',()=>{
            if(uploader.isBusy()){toast('ابتدا بارگذاری فیش را کامل کنید');return;}
            run('record_payment',{amount:numericValue(amountValue),receipts:files.map(file=>file.id)});
          }));
        }
      }
    },
  });
}

function openStatement(project,contract,record,onChanged,{finance=false,approval}={}){
  if(record.statementType==='advance')return openAdvanceStep(project,contract,record,onChanged,{finance,approval});
  let pending=false;
  const reopen=()=>{
    const source=currentProject(project);
    const updated=statementsFor(source,contract.id).find(item=>item.id===record.id);
    if(updated)openStatement(source,contract,updated,onChanged,{finance,approval});
  };
  const run=async(action,options={})=>{
    if(pending)return;
    pending=true;
    try{await saveContractHandoff(project.id,record,action,options);onChanged();reopen();}
    catch(error){toast(error.message);}
    finally{pending=false;}
  };
  openWbsSheet({title:statementTitle(record),showSave:false,historyKey:'statement:'+record.id,reuseHistoryOnReplace:true,
    body(root){
      root.classList.add('contract-status-sheet');
      const status=approvedStatement(record)?'تأیید مالی شده':record.accountingStatus==='sent'?'در انتظار تأیید مالی':record.status==='draft'?'برگشت برای اصلاح':record.approvalStatus==='pending'?'در انتظار تأیید':'در انتظار امضا یا ارسال به مالی';
      root.append(button(record.statementType==='advance'?'پیش‌نمایش پیش‌پرداخت':'پیش‌نمایش صورت‌وضعیت',trigger=>openContractPreview(project,contract,{trigger,documentPreview:{title:'پیش‌نمایش '+statementTitle(record),content:statementPreviewContent(project,contract,record)}})));
      if(finance){
      root.append(table([
        ['شماره قرارداد',contract.contractNo||'—'],['مربوط به',record.addendumNo||'قرارداد اصلی'],['تاریخ',formatJalaliDisplay(record.date)||record.date||'—'],
        ['وضعیت',status],...(record.advanceDeduction?[['کسر بابت پیش‌پرداخت',money(record.advanceDeduction)]]:[]),['کارکرد این سند',money(record.stageAmount||0)],['کارکرد تجمعی',money(record.cumulativeAmount||0)],
        ['حسن انجام کار',money(record.retentionAmount||0)],['خالص',money(record.netAmount??record.approvedAmount??record.stageAmount??0)],
        ['پرداخت‌شده',money(record.paidAmount||0)],
      ]));
      if(record.operations?.length)root.append(element('h3','','عملیات'),operationSummary(record.operations));
      if(record.finalTotals)root.append(table([['جمع عملیات موقت',money(record.finalTotals.gross)],['حسن انجام کار',money(record.finalTotals.retention)],['خالص موقت‌ها',money(record.finalTotals.net)]]));
      if(record.statementType==='final' && !record.finalTotals){
        const previous=statementsFor(project,contract.id).filter(item=>item.id!==record.id && (item.addendumId||null)===(record.addendumId||null) && (!item.statementType || item.statementType==='interim') && approvedStatement(item));
        if(previous.length)root.append(element('h3','','صورت‌وضعیت‌های موقت تأییدشده'),table(previous.map(item=>[statementTitle(item),money(item.approvedAmount??item.stageAmount??0)])));
      }
      }else root.append(element('p','contract-meta','وضعیت: '+status));
      if(record.statementType)root.append(button('تاریخچه',()=>openContractHistory(record,{finance})));
      if(record.note)root.append(element('p','',record.note));
      if(record.financeRejection?.reason)root.append(element('p','contract-rejection-reason',record.financeRejection.reason));
      if(approval?.action && record.approvalStatus==='pending'){
        const actions=element('div','contract-addendum-toolbar');
        actions.append(approval.action);
        if(approval.reject)actions.append(renderInlineContractReject(approval.reject,reopen));
        root.append(actions);
      }
      if(!approval && !finance && record.statementType && canWriteProjectModule(project.id,'contracts')){
        if(canReviewContract(record,currentExecutionActor(project)))root.append(button('تأیید صورت‌وضعیت',()=>run('approve_statement')));
        if(record.status==='draft')root.append(button('اصلاح و ارسال مجدد',()=>openStatementForm(project,contract,onChanged,record)));
      }
      if(record.statementType){
        const signed=renderContractSignedSection(project,record,{onChanged,finance:finance||!!approval,onReturn:reopen,label:'صورت‌وضعیت'});
        if(signed)root.append(signed);
      }
      if(finance && record.statementType && canWriteProjectModule(project.id,financeScope(project.id))){
        if(record.accountingStatus==='sent'){
          const reason=input('دلیل برگشت','text');
          root.append(button('تأیید مالی',()=>run('approve_finance')),reason.row,
            button('برگشت برای اصلاح',()=>run('reject_finance',{reason:reason.node.value})));
        }
        if(approvedStatement(record) && record.netAmount>(record.paidAmount||0)){
          const payment=input('پرداخت جدید (تومان)','text');
          payment.node.inputMode='numeric';
          root.append(payment.row,button('ثبت پرداخت',()=>run('record_payment',{amount:numericValue(payment.node.value)})));
        }
      }
    },
  });
}

export function openStatementAction(project,contract,record,onChanged,{approval,step,openSheet=openWbsSheet}={}){
  if(record.statementType==='advance')return openAdvanceStep(project,contract,record,onChanged,{approval,step,openSheet});
  const active=contractProgressSteps(record,project).find(item=>!item.done);
  if(!active || (step && step.id!==active.id))return;
  if(active.id==='signed')return openContractSignedUpload(project,record,{onChanged,finance:!!approval,label:'صورت‌وضعیت'});
  const reopen=()=>{
    const source=currentProject(project);
    const latest=statementsFor(source,contract.id).find(item=>item.id===record.id)||record;
    openStatementAction(source,contract,latest,onChanged,{approval,openSheet});
  };
  openSheet({title:active.label,showSave:false,historyKey:'statement:'+record.id,reuseHistoryOnReplace:true,
    body(root){
      root.classList.add('contract-status-sheet');
      if(active.id==='completed'){
        if(!approval && canWriteProjectModule(project.id,'contracts') && record.status==='draft')root.append(button('ویرایش و تکمیل صورت‌وضعیت',()=>openStatementForm(project,contract,onChanged,record)));
      }else if(active.id==='approved'){
        if(approval?.action && record.approvalStatus==='pending'){
          const actions=element('div','contract-addendum-toolbar');actions.append(approval.action);
          if(approval.reject)actions.append(renderInlineContractReject(approval.reject,reopen));root.append(actions);
        }
      }else if(!approval){
        const signed=renderContractSignedSection(project,record,{stage:active.id,onChanged,onReturn:reopen,label:'صورت‌وضعیت'});
        if(signed)root.append(signed);
      }
    },
  });
}

export function renderStatementCard(project,contract,record,onChanged,approval){
  const row=element('article','contract-row');
  const title=statementTitle(record);
  const open=(event,step)=>openStatementAction(project,contract,record,onChanged,{approval,step});
  const progress=renderContractProgressCircle(document,record,project,event=>{event.stopPropagation();open();});
  const writable=!approval && record.statementType && canWriteProjectModule(project.id,'contracts');
  const deletable=writable && canDeleteContractAddenda(window.KarhaSaosaWorkspaceAccess?.[project.id]);
  const editable=record.statementType==='advance'?canEditAdvanceRequest(record):record.status==='draft';
  const buildDocument=()=>statementPreviewContent(project,contract,record);
  const heading=renderContractCardHeading(project,contract,{
    onEdit:writable?()=>editable?openStatementForm(project,contract,onChanged,record):toast(title+' در وضعیت فعلی قابل ویرایش نیست'):undefined,
    onExport:trigger=>{
      const documentNode=buildDocument();
      openContractExport(project,{title,contractNo:contract.contractNo||''},{trigger,markup:documentNode.outerHTML});
    },
    onDelete:deletable?()=>{
      if(!canDeleteContractDocument(record)){toast(title+' در وضعیت فعلی قابل حذف نیست');return;}
      openConfirm('آیا می‌خواهید '+title+' را حذف کنید؟',()=>saveContractHandoff(project.id,record,'delete_statement')
        .then(()=>{onChanged();toast(title+(record.addendumNo?' ('+record.addendumNo+')':'')+' حذف شد.');})
        .catch(error=>toast(error.message)),'بله',{cancelLabel:'خیر'});
    }:undefined,
  },{onHistory:()=>openContractHistory(record),onPreview:trigger=>openContractPreview(project,contract,{trigger,documentPreview:{title:'پیش‌نمایش '+title,content:buildDocument()}}),progress});
  heading.className+=' contract-card-heading--nested-addendum';
  const main=heading.children[0];
  main.children[0].textContent=title;
  main.children[1].dir='rtl';
  if(record.statementType==='advance'){
    main.children[1].replaceChildren(element('strong','',money(record.statementAmount||0)),
      document.createTextNode(' | '+formatJalaliDisplay(record.date)));
  }else main.children[1].textContent=[record.addendumNo,Number(record.statementAmount??record.stageAmount)?money(record.statementAmount??record.stageAmount):'',formatJalaliDisplay(record.date)].filter(Boolean).join(' | ');

  heading.children[2].hidden=true;
  row.append(heading,renderContractWorkflowPanel(document,record,project,{onOpen:open,expanded:!!approval || record.statementType==='advance',heading}));
  if(approval?.action && record.approvalStatus==='pending' && (record.statementType!=='advance' || hasAdvanceSubmission(record))){
    const actions=element('div','contract-addendum-toolbar');
    actions.append(button(approval.action.textContent,()=>approval.action.click()));
    if(approval.reject)actions.append(renderInlineContractReject(approval.reject,onChanged));
    row.append(actions);
  }
  return row;
}

export function renderAccountingStatements(body,projectId){
  const project=projectRepository.find(projectId);
  if(!project)return;
  body.replaceChildren();
  for(const contract of project.contracts||[]){
    if(contract.trashed)continue;
    const records=statementsFor(project,contract.id).filter(record=>['sent','accepted'].includes(record.accountingStatus));
    for(const record of records){
      const open=button((contract.contractNo||'')+' · '+statementTitle(record),()=>openStatement(project,contract,record,()=>renderAccountingStatements(body,projectId),{finance:true}));
      if(record.statementType!=='advance'){body.append(open);continue;}
      const row=element('div','contract-addendum-toolbar');
      row.append(open,button('پیش‌نمایش',trigger=>openContractPreview(project,contract,{trigger,
        documentPreview:{title:'پیش‌نمایش پیش‌پرداخت',content:statementPreviewContent(project,contract,record)}})));
      body.append(row);
    }
  }
  if(!body.children.length)body.append(element('p','contract-empty','صورت‌وضعیتی به مالی ارسال نشده است.'));
}

