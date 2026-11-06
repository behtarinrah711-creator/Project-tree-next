export function searchText(value){
  return String(value || '').normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک')
    .replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[\u200c\u200d\s]+/g,'')
    .toLocaleLowerCase('fa');
}
