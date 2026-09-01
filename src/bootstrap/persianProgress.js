const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toPersianDigits(value){
  return String(value).replace(/\d/g, digit => FA_DIGITS[Number(digit)]);
}

function formatProgressMeta(node){
  if(!(node instanceof HTMLElement) || !node.classList.contains('wbs-meta')) return;
  const raw = String(node.textContent || '').trim();
  const match = raw.match(/^([0-9۰-۹]+)\s*[%٪]$/);
  if(!match) return;
  const numeric = match[1].replace(/[۰-۹]/g, digit => String(FA_DIGITS.indexOf(digit)));
  node.textContent = `٪${toPersianDigits(numeric)}`;
  node.classList.add('is-progress');
}

function scan(root = document){
  if(root instanceof HTMLElement) formatProgressMeta(root);
  root.querySelectorAll?.('.wbs-meta').forEach(formatProgressMeta);
}

export function bindPersianProgressFormatting(){
  scan(document);
  const observer = new MutationObserver(records => {
    for(const record of records){
      record.addedNodes.forEach(node => {
        if(node.nodeType === Node.ELEMENT_NODE) scan(node);
      });
      if(record.type === 'characterData') formatProgressMeta(record.target.parentElement);
    }
  });
  observer.observe(document.documentElement, { subtree:true, childList:true, characterData:true });
  return () => observer.disconnect();
}
