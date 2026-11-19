import {appendReportPhotos} from './dailyExecutionReport.js';
import {openSearchPicker} from '../../ui/searchPickerAdapter.js';
import {openNumpadGeneric} from '../../ui/numpad.js';
import {formatJalaliDisplay} from '../../ui/jalali.js';
import {todayApi} from '../../domain/wbs/todayApi.js';
import {contractorForItem,tehranTodayJalali} from '../../domain/wbs/todayDomain.js';
import {mountFileUploader} from '../files/fileUploader.js';
import {fieldRow,openWbsSheet} from './wbsSheet.js';

export const INTERRUPTION_ELIGIBILITY={pending:'در دست بررسی',eligible:'مجاز',ineligible:'غیرمجاز'};
const roles={contractor:'پیمانکار',assignee:'مسئول پیگیری',approver:'مسئول تأیید',client:'کارفرما',supplier:'تأمین‌کننده',other:'مخاطب دیگر',external:'عامل بیرونی',unknown:'در دست بررسی'};
const name=contact=>contact?.name||contact?.title||'';
const id=contact=>String(contact?.id||'');

export function openExecutionInterruption(project,item,actor,refresh,{type='execution_obstacle',multiday=false,existing}={}){
  const planned=type==='planned_pause';
  const documentRef=document;
  const current=tehranTodayJalali();
  const draft={type,multiday,day:current,role:'unknown',...existing};
  const contacts=(project.contacts||[]).filter(contact=>contact && !contact.trashed);
  const entity=item.entity;
  const ref={kind:item.kind,id:item.id,workId:item.workId};
  let uploader,feedback;
  const photos=[...(draft.photos||[])];
  const button=(label,fn)=>{
    const node=documentRef.createElement('button');
    node.className='wbs-input';node.type='button';node.textContent=label;node.onclick=fn;
    return node;
  };
  const sheet=openWbsSheet({
    title:planned?'ثبت وقفهٔ برنامه‌ریزی‌شده':draft.multiday?'ثبت توقف چندروزه':'ثبت مانع امروز',
    historyKey:'execution-interruption:'+item.id,autoFocus:false,
    body(root){
      const field=(label,key,tag)=>{
        const input=documentRef.createElement(tag);
        input.className='wbs-input';input.value=draft[key]||'';
        input.oninput=()=>{draft[key]=input.value;};
        root.append(fieldRow(label,input));
      };
      const date=(label,key)=>{
        const node=button(draft[key]?formatJalaliDisplay(draft[key]):'انتخاب تاریخ',()=>
          window.KarhaUI?.openJalaliPicker?.(draft[key]||current,value=>{draft[key]=value;node.textContent=formatJalaliDisplay(value);}));
        root.append(fieldRow(label,node));
      };
      if(planned||draft.multiday)date(planned?'تاریخ شروع وقفه':'تاریخ شروع توقف','day');
      if(planned||draft.multiday)date(planned?'تاریخ برنامه‌ریزی‌شدهٔ ادامه':'تاریخ پیگیری یا ادامه','resumeOn');
      field(planned?'دلیل یا پیش‌نیاز ادامه':'علت مانع','reason','input');
      field(planned?'شرح کار باقی‌مانده':'شرح مانع','description','textarea');
      if(!planned){
        const person=button('انتخاب مخاطب',()=>openSearchPicker({title:'انتخاب مخاطب',resourceType:'contact',
          contextKey:'execution-obstacle-contact',items:contacts.map(contact=>({id:id(contact),name:name(contact)})),
          onSelect:selected=>{draft.contactId=String(selected.id);paint();}}));
        const personRow=fieldRow('شخص یا شرکت',person);
        const role=button('',()=>openSearchPicker({title:'انتخاب نقش',contextKey:'execution-obstacle-role',
          items:Object.entries(roles).map(([id,name])=>({id,name})),onSelect:selected=>{
            draft.role=selected.id;
            const assigned={contractor:id(contractorForItem(project,item).contact),assignee:entity.assigneeContactId,approver:entity.approvalContactId};
            draft.contactId=String(assigned[draft.role]||'');
            paint();
          }}));
        const paint=()=>{
          role.textContent=roles[draft.role];
          person.textContent=name(contacts.find(contact=>id(contact)===draft.contactId))||'انتخاب مخاطب';
          const hidePerson=['unknown','external'].includes(draft.role);
          personRow.hidden=hidePerson;
          personRow.classList.toggle('hidden',hidePerson);
        };
        paint();
        root.append(fieldRow('نقش طرف منتسب',role),personRow);
        if(!draft.multiday){
          const duration=button(draft.durationHours==null?'تمام‌روز':draft.durationHours+' ساعت',()=>openNumpadGeneric(
            draft.durationHours??'',value=>{
              draft.durationHours=value===''?null:Number(value);
              duration.textContent=draft.durationHours==null?'تمام‌روز':draft.durationHours+' ساعت';
            },{suffix:' ساعت',group:false,allowDecimal:true,maxLen:4,validate:value=>value!==''&&!(Number(value)>0&&Number(value)<=24)?'مدت باید بیشتر از صفر و حداکثر ۲۴ ساعت باشد':''}));
          root.append(fieldRow('مدت توقف',duration));
        }
        const attachments=documentRef.createElement('div');
        root.append(fieldRow('مستندات',attachments));
        uploader=mountFileUploader(attachments,{projectId:project.id,recordId:existing?.id||item.id,category:'reports',
          files:photos,label:'افزودن عکس',buttonLabel:true,allowReplace:true});
      }
      feedback=documentRef.createElement('p');
      feedback.setAttribute('role','alert');
      root.append(feedback);
    },
    onSave(){
      if(uploader?.isBusy()){feedback.textContent='ابتدا بارگذاری عکس‌ها را تمام کنید';return false;}
      const result=todayApi.saveInterruption(project.id,ref,{...draft,photos},actor);
      if(!result.ok){
        feedback.textContent=({
          forbidden:'ثبت برای مسئول پیگیریِ دارای دسترسی اجرا مجاز است.',
          locked:'کار تکمیل شده یا در انتظار تأیید است.',
          not_found:'کار پیدا نشد. فهرست اجرا را تازه کنید.',
          reason_required:'دلیل را وارد کنید.',
          description_required:planned?'شرح کار باقی‌مانده را وارد کنید.':'شرح مانع را وارد کنید.',
          invalid_start:planned?'تاریخ شروع وقفه را انتخاب کنید.':'تاریخ شروع توقف باید امروز یا قبل از امروز باشد.',
          invalid_resume:planned?'تاریخ ادامه باید بعد از شروع وقفه باشد.':'تاریخ پیگیری یا ادامه را بررسی کنید.',
          invalid_duration:'مدت باید بین صفر و ۲۴ ساعت باشد.',
          contact_required:'شخص یا شرکت مرتبط را انتخاب کنید.',
        })[result.code]||'ذخیره انجام نشد. وضعیت کار را بررسی کنید.';
        return false;
      }
      refresh?.();
      return true;
    },
  });
  if(uploader){
    const observer=new MutationObserver(()=>{
      if(!sheet.isConnected){uploader.destroy();observer.disconnect();}
    });
    observer.observe(documentRef.body,{childList:true,subtree:true});
  }
}

export function obstacleRole(role){return roles[role]||'در دست بررسی';}

export function openExecutionDelayReport(project,items,{actor,canReview,refresh}={}){
  const rows=items.flatMap(item=>(item.entity.executionHistory||[])
    .filter(entry=>entry.type==='execution_obstacle')
    .map(entry=>({entry,source:item,path:[...(item.path||[]),item.entity.title||item.entity.text].filter(Boolean).join(' / ')})));
  const filters={role:'',contactId:'',from:'',to:'',cause:'',review:'',eligibility:''};
  openWbsSheet({
    title:'گزارش موانع و تأخیرات',saveLabel:'خروجی CSV',historyKey:'execution-delay-report:'+project.id,
    body(root){
      const results=document.createElement('div');
      const pick=(label,key,items)=>{
        const button=document.createElement('button');
        button.type='button';button.className='wbs-input';button.textContent='همه';
        button.onclick=()=>openSearchPicker({title:label,contextKey:'delay-report-'+key,items:[{id:'',name:'همه'},...items],
          onSelect:selected=>{filters[key]=String(selected.id);button.textContent=selected.name;paint();}});
        root.append(fieldRow(label,button));
      };
      pick('نقش','role',Object.entries(roles).map(([id,name])=>({id,name})));
      pick('شخص یا شرکت','contactId',[...new Map(rows.filter(({entry})=>entry.contactId)
        .map(({entry})=>[entry.contactId,{id:entry.contactId,name:entry.contactName}])).values()]);
      pick('علت','cause',[...new Set(rows.map(({entry})=>entry.reason))].map(name=>({id:name,name})));
      pick('وضعیت توقف','eligibility',Object.entries(INTERRUPTION_ELIGIBILITY).map(([id,name])=>({id,name})));
      pick('وضعیت بررسی','review',[{id:'pending',name:'در دست بررسی'},{id:'confirmed',name:'بررسی‌شده'}]);
      for(const [key,label] of [['from','از تاریخ'],['to','تا تاریخ']]){
        const button=document.createElement('button');
        button.type='button';button.className='wbs-input';button.textContent='انتخاب تاریخ';
        button.onclick=()=>window.KarhaUI?.openJalaliPicker?.(filters[key]||tehranTodayJalali(),value=>{
          filters[key]=value;button.textContent=formatJalaliDisplay(value);paint();
        });
        root.append(fieldRow(label,button));
      }
      function paint(){
        results.replaceChildren();
        for(const row of filtered()){
          const {entry,path,source}=row;
          const item=document.createElement('div');
          item.className='today-detail-card';
          const title=document.createElement('strong');title.textContent=path;
          const summary=document.createElement('p');
          summary.textContent=[formatJalaliDisplay(entry.day),entry.reason,obstacleRole(entry.role),entry.contactName,
            entry.resumedOn?'رفع مانع '+formatJalaliDisplay(entry.resumedOn):'',
            entry.multiday?'چندروزه':entry.durationHours==null?'تمام‌روز':entry.durationHours+' ساعت',
            INTERRUPTION_ELIGIBILITY[entry.eligibility]||INTERRUPTION_ELIGIBILITY.pending,
            entry.reviewed?'اثر بر موعد: '+entry.impactDays+' روز':''].filter(Boolean).join(' · ');
          item.append(title,summary);
          appendReportPhotos(item,entry.photos);
          if(canReview && actor?.contactId && String(source.entity.assigneeContactId)===actor.contactId){
            const review=document.createElement('button');
            review.type='button';review.className='today-report-link';review.textContent='ثبت اثر بر موعد';
            const error=document.createElement('p');error.setAttribute('role','alert');
            review.onclick=()=>openNumpadGeneric(entry.impactDays??'',value=>{
              const result=todayApi.saveInterruption(project.id,{kind:source.kind,id:source.id,workId:source.workId},
                {id:entry.id,review:true,impactDays:Number(value)},actor);
              if(!result.ok){error.textContent='ثبت نتیجهٔ بررسی انجام نشد';return false;}
              row.entry=result.entity.executionHistory.find(value=>value.id===entry.id);
              refresh?.();paint();
            },{suffix:' روز',group:false,maxLen:4,validate:value=>/^\d+$/.test(value)?'':'تعداد روز را وارد کنید'});
            const eligibility=document.createElement('button');
            eligibility.type='button';eligibility.className='today-report-link';eligibility.textContent='تعیین وضعیت توقف';
            eligibility.onclick=()=>openSearchPicker({title:'وضعیت توقف',contextKey:'execution-stop-eligibility',
              items:Object.entries(INTERRUPTION_ELIGIBILITY).map(([id,name])=>({id,name})),onSelect:selected=>{
                const result=todayApi.saveInterruption(project.id,{kind:source.kind,id:source.id,workId:source.workId},
                  {id:entry.id,eligibility:selected.id},actor);
                if(!result.ok){error.textContent='وضعیت توقف ذخیره نشد.';return;}
                row.entry=result.entity.executionHistory.find(value=>value.id===entry.id);
                refresh?.();paint();
              }});
            item.append(review,eligibility,error);
          }
          results.append(item);
        }
        if(!results.childElementCount)results.textContent='مانعی در این بازه ثبت نشده است';
      }
      root.append(results);paint();
    },
    onSave(){
      const escape=value=>'"'+String(value??'').replace(/^[=+@\-\t\r\n]/,first=>"'"+first).replaceAll('"','""')+'"';
      const data=[['مسیر کار','تاریخ شروع','تاریخ ادامهٔ پیش‌بینی‌شده','تاریخ رفع مانع','علت','شرح','نقش','مخاطب','نوع بازه','ساعت','اثر بر موعد (روز)','وضعیت توقف','وضعیت بررسی'],
        ...filtered().map(({entry,path})=>[path,entry.day,entry.resumeOn,entry.resumedOn,entry.reason,entry.description,
          obstacleRole(entry.role),entry.contactName,entry.multiday?'چندروزه':entry.durationHours==null?'تمام‌روز':'ساعتی',
          entry.durationHours,entry.impactDays,INTERRUPTION_ELIGIBILITY[entry.eligibility]||INTERRUPTION_ELIGIBILITY.pending,entry.reviewed?'بررسی‌شده':'در دست بررسی'])];
      const url=URL.createObjectURL(new Blob(['\uFEFF',data.map(row=>row.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='execution-delays.csv';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      return false;
    },
  });
  function filtered(){
    return rows.filter(({entry})=>(!filters.role||entry.role===filters.role)
      && (!filters.contactId||entry.contactId===filters.contactId)
      && (!filters.cause||entry.reason===filters.cause)
      && (!filters.eligibility||(entry.eligibility||'pending')===filters.eligibility)
      && (!filters.review||(entry.reviewed?'confirmed':'pending')===filters.review)
      && (!filters.from||(entry.resumedOn||(entry.multiday?tehranTodayJalali():entry.day))>=filters.from)
      && (!filters.to||entry.day<=filters.to)).sort((a,b)=>b.entry.day.localeCompare(a.entry.day));
  }
}
