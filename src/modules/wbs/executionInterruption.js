import {interruptionScheduleLookup,jalaliDayNumber,previewPlannedPause,scheduleDate,scheduleRangeOf} from '../../domain/wbs/scheduling.js';
import {appendReportPhotos} from './dailyExecutionReport.js';
import {openSearchPicker} from '../../ui/searchPickerAdapter.js';
import {openNumpadGeneric} from '../../ui/numpad.js';
import {formatJalaliWithWeekday} from '../../ui/jalali.js';
import {todayApi} from '../../domain/wbs/todayApi.js';
import {INACTIVE_REASONS,tehranTodayJalali} from '../../domain/wbs/todayDomain.js';
import {mountFileUploader} from '../files/fileUploader.js';
import {fieldRow,openWbsSheet} from './wbsSheet.js';
import {predecessorField} from './predecessorField.js';

export const INTERRUPTION_ELIGIBILITY={pending:'در دست بررسی',eligible:'مجاز',ineligible:'غیرمجاز'};
const roles={contractor:'پیمانکار',assignee:'مسئول پیگیری',approver:'مسئول تأیید',client:'کارفرما',supplier:'تأمین‌کننده',other:'مخاطب دیگر',external:'عامل بیرونی',unknown:'در دست بررسی'};
const name=contact=>[contact?.firstName,contact?.lastName].filter(Boolean).join(' ')||contact?.name||contact?.title||'';
const id=contact=>String(contact?.id||'');

export function openExecutionInterruption(project,item,actor,refresh,onReturn,{plannedOnly=false}={}){
  const current=tehranTodayJalali();
  const draft={multiday:true,day:current,role:'unknown',contactIds:[]};
  const contacts=(project.contacts||[]).filter(contact=>contact && !contact.trashed);
  const ref={kind:item.kind,id:item.id,workId:item.workId};
  const photos=[];
  let uploader,feedback,saved=false;
  const button=(label,onclick)=>{
    const node=document.createElement('button');
    node.className='wbs-input';node.type='button';node.textContent=label;node.onclick=onclick;
    return node;
  };
  const renderForm=(root,planned,title)=>{
    draft.type=planned?'planned_pause':'execution_obstacle';
    sheet.querySelector('.sheet-caption').textContent=title;
    sheet.querySelector('.wbs-sheet-save').hidden=false;
    root.replaceChildren();
    const reason=button('انتخاب دلیل',()=>openSearchPicker({
      title:'دلیل توقف',contextKey:'execution-stop-reason',
      items:Object.entries(INACTIVE_REASONS).map(([id,name])=>({id,name})),
      onSelect:selected=>{draft.reasonId=selected.id;draft.reason=selected.name;reason.textContent=selected.name;},
    }));
    root.append(fieldRow('دلیل توقف',reason));
    let refreshResume=()=>{};
    const date=(label,key)=>{
      const node=button(draft[key]?formatJalaliWithWeekday(draft[key]):'انتخاب تاریخ',()=>
        window.KarhaUI?.openJalaliPicker?.(draft[key]||current,value=>{
          draft[key]=value;
          if(key==='resumeOn')manualResume=value;
          node.textContent=formatJalaliWithWeekday(value);
          refreshResume();
        }));
      return fieldRow(label,node);
    };
    let manualResume=draft.resumeOn||'';
    const dates=document.createElement('div');
    dates.className='today-report-stop-dates';
    const resumeRow=date(planned?'تاریخ شروع مجدد کار':'تاریخ ادامه','resumeOn');
    dates.append(date('تاریخ شروع توقف','day'),resumeRow);
    root.append(dates);
    if(planned){
      const resumeButton=resumeRow.querySelector('button');
      const modes=document.createElement('div');modes.className='today-resume-modes';
      const manual=button('دستی',()=>{draft.resumeMode='manual';refreshResume();});
      const automatic=button('خودکار',()=>{draft.resumeMode='auto';refreshResume();});
      modes.append(manual,automatic);root.append(modes);
      draft.resumeMode='manual';
      const lookup=interruptionScheduleLookup(project.tasks);
      const range=scheduleRangeOf({...item.entity,kind:item.kind==='task'||item.kind==='standalone'?'workTask':item.kind});
      const duration=button('',()=>openNumpadGeneric(draft.resumeDurationDays??'',value=>{
        durationOverride=Number(value);
        refreshResume();
      },{suffix:' روز',group:false,maxLen:5,validate:value=>/^\d+$/.test(value)&&Number(value)>0?'':'مدت باقی‌مانده را وارد کنید'}));
      let durationOverride=null;
      root.append(fieldRow('مدت باقی‌ماندهٔ اجرا',duration));
      const dependency=predecessorField({project,consumerId:item.id,single:true,
        excludeIds:[String(item.workId||'')],allowCandidate:row=>row.kind!=='stage',
        onChange:()=>refreshResume()});
      const forecast=document.createElement('div');
      forecast.className='wbs-calculated-dates today-stop-forecast';
      forecast.setAttribute('aria-live','polite');
      const datesPreview=['شروع مجدد','پایان پیش‌بینی‌شده'].map(label=>{
        const value=document.createElement('strong');
        forecast.append(fieldRow(label,value));
        return value;
      });
      const scheduleFeedback=document.createElement('p');
      scheduleFeedback.setAttribute('role','status');
      root.append(dependency.element,forecast,scheduleFeedback);
      refreshResume=()=>{
        const relation=dependency.relations()[0];
        draft.resumePredecessorId=relation?.predecessorId||'';
        draft.resumeLagDays=relation?.lagDays||0;
        draft.resumeRelationType=relation?.type||'FS';
        const auto=draft.resumeMode==='auto';
        manual.setAttribute('aria-pressed',String(!auto));
        automatic.setAttribute('aria-pressed',String(auto));
        dependency.element.classList.toggle('today-resume-manual',!auto);
        const stop=jalaliDayNumber(draft.day);
        const pause={...draft,resumeOn:manualResume};
        const baseline=stop===null?null:previewPlannedPause(item.entity,range,{
          ...pause,resumeMode:'manual',resumeOn:scheduleDate(stop+1),
        },lookup).window;
        draft.resumeDurationDays=durationOverride??baseline?.remaining??null;
        duration.textContent=draft.resumeDurationDays
          ?new Intl.NumberFormat('fa-IR').format(draft.resumeDurationDays)+' روز':'انتخاب کنید';
        const preview=previewPlannedPause(item.entity,range,{...pause,resumeDurationDays:draft.resumeDurationDays},lookup);
        draft.resumeOn=auto?(relation && preview.window?scheduleDate(preview.window.resume):''):manualResume;
        resumeButton.disabled=auto;
        resumeRow.hidden=auto;
        dates.classList.toggle('today-stop-dates-auto',auto);
        resumeButton.textContent=draft.resumeOn?formatJalaliWithWeekday(draft.resumeOn):'انتخاب تاریخ';
        const valid=!!preview.window && !preview.conflicts && (!auto || !!lookup(draft.resumePredecessorId));
        datesPreview[0].textContent=valid?formatJalaliWithWeekday(scheduleDate(preview.window.resume)):'—';
        datesPreview[1].textContent=valid?formatJalaliWithWeekday(scheduleDate(preview.end)):'—';
        scheduleFeedback.hidden=valid || (!auto && !manualResume && !!baseline);
        scheduleFeedback.textContent=auto && !relation?'برای محاسبهٔ شروع مجدد، پیش‌نیاز را انتخاب کنید.'
          :preview.conflicts?'این بازه با توقف دیگری تداخل دارد.'
          :!baseline?'تاریخ توقف باید در یکی از بازه‌های اجرای کار باشد.'
          :auto?'تاریخ پیش‌نیاز را بررسی کنید.':'تاریخ شروع مجدد باید بعد از شروع توقف باشد.';
      };
      refreshResume();
    }
    const description=document.createElement('textarea');
    description.className='wbs-input';description.rows=3;
    description.addEventListener('input',()=>{draft.description=description.value;});
    root.append(fieldRow('توضیحات',description));
    if(!planned){
      const selected=document.createElement('div');
      const paint=()=>{
        selected.replaceChildren();
        for(const contactId of draft.contactIds){
          const row=document.createElement('div');
          row.className='wbs-contract-approver';
          const text=document.createElement('span');
          text.textContent=name(contacts.find(contact=>id(contact)===contactId));
          const remove=button('×',()=>{draft.contactIds=draft.contactIds.filter(value=>value!==contactId);paint();});
          remove.setAttribute('aria-label','برداشتن '+text.textContent);
          row.append(text,remove);selected.append(row);
        }
        const label=draft.contactIds.length?'افزودن شخص':'انتخاب طرف منتسب';
        const picker=button(label,()=>openSearchPicker({
          title:'انتخاب طرف منتسب',resourceType:'contact',contextKey:'execution-stop-contact',
          items:contacts.filter(contact=>!draft.contactIds.includes(id(contact))).map(contact=>({id:id(contact),name:name(contact)})),
          onSelect:contact=>{draft.contactIds.push(String(contact.id));paint();},
        }));
        picker.setAttribute('aria-label',label);
        selected.append(picker);
      };
      paint();
      root.append(fieldRow('طرف‌های منتسب',selected));
    }
    const attachments=document.createElement('div');
    root.append(fieldRow('مستندات',attachments));
    uploader=mountFileUploader(attachments,{projectId:project.id,recordId:item.id,category:'reports',
      files:photos,label:'افزودن عکس',buttonLabel:true,allowReplace:true});
    const note=document.createElement('small');
    note.textContent='این ثبت، گزارش روزهای توقف است.';
    feedback=document.createElement('p');
    feedback.setAttribute('role','alert');
    root.append(note,feedback);
  };
  let formRoot;
  const sheet=openWbsSheet({
    title:'ثبت توقف',historyKey:'execution-interruption:'+item.id,autoFocus:false,
    keepParent:!!onReturn,
    onClose:()=>{uploader?.destroy();if(saved)onReturn?.();},
    body(root){
      formRoot=root;
      if(plannedOnly)return;
      for(const [planned,title,description] of [
        [true,'توقف مجاز','وقفه‌ای که از قبل هماهنگ شده است.'],
        [false,'توقف غیرمجاز','توقف ناشی از مانع یا تخلف خارج از برنامه.'],
      ]){
        const choice=button(title,()=>renderForm(root,planned,'ثبت '+title));
        const note=document.createElement('small');
        note.textContent=description;
        choice.classList.add('today-report-stop-choice',planned?'is-allowed':'is-unallowed');
        choice.append(note);root.append(choice);
      }
    },
    onSave(){
      if(!draft.type)return false;
      if(uploader?.isBusy()){feedback.textContent='ابتدا بارگذاری عکس‌ها را تمام کنید';return false;}
      const result=todayApi.saveInterruption(project.id,ref,{...draft,photos,isDailyReport:true},actor);
      if(!result.ok){
        feedback.textContent=({
          forbidden:'ثبت برای مسئول پیگیریِ دارای دسترسی اجرا مجاز است.',
          locked:'کار تکمیل شده یا در انتظار تأیید است.',
          reason_required:'دلیل توقف را انتخاب کنید.',
          description_required:'توضیحات را وارد کنید.',
          invalid_start:'تاریخ شروع توقف را بررسی کنید.',
          invalid_remaining_duration:'مدت باقی‌مانده را بررسی کنید.',
          invalid_resume:'تاریخ ادامه را بررسی کنید.',
          invalid_resume_predecessor:draft.resumeMode==='auto' && !draft.resumePredecessorId
            ?'برای محاسبهٔ شروع مجدد، پیش‌نیاز را انتخاب کنید.'
            :'پیش‌نیاز شروع مجدد معتبر نیست یا وابستگی حلقوی دارد.',
          contact_required:'طرف‌های منتسب را دوباره انتخاب کنید.',
          interruption_exists:'برای این بازه توقف ثبت شده است.',
        })[result.code]||'ذخیره انجام نشد. وضعیت کار را بررسی کنید.';
        return false;
      }
      refresh?.();
      saved=true;
      return true;
    },
  });
  if(plannedOnly)renderForm(formRoot,true,'ثبت توقف مجاز');
  else sheet.querySelector('.wbs-sheet-save').hidden=true;
}

const eligibilityOf=entry=>entry.type==='planned_pause'?'eligible':entry.isDailyReport?'ineligible':entry.eligibility||'pending';
const attributedContacts=entry=>entry.attributedContacts || (entry.contactId?[{id:entry.contactId,name:entry.contactName}]:[]);

export function obstacleRole(role){return roles[role]||'در دست بررسی';}

export function openExecutionDelayReport(project,items,{actor,canReview,refresh}={}){
  const rows=items.flatMap(item=>(item.entity.executionHistory||[])
    .filter(entry=>['execution_obstacle','planned_pause'].includes(entry.type))
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
      pick('شخص یا شرکت','contactId',[...new Map(rows.flatMap(({entry})=>attributedContacts(entry).map(contact=>[contact.id,contact]))).values()]);
      pick('علت','cause',[...new Set(rows.map(({entry})=>entry.reason))].map(name=>({id:name,name})));
      pick('وضعیت توقف','eligibility',Object.entries(INTERRUPTION_ELIGIBILITY).map(([id,name])=>({id,name})));
      pick('وضعیت بررسی','review',[{id:'pending',name:'در دست بررسی'},{id:'confirmed',name:'بررسی‌شده'}]);
      for(const [key,label] of [['from','از تاریخ'],['to','تا تاریخ']]){
        const button=document.createElement('button');
        button.type='button';button.className='wbs-input';button.textContent='انتخاب تاریخ';
        button.onclick=()=>window.KarhaUI?.openJalaliPicker?.(filters[key]||tehranTodayJalali(),value=>{
          filters[key]=value;button.textContent=formatJalaliWithWeekday(value);paint();
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
          summary.textContent=[formatJalaliWithWeekday(entry.day),entry.reason,obstacleRole(entry.role),attributedContacts(entry).map(contact=>contact.name).join('، '),
            entry.resumedOn?'رفع مانع '+formatJalaliWithWeekday(entry.resumedOn):'',
            entry.multiday?'چندروزه':entry.durationHours==null?'تمام‌روز':entry.durationHours+' ساعت',
            INTERRUPTION_ELIGIBILITY[eligibilityOf(entry)],
            entry.reviewed?'اثر بر موعد: '+entry.impactDays+' روز':''].filter(Boolean).join(' · ');
          item.append(title,summary);
          appendReportPhotos(item,entry.photos);
          if(entry.type==='execution_obstacle' && canReview && actor?.contactId && String(source.entity.assigneeContactId)===actor.contactId){
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
            item.append(review);
            if(!entry.isDailyReport)item.append(eligibility);
            item.append(error);
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
          obstacleRole(entry.role),attributedContacts(entry).map(contact=>contact.name).join('، '),entry.multiday?'چندروزه':entry.durationHours==null?'تمام‌روز':'ساعتی',
          entry.durationHours,entry.impactDays,INTERRUPTION_ELIGIBILITY[eligibilityOf(entry)],entry.reviewed?'بررسی‌شده':'در دست بررسی'])];
      const url=URL.createObjectURL(new Blob(['\uFEFF',data.map(row=>row.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='execution-delays.csv';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      return false;
    },
  });
  function filtered(){
    return rows.filter(({entry})=>(!filters.role||entry.role===filters.role)
      && (!filters.contactId||attributedContacts(entry).some(contact=>contact.id===filters.contactId))
      && (!filters.cause||entry.reason===filters.cause)
      && (!filters.eligibility||eligibilityOf(entry)===filters.eligibility)
      && (!filters.review||(entry.reviewed?'confirmed':'pending')===filters.review)
      && (!filters.from||(entry.resumedOn||(entry.multiday?tehranTodayJalali():entry.day))>=filters.from)
      && (!filters.to||entry.day<=filters.to)).sort((a,b)=>b.entry.day.localeCompare(a.entry.day));
  }
}
