import { actualProgress, effectiveDependencyLinks, PROJECT_FINISH_MILESTONE_ID, scheduleDate } from '../../domain/wbs/scheduling.js';
import { buildBuckets } from '../../domain/wbs/costline.js';
import { toPersianDigits } from '../../ui/digits.js';
import { formatJalaliDisplay } from '../../ui/jalali.js';
import { formatTimelineDate } from './timelineDetailsFormatting.js';
import { allocateDependencyLane, dependencyGeometry, dependencyPath } from './timelineDependencies.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = new Intl.NumberFormat('fa-IR', { maximumFractionDigits:1 });
const date = day => formatJalaliDisplay(scheduleDate(day));
const rowHeight = 32;
const chartWidth = 760;
const pageLayouts = {
  landscape:{ A4:{rows:17,buckets:16}, A3:{rows:27,buckets:24} },
  portrait:{ A4:{rows:27,buckets:11}, A3:{rows:41,buckets:16} },
};
const pageLayout=({paper,orientation})=>
  pageLayouts[orientation==='portrait'?'portrait':'landscape'][paper==='A4'?'A4':'A3'];

export const ganttPrintStyles = `.gantt-print{width:100%}
.gantt-print{font-family:IRANSansX,Tahoma,sans-serif;direction:rtl;text-align:right;box-sizing:border-box;break-inside:avoid;font-size:11px}
.gantt-print+.gantt-print{break-before:page}
.gantt-print h1{margin:0 0 4px;font-size:18px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.gantt-print p{margin:0 0 6px}
.gantt-print-grid{display:flex;direction:rtl;border:1px solid #9aa7b1}
.gantt-print-labels{width:28%;box-sizing:border-box;border-inline-end:1px solid #9aa7b1;min-width:0}
.gantt-print-chart{width:72%;min-width:0}
.gantt-print-chart-body{position:relative;overflow:hidden}
.gantt-print-detail{position:absolute;direction:rtl;white-space:nowrap;font-size:9px;line-height:11px;text-align:right;color:#253655;background:#fff;padding:0 2px}
.gantt-print-progress{font-weight:700}
.gantt-print-labels>div{height:${rowHeight}px;line-height:31px;border-bottom:1px solid #d8dfe5;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-inline:6px}
.gantt-print-labels>div:first-child,.gantt-print-axis{height:27px;line-height:26px;background:#eef3f8;font-weight:600}
.gantt-print-axis{position:relative;direction:rtl;box-sizing:border-box;border-bottom:1px solid #9aa7b1}
.gantt-print-axis span{position:absolute;height:100%;text-align:right;padding-inline:2px;line-height:26px;border-right:1px solid #d8dfe5;box-sizing:border-box;white-space:nowrap;overflow:hidden;font-size:10px}
.gantt-print-grid svg{width:100%;display:block;overflow:hidden}
.gantt-print .signature{margin-top:12px;text-align:left}
.gantt-print .signature img{max-width:130px;max-height:55px;display:block;margin-right:auto}
@media print{.gantt-print{width:auto}}
`;

export function ganttExportAxis(start,end,scale){
  if(!Number.isFinite(start) || !Number.isFinite(end) || end<start)return [];
  const buckets=buildBuckets({rangeId:scale,works:[{start:scheduleDate(start),end:scheduleDate(end)}]});
  return buckets.map(bucket=>({...bucket,startDay:Math.max(start,bucket.startDay),endDay:Math.min(end,bucket.endDay)}));
}

function segments(entry){
  return entry.segments?.length ? entry.segments : entry.range ? [entry.range] : [];
}

export function ganttExportRows(entries,start,end){
  return entries.filter(entry=>!entry.range || segments(entry).some(segment=>segment.start<=end && segment.end>=start));
}

export function validateGanttExport(entries,settings){
  const {start,end,scale}=settings;
  if(!Number.isFinite(start) || !Number.isFinite(end) || start>end)return 'بازهٔ تاریخ نمودار را مشخص کنید';
  const limit=pageLayout(settings).buckets;
  const minDays={week:7,week2:14,month:31}[scale] || 7;
  if(end-start+1>limit*minDays || ganttExportAxis(start,end,scale).length>limit)
    return 'برای خوانایی نمودار، بازهٔ تاریخ را کوتاه‌تر یا مقیاس زمانی را درشت‌تر کنید';
  if(!ganttExportRows(entries,start,end).some(entry=>entry.range))return 'در بازهٔ انتخاب‌شده کاری با تاریخ وجود ندارد';
  return '';
}

function dependencyLinks(project,analysis){
  const milestoneLinks=[...(analysis.stageMilestones||[]).filter(point=>point.ready),
    ...(analysis.milestone?[{...analysis.milestone,id:PROJECT_FINISH_MILESTONE_ID}]:[])];
  return [...effectiveDependencyLinks(project.tasks),...milestoneLinks.flatMap(point=>
    (point.predecessorIds||[]).map(sourceId=>({sourceId,targetId:point.id,type:'FS'})))];
}

function dependencyLines(rows,links,distance,start,end,page){
  const byId=new Map(rows.flatMap((entry,index)=>{
    if(!entry.range || entry.range.start<start || entry.range.start>end)return [];
    return [[String(entry.item.id),{start:distance(entry.range.start),centerY:(index+.5)*rowHeight}]];
  }));
  const occupied=[];
  return links.map(link=>{
    const source=byId.get(String(link.sourceId)), target=byId.get(String(link.targetId));
    if(!source || !target)return '';
    const route=dependencyGeometry(source,target,link.type,[],chartWidth);
    route.laneX=allocateDependencyLane(route,source.centerY,target.centerY,occupied,chartWidth);
    return `<path class="gantt-print-dependency" d="${dependencyPath(route,source.centerY,target.centerY)}" fill="none" stroke="#566576" stroke-width="1.1" marker-end="url(#gantt-arrow-${page})"><title>${escape(link.type)}</title></path>`;
  }).join('');
}

export function ganttExportDocument({project,entries,analysis},settings){
  const {start,end,scale,title,showTitle,showDates,showProgress,showDependencies,showFloat}=settings;
  const rowsPerPage=pageLayout(settings).rows;
  const rows=ganttExportRows(entries,start,end);
  const axis=ganttExportAxis(start,end,scale);
  const distance=day=>chartWidth*(Math.max(start,Math.min(end+1,day))-start)/(end-start+1);
  const x=day=>chartWidth-distance(day);
  const percent=value=>value/chartWidth*100;
  const links=showDependencies?dependencyLinks(project,analysis):[];
  const pages=Math.ceil(rows.length/rowsPerPage);
  const axisHtml=axis.map(bucket=>`<span style="right:${percent(distance(bucket.startDay))}%;width:${percent(distance(bucket.endDay+1)-distance(bucket.startDay))}%">${escape(toPersianDigits(scheduleDate(bucket.startDay)))}</span>`).join('');
  return Array.from({length:pages},(_,page)=>{
    const visible=rows.slice(page*rowsPerPage,(page+1)*rowsPerPage);
    const height=visible.length*rowHeight;
    const labels=visible.map(entry=>{
      const title=escape(entry.item.text);
      return `<div style="padding-inline-start:${6+Math.min(entry.depth,4)*7}px" title="${title}">${title}</div>`;
    }).join('');
    const grid=axis.map(bucket=>`<path d="M ${x(bucket.startDay)} 0 V ${height}"/>`).join('')+
      visible.map((_,index)=>`<path d="M 0 ${(index+1)*rowHeight} H ${chartWidth}"/>`).join('');
    const bars=visible.map((entry,index)=>{
      const y=(index+.5)*rowHeight;
      return segments(entry).map(segment=>{
        if(segment.start>end || segment.end<start)return '';
        const left=x(segment.end+1), right=x(segment.start);
        if(entry.kind==='milestone'){
          const center=(left+right)/2;
          return `<path d="M ${center} ${y-5} l 5 5 -5 5 -5 -5 z" fill="#253655"/>`;
        }
        const fill=entry.kind==='stage'?'#405b79':'#1679a3';
        const progress=Math.max(0,Math.min(100,actualProgress(entry.item)||0));
        const completed=(right-left)*progress/100;
        return `<rect x="${left}" y="${y-4}" width="${right-left}" height="8" rx="2" fill="${fill}"/>`+
          (showProgress&&completed?`<rect x="${right-completed}" y="${y-4}" width="${completed}" height="8" rx="2" fill="#247450"/>`:'');
      }).join('');
    }).join('');
    const details=visible.map((entry,index)=>{
      const range=entry.range;
      if(!range)return `<span class="gantt-print-detail" style="right:4px;top:${index*rowHeight+10}px">بدون تاریخ</span>`;
      const top=index*rowHeight;
      const finish=segments(entry).at(-1).end;
      const anchor=(day)=>Math.max(0,Math.min(91,percent(distance(day))));
      const label=(value,day,y,classes='')=>`<span class="gantt-print-detail ${classes}" style="right:${anchor(day)}%;top:${top+y}px">${escape(value)}</span>`;
      const progress=actualProgress(entry.item)||0;
      const milestone=entry.kind==='milestone';
      const float=analysis.rows.get(String(entry.item.id))?.totalFloat;
      const startLabel=formatTimelineDate(scheduleDate(range.start));
      const finishLabel=formatTimelineDate(scheduleDate(finish));
      let dates='';
      if(showDates){
        const wide=anchor(finish+1)-anchor(range.start)>=12;
        dates=milestone||startLabel===finishLabel?label(finishLabel,range.start,21)
          :wide?label(startLabel,range.start,21)+label(finishLabel,finish+1,21)
          :label(`${startLabel} تا ${finishLabel}`,range.start,21);
      }
      const metrics=[showProgress&&!milestone?`${number.format(progress)}٪`:'',
        showFloat&&Number.isFinite(float)?`شناوری ${number.format(float)} روز`:''].filter(Boolean).join(' · ');
      return dates+(metrics?label(metrics,range.start,0,'gantt-print-progress'):'');
    }).join('');
    return `<section class="gantt-print" dir="rtl">
      ${showTitle?`<h1>${escape(title)}</h1>`:''}
      <p>${showDates?`${date(start)} تا ${date(end)} · `:''}صفحه ${number.format(page+1)} از ${number.format(pages)}</p>
      <div class="gantt-print-grid">
        <div class="gantt-print-labels"><div>مرحله و کار</div>${labels}</div>
        <div class="gantt-print-chart"><div class="gantt-print-axis">${axisHtml}</div><div class="gantt-print-chart-body">
          <svg width="${chartWidth}" height="${height}" style="height:${height}px" viewBox="0 0 ${chartWidth} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <defs><marker id="gantt-arrow-${page}" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 6 3 L 0 6 Z" fill="#566576"/></marker></defs>
            <g stroke="#d8dfe5" stroke-width=".7" fill="none">${grid}</g>${bars}<g transform="translate(${chartWidth} 0) scale(-1 1)">${dependencyLines(visible,links,distance,start,end,page)}</g>
          </svg>
          ${details}
        </div></div>
      </div>
    </section>`;
  }).join('');
}
