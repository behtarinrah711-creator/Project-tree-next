export const contractPageStyles = `
.contract-pages{width:794px;direction:rtl;color:#202124;font-family:IRANSansX,Tahoma,sans-serif;font-size:13px;line-height:1.7}
.contract-sheet{position:relative;width:794px;height:1123px;box-sizing:border-box;padding:76px;background:#fff;break-after:page;margin-bottom:20px}
.contract-sheet:last-child{break-after:auto;margin-bottom:0}
.contract-sheet:before{content:'';position:absolute;inset:38px;border:1px solid #777;pointer-events:none}
.contract-sheet-content{height:971px;display:flow-root;overflow-wrap:anywhere}
.contract-sheet-number{position:absolute;bottom:43px;left:76px;right:76px;text-align:center;font-size:11px}
.contract-pages .doc-title{text-align:center;font-size:21px;font-weight:600;margin:0 0 18px}
.contract-pages .doc-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;margin-bottom:16px}
.contract-pages .doc-parties{margin-bottom:16px}.contract-pages .party{margin-bottom:5px}
.contract-pages .doc-clause{margin:8px 0;padding-bottom:8px;border-bottom:1px solid #ddd;white-space:pre-wrap}
.contract-pages .doc-child{padding-right:22px;margin-top:3px;white-space:pre-wrap}
.contract-pages .doc-signatures{display:flex;justify-content:space-between;gap:20px;margin-top:30px;text-align:center}
.contract-pages .signature-box{border-top:1px dotted #777;padding-top:12px}
@media print{@page{size:A4;margin:0}html,body{margin:0!important;padding:0!important}.contract-sheet{margin:0;break-inside:avoid}}
`;

/** Measure at print width; keep ordinary blocks together and split oversized text. */
export function paginateContract(source, documentRef=globalThis.document){
  const pages=documentRef.createElement('div');pages.className='contract-pages';
  const style=documentRef.createElement('style');style.textContent=contractPageStyles;pages.appendChild(style);
  const measure=documentRef.createElement('div');
  measure.style.cssText='position:absolute;left:-10000px;top:0;width:794px;visibility:hidden';
  measure.appendChild(pages);documentRef.body.appendChild(measure);
  let content;
  const next=()=>{
    const sheet=documentRef.createElement('section');sheet.className='contract-sheet';
    content=documentRef.createElement('div');content.className='contract-sheet-content';
    sheet.appendChild(content);pages.appendChild(sheet);
  };
  const fits=()=>content.scrollHeight<=content.clientHeight;
  const append=block=>{
    content.appendChild(block);
    if(fits())return;
    block.remove();
    if(content.childNodes.length){next();content.appendChild(block);if(fits())return;block.remove();}
    // A single clause may exceed a page. Split by text without losing characters.
    let remaining=block.textContent;
    while(remaining){
      const part=block.cloneNode(false);content.appendChild(part);
      let low=0,high=remaining.length;
      while(low<high){const mid=Math.ceil((low+high)/2);part.textContent=remaining.slice(0,mid);if(fits())low=mid;else high=mid-1;}
      let cut=Math.max(1,low);
      if(cut<remaining.length){const space=remaining.lastIndexOf(' ',cut);if(space>cut/2)cut=space+1;}
      part.textContent=remaining.slice(0,cut);remaining=remaining.slice(cut);
      if(remaining)next();
    }
  };
  const blocks=[];
  const flatten=node=>{
    if(node.classList?.contains('doc-clauses')){[...node.children].forEach(flatten);return;}
    if(node.classList?.contains('doc-clause')){
      const title=node.cloneNode(true);title.querySelectorAll('.doc-child').forEach(x=>x.remove());
      blocks.push(title);node.querySelectorAll('.doc-child').forEach(x=>blocks.push(x.cloneNode(true)));return;
    }
    blocks.push(node.cloneNode(true));
  };
  [...source.children].forEach(flatten);
  try{
    next();blocks.forEach(append);
    const sheets=pages.querySelectorAll('.contract-sheet');
    sheets.forEach((sheet,i)=>{const label=documentRef.createElement('div');label.className='contract-sheet-number';label.textContent=`صفحه ${new Intl.NumberFormat('fa-IR').format(i+1)} از ${new Intl.NumberFormat('fa-IR').format(sheets.length)}`;sheet.appendChild(label);});
    pages.remove();return pages;
  }finally{measure.remove();}
}

export function paginateContractMarkup(html,documentRef=globalThis.document){
  const source=documentRef.createElement('div');source.innerHTML=html;
  const wrapper=source.querySelector('.contract-export-document');
  if(wrapper){while(wrapper.firstChild)source.insertBefore(wrapper.firstChild,wrapper);wrapper.remove();}
  return paginateContract(source,documentRef).outerHTML;
}
