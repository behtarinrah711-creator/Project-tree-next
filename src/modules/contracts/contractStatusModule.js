import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { contractApi } from '../../domain/contractApi.js';
import { getProjectContracts } from './realContractDomain.js';

function project(projectId=null){
  const id=projectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.();
  return id ? projectRepository.getActiveProject(id) : null;
}
function contacts(p){return Array.isArray(p?.contacts)?p.contacts.filter(c=>!c.trashed):[];}
function activities(p){return Array.isArray(p?.activityTemplates)?p.activityTemplates.filter(a=>!a.trashed):[];}
function activity(p,id){return activities(p).find(a=>String(a.id)===String(id))||null;}
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function num(v){return Number(String(v??'').replace(/[^\d.]/g,''))||0;}
function money(v){try{return new Intl.NumberFormat('fa-IR').format(Number(v)||0);}catch{return String(v);}}
function persian(v){return String(v??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);}
function today(){return new Date().toISOString().slice(0,10);}

let state={contactId:'',contractId:'',date:today(),percent:'',note:''};

export const contractStatusModule={
  id:'contract-status',
  getState(){return state;},
  reset(){state={contactId:'',contractId:'',date:today(),percent:'',note:''};},

  render(container,projectId=null){
    const p=project(projectId);
    const body=container || document.getElementById('contractStatusBody');
    if(!body)return;
    body.innerHTML='';
    if(!p){body.innerHTML='<div class="contract-empty">ابتدا یک پروژه را انتخاب کنید.</div>';return;}
    if(!Array.isArray(p.contractStatusReports))p.contractStatusReports=[];
    const cs=contacts(p), contracts=getProjectContracts(p).filter(c=>!c.trashed);

    const field=(label,kind,value,change,options)=>{
      const w=document.createElement('div');w.className='contract-status-field';
      const l=document.createElement('label');l.textContent=label;w.appendChild(l);
      let e;
      if(kind==='select'){e=document.createElement('select');e.innerHTML=options||'';e.value=value||'';}
      else if(kind==='textarea'){e=document.createElement('textarea');e.value=value||'';}
      else {e=document.createElement('input');e.type=kind||'text';e.value=value||'';}
      e.oninput=()=>change(e.value);
      e.onchange=()=>{change(e.value);this.render(body,p.id);};
      w.appendChild(e);body.appendChild(w);return e;
    };

    field('مخاطب / پیمانکار','select',state.contactId,v=>{state.contactId=v;state.contractId='';state.percent='';},
      '<option value="">انتخاب مخاطب…</option>'+cs.map(c=>'<option value="'+esc(c.id)+'">'+esc([c.firstName,c.lastName].filter(Boolean).join(' ')||c.name||'مخاطب')+'</option>').join(''));

    const mine=contracts.filter(c=>String(c.contactId)===String(state.contactId));
    field('قرارداد','select',state.contractId,v=>{state.contractId=v;state.percent='';},
      '<option value="">انتخاب قرارداد…</option>'+mine.map(c=>'<option value="'+esc(c.id)+'">'+esc((c.title||'قرارداد')+' · '+(activity(p,c.activityId)?.name||'فعالیت'))+'</option>').join(''));

    const selected=contracts.find(c=>String(c.id)===String(state.contractId));
    if(!selected){
      const inf=document.createElement('div');inf.className='contract-status-card';
      inf.textContent=state.contactId?(mine.length?'یک قرارداد را انتخاب کنید.':'برای این مخاطب قرارداد ثبت نشده است.'):'ابتدا مخاطب را انتخاب کنید.';
      body.appendChild(inf);return;
    }

    const total=num(selected.amount);
    const reports=p.contractStatusReports.filter(x=>String(x.contractId)===String(selected.id))
      .sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    const last=reports.length?Math.max(...reports.map(x=>Number(x.percent)||0)):0;
    const a=activity(p,selected.activityId);
    const head=document.createElement('div');head.className='contract-status-card';
    head.innerHTML='<div class="contract-status-title">'+esc(selected.title||'قرارداد')+
      '</div><div class="contract-status-meta">فعالیت: '+esc(a?.name||'—')+
      ' · مبلغ قرارداد: '+esc(money(total))+' · پیشرفت فعلی: '+esc(persian(last))+'٪</div>';
    body.appendChild(head);

    field('تاریخ صورت وضعیت','text',state.date,v=>state.date=v);
    field('درصد انجام تجمعی','number',state.percent,v=>state.percent=v);
    field('توضیحات','textarea',state.note,v=>state.note=v);

    const pct=Number(state.percent);
    const cumulative=Number.isFinite(pct)?Math.round(total*pct/100):0;
    const previous=Math.round(total*last/100);
    const stage=Math.max(0,cumulative-previous);
    const remain=Math.max(0,total-cumulative);
    const calc=document.createElement('div');calc.className='contract-status-card';
    calc.innerHTML='<b>مبلغ این صورت وضعیت:</b> '+esc(money(stage))+
      '<br><b>مبلغ تجمعی:</b> '+esc(money(cumulative))+
      '<br><b>مانده قرارداد:</b> '+esc(money(remain));
    body.appendChild(calc);

    const list=document.createElement('div');list.className='contract-status-list';
    const title=document.createElement('div');title.className='contract-status-title';title.textContent='صورت وضعیت‌های ثبت‌شده این قرارداد';list.appendChild(title);
    if(!reports.length){const e=document.createElement('div');e.className='contract-empty';e.textContent='هنوز صورت وضعیتی برای این قرارداد ثبت نشده است.';list.appendChild(e);}
    reports.forEach((r,i)=>{
      const row=document.createElement('div');row.className='contract-status-row';
      row.innerHTML='<div class="contract-status-row-head"><b>صورت وضعیت '+persian(i+1)+'</b><span class="contract-status-badge">در انتظار تایید حسابداری</span></div>'+
        '<div class="contract-status-meta">'+esc(r.date)+' · '+esc(persian(r.percent))+'٪ · مبلغ این مرحله '+esc(money(r.stageAmount||0))+'</div>'+
        (r.note?'<div class="contract-status-meta">'+esc(r.note)+'</div>':'');
      list.appendChild(row);
    });
    body.appendChild(list);

    const bar=document.createElement('div');bar.className='contract-status-savebar';
    const b=document.createElement('button');b.textContent='ثبت و ارسال به تاییدیه حسابداری';
    b.onclick=()=>{
      const n=Number(state.percent);
      if(!String(state.date||'').trim()){this.toast('تاریخ را وارد کنید');return;}
      if(!Number.isFinite(n)||n<0||n>100){this.toast('درصد را بین صفر تا ۱۰۰ وارد کنید');return;}
      if(n<last){this.toast('درصد جدید نمی‌تواند کمتر از درصد قبلی باشد');return;}
      if(n===last&&reports.length){this.toast('این درصد قبلاً ثبت شده است');return;}
      const cum=Math.round(total*n/100),prev=Math.round(total*last/100),stageAmount=Math.max(0,cum-prev);
      p.contractStatusReports.push({id:'csr_'+Date.now(),projectId:p.id,contractId:selected.id,
        contactId:selected.contactId,activityId:selected.activityId,date:String(state.date).trim(),percent:n,
        stageAmount,cumulativeAmount:cum,note:String(state.note||'').trim(),
        approvalStatus:'pending-accounting',createdAt:Date.now()});
      const progressEntry={id:'pt_'+Date.now(),percent:n,amount:cum,stageAmount,
        date:String(state.date).trim(),note:String(state.note||'').trim(),createdAt:Date.now(),source:'contract-status'};
      contractApi.save(p.id,{
        ...selected,
        progressTimeline:[...(selected.progressTimeline||[]),progressEntry],
        progressPercent:n,
      });
      projectRepository.saveProjectsList(projectRepository.getProjectsList());
      this.toast('صورت وضعیت ثبت و برای تاییدیه حسابداری ارسال شد');
      state.percent='';state.note='';this.render(body,p.id);
    };
    bar.appendChild(b);body.appendChild(bar);
  },
  toast(message){ if(typeof window?.showToast==='function')window.showToast(message); else alert(message); }
};
export default contractStatusModule;
