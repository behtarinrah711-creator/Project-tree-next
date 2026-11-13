import { projectRepository } from '../../data/projectRepository.js';
import { canCreateAddendumFromContract } from '../../domain/contractAddenda.js';
import { statementsFor } from '../../domain/contractStatements.js';
import { canWriteProjectModule } from '../roleManagement/permissionState.js';
import { openWbsSheet } from '../wbs/wbsSheet.js';
import { openAddendumForContract, renderAddendumCard } from './contractAddendaView.js';
import { openStatementForm, renderStatementCard, statementTypes } from './contractStatementsView.js';

const number=new Intl.NumberFormat('fa-IR');
function button(label,classes,action){
  const control=document.createElement('button');
  control.type='button';control.textContent=label;control.className='contract-review-action '+classes;
  control.onclick=event=>{event.stopPropagation();action();};
  return control;
}

export function renderContractDocuments(project,contract,{onChanged=()=>{},reviewOnly=false,approvals=new Map()}={}){
  const row=document.createElement('section');row.className='contract-addenda-row';
  const toolbar=document.createElement('div');toolbar.className='contract-addenda-row-toolbar';
  const list=document.createElement('div');list.className='contract-addenda-children';list.hidden=!approvals.size;
  const current=()=>projectRepository.find(project.id)||project;
  const toggle=button('','contract-addenda-toggle',()=>{list.hidden=!list.hidden;paint(current());});
  const changed=()=>{if(row.isConnected)paint(current());onChanged();};
  const created=()=>{list.hidden=false;changed();};
  function paint(source){
    const addenda=(source.contractAddenda||[]).filter(item=>!item.trashed && String(item.parentContractId)===String(contract.id));
    const statements=statementsFor(source,contract.id);
    toggle.textContent='اسناد ('+number.format(addenda.length+statements.length)+')';
    toggle.setAttribute('aria-expanded',String(!list.hidden));
    if(list.hidden)return;
    const groups=[
      ['الحاقیه‌ها',addenda,item=>renderAddendumCard(source,item,changed,false,reviewOnly?(approvals.get(item.id)||{}):undefined,{nested:true})],
      ['صورت‌وضعیت‌ها',statements.filter(item=>item.statementType!=='retention-release'),item=>renderStatementCard(source,contract,item,changed,reviewOnly?(approvals.get(item.id)||{}):undefined)],
      ['آزادسازی حسن انجام کار',statements.filter(item=>item.statementType==='retention-release'),item=>renderStatementCard(source,contract,item,changed,reviewOnly?(approvals.get(item.id)||{}):undefined)],
    ];
    list.replaceChildren();
    for(const [label,records,render] of groups){
      if(!records.length)continue;
      const heading=document.createElement('h3');heading.className='contract-meta contract-project-path';heading.textContent=label;
      list.append(heading,...[...records].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(render));
    }
    if(!list.children.length){
      const empty=document.createElement('p');empty.className='contract-meta';empty.textContent='هنوز سندی ثبت نشده است.';
      list.append(empty);
    }
  }
  toolbar.append(toggle);
  const writable=!reviewOnly && canWriteProjectModule(project.id,'contracts');
  const addendum=writable && canCreateAddendumFromContract(contract,project);
  const statement=writable && contract.accountingStatus==='accepted';
  if(addendum || statement)toolbar.append(button('ثبت سند','contract-addendum-create',()=>{
    const source=current();
    const latest=(source.contracts||[]).find(item=>String(item.id)===String(contract.id))||contract;
    const options=[];
    if(canCreateAddendumFromContract(latest,source))options.push(['الحاقیه',()=>openAddendumForContract(project.id,contract.id,created)]);
    if(latest.accountingStatus==='accepted')for(const [type,label] of statementTypes){
      options.push([type==='retention-release'?label:'صورت‌وضعیت '+label,()=>openStatementForm(source,latest,created,null,type)]);
    }
    openWbsSheet({title:'انتخاب نوع سند',showSave:false,reuseHistoryOnReplace:true,historyKey:'contract-document-type:'+contract.id,
      body(root){
        root.classList.add('contract-status-sheet');
        const choices=document.createElement('div');choices.className='workspace-option-list';
        choices.append(...options.map(([label,action])=>button(label,'workspace-option',action)));
        root.append(choices);
      },
    });
  }));
  row.append(toolbar,list);
  paint(project);
  return row;
}
