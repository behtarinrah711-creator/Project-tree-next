import { quantityTable } from './contractDocument.js';
import {mountFileUploader} from '../files/fileUploader.js';
import {openContractReasonSheet} from './contractReasonSheet.js';
import {canDeleteContractDocument,canReopenSignedContract} from '../../domain/contractHandoff.js';
import {renderInlineContractReject} from './contractReasonSheet.js';
import {openContractPreview} from './contractPreviewView.js';
import {statementWorkRows,resolveStatementWork} from '../../domain/statementWork.js';
import { contactApi } from '../../domain/contactApi.js';
import { projectRepository } from '../../data/projectRepository.js';
import { canReviewContract, canRevokeContractApproval, canWithdrawAdvanceRequest, canWithdrawPendingStatement, canEditAdvanceRequest, hasAdvanceSubmission, contractApproverIds } from '../../domain/contractApproval.js';
import { accountStatements, approvedStatement, statementAccount, statementAddenda, contractStatementTotals, finalStatementSummary, statementAmounts, statementsFor, contractAdvanceDeductionBalance, contractOnAccountBalance, isOnAccountPayment, advanceDeductionFromPercent, contractAdvanceRows } from '../../domain/contractStatements.js';
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
const financeScope=(projectId,scope='accounting-statements')=>{
  const permissions=window.KarhaSaosaWorkspaceAccess?.[projectId]?.permissions||{};
  return Object.hasOwn(permissions.modules||permissions,scope)?scope:'accounting';
};
const currentProject=project=>projectRepository.find(project.id)||project;
export const statementTypes=[['interim','موقت'],['final','قطعی'],['retention-release','آزاد کردن حسن انجام کار'],['advance','پیش‌پرداخت'],['on-account','درخواست پرداخت علی‌الحساب']];
const statementTitle=record=>record.statementType==='advance'?('درخواست پرداخت '+(isOnAccountPayment(record)?'علی‌الحساب':'پیش‌پرداخت')+' شمارهٔ ')+format.format(record.sequence||1):record.statementType==='retention-release'?'آزاد کردن حسن انجام کار':record.statementType==='final'?'صورت‌وضعیت قطعی':'صورت‌وضعیت موقت شماره '+format.format(record.sequence||1);

function table(rows){
  const node=element('table','contract-financial-table');
  const body=element('tbody');
  for(const [label,value] of rows){
    const row=element('tr'),heading=element('th','',label);
    heading.scope='row';
    const cell=element('td');
    if(value && typeof value==='object')cell.append(value);
    else if(value)cell.textContent=value;
    row.append(heading,cell);
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
  const onAccount=contractOnAccountBalance(project,contract.id);
  group('صورت‌وضعیت‌ها و پرداخت‌ها',[
    ['کارکرد تأییدشده',totals.gross],
    ['مانده حسن انجام کار',totals.retained],
    ['حسن انجام کار آزادشده',totals.released],
    ['پرداخت ثبت‌شده',totals.paid],
    ...(onAccount.paid?[['علی‌الحساب واریزشده',onAccount.paid],['مانده علی‌الحساب قابل کسر',onAccount.available]]:[]),
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
    workRows=statementWorkRows(account,accountStatements(source,account).filter(item=>item.id!==record?.id && approvedStatement(item)));
    entries=workRows.map(row=>({...record?.workEntries?.find(item=>item.key===row.key),key:row.key}));
  }
  selectAccount();
  const workEntries=()=>entries.filter(entry=>entry.raw?.trim() || entry.value!=null).map(({key,method,raw,value})=>({
    key,method,value:raw===undefined?value:/^[\d۰-۹٠-٩,٬.٫]+$/.test(raw.trim())?numericValue(raw):null,
  }));
  let saving=false;
  const documentRecord=record||{id:'statement-'+crypto.randomUUID(),statementType:type==='on-account'?'advance':type,...(type==='on-account'?{paymentPurpose:'on-account'}:{})};
  const operations=record?.operations?.length
    ? record.operations.map(row=>({...makeQuantityRow(),...row}))
    : [{...makeQuantityRow(),pricingMode:'quantity'}];
  if(record && !record.operations?.length){
    Object.assign(operations[0],{description:record.note||'کارکرد صورت‌وضعیت',pricingMode:'agreed',agreedPrice:record.statementType==='final'?record.cumulativeAmount:record.stageAmount});
  }
  const statementType=documentRecord.statementType;
  const onAccount=isOnAccountPayment(documentRecord);
  const {available:availableOnAccount}=contractOnAccountBalance(source,contract.id,record?.id);
  let onAccountDeduction=record?.onAccountDeduction||0;
  const advanceRows=statementType==='advance' && !onAccount?contractAdvanceRows(source,contract,record?.id):[];
  const payableAdvanceRows=advanceRows.filter(row=>row.balance>0);
  let advanceRow=payableAdvanceRows.find(row=>row.key===record?.advanceRow?.key) ||
    (payableAdvanceRows.length===1?payableAdvanceRows[0]:null);
  let advanceAmount=record?.statementAmount ?? '';
  const {paid:paidAdvance,available:availableAdvance}=contractAdvanceDeductionBalance(source,contract.id,record?.id);
  let deductionPercent=record?.advanceDeductionPercent;
  const legacyDeduction=record?.advanceDeduction||0;
  const deductionAmount=()=>addendumId?0:deductionPercent===undefined
    ? legacyDeduction
    : advanceDeductionFromPercent(paidAdvance,deductionPercent);
  const label=statementType==='advance'?(onAccount?'درخواست پرداخت علی‌الحساب':'پرداخت پیش‌پرداخت'):statementType==='retention-release'?'آزاد کردن حسن انجام کار'
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
          if(onAccount){
            const editor=element('div','form-template contract-advance-amounts');
            ftNumberRow(editor,'مبلغ درخواستی',advanceAmount,value=>{advanceAmount=value;},{suffix:'تومان',onCommit:refresh});
            fields.append(editor);
            return;
          }
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
                if(advanceRow && advanceRow.key!==key)advanceAmount='';
                advanceRow=payableAdvanceRows.find(row=>row.key===key);
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
            const valid=deduction!==null && deduction<=availableAdvance && onAccountDeduction<=availableOnAccount && deduction+onAccountDeduction<=result.netAmount;
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
            if(availableOnAccount || onAccountDeduction){
              const editor=element('div','form-template');
              editor.append(table([['مانده علی‌الحساب قابل کسر',money(availableOnAccount)]]));
              ftNumberRow(editor,'کسر علی‌الحساب',onAccountDeduction||'',value=>{
                onAccountDeduction=numericValue(value);
              },{suffix:'تومان',onCommit:update});
              calculation.append(editor);
            }
            calculation.append(table([
              ['کسر پیش‌پرداخت این دوره',deduction===null?'—':money(deduction)],
              ['خالص قابل پرداخت',valid?money(result.netAmount-deduction-onAccountDeduction):'—'],
            ]));
            if(!valid)calculation.append(element('p','wbs-note','مبلغ کسر باید در محدوده مانده پرداخت قبلی و مبلغ قابل پرداخت باشد.'));
            if(workEntries().length && !resolved)calculation.append(element('p','wbs-note','کارکرد را در محدوده مانده هر ردیف وارد کنید.'));
          };
          for(const [index,row] of workRows.entries()){
            const entry=entries[index];
            entry.method ||= row.measured?'quantity':'amount';
            const card=element('div','contract-quantity-row contract-statement-operation form-template');
            card.append(element('h3','contract-statement-operation-title',row.description||'عملیات '+format.format(index+1)));
            const display=value=>row.measured?format.format(value)+' '+(row.unit||''):money(value);
            const item=workEntries().find(item=>item.key===row.key);
            const operation=item && resolveStatementWork([row],[item])?.[0];
            const cumulative=operation?.statementProgress.cumulative ?? row.previous;
            card.append(table([
              [row.measured?'مقدار قرارداد':'مبلغ توافقی قرارداد',row.limit===null?'تعیین نشده':display(row.limit)],
              ...(row.measured?[['بهای واحد قرارداد',money(numericValue(row.unitPrice))]]:[]),
              ['کارکرد قبلی',display(row.previous)],
              ['کارکرد تجمیعی با این دوره',display(cumulative)],
              ['مانده پس از این دوره',row.limit===null?'تعیین نشده':display(Math.max(0,row.limit-cumulative))],
            ]));
            const equivalent=element('div','contract-statement-operation-result');
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
        if(deduction===null || deduction>availableAdvance || !Number.isSafeInteger(onAccountDeduction) || onAccountDeduction<0 || onAccountDeduction>availableOnAccount || deduction+onAccountDeduction>net){
          toast('مبلغ کسورات را در محدوده مانده و مبلغ قابل پرداخت وارد کنید');
          return false;
        }
      }
      if(type==='retention-release' && (!operations.length || operations.some(row=>!row.description.trim() || !rowAmount(row) || (row.pricingMode==='quantity' && !row.unit)))){toast('شرح و مبلغ عملیات را کامل کنید');return false;}
      const requestedAmount=numericValue(advanceAmount);
      if(type==='advance' && (!Number.isSafeInteger(requestedAmount) || requestedAmount<=0 || (!onAccount && (!advanceRow || requestedAmount>advanceRow.balance)))){
        toast(onAccount?'مبلغ درخواست را معتبر وارد کنید':'ردیف پیش‌پرداخت را انتخاب کنید و مبلغ را در محدوده مانده آن وارد کنید');
        return false;
      }
      saving=true;
      saveContractHandoff(project.id,documentRecord,'save_statement',{contractId:contract.id,addendumId,statementType:type,date,...(type==='interim'?{workEntries:workEntries(),onAccountDeduction,advanceDeduction:deductionAmount(),advanceDeductionPercent:addendumId?undefined:deductionPercent}:type==='advance'?{amount:requestedAmount,...(onAccount?{paymentPurpose:'on-account'}:{advanceRowKey:advanceRow.key})}:type==='final'?{}:{operations}),note:value('note')})
        .then(()=>{if(root.isConnected)closeWbsSheet();onChanged();})
        .catch(error=>toast(error.message)).finally(()=>{saving=false;});
      return false;
    },
  });
  sheet.classList.add('contract-addendum-form');
}

function contractorPaymentDetails(project,contract){
  const contractor=contactApi.lookup(project.id,contract.contractorId || contract.contactId);
  if(!contractor)return null;
  const paymentFields=[['card','شماره کارت'],['iban','شماره شبا'],['account','شماره حساب'],['bankName','نام بانک'],['ownerName','صاحب حساب']];
  const accounts=contractor.bankAccounts;
  const bankAccounts=Array.isArray(accounts) && accounts.length?accounts:[{
    card:contractor.cards,iban:contractor.ibans,account:contractor.accounts,
  }];
  const rows=[];
  for(const account of bankAccounts){
    for(const [key,label] of paymentFields){
      const raw=account?.[key];
      const values=(Array.isArray(raw)?raw:[raw]).map(value=>String(value??'').trim()).filter(Boolean);
      if(!values.length)continue;
      const cell=element('div');
      cell.replaceChildren(...values.map(value=>{
        const line=element('div');
        line.append(element('bdi','',value));
        return line;
      }));
      rows.push([label,cell]);
    }
  }
  if(!rows.length)return null;
  const paymentTable=table(rows);
  paymentTable.classList.add('contract-document-payment-table');
  return paymentTable;
}

function statementDocumentHeader(project,contract,record){
  const advance=record.statementType==='advance';
  const header=element('header','contract-document-statement-header');
  const projectName=element('strong','contract-document-statement-project',project.name||'—');
  const title=element('h2','',advance?'درخواست پرداخت':statementTitle(record));
  if(advance)title.append(element('small','',statementTitle(record).replace(/^درخواست پرداخت\s*/,'')));
  const date=element('div','contract-document-statement-date');
  date.append(element('strong','',advance?'تاریخ درخواست':'تاریخ صورت‌وضعیت'),
    element('span','',formatJalaliDisplay(record.date)||'—'));
  header.append(projectName,title,date);
  const path=contractProjectPath(project,contract);
  const contractor=contactApi.lookup(project.id,contract.contractorId || contract.contactId);
  const contractorName=[contractor?.firstName,contractor?.lastName].filter(Boolean).join(' ') ||
    contractor?.name || contract.contractorName || '—';
  const facts=element('div','contract-document-statement-facts');
  const route=element('strong','contract-document-statement-route','مسیر قرارداد: '+(path||'—'));
  facts.append(route);
  for(const [label,value] of [
    ['پیمانکار',contractorName],
    ['موضوع قرارداد',path?.split('←').at(-1)?.trim() || contract.title || '—'],
    ['شماره قرارداد',contract.contractNo||'—'],
    ['تاریخ قرارداد',formatJalaliDisplay(contract.contractDate)||'—'],
  ]){
    const pair=element('div','contract-document-statement-fact');
    pair.append(element('strong','',label),element('bdi','',value));
    facts.append(pair);
  }
  return [header,facts];
}

function statementPreviewContent(project,contract,record,signature=null){
    const documentNode=element('section','contract-export-document');
    documentNode.dir='rtl';
    const header=statementDocumentHeader(project,contract,record);
    documentNode.classList.add('contract-document-statement');
    const body=element('div','contract-document-statement-body');
    documentNode.append(body);
    body.append(...header);
    const paymentDetails=contractorPaymentDetails(project,contract);
    if(paymentDetails){
      const rows=[...paymentDetails.tBodies[0].rows];
      const heading=paymentDetails.createCaption();
      heading.textContent='اطلاعات پرداخت';
      const itemsPerRow=3;
      const columns=element('colgroup');
      for(let index=0;index<itemsPerRow;index++){
        columns.append(element('col','contract-document-payment-label'),element('col'));
      }
      heading.after(columns);
      for(let index=0;index<rows.length;index+=itemsPerRow){
        const row=rows[index];
        const items=rows.slice(index+1,index+itemsPerRow);
        for(const item of items){
          row.append(...item.cells);
          item.remove();
        }
        const missing=itemsPerRow-items.length-1;
        if(missing)row.lastElementChild.colSpan=1+missing*2;
      }
      paymentDetails.classList.add('contract-document-quantities','contract-document-payment-pairs');
      body.append(paymentDetails);
    }
    if(record.statementType==='advance'){
      const row=record.advanceRow;
      documentNode.dataset.documentKind='advance';

      const detail=table([
        ['مبلغ کل قرارداد',money(contract.remeasurement || contract.amount==null || contract.amount==='' ? null : Number(contract.amount))],
        ...(row?[
          ['ردیف پیش‌پرداخت در قرارداد',format.format(row.number)],['شرح پیش‌پرداخت',row.description||'—'],
          ['موعد یا شرط پرداخت',row.dueText||'—'],['مبلغ پیش‌پرداخت طبق قرارداد',money(row.total)],
        ]:[]),
        ['مبلغ درخواستی این نوبت',money(record.statementAmount||0)],['پرداخت‌شده',money(record.paidAmount||0)],
        ['وضعیت تأیید',!hasAdvanceSubmission(record)?'ارسال نشده':record.approvalStatus==='approved'?'تأیید شده':record.approvalStatus==='pending'?'در انتظار تأیید':'ارسال نشده'],
        ['وضعیت مالی',approvedStatement(record)?'تأیید شده':record.accountingStatus==='sent'?'در انتظار تأیید':record.accountingStatus==='rejected'?'برگشت خورده':'ارسال نشده'],
        ...(record.note?.trim()||signature?[['توضیحات',record.note||'']]:[]),
      ]);
      if(signature){
        const cell=detail.lastElementChild.lastElementChild.lastElementChild;
        const note=element('div','contract-advance-note');
        const signer=element('div','contract-advance-note-signature');
        const image=element('img');
        image.src=signature.image;
        image.alt='امضا';
        signer.append(image,element('div','',signature.name));
        note.append(element('span','contract-advance-note-text',record.note||''),signer);
        cell.replaceChildren(note);
      }
      detail.classList.add('contract-document-quantities','contract-document-statement-pairs');
      body.append(element('h3','contract-document-statement-band','خلاصه مالی'),detail);
      return documentNode;
    }
    const account=record.addendumId
      ? statementAccount(contract,statementAddenda(project,contract).find(item=>item.id===record.addendumId))
      : contract;
    const basis=record.addendumId && !account.statementAddendumId ? null : contractStatementTotals(project,account).total;
    const progressFormat=new Intl.NumberFormat('fa-IR',{style:'percent',maximumFractionDigits:1});
    const progress=amount=>basis>0 && Number.isFinite(Number(amount)) ? progressFormat.format(Number(amount)/basis) : '—';
    const summaryMoney=value=>{
      if(value===null)return money(value);
      if(Number(value)===0)return format.format(0);
      const amount=element('bdi');
      amount.dir='rtl';
      const digits=element('bdi','',format.format(value));
      digits.dir='ltr';
      amount.append(digits,'\u00a0تومان');
      return amount;
    };
    const progressStatement=record.statementType!=='retention-release';
    const note=String(record.note??'').trim();
    const details=table(note?[['توضیحات',note]]:[]);
    const totals=table([
      [record.addendumId?'مبلغ کل الحاقیه':'مبلغ کل قرارداد',summaryMoney(basis)],
      ['کارکرد این سند',summaryMoney(record.statementAmount??record.stageAmount??0)],
      ['کارکرد تجمیعی',summaryMoney(record.cumulativeAmount||0)],
      ...(progressStatement?[['پیشرفت تجمیعی تا این صورت‌وضعیت',progress(record.cumulativeAmount??record.stageAmount??0)]]:[]),
      ['کسر حسن انجام کار',summaryMoney(record.retentionAmount||0)],
      ...(Number(record.advanceDeduction)?[['کسر پیش‌پرداخت',summaryMoney(record.advanceDeduction)]]:[]),
      ...(Number(record.onAccountDeduction)?[['کسر علی‌الحساب',summaryMoney(record.onAccountDeduction)]]:[]),
      ['خالص قابل پرداخت',summaryMoney(record.netAmount??record.approvedAmount??record.stageAmount??0)],
      ['پرداخت‌شده',summaryMoney(record.paidAmount||0)],
    ]);
    for(const section of [details,totals])section.classList.add('contract-document-quantities','contract-document-statement-pairs');
    if(details.tBodies[0].rows.length){
      details.classList.add('contract-document-statement-note');
      body.append(details);
    }
    if(record.operations?.length){
      const template=element('template');
      template.innerHTML=quantityTable(record.operations.map(row=>{
        const source=row.sourceSequence?'موقت '+format.format(row.sourceSequence):formatJalaliDisplay(row.sourceDate);
        return {...row,description:[source,row.description].filter(Boolean).join(' · ')};
      }),true);
      if(progressStatement){
        const operations=template.content.querySelector('table');
        operations.classList.add('contract-document-statement-progress');
        const headerRow=operations.tHead.rows[0];
        headerRow.cells[3].textContent=record.statementType==='final'?'مقدار یا مبلغ ردیف':'مقدار یا مبلغ این دوره';
        headerRow.cells[4].before(
          element('th','','کارکرد تجمیعی از کل ردیف'),
          element('th','','سهم از پیشرفت قرارداد'),
        );
        const prior=accountStatements(project,account).filter(item=>item.id!==record.id && approvedStatement(item) &&
          item.statementType==='interim' && Number(item.sequence)>0 && Number(item.sequence)<Number(record.sequence));
        const contractualRows=statementWorkRows(account,prior);
        const rows=operations.tBodies[0].rows;
        for(const [index,operation] of record.operations.entries()){
          const row=rows[index];
          const measured=operation.pricingMode==='quantity';
          const current=numericValue(measured?operation.quantity:operation.agreedPrice);
          if(!measured)row.cells[3].textContent=money(current);
          const linked=contractualRows.find(item=>item.key===operation.contractRowId && item.measured===measured);
          const snapshot=operation.statementProgress ||
            (linked && record.statementType==='interim' && Number(record.sequence)>0
              ? {limit:linked.limit,cumulative:linked.previous+current} : null);
          const display=number=>format.format(number);
          const comparison=snapshot
            ? snapshot.limit===null ? display(snapshot.cumulative)+(measured?'':' تومان')
              : display(snapshot.cumulative)+' از '+display(snapshot.limit)+(measured?'':' تومان')
            : '—';
          row.cells[4].before(element('td','',comparison),element('td','',progress(rowAmount(operation))));
        }
        const total=rows[rows.length-1];
        total.cells[0].colSpan=5;
        const heading=record.statementType==='final'?'پیشرفت تجمیعی':'پیشرفت این دوره';
        const gross=record.operations.reduce((sum,operation)=>sum+rowAmount(operation),0);
        const cell=element('td','',heading+' '+progress(gross));
        cell.colSpan=2;
        total.cells[1].before(cell);
      }
      body.append(element('h3','contract-document-statement-band','شرح عملیات انجام‌شده'),template.content);
    }
    const cumulative=Number(record.cumulativeAmount??record.stageAmount??0);
    const financial=element('div','contract-document-statement-financial');
    financial.append(totals);
    if(progressStatement && basis>0 && Number.isFinite(cumulative)){
      const figure=element('figure','contract-document-statement-ring');
      const graphic=element('div','contract-document-statement-ring-graphic');
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 100 100');
      svg.setAttribute('aria-hidden','true');
      const current=record.statementType==='final' ? 0 :
        Math.min(Math.max(0,cumulative),Math.max(0,Number(record.stageAmount??record.statementAmount) || 0));
      const previous=Math.max(0,cumulative-current);
      const parts=[
        {label:'دوره‌های قبل',amount:previous,color:'#326854',ink:'#fff'},
        {label:'این صورت‌وضعیت',amount:current,color:'#9fceae',ink:'#143b2a'},
        {label:'ماندهٔ کار',amount:Math.max(0,basis-cumulative),color:'none',ink:'#222'},
      ].filter(part=>part.amount>0);
      const total=parts.reduce((sum,part)=>sum+part.amount,0);
      const point=(fraction,radius)=>[
        50+radius*Math.cos(fraction*2*Math.PI-Math.PI/2),
        50+radius*Math.sin(fraction*2*Math.PI-Math.PI/2),
      ];
      const legend=element('div','contract-document-statement-pie-legend');
      const cuts=[];
      const labels=[];
      let offset=0;
      for(const part of parts){
        const fraction=part.amount/total;
        const slice=document.createElementNS(svg.namespaceURI,fraction===1?'circle':'path');
        slice.setAttribute('fill',part.color);
        if(fraction===1){
          for(const [key,value] of Object.entries({cx:50,cy:50,r:48}))slice.setAttribute(key,String(value));
        }else{
          slice.setAttribute('d',`M 50 50 L ${point(offset,48).join(' ')} A 48 48 0 ${fraction>.5?1:0} 1 ${point(offset+fraction,48).join(' ')} Z`);
        }
        svg.append(slice);
        if(parts.length>1)cuts.push(offset);
        if(fraction>=.12){
          const label=document.createElementNS(svg.namespaceURI,'text');
          const [x,y]=point(offset+fraction/2,fraction===1?0:31);
          label.setAttribute('x',String(x));
          label.setAttribute('y',String(y));
          label.setAttribute('fill',part.ink);
          label.setAttribute('dominant-baseline','central');
          label.setAttribute('text-anchor','middle');
          label.textContent=progress(part.amount);
          labels.push(label);
        }
        offset+=fraction;
        legend.append(element('span','',part.label+' · '+progress(part.amount)));
      }
      for(const cut of cuts){
        const line=document.createElementNS(svg.namespaceURI,'path');
        line.setAttribute('d',`M 50 50 L ${point(cut,48).join(' ')}`);
        line.setAttribute('stroke','#333');
        line.setAttribute('stroke-width','1.6');
        svg.append(line);
      }
      const outline=document.createElementNS(svg.namespaceURI,'circle');
      for(const [key,value] of Object.entries({cx:50,cy:50,r:48,fill:'none',stroke:'#333','stroke-width':2.6})){
        outline.setAttribute(key,String(value));
      }
      svg.append(outline,...labels);
      graphic.append(svg);
      const inMillions=[cumulative,basis].every(value=>value%1000000===0);
      const divisor=inMillions?1000000:1;
      const comparison=format.format(cumulative/divisor)+' از '+format.format(basis/divisor)+
        (inMillions?' میلیون تومان':' تومان');
      const caption=element('figcaption','',comparison);
      figure.append(element('strong','','پیشرفت تجمیعی '+progress(cumulative)),graphic,legend,caption);
      financial.classList.add('contract-document-statement-financial--with-ring');
      financial.append(figure);
    }
    body.append(element('h3','contract-document-statement-band contract-document-statement-summary','خلاصه مالی'),financial);
    return documentNode;
  }

function openStatementStep(project,contract,record,onChanged,{finance=false,approval,step,openSheet=openWbsSheet}={}){
  const steps=contractProgressSteps(record,project);
  const writable=!finance && !approval && canWriteProjectModule(project.id,'contracts');
  const advance=record.statementType==='advance';
  const canWithdraw=writable && advance && canWithdrawAdvanceRequest(record);
  const active=step || (canWithdraw && steps.find(item=>item.id==='advance-submit')) ||
    steps.find(item=>!item.done) || steps.at(-1);
  const financeWritable=finance && canWriteProjectModule(project.id,financeScope(project.id,advance?'accounting-contracts':'accounting-statements'));
  const current=steps.find(item=>!item.done)?.id;
  if(active.id!==current && !active.done && !active.rejected)return;
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
      openStatementStep(source,contract,updated,onChanged,{finance,approval,openSheet,
        step:['approve_finance','reject_finance','reopen_signed_contract','withdraw_statement'].includes(action)?undefined:contractProgressSteps(updated,source).find(item=>item.id===active.id)});
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
      if(active.id==='completed'){
        if(writable && record.status==='draft'){
          root.append(actionButton('ویرایش و تکمیل صورت‌وضعیت',()=>openStatementForm(project,contract,onChanged,record)));
        }
      }
      if(active.id==='signed'){
        const signed=renderContractSignedSection(project,record,{stage:'signed',finance:!writable,onChanged,label:'صورت‌وضعیت'});
        if(signed)root.append(signed);
      }
      if(active.id==='advance-submit'){
        if(writable && current===active.id){
          root.append(actionButton('ارسال جهت تأیید',()=>run('submit_advance')));
        }else{
          if(canWithdraw){
            root.append(actionButton('پس گرفتن از تأیید',()=>showReason('پس گرفتن از تأیید','withdraw_advance'),'danger'));
          }
          showHistory({actions:['submit','withdraw_submission']});
        }
      }
      if(active.id==='approved'){
        showHistory({actions:['approve','reject','revoke','withdraw_submission']});
        if(writable && canWithdrawPendingStatement(record)){
          root.append(actionButton('پس گرفتن از تأیید برای ویرایش',()=>showReason('پس گرفتن صورت‌وضعیت از تأیید','withdraw_statement'),'danger'));
        }
        if(record.approvalStatus==='pending' && (!advance || hasAdvanceSubmission(record))){
          const approvedIds=(record.approvedContactIds||[]).map(String);
          for(const id of contractApproverIds(record).filter(id=>!approvedIds.includes(id))){
            const person=project.contacts?.find(contact=>String(contact.id)===id);
            const name=[person?.firstName,person?.lastName].filter(Boolean).join(' ') || person?.name || person?.title || 'مسئول تأیید';
            showStatus('در انتظار تأیید',name);
          }
          if(approval?.action){
            if(canReviewContract(record,currentExecutionActor(project))){
              root.append(actionButton(approval.action.textContent,()=>openConfirm('این مورد تأیید شود؟',()=>run('approve_statement'))));
            }
          }
        }
        if(approval?.reject && (canReviewContract(record,currentExecutionActor(project)) ||
          canRevokeContractApproval(record,currentExecutionActor(project)))){
          root.append(renderInlineContractReject(approval.reject,onChanged));
        }
      }
      if(active.id==='finance'){
        showHistory({actions:['send_finance','withdraw_finance']});
        if(writable && current===active.id){
          if(advance)root.append(actionButton('ارسال به مالی',()=>run('send_finance'),'success'));
          else root.append(actionButton('ارسال به مالی',()=>openConfirm('صورت‌وضعیت به همراه نسخه امضاشده به مالی ارسال شود؟',()=>run('send_finance')),'success'));
        }
        if(writable && !advance && canReopenSignedContract(record)){
          root.append(actionButton('بازگشت برای ویرایش',()=>showReason('بازگشت صورت‌وضعیت برای ویرایش','reopen_signed_contract'),'danger'));
        }
        if(writable && record.accountingStatus==='sent'){
          root.append(actionButton('پس گرفتن از مالی',()=>showReason('پس گرفتن از مالی','withdraw_finance'),'danger'));
        }
      }
      if(active.id==='finance-approved'){
        showHistory({actions:['approve_finance','reject_finance','revoke_finance']});
        if(record.accountingStatus==='sent'){
          showStatus('در انتظار تأیید مالی');
          if(financeWritable)root.append(actionButton('تأیید مالی',()=>run('approve_finance')),
            actionButton('رد کردن',()=>showReason(!advance?'برگشت صورت‌وضعیت برای اصلاح':isOnAccountPayment(record)?'رد پرداخت علی‌الحساب':'رد پیش‌پرداخت','reject_finance'),'danger'));
        }
      }
      if(active.id==='paid'){
        root.append(table([['وضعیت پرداخت',paymentStatus],['پرداخت‌شده',money(paid)],['مانده پرداخت',money(remaining)]]));
        const attach=(root,files,readOnly)=>mountFileUploader(root,{projectId:project.id,recordId:record.id,
          category:'advance-receipts',files,readOnly,singleFile:!readOnly,onError:toast,label:'افزودن فیش پرداخت',buttonLabel:true});
        for(const payment of record.payments||[]){
          const entry=showHistory({payment,showPaymentAmount:false}).querySelector('.contract-history-entry');
          const details=element('div','contract-payment-receipt-row');
          details.dir='rtl';
          const receipt=element('section');
          if(payment.receipts?.length)uploaders.push(attach(receipt,payment.receipts,true));
          details.append(receipt,element('strong','',money(payment.amount)));
          entry.append(details);
        }
        if(financeWritable && approvedStatement(record) && remaining){
          const form=element('div','form-template'),files=[];
          root.append(form);
          let amountValue='';
          const repaint=()=>{
            form.replaceChildren();
            ftNumberRow(form,'مبلغ این فیش',amountValue,value=>{amountValue=value;},{suffix:'تومان',onCommit:repaint});
          };
          repaint();
          const container=element('section');root.append(container);
          const uploader=attach(container,files,false);uploaders.push(uploader);
          root.append(actionButton('ثبت پرداخت',()=>{
            if(uploader.isBusy()){toast('ابتدا بارگذاری فیش را کامل کنید');return;}
            if(advance && files.length!==1){toast('برای هر پرداخت یک فیش واریزی بارگذاری کنید');return;}
            run('record_payment',{amount:numericValue(amountValue),receipts:files.map(file=>file.id)});
          }));
        }
      }
    },
  });
}

function openStatement(project,contract,record,onChanged,{finance=false,approval}={}){
  if(record.statementType==='advance')return openStatementStep(project,contract,record,onChanged,{finance,approval});
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
        ['وضعیت',status],...(record.onAccountDeduction?[['کسر علی‌الحساب',money(record.onAccountDeduction)]]:[]),...(record.advanceDeduction?[['کسر بابت پیش‌پرداخت',money(record.advanceDeduction)]]:[]),['کارکرد این سند',money(record.stageAmount||0)],['کارکرد تجمیعی',money(record.cumulativeAmount||0)],
        ['کسر حسن انجام کار',money(record.retentionAmount||0)],['خالص',money(record.netAmount??record.approvedAmount??record.stageAmount??0)],
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
  return openStatementStep(project,contract,record,onChanged,{approval,step,openSheet});
}

export function renderStatementCard(project,contract,record,onChanged,approval,{finance=false}={}){
  const row=element('article','contract-row');
  const title=statementTitle(record);
  const open=(event,step)=>finance
    ? openStatementStep(project,contract,record,onChanged,{finance,step})
    : openStatementAction(project,contract,record,onChanged,{approval,step});
  const progress=renderContractProgressCircle(document,record,project,event=>{event.stopPropagation();open();});
  const writable=!finance && !approval && record.statementType && canWriteProjectModule(project.id,'contracts');
  const deletable=writable && canDeleteContractAddenda(window.KarhaSaosaWorkspaceAccess?.[project.id]);
  const editable=record.statementType==='advance'?canEditAdvanceRequest(record):record.status==='draft';
  const buildDocument=()=>statementPreviewContent(project,contract,record);
  const heading=renderContractCardHeading(project,contract,{
    onEdit:writable?()=>{
      if(editable)return openStatementForm(project,contract,onChanged,record);
      if(canWithdrawPendingStatement(record))return openStatementStep(project,contract,record,onChanged);
      if(record.accountingStatus==='sent' || (!record.paidAmount && canReopenSignedContract(record))){
        const step=contractProgressSteps(record,project).find(item=>item.id==='finance');
        return openStatementStep(project,contract,record,onChanged,{step});
      }
      toast(title+' در وضعیت فعلی قابل ویرایش نیست');
    }:undefined,
    onExport:trigger=>{
      const documentNode=buildDocument();
      let inlineSignature=null;
      if(record.statementType==='advance'){
        const approver=currentExecutionActor(project);
        const approvalEvent=record.approvalHistory?.findLast(event=>event.action==='approve' && event.actor?.id===approver.id);
        const approved=approver.contactId && (record.approvedContactIds||[]).map(String).includes(approver.contactId);
        const name=approved && approvalEvent ? approver.name || approvalEvent.actor.name : '';
        inlineSignature={name,build:image=>statementPreviewContent(
          project,contract,record,image&&name?{image,name}:null
        ).outerHTML};
      }
      const exportContract=record.statementType==='advance'
        ? {...contract,title}
        : {title,contractNo:contract.contractNo||''};
      openContractExport(project,exportContract,{trigger,markup:documentNode.outerHTML,inlineSignature});
    },
    onDelete:deletable?()=>{
      if(!canDeleteContractDocument(record)){toast(title+' در وضعیت فعلی قابل حذف نیست');return;}
      openConfirm('آیا می‌خواهید '+title+' را حذف کنید؟',()=>saveContractHandoff(project.id,record,'delete_statement')
        .then(()=>{onChanged();toast(title+(record.addendumNo?' ('+record.addendumNo+')':'')+' حذف شد.');})
        .catch(error=>toast(error.message)),'بله',{cancelLabel:'خیر'});
    }:undefined,
  },{onHistory:()=>openContractHistory(record,{finance}),onPreview:trigger=>openContractPreview(project,contract,{trigger,documentPreview:{title:'پیش‌نمایش '+title,content:buildDocument()}}),progress});
  heading.className+=' contract-card-heading--nested-addendum';
  const main=heading.children[0];
  main.children[0].textContent=title;
  main.children[1].dir='rtl';
  if(record.statementType==='advance'){
    main.children[1].replaceChildren(element('strong','',money(record.statementAmount||0)),
      document.createTextNode(' | '+formatJalaliDisplay(record.date)));
  }else main.children[1].textContent=[record.addendumNo,Number(record.statementAmount??record.stageAmount)?money(record.statementAmount??record.stageAmount):'',formatJalaliDisplay(record.date)].filter(Boolean).join(' | ');

  heading.children[2].hidden=true;
  row.append(heading,renderContractWorkflowPanel(document,record,project,{onOpen:open,expanded:true,heading,openCompleted:true}));
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
    const records=statementsFor(project,contract.id).filter(record=>record.statementType!=='advance' && ['sent','accepted'].includes(record.accountingStatus));
    for(const record of records){
      body.append(button((contract.contractNo||'')+' · '+statementTitle(record),()=>openStatement(project,contract,record,()=>renderAccountingStatements(body,projectId),{finance:true})));
    }
  }
  if(!body.children.length)body.append(element('p','contract-empty','صورت‌وضعیتی به مالی ارسال نشده است.'));
}

