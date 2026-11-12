import { projectRepository } from '../../data/projectRepository.js';
import { canReviewContract } from '../../domain/contractApproval.js';
import { approvedStatement, contractStatementTotals, statementAmounts, statementsFor } from '../../domain/contractStatements.js';
import { canWriteProjectModule } from '../roleManagement/permissionState.js';
import { currentExecutionActor } from '../wbs/executionActor.js';
import { fieldRow, openWbsSheet, closeWbsSheet } from '../wbs/wbsSheet.js';
import { todayJalaliStr, formatJalaliDisplay } from '../../ui/jalali.js';
import { numericValue } from './contractPricing.js';
import { saveContractHandoff } from './contractHandoffApi.js';
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
const statementTitle=record=>record.statementType==='final'?'صورت‌وضعیت قطعی':'صورت‌وضعیت موقت شماره '+format.format(record.sequence||1);

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
  const totals=contractStatementTotals(project,contract);
  return table([
    ['مبلغ اولیه قرارداد',money(totals.original)],
    ['جمع الحاقیه‌های نهایی‌شده',money(totals.adjustments)],
    ['مبلغ به‌روز قرارداد',money(totals.total)],
    ['حسن انجام کار کل با احتساب الحاقیه‌ها',money(totals.estimatedRetention)],
    ['خالص کل در صورت تکمیل',money(totals.total===null?null:totals.total-totals.estimatedRetention)],
    ['کارکرد تأییدشده',money(totals.gross)],
    ['حسن انجام کار کسرشده',money(totals.retained)],
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

function openStatementForm(project,contract,onChanged,record=null){
  const totals=contractStatementTotals(currentProject(project),contract);
  let saving=false;
  const documentRecord=record||{id:'statement-'+crypto.randomUUID(),statementType:'interim'};
  openWbsSheet({
    title:record?'اصلاح صورت‌وضعیت':'ایجاد صورت‌وضعیت',historyKey:'statement-form:'+contract.id,
    body(root){
      const kind=element('select','wbs-input');
      for(const [value,label] of [['interim','موقت'],['final','قطعی']]){
        const option=element('option','',label);
        option.value=value;kind.append(option);
      }
      kind.value=documentRecord.statementType;
      kind.name='kind';
      const date=input('تاریخ صورت‌وضعیت','text',record?.date||todayJalaliStr());
      date.node.name='date';
      const entered=input('مبلغ کارکرد به تومان','text',record?String(record.statementType==='final'?record.cumulativeAmount:record.stageAmount):'');
      entered.node.name='amount';entered.node.inputMode='numeric';
      const note=element('textarea','wbs-input');
      note.name='note';note.value=record?.note||'';
      const calculation=element('div');
      const refresh=()=>{
        const value=numericValue(entered.node.value),gross=kind.value==='final'?value-totals.gross:value;
        const result=statementAmounts(totals,contract,gross);
        calculation.replaceChildren(table([
          ['کارکرد قبلی',money(totals.gross)],
          ['مانده قبل از ثبت',money(totals.remaining)],
          ['کارکرد تا امروز',money(result.cumulativeAmount)],
          ['حسن انجام کار این سند',money(result.retentionAmount)],
          ['خالص این صورت‌وضعیت',money(result.netAmount)],
        ]));
      };
      kind.onchange=()=>{
        entered.node.setAttribute('aria-label',kind.value==='final'?'مبلغ کل کارکرد قطعی':'مبلغ کارکرد این دوره');
        refresh();
      };
      entered.node.oninput=refresh;
      entered.node.placeholder='موقت: این دوره، قطعی: کل کارکرد';
      root.append(fieldRow('نوع صورت‌وضعیت',kind),date.row,entered.row,fieldRow('توضیحات',note),calculation);
      refresh();
    },
    onSave(root){
      if(saving)return false;
      const value=name=>root.querySelector('[name="'+name+'"]').value.trim();
      const raw=value('amount');
      if(!raw || !/^[\d۰-۹٠-٩,٬]+$/.test(raw)){toast('مبلغ کارکرد را وارد کنید');return false;}
      saving=true;
      saveContractHandoff(project.id,documentRecord,'save_statement',{contractId:contract.id,statementType:value('kind'),date:value('date'),amount:numericValue(raw),note:value('note')})
        .then(()=>{if(root.isConnected)closeWbsSheet();onChanged();})
        .catch(error=>toast(error.message)).finally(()=>{saving=false;});
      return false;
    },
  });
}

function openStatement(project,contract,record,onChanged,{finance=false}={}){
  let pending=false;
  const reopen=()=>{
    const source=currentProject(project);
    const updated=statementsFor(source,contract.id).find(item=>item.id===record.id);
    if(updated)openStatement(source,contract,updated,onChanged,{finance});
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
        ['شماره قرارداد',contract.contractNo||'—'],['تاریخ',formatJalaliDisplay(record.date)||record.date||'—'],
        ['وضعیت',status],['کارکرد این سند',money(record.stageAmount||0)],['کارکرد تجمعی',money(record.cumulativeAmount||0)],
        ['حسن انجام کار',money(record.retentionAmount||0)],['خالص',money(record.netAmount??record.approvedAmount??record.stageAmount??0)],
        ['پرداخت‌شده',money(record.paidAmount||0)],
      ]));
      if(record.statementType==='final'){
        const previous=statementsFor(project,contract.id).filter(item=>item.id!==record.id && item.statementType!=='final' && approvedStatement(item));
        if(previous.length)root.append(element('h3','','صورت‌وضعیت‌های موقت تأییدشده'),table(previous.map(item=>[statementTitle(item),money(item.approvedAmount??item.stageAmount??0)])));
      }
      if(record.note)root.append(element('p','',record.note));
      if(record.financeRejection?.reason)root.append(element('p','contract-rejection-reason',record.financeRejection.reason));
      if(!finance && record.statementType && canWriteProjectModule(project.id,'contracts')){
        if(canReviewContract(record,currentExecutionActor(project)))root.append(button('تأیید صورت‌وضعیت',()=>run('approve_statement')));
        if(record.status==='draft')root.append(button('اصلاح و ارسال مجدد',()=>openStatementForm(project,contract,onChanged,record)));
      }
      if(record.statementType){
        const signed=renderContractSignedSection(project,record,{onChanged,finance,onReturn:reopen,label:'صورت‌وضعیت'});
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

export function renderContractStatementsRow(project,contract,{approvedOnly=false,onChanged=()=>{}}={}){
  const row=element('section','contract-addenda-row');
  const toolbar=element('div','contract-addenda-row-toolbar');
  const content=element('div','contract-addenda-children');
  content.hidden=true;
  const toggle=button('',()=>{content.hidden=!content.hidden;refresh();},'contract-review-action contract-addenda-toggle');
  const refresh=(source=currentProject(project))=>{
    const records=statementsFor(source,contract.id);
    const visible=approvedOnly?records.filter(approvedStatement):records;
    toggle.textContent='صورت‌وضعیت‌ها ('+format.format(visible.length)+')';
    toggle.setAttribute('aria-expanded',String(!content.hidden));
    if(!content.hidden){
      content.replaceChildren(...visible.map(record=>button(statementTitle(record)+' · '+money(record.stageAmount||0),()=>openStatement(source,contract,record,()=>refresh()))));
      if(!visible.length)content.append(element('p','contract-meta','صورت‌وضعیتی ثبت نشده است.'));
    }
    if(inProgress){
      const count=records.filter(record=>!approvedStatement(record)).length;
      inProgress.hidden=!count;
      inProgress.textContent=format.format(count)+' صورت‌وضعیت در جریان';
    }
  };
  const canWrite=canWriteProjectModule(project.id,'contracts');
  const inProgress=approvedOnly && canWrite ? button('',()=>{
    const source=currentProject(project);
    openWbsSheet({title:'صورت‌وضعیت‌های در جریان',showSave:false,historyKey:'statement-pending:'+contract.id,reuseHistoryOnReplace:true,
      body(root){root.append(...statementsFor(source,contract.id).filter(record=>!approvedStatement(record)).map(record=>button(statementTitle(record),()=>openStatement(source,contract,record,()=>refresh()))));}});
  }):null;
  toolbar.append(toggle);
  if(contract.accountingStatus==='accepted' && canWrite)toolbar.append(button('ایجاد صورت‌وضعیت',()=>openStatementForm(currentProject(project),contract,()=>{content.hidden=false;refresh();onChanged();}),'contract-review-action contract-addendum-create'));
  row.append(toolbar,content);
  if(inProgress)row.append(inProgress);
  refresh(project);
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
