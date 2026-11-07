// Runs in the print window after its fonts have loaded.
export function paginateCostlinePrint(){
  const source=document.querySelector('.cost-report');
  if(!source) return;
  const pages=document.createElement('div');
  pages.className='contract-pages contract-pagination-measure';
  document.body.appendChild(pages);
  let content, report, section, sectionSource;
  const startPage=()=>{
    const sheet=document.createElement('div');
    sheet.className='contract-sheet';
    content=document.createElement('div');
    content.className='contract-sheet-content';
    report=source.cloneNode(false);
    content.append(report);
    sheet.append(content);
    pages.append(sheet);
    section=null;
  };
  const target=()=>{
    if(!section){
      section=sectionSource.cloneNode(false);
      report.append(section);
    }
    return section;
  };
  const fits=()=>content.scrollHeight<=content.clientHeight;
  const appendBlock=node=>{
    const copy=node.cloneNode(true);
    const pageHadContent=report.textContent.trim()!=='';
    target().append(copy);
    if(!fits() && pageHadContent){
      copy.remove();
      startPage();
      target().append(copy);
    }
  };
  const appendTable=(table,heading)=>{
    const rows=[...table.tBodies[0].rows];
    let fragment, body;
    const beginFragment=label=>{
      fragment=table.cloneNode(false);
      fragment.append(table.tHead.cloneNode(true));
      body=fragment.createTBody();
      if(label) target().append(label);
      target().append(fragment);
    };
    const label=heading?.cloneNode(true);
    const pageHadContent=report.textContent.trim()!=='';
    beginFragment(label);
    for(const row of rows){
      const copy=row.cloneNode(true);
      body.append(copy);
      if(fits()) continue;
      if(body.rows.length===1 && fragment.previousElementSibling===label && !pageHadContent) continue;
      copy.remove();
      if(!body.rows.length){
        fragment.remove();
        if(label?.parentNode===section) label.remove();
      }
      startPage();
      beginFragment(label && !label.parentNode ? label : null);
      body.append(copy);
    }
  };
  try{
    startPage();
    const signature=source.nextElementSibling;
    for(const node of source.children){
      sectionSource=node.matches('section') ? node : document.createElement('section');
      section=null;
      if(node.matches('.cost-appendix, .cost-summary + .cost-summary') && report.textContent.trim()) startPage();
      const blocks=node.matches('section') ? [...node.children] : [node];
      for(let i=0;i<blocks.length;i++){
        const block=blocks[i];
        if(block.matches('h2') && blocks[i+1]?.matches('table')) appendTable(blocks[++i],block);
        else if(block.matches('table')) appendTable(block);
        else appendBlock(block);
      }
    }
    if(signature?.matches('.signature')){
      sectionSource=document.createElement('section');
      section=null;
      appendBlock(signature);
      signature.remove();
    }
    pages.classList.remove('contract-pagination-measure');
    source.replaceWith(pages);
  }catch(error){
    pages.remove();
    console.error('Cost report pagination failed',error);
  }
}
