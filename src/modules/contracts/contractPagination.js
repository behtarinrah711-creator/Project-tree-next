/** Measure at print width; keep ordinary blocks together and split oversized text. */
export function paginateContract(source, documentRef=globalThis.document){
  const meta=source.querySelectorAll('.doc-contract-meta')[0];
  const documentKind=meta?.getAttribute?.('data-document-kind')==='addendum'?'الحاقیه':'قرارداد';
  const contractNumber=meta?.getAttribute?.('data-contract-number') || source.querySelectorAll('.contract-document-attachment')[0]?.getAttribute?.('data-contract-number') || '';
  const pages=documentRef.createElement('div');pages.className='contract-pages';
  const measure=documentRef.createElement('div');
  measure.className='contract-pagination-measure';
  measure.appendChild(pages);documentRef.body.appendChild(measure);
  let content;
  const next=()=>{
    const sheet=documentRef.createElement('section');sheet.className='contract-sheet';
    content=documentRef.createElement('div');content.className='contract-sheet-content';
    sheet.appendChild(content);pages.appendChild(sheet);
  };
  const fits=()=>content.scrollHeight<=content.clientHeight;
  const append=block=>{
    if(block.classList?.contains('contract-document-attachment')){
      if(content.childNodes.length)next();
      content.appendChild(block);return;
    }
    content.appendChild(block);
    if(fits())return;
    block.remove();
    if(content.childNodes.length){next();content.appendChild(block);if(fits())return;block.remove();}
    const table=block.querySelectorAll('.contract-document-quantities')[0];
    const tableBody=table?.tBodies?.[0];
    if(tableBody?.rows.length>1){
      const rows=[...tableBody.rows];
      const startTable=()=>{
        const section=block.cloneNode(true);
        const body=section.querySelectorAll('.contract-document-quantities')[0].tBodies[0];
        body.replaceChildren();
        content.appendChild(section);
        return {section,body};
      };
      let part=startTable();
      for(const [index,row] of rows.entries()){
        part.body.appendChild(row);
        if(fits())continue;
        row.remove();
        if(part.body.rows.length){
          next();
          part=startTable();
          part.body.appendChild(row);
          if(fits())continue;
          row.remove();
        }
        // Preserve the text of a single row that exceeds an entire page.
        part.section.remove();
        const text=documentRef.createElement('div');
        text.textContent=[...row.cells].map(cell=>cell.textContent).join(' · ');
        append(text);
        if(index<rows.length-1){next();part=startTable();}
      }
      return;
    }
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
    if(node.classList?.contains('doc-signatures'))return;
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
    sheets.forEach((sheet,i)=>{
      const signatures=documentRef.createElement('div');signatures.className='contract-sheet-signatures';
      for(const party of ['کارفرما','پیمانکار','شاهد']){
        const box=documentRef.createElement('div');box.className='contract-sheet-signature';
        box.textContent='نام، نام خانوادگی، امضا و اثر انگشت '+party+':';
        signatures.appendChild(box);
      }
      sheet.appendChild(signatures);
      const label=documentRef.createElement('div');label.className='contract-sheet-number';
      label.textContent=(contractNumber?'شماره '+documentKind+': '+contractNumber+' — ':'')+`صفحه ${new Intl.NumberFormat('fa-IR').format(i+1)} از ${new Intl.NumberFormat('fa-IR').format(sheets.length)}`;
      sheet.appendChild(label);
    });
    pages.remove();return pages;
  }finally{measure.remove();}
}

export function paginateContractMarkup(html,documentRef=globalThis.document){
  const source=documentRef.createElement('div');source.innerHTML=html;
  const wrapper=source.querySelector('.contract-export-document');
  if(wrapper){while(wrapper.firstChild)source.insertBefore(wrapper.firstChild,wrapper);wrapper.remove();}
  return paginateContract(source,documentRef).outerHTML;
}
