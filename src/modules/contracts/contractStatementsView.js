import {renderInlineContractReject} from './contractReasonSheet.js';
import {openContractPreview} from './contractPreviewView.js';
import {statementWorkRows,resolveStatementWork} from '../../domain/statementWork.js';
import { projectRepository } from '../../data/projectRepository.js';
import { canReviewContract } from '../../domain/contractApproval.js';
import { accountStatements, approvedStatement, statementAccount, statementAddenda, contractStatementTotals, finalStatementSummary, statementAmounts, statementsFor } from '../../domain/contractStatements.js';
import { canWriteProjectModule } from '../roleManagement/permissionState.js';
import { currentExecutionActor } from '../wbs/executionActor.js';
import { fieldRow, openWbsSheet, closeWbsSheet } from '../wbs/wbsSheet.js';
import { todayJalaliStr, formatJalaliDisplay, openJalaliPicker } from '../../ui/jalali.js';
import { makeQuantityRow, numericValue, renderQuantityRows, rowAmount } from './contractPricing.js';
import { ftAmountSummary, ftNumberRow, ftSelectRow } from './realContractFormModule.js';
import { openStaticChoicePicker } from './contractPickers.js';
import { saveContractHandoff } from './contractHandoffApi.js';
import { contractRowData, renderContractCardHeading } from './contractsModule.js';
import { renderContractProgress, renderContractProgressCircle } from './contractProgressView.js';
import { renderContractHistory } from './contractHistoryView.js';
import { openContractExport } from './contractExportView.js';
import { openConfirm } from '../../ui/confirm.js';
import { canDeleteContractAddenda } from '../../domain/contractAddenda.js';
import { renderContractSignedSection } from './contractSignedView.js';

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
export const statementTypes=[['interim','موقت'],['final','قطعی'],['retention-release','آزاد کردن حسن انجام کار']];
const statementTitle=record=>record.statementType==='retention-release'?'آزاد کردن حسن انجام کار':record.statementType==='final'?'صورت‌وضعیت قطعی':'صورت‌وضعیت موقت شماره '+format.format(record.sequence||1);

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
  return table([
    ['مبلغ اولیه قرارداد',money(totals.original)],
    ['جمع الحاقیه‌های نهایی‌شده',money(totals.adjustments)],
    ['مبلغ به‌روز قرارداد',money(totals.total)],
    ['حسن انجام کار کل با احتساب الحاقیه‌ها',money(totals.estimatedRetention)],
    ['خالص کل در صورت تکمیل',money(totals.total===null?null:totals.total-totals.estimatedRetention)],
    ['کارکرد تأییدشده',money(totals.gross)],
    ['مانده حسن انجام کار',money(totals.retained)],
    ['حسن انجام کار آزادشده',money(totals.released)],
    ['پرداخت ثبت‌شده',money(totals.paid)],
    ['مانده برای صورت‌وضعیت',money(totals.remaining)],
    ['مانده پرداخت پیمانکار',money(totals.payable)],
  ]);
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
  const label=statementType==='retention-release'?'آزاد کردن حسن انجام کار'
    :(record?'اصلاح':'ایجاد')+' صورت‌وضعیت '+statementTypes.find(([value])=>value===statementType)[1];
  let date=record?.date||todayJalaliStr();
  const sheet=openWbsSheet({
    title:label,historyKey:'statement-form:'+contract.id,
    body(root){
      const contractInfo=contractRowData(project.id,contract);
      const identity=element('div','contract-statement-identity');
      identity.append(element('strong','',contractInfo.title),element('div','',contractInfo.number));
      const dateField=element('div','form-template');
      const paintDate=()=>{
        dateField.replaceChildren();
        ftSelectRow(dateField,'تاریخ صورت‌وضعیت',formatJalaliDisplay(date),()=>openJalaliPicker(date,next=>{date=next;paintDate();}));
      };
      paintDate();
      const note=element('textarea','wbs-input');
      note.name='note';note.value=record?.note||'';
      const fields=element('div','contract-form-body');
      const calculation=element('div');
      const refresh=()=>{
        fields.replaceChildren();
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
            calculation.replaceChildren(table([['مبلغ کل صورت‌وضعیت',money(gross)],['حسن انجام کار',money(result.retentionAmount)],['خالص این صورت‌وضعیت',money(result.netAmount)]]));
            if(workEntries().length && !resolved)calculation.append(element('p','wbs-note','کارکرد را در محدوده مانده هر ردیف وارد کنید.'));
          };
          for(const [index,row] of workRows.entries()){
            const entry=entries[index];
            entry.method ||= row.measured?'quantity':'amount';
            const card=element('div','contract-quantity-row form-template');
            card.append(element('h3','contract-statement-operation-title',row.description||'عملیات '+format.format(index+1)));
            const display=value=>row.measured?format.format(value)+' '+(row.unit||''):money(value);
            card.append(table([
              [row.measured?'بهای واحد قرارداد':'مبلغ توافقی قرارداد',money(numericValue(row.measured?row.unitPrice:row.agreedPrice))],
              ['کارکرد قبلی',display(row.previous)],
              ['مانده ردیف',row.limit===null?'تعیین نشده':display(Math.max(0,row.limit-row.previous))],
            ]));
            const equivalent=element('p','wbs-note');
            const updateRow=()=>{
              const item=workEntries().find(item=>item.key===row.key);
              const operation=item && resolveStatementWork([row],[item])?.[0];
              equivalent.textContent=operation?[row.measured?display(operation.quantity):'',money(rowAmount(operation))].filter(Boolean).join(' | '):'';
              update();
            };
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
            card.append(equivalent);fields.append(card);updateRow();
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
      root.append(identity,fieldRow('مربوط به',target),dateField,fields,fieldRow('توضیحات اختیاری',note),calculation);
      refresh();
    },
    onSave(root){
      if(saving)return false;
      const value=name=>root.querySelector('[name="'+name+'"]').value.trim();
      const type=statementType;
      if(type==='final' && !final.ready){toast('شرایط صدور صورت‌وضعیت قطعی تکمیل نشده است');return false;}
      if(type==='interim' && !resolveStatementWork(workRows,workEntries())){toast('کارکرد عملیات قرارداد را معتبر وارد کنید');return false;}
      if(type==='retention-release' && (!operations.length || operations.some(row=>!row.description.trim() || !rowAmount(row) || (row.pricingMode==='quantity' && !row.unit)))){toast('شرح و مبلغ عملیات را کامل کنید');return false;}
      saving=true;
      saveContractHandoff(project.id,documentRecord,'save_statement',{contractId:contract.id,addendumId,statementType:type,date,...(type==='interim'?{workEntries:workEntries()}:type==='final'?{}:{operations}),note:value('note')})
        .then(()=>{if(root.isConnected)closeWbsSheet();onChanged();})
        .catch(error=>toast(error.message)).finally(()=>{saving=false;});
      return false;
    },
  });
  sheet.classList.add('contract-addendum-form');
}

function openStatement(project,contract,record,onChanged,{finance=false,approval}={}){
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
      root.append(table([
        ['شماره قرارداد',contract.contractNo||'—'],['مربوط به',record.addendumNo||'قرارداد اصلی'],['تاریخ',formatJalaliDisplay(record.date)||record.date||'—'],
        ['وضعیت',status],['کارکرد این سند',money(record.stageAmount||0)],['کارکرد تجمعی',money(record.cumulativeAmount||0)],
        ['حسن انجام کار',money(record.retentionAmount||0)],['خالص',money(record.netAmount??record.approvedAmount??record.stageAmount??0)],
        ['پرداخت‌شده',money(record.paidAmount||0)],
      ]));
      if(record.operations?.length)root.append(element('h3','','عملیات'),operationSummary(record.operations));
      if(record.finalTotals)root.append(table([['جمع عملیات موقت',money(record.finalTotals.gross)],['حسن انجام کار',money(record.finalTotals.retention)],['خالص موقت‌ها',money(record.finalTotals.net)]]));
      if(record.statementType==='final' && !record.finalTotals){
        const previous=statementsFor(project,contract.id).filter(item=>item.id!==record.id && (item.addendumId||null)===(record.addendumId||null) && (!item.statementType || item.statementType==='interim') && approvedStatement(item));
        if(previous.length)root.append(element('h3','','صورت‌وضعیت‌های موقت تأییدشده'),table(previous.map(item=>[statementTitle(item),money(item.approvedAmount??item.stageAmount??0)])));
      }
      if(record.statementType)root.append(renderContractProgress(document,record,project),renderContractHistory(document,record,{finance}));
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

export function renderStatementCard(project,contract,record,onChanged,approval){
  const row=element('article','contract-row');
  const title=statementTitle(record);
  const open=()=>openStatement(project,contract,record,onChanged,{approval});
  const progress=renderContractProgressCircle(document,record,project,event=>{event.stopPropagation();open();});
  const writable=!approval && record.statementType && canWriteProjectModule(project.id,'contracts');
  const deletable=writable && canDeleteContractAddenda(window.KarhaSaosaWorkspaceAccess?.[project.id]);
  const editable=record.status==='draft';
  const buildDocument=()=>{
    const documentNode=element('section','contract-export-document');
    documentNode.dir='rtl';
    documentNode.append(element('h2','',title),element('p','',contract.contractNo||''),element('p','',formatJalaliDisplay(record.date)||''),
      operationSummary(record.operations||[]),table([['مبلغ سند',money(record.statementAmount??record.stageAmount??0)]]));
    return documentNode;
  };
  const heading=renderContractCardHeading(project,contract,{
    onEdit:writable?()=>editable?openStatementForm(project,contract,onChanged,record):toast('صورت‌وضعیت در وضعیت فعلی قابل ویرایش نیست'):undefined,
    onExport:trigger=>{
      const documentNode=buildDocument();
      openContractExport(project,{title,contractNo:contract.contractNo||''},{trigger,markup:documentNode.outerHTML});
    },
    onDelete:deletable?()=>{
      if(record.signedAt || ['sent','accepted'].includes(record.accountingStatus)){toast('صورت‌وضعیت در وضعیت فعلی قابل حذف نیست');return;}
      openConfirm('صورت‌وضعیت حذف شود؟',()=>saveContractHandoff(project.id,record,'delete_statement')
        .then(onChanged).catch(error=>toast(error.message)),'حذف');
    }:undefined,
  },{onPreview:trigger=>openContractPreview(project,contract,{trigger,documentPreview:{title:'پیش‌نمایش '+title,content:buildDocument()}}),progress});
  heading.className+=' contract-card-heading--nested-addendum';
  const main=heading.children[0];
  main.children[0].textContent=title;
  main.children[1].dir='rtl';
  main.children[1].textContent=[record.addendumNo,Number(record.statementAmount??record.stageAmount)?money(record.statementAmount??record.stageAmount):'',formatJalaliDisplay(record.date)].filter(Boolean).join(' | ');

  heading.children[2].hidden=true;
  row.append(heading);
  return row;
}

export function renderAccountingStatements(body,projectId){
  const project=projectRepository.find(projectId);
  if(!project)return;
  body.replaceChildren();
  for(const contract of project.contracts||[]){
    if(contract.trashed)continue;
    const records=statementsFor(project,contract.id).filter(record=>['sent','accepted'].includes(record.accountingStatus));
    for(const record of records)body.append(button((contract.contractNo||'')+' · '+statementTitle(record),()=>openStatement(project,contract,record,()=>renderAccountingStatements(body,projectId),{finance:true})));
  }
  if(!body.children.length)body.append(element('p','contract-empty','صورت‌وضعیتی به مالی ارسال نشده است.'));
}
