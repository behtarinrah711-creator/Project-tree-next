import {formatJalaliDisplay,JALALI_MONTHS,jalaliMonthLength,jalaliToGregorian} from '../../ui/jalali.js';
import {toPersianDigits} from '../../ui/digits.js';
import {collectTodayItems,dailyExecutionStatus,executionItemsOnDay,tehranTodayJalali} from '../../domain/wbs/todayDomain.js';
import {todayReportOf} from './dailyExecutionReport.js';
import {openWbsSheet} from './wbsSheet.js';

export function openExecutionCalendar(project,renderCard,{day=tehranTodayJalali(),month=day.slice(0,7)}={}){
  const today=tehranTodayJalali();
  const items=collectTodayItems(project,today,{includeApproved:true});
  const button=(label,action)=>{
    const node=document.createElement('button');
    node.type='button';node.textContent=label;node.onclick=action;
    return node;
  };
  return openWbsSheet({title:'تقویم اجرا',showSave:false,autoFocus:false,
    historyKey:'execution-calendar:'+project.id,reuseHistoryOnReplace:true,
    body(root){
      root.classList.add('wbs-today-frame','execution-calendar');
      const paint=()=>{
        const [year,m]=month.split('/').map(Number);
        const shift=delta=>{
          const index=year*12+m-1+delta;
          month=Math.floor(index/12)+'/'+String(index%12+1).padStart(2,'0');
          paint();
        };
        const head=document.createElement('div');head.className='jalali-head';
        const caption=document.createElement('span');caption.textContent=JALALI_MONTHS[m-1]+' '+toPersianDigits(year);
        head.append(button('‹',()=>shift(-1)),caption,button('›',()=>shift(1)));
        head.firstChild.setAttribute('aria-label','ماه قبل');
        head.lastChild.setAttribute('aria-label','ماه بعد');
        const week=document.createElement('div');week.className='jalali-week';
        for(const name of ['ش','ی','د','س','چ','پ','ج']){
          const label=document.createElement('span');label.textContent=name;week.append(label);
        }
        const grid=document.createElement('div');grid.className='jalali-days';
        const first=jalaliToGregorian(year,m,1);
        const offset=(new Date(Date.UTC(first.gy,first.gm-1,first.gd)).getUTCDay()+1)%7;
        for(let i=0;i<offset;i++)grid.append(document.createElement('span'));
        for(let i=1;i<=jalaliMonthLength(year,m);i++){
          const date=month+'/'+String(i).padStart(2,'0');
          const scheduled=executionItemsOnDay(items,date);
          const reported=scheduled.filter(({entity})=>todayReportOf(entity,date)).length;
          const cell=button(toPersianDigits(i),()=>{day=date;paint();});
          cell.classList.toggle('selected',date===day);
          cell.classList.toggle('today',date===today);
          cell.setAttribute('aria-pressed',String(date===day));
          if(scheduled.length){
            const count=document.createElement('small');
            count.textContent=toPersianDigits(date>today?scheduled.length:reported+'/'+scheduled.length);
            cell.append(count);
          }
          if(scheduled.length && scheduled.every(({entity})=>dailyExecutionStatus(entity,date).reasonId==='holiday')){
            cell.title='تعطیلی کارگاه';
            cell.classList.add('is-holiday');
          }
          grid.append(cell);
        }
        const heading=document.createElement('h3');heading.textContent='کارهای '+formatJalaliDisplay(day);
        const list=document.createElement('div');
        const daily=executionItemsOnDay(items,day);
        if(!daily.length)list.textContent='کاری برای این روز وجود ندارد.';
        daily.forEach(item=>list.append(renderCard(project,item,day,{day,month})));
        root.replaceChildren(head,week,grid,heading,list);
      };
      paint();
    },
  });
}
