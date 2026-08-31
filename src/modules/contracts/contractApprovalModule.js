import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { getProjectContracts } from './realContractDomain.js';

function project(projectId=null){
  const id=projectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.();
  return id ? projectRepository.getActiveProject(id) : null;
}
function contacts(p){return Array.isArray(p?.contacts)?p.contacts.filter(c=>!c.trashed):[];}
function findContact(p,id){return contacts(p).find(c=>String(c.id)===String(id))||null;}
function activities(p){return Array.isArray(p?.activityTemplates)?p.activityTemplates.filter(a=>!a.trashed):[];}
function activity(p,id){return activities(p).find(a=>String(a.id)===String(id))||null;}
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function num(v){return Number(String(v??'').replace(/[^\d.]/g,''))||0;}
function money(v){try{return new Intl.NumberFormat('fa-IR').format(Number(v)||0);}catch{return String(v);}}
function persian(v){return String(v??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);}
function toast(m){if(typeof window?.showToast==='function')window.showToast(m);else alert(m);}

export const contractApprovalModule={
  id:'contract-approval',

  render(container,projectId=null){
    const body=container||document.getElementById('contractApprovalBody'); if(!body)return;
    body.innerHTML='';
    const p=project(projectId);
    if(!p){body.innerHTML='<div class="contract-empty">ابتدا یک پروژه را انتخاب کنید.</div>';return;}
    if(!Array.isArray(p.contractStatusReports))p.contractStatusReports=[];
    const reports=p.contractStatusReports.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    if(!reports.length){body.innerHTML='<div class="contract-empty">هنوز صورت‌وضعیت قراردادی برای بررسی وجود ندارد.</div>';return;}
    const wrap=document.createElement('div');wrap.className='contract-approval-list';

    reports.forEach(r=>{
      const c=getProjectContracts(p).find(x=>String(x.id)===String(r.contractId)); if(!c)return;
      const contact=findContact(p,c.contactId||r.contactId), a=activity(p,r.activityId||c.activityId);
      const total=num(c.amount), approved=num(r.approvedAmount), paid=num(r.paidAmount), stage=num(r.stageAmount);
      const card=document.createElement('div');card.className='contract-approval-card';
      const name=[contact?.firstName,contact?.lastName].filter(Boolean).join(' ')||contact?.name||'بدون مخاطب';
      const status=r.approvalStatus==='approved'?'تایید شده':r.approvalStatus==='rejected'?'رد شده':'در انتظار تایید';
      card.innerHTML='<div class="contract-status-title">'+esc(c.title||'قرارداد')+'</div>'+
        '<div class="contract-status-meta">پیمانکار: '+esc(name)+' · فعالیت: '+esc(a?.name||'—')+'</div>'+
        '<div class="contract-status-meta">تاریخ: '+esc(r.date||'—')+' · درصد تجمعی: '+esc(persian(r.percent||0))+'٪ · مبلغ مرحله: '+esc(money(stage))+'</div>'+
        '<div class="contract-approval-status">وضعیت: <b>'+esc(status)+'</b></div>';
      const calc=document.createElement('div');calc.className='contract-status-card';
      calc.innerHTML='<b>مبلغ قرارداد:</b> '+esc(money(total))+'<br><b>مبلغ تاییدشده:</b> '+esc(money(approved))+'<br><b>مبلغ پرداخت‌شده:</b> '+esc(money(paid))+'<br><b>مانده قابل پرداخت این صورت وضعیت:</b> '+esc(money(Math.max(0,approved-paid)));
      card.appendChild(calc);
      const fields=document.createElement('div');fields.className='contract-approval-fields';
      const mk=(label,val)=>{const w=document.createElement('div');w.className='contract-status-field';const l=document.createElement('label');l.textContent=label;const inp=document.createElement('input');inp.type='text';inp.value=val?String(val):'';inp.inputMode='numeric';w.append(l,inp);return {w,inp};};
      const ap=mk('مبلغ تاییدشده (تومان)',approved), pp=mk('مبلغ پرداخت‌شده (تومان)',paid);fields.append(ap.w,pp.w);card.appendChild(fields);
      const actions=document.createElement('div');actions.className='contract-approval-actions';
      const approve=document.createElement('button');approve.className='contract-approval-btn primary';approve.textContent='تایید';
      approve.onclick=()=>{
        const av=num(ap.inp.value),pv=num(pp.inp.value);
        if(pv>av){toast('مبلغ پرداخت‌شده نمی‌تواند بیشتر از مبلغ تاییدشده باشد');return;}
        if(av>stage){toast('مبلغ تاییدشده نمی‌تواند بیشتر از مبلغ این صورت وضعیت باشد');return;}
        r.approvedAmount=av;r.paidAmount=pv;r.approvalStatus='approved';r.approvedAt=Date.now();
        r.approvedBy=window.currentUser?.uid||null;
        projectRepository.saveProjectsList(projectRepository.getProjectsList());
        this.render(body,p.id);toast('صورت وضعیت تایید شد');
      };
      const reject=document.createElement('button');reject.className='contract-approval-btn danger';reject.textContent='رد';
      reject.onclick=()=>{
        r.approvalStatus='rejected';r.approvedAmount=0;r.paidAmount=0;r.rejectedAt=Date.now();
        projectRepository.saveProjectsList(projectRepository.getProjectsList());
        this.render(body,p.id);toast('صورت وضعیت رد شد');
      };
      const save=document.createElement('button');save.className='contract-approval-btn';save.textContent='ثبت پرداخت';
      save.onclick=()=>{
        const av=num(r.approvedAmount),pv=num(pp.inp.value);
        if(r.approvalStatus!=='approved'){toast('ابتدا صورت وضعیت را تایید کنید');return;}
        if(pv>av){toast('مبلغ پرداخت‌شده نمی‌تواند بیشتر از مبلغ تاییدشده باشد');return;}
        r.paidAmount=pv;r.paidAt=Date.now();
        projectRepository.saveProjectsList(projectRepository.getProjectsList());
        this.render(body,p.id);toast('پرداخت ثبت شد');
      };
      actions.append(approve,reject,save);card.appendChild(actions);wrap.appendChild(card);
    });
    if(!wrap.children.length){body.innerHTML='<div class="contract-empty">قرارداد مرتبط با صورت‌وضعیت‌ها پیدا نشد.</div>';return;}
    body.appendChild(wrap);
  }
};
export default contractApprovalModule;
