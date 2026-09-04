function faNumber(value){
  return new Intl.NumberFormat('fa-IR', { useGrouping:false, maximumFractionDigits:0 }).format(value);
}

export function formatTimelineDate(value){
  const [, jm, jd] = String(value || '').split('/').map(Number);
  if(!jm || !jd) return '';
  return `${faNumber(jm)}/${faNumber(jd)}`;
}

export function shouldShowProgressLabel(barWidth, progress){
  const width = Number(barWidth) || 0;
  const value = Math.max(0, Math.min(100, Number(progress) || 0));
  if(value <= 0) return false;
  return width >= (value >= 100 ? 34 : 28);
}
