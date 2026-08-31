/** Phase 8.2 — Jalali calendar helpers + picker. */
import { toPersianDigits } from './digits.js';

export function gregorianToJalali(gy, gm, gd){
  const g_d_m=[0,31,59,90,120,151,181,212,243,273,304,334];
  let jy=(gy<=1600)?0:979;
  gy-=(gy<=1600)?621:1600;
  const gy2=(gm>2)?(gy+1):gy;
  let days=(365*gy) + Math.floor((gy2+3)/4) - Math.floor((gy2+99)/100) + Math.floor((gy2+399)/400) - 80 + gd + g_d_m[gm-1];
  jy+=33*Math.floor(days/12053); days%=12053;
  jy+=4*Math.floor(days/1461); days%=1461;
  if(days > 365){ jy+=Math.floor((days-1)/365); days=(days-1)%365; }
  const jm=(days<186)?1+Math.floor(days/31):7+Math.floor((days-186)/30);
  const jd=1+((days<186)?(days%31):((days-186)%30));
  return {jy,jm,jd};
}

export function jalaliToGregorian(jy, jm, jd){
  const gy=(jy<=979)?621:1600;
  jy-=(jy<=979)?0:979;
  const days=(365*jy) + Math.floor(jy/33)*8 + Math.floor(((jy%33)+3)/4) + 78 + jd + ((jm<7)?(jm-1)*31:((jm-7)*30+186));
  let gy2 = gy + 400*Math.floor(days/146097);
  let days2 = days % 146097;
  if(days2 > 36524){ gy2+=100*Math.floor(--days2/36524); days2%=36524; if(days2>=365) days2++; }
  gy2+=4*Math.floor(days2/1461); days2%=1461;
  if(days2>365){ gy2+=Math.floor((days2-1)/365); days2=(days2-1)%365; }
  const gd=days2+1;
  const sal_a=[0,31,(gy2%4===0&&gy2%100!==0)||gy2%400===0?29:28,31,30,31,30,31,31,30,31,30,31];
  let gm=0, v=gd;
  for(gm=1; gm<=12 && v>sal_a[gm]; gm++) v-=sal_a[gm];
  return {gy:gy2, gm, gd:v};
}

export function jalaliMonthLength(jy, jm){
  if(jm<=6) return 31;
  if(jm<=11) return 30;
  try{
    const g = jalaliToGregorian(jy, 12, 30);
    const j = gregorianToJalali(g.gy, g.gm, g.gd);
    return (j.jy===jy && j.jm===12 && j.jd===30) ? 30 : 29;
  } catch(e){ return 29; }
}

export const JALALI_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];

export function todayJalaliStr(){
  const n = new Date();
  const j = gregorianToJalali(n.getFullYear(), n.getMonth()+1, n.getDate());
  return j.jy + '/' + String(j.jm).padStart(2,'0') + '/' + String(j.jd).padStart(2,'0');
}

export function formatJalaliDisplay(str){
  if(!str) return '';
  const p = String(str).split(/[\/\-]/);
  if(p.length<3) return str;
  const m = parseInt(p[1],10);
  return toPersianDigits(p[2]) + ' ' + (JALALI_MONTHS[m-1]||'') + ' ' + toPersianDigits(p[0]);
}

const jalaliPick = { y:1400, m:1, d:1, onPick:null, maxDate:null };
let installed = false;

export function openJalaliPicker(current, onPick, opts={}, { documentRef = document, windowRef = window } = {}){
  jalaliPick.onPick = onPick;
  jalaliPick.maxDate = opts.maxToday ? todayJalaliStr() : null;
  let y, m, d;
  if(current && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(current)){
    const p = current.split('/');
    y = +p[0]; m = +p[1]; d = +p[2];
  } else {
    const n = new Date();
    const j = gregorianToJalali(n.getFullYear(), n.getMonth()+1, n.getDate());
    y=j.jy; m=j.jm; d=j.jd;
  }
  jalaliPick.y = y; jalaliPick.m = m; jalaliPick.d = d;
  const pop = documentRef.getElementById('jalaliPop');
  if(pop) pop.classList.remove('hidden');
  renderJalaliPicker({ documentRef });
  windowRef.KarhaChildHistory?.open('jalali-picker');
}

export function closeJalaliPicker(fromPopState=false, { documentRef = document, windowRef = window } = {}){
  const pop = documentRef.getElementById('jalaliPop');
  if(pop) pop.classList.add('hidden');
  windowRef.KarhaChildHistory?.consume('jalali-picker',{fromPopState});
}

function renderJalaliPicker({ documentRef = document, windowRef = window } = {}){
  const box = documentRef.getElementById('jalaliBox');
  if(!box) return;
  const y = jalaliPick.y, m = jalaliPick.m;
  const len = jalaliMonthLength(y, m);
  const g1 = jalaliToGregorian(y, m, 1);
  const dt = new Date(g1.gy, g1.gm-1, g1.gd);
  let start = (dt.getDay() + 1) % 7;
  const today = todayJalaliStr();
  const selected = y+'/'+String(m).padStart(2,'0')+'/'+String(jalaliPick.d).padStart(2,'0');
  const maxDate = jalaliPick.maxDate || null;
  const keyCompare = (a,b)=>String(a).localeCompare(String(b));

  let html = '<div class="jalali-head">';
  html += '<button type="button" id="jalaliNext" title="ماه بعد">‹</button>';
  html += '<span>'+JALALI_MONTHS[m-1]+' '+toPersianDigits(y)+'</span>';
  html += '<button type="button" id="jalaliPrev" title="ماه قبل">›</button></div>';
  html += '<div class="jalali-week"><span>ش</span><span>ی</span><span>د</span><span>س</span><span>چ</span><span>پ</span><span>ج</span></div>';
  html += '<div class="jalali-days">';
  for(let i=0;i<start;i++) html += '<button type="button" class="muted"> </button>';
  for(let day=1; day<=len; day++){
    const key = y+'/'+String(m).padStart(2,'0')+'/'+String(day).padStart(2,'0');
    let cls = '';
    if(key === today) cls += ' today';
    if(key === selected) cls += ' selected';
    const disabledFuture = maxDate && keyCompare(key,maxDate)>0;
    if(disabledFuture) cls += ' muted';
    html += '<button type="button" class="'+cls.trim()+'" data-d="'+day+'"'+(disabledFuture?' disabled':'')+'>'+toPersianDigits(day)+'</button>';
  }
  html += '</div>';
  html += '<div class="jalali-foot"><button type="button" id="jalaliTodayBtn">امروز</button></div>';
  box.innerHTML = html;
  const prev = documentRef.getElementById('jalaliPrev');
  const next = documentRef.getElementById('jalaliNext');
  const todayBtn = documentRef.getElementById('jalaliTodayBtn');
  if(prev) prev.onclick = (e)=>{ e.stopPropagation();
    jalaliPick.m--; if(jalaliPick.m<1){ jalaliPick.m=12; jalaliPick.y--; }
    renderJalaliPicker({ documentRef, windowRef });
  };
  if(next) next.onclick = (e)=>{ e.stopPropagation();
    jalaliPick.m++; if(jalaliPick.m>12){ jalaliPick.m=1; jalaliPick.y++; }
    renderJalaliPicker({ documentRef, windowRef });
  };
  if(todayBtn) todayBtn.onclick = async (e)=>{
    e.stopPropagation();
    const n = new Date();
    const j = gregorianToJalali(n.getFullYear(), n.getMonth()+1, n.getDate());
    const val = j.jy+'/'+String(j.jm).padStart(2,'0')+'/'+String(j.jd).padStart(2,'0');
    jalaliPick.y = j.jy; jalaliPick.m = j.jm; jalaliPick.d = j.jd;
    if(jalaliPick.onPick){
      try{ await jalaliPick.onPick(val); }catch(err){ console.warn(err); }
    }
    renderJalaliPicker({ documentRef, windowRef });
  };
  box.querySelectorAll('.jalali-days button[data-d]').forEach(btn=>{
    btn.onclick = (e)=>{
      e.stopPropagation();
      const day = +btn.getAttribute('data-d');
      const val = jalaliPick.y+'/'+String(jalaliPick.m).padStart(2,'0')+'/'+String(day).padStart(2,'0');
      if(jalaliPick.maxDate && val>jalaliPick.maxDate) return;
      if(jalaliPick.onPick) jalaliPick.onPick(val);
      closeJalaliPicker(false, { documentRef, windowRef });
    };
  });
}

export function installJalaliBindings({ documentRef, windowRef = globalThis } = {}){
  if(!documentRef) return;
  if(installed) return;
  const pop = documentRef.getElementById('jalaliPop');
  if(!pop) return;
  installed = true;
  pop.onclick = (e)=>{ if(e.target && e.target.id==='jalaliPop') closeJalaliPicker(false, { documentRef, windowRef }); };
  windowRef.KarhaChildHistory?.register('jalali-picker',{onPop:()=>closeJalaliPicker(true,{documentRef,windowRef})});
}
