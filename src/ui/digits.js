/** Phase 8.2 — digit formatting primitives (no DOM ownership). */
export function toPersianDigits(str){
  return String(str).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}
export function toEnglishDigits(str){
  return String(str).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}
export function groupWithCommas(digits){
  const s = String(digits || '');
  if(!s) return '';
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function formatCost(n){
  if(n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return toPersianDigits('0');
  return toPersianDigits(groupWithCommas(String(Math.round(Number(n)))));
}
export function formatCostDisplay(n){
  if(n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '';
  return toPersianDigits(groupWithCommas(String(Math.round(Math.abs(Number(n)))))) + ' تومان';
}
