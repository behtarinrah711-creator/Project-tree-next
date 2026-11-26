/** Measure at print width; keep ordinary blocks together and split oversized text. */
export function paginateContract(source, documentRef=globalThis.document){
  const advance=source.getAttribute?.('data-document-kind')==='advance';
  const statement=source.classList?.contains('contract-document-statement-body');
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
    if(statement){
      sheet.classList.add('contract-sheet--statement');
      content.classList.add('contract-export-document','contract-document-statement','contract-document-statement-body');
      content.dir='rtl';
    }
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
    const findTable=node=>node.classList?.contains('contract-document-quantities')?node:node.querySelectorAll('.contract-document-quantities')[0];
    const table=findTable(block);
    const tableBody=table?.tBodies?.[0];
    if(tableBody?.rows.length>1){
      const rows=[...tableBody.rows];
      const startTable=()=>{
        const section=block.cloneNode(true);
        const body=findTable(section).tBodies[0];
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
  const createSignatures=()=>{
    const signatures=documentRef.createElement('div');signatures.className='contract-sheet-signatures';
    for(const party of ['کارفرما','پیمانکار']){
      const box=documentRef.createElement('div');box.className='contract-sheet-signature';
      box.textContent='نام، نام خانوادگی، امضا و اثر انگشت '+party+':';
      signatures.appendChild(box);
    }
    return signatures;
  };
  try{
    next();
    const summaryIndex=statement?blocks.findIndex(block=>block.classList?.contains('contract-document-statement-summary')):-1;
    if(summaryIndex<0){
      blocks.forEach(append);
      if(statement && !advance)append(createSignatures());
    }else{
      blocks.slice(0,summaryIndex).forEach(append);
      const summary=[...blocks.slice(summaryIndex),createSignatures()];
      const hadContent=content.hasChildNodes();
      content.append(...summary);
      if(!fits()){
        summary.forEach(block=>block.remove());
        if(hadContent)next();
        content.append(...summary);
        if(!fits()){
          summary.forEach(block=>block.remove());
          summary.forEach(append);
        }
      }
    }
    const sheets=pages.querySelectorAll('.contract-sheet');
    sheets.forEach((sheet,i)=>{
      if(!advance && !statement)sheet.appendChild(createSignatures());
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
  const statement=wrapper?.querySelector('.contract-document-statement-body');
  if(statement){
    if(wrapper.getAttribute('data-document-kind')==='advance')statement.setAttribute('data-document-kind','advance');
    return paginateContract(statement,documentRef).outerHTML;
  }
  if(wrapper?.getAttribute('data-document-kind')==='advance')source.setAttribute('data-document-kind','advance');
  if(wrapper){while(wrapper.firstChild)source.insertBefore(wrapper.firstChild,wrapper);wrapper.remove();}
  return paginateContract(source,documentRef).outerHTML;
}
