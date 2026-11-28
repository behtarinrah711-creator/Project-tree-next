const sizes = { A4:[297,210], A3:[420,297] };
export function paperDimensions(paper,orientation){
  const [width,height]=sizes[paper] || sizes.A3;
  return orientation==='portrait'?[height,width]:[width,height];
}

export const ganttPaperMargin = 8;
const pt = mm => (mm*72/25.4).toFixed(3);

export function ganttPdfBlob(images,paper,orientation){
  const [width,height]=paperDimensions(paper,orientation);
  const encoder=new TextEncoder();
  const chunks=[];
  const offsets=[0];
  let length=0;
  function append(value){
    const bytes=typeof value==='string'?encoder.encode(value):value;
    chunks.push(bytes);
    length+=bytes.byteLength;
  }
  function object(id,...parts){
    offsets[id]=length;
    append(`${id} 0 obj\n`);
    parts.forEach(append);
    append('\nendobj\n');
  }
  append('%PDF-1.4\n');
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
  images.forEach(({bytes,pixelWidth,pixelHeight},index)=>{
    const page=3+index*3;
    const imageWidth=Math.min(width-2*ganttPaperMargin,(height-2*ganttPaperMargin)*pixelWidth/pixelHeight);
    const imageHeight=imageWidth*pixelHeight/pixelWidth;
    object(page,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(width)} ${pt(height)}] /Resources << /XObject << /Chart ${page+1} 0 R >> >> /Contents ${page+2} 0 R >>`);
    object(page+1,`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,bytes,'\nendstream');
    const stream=`q ${pt(imageWidth)} 0 0 ${pt(imageHeight)} ${pt(width-ganttPaperMargin-imageWidth)} ${pt(height-ganttPaperMargin-imageHeight)} cm /Chart Do Q\n`;
    object(page+2,`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  });
  const xref=length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach(offset=>append(`${String(offset).padStart(10,'0')} 00000 n \n`));
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks,{type:'application/pdf'});
}

function showGanttPdfPreview(documentRef,windowRef,images,settings){
  const {paper,orientation,title}=settings;
  const dialog=documentRef.createElement('dialog');
  dialog.className='gantt-pdf-preview';
  dialog.dir='rtl';
  dialog.setAttribute('aria-label','پیش‌نمایش PDF گانت');
  const pdfUrl=windowRef.URL.createObjectURL(ganttPdfBlob(images,paper,orientation));
  const urls=[pdfUrl];
  const header=documentRef.createElement('header');
  const heading=documentRef.createElement('h2');
  heading.textContent='پیش‌نمایش PDF گانت';
  const close=documentRef.createElement('button');
  close.type='button';
  close.textContent='بازگشت';
  close.onclick=()=>dialog.close();
  const save=documentRef.createElement('a');
  save.href=pdfUrl;
  save.download=`${title || 'نمودار گانت'}.pdf`;
  save.textContent='ذخیرهٔ PDF';
  header.append(heading,close,save);
  const pages=documentRef.createElement('div');
  pages.className='gantt-pdf-preview-pages';
  pages.dataset.paper=paper==='A4'?'A4':'A3';
  pages.dataset.orientation=orientation==='portrait'?'portrait':'landscape';
  const number=new Intl.NumberFormat('fa-IR');
  images.forEach(({bytes},index)=>{
    const page=documentRef.createElement('div');
    page.className='gantt-pdf-preview-page';
    const image=documentRef.createElement('img');
    const url=windowRef.URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));
    urls.push(url);
    image.src=url;
    image.alt=`صفحهٔ ${number.format(index+1)} از ${number.format(images.length)}`;
    page.append(image);
    pages.append(page);
  });
  dialog.append(header,pages);
  const cleanup=()=>{
    dialog.remove();
    urls.forEach(url=>windowRef.URL.revokeObjectURL(url));
  };
  dialog.addEventListener('close',cleanup,{once:true});
  documentRef.body.append(dialog);
  try {
    dialog.showModal();
  } catch(error) {
    cleanup();
    throw error;
  }
}

function paintGanttTitles(page,canvas,windowRef){
  const context=canvas.getContext('2d');
  if(!context)return;
  const bounds=page.getBoundingClientRect();
  context.save();
  // html2canvas leaves its capture offset on the context. Title positions use page coordinates.
  context.setTransform(canvas.width/bounds.width,0,0,canvas.height/bounds.height,0,0);
  context.textAlign='right';
  context.textBaseline='middle';
  const graphemes=new Intl.Segmenter('fa',{granularity:'grapheme'});
  for(const label of page.querySelectorAll('.gantt-print-title')){
    const style=windowRef.getComputedStyle(label);
    context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.direction='rtl';
    const width=label.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    if(width<=0)continue;
    let title=label.textContent;
    if(context.measureText(title).width>width){
      const chars=Array.from(graphemes.segment(title),part=>part.segment);
      let low=0,high=chars.length;
      while(low<high){
        const middle=Math.ceil((low+high)/2);
        if(context.measureText(chars.slice(0,middle).join('')+'…').width<=width)low=middle;
        else high=middle-1;
      }
      title=chars.slice(0,low).join('').trimEnd()+'…';
    }
    const box=label.getBoundingClientRect();
    context.fillStyle=style.color;
    context.fillText(title,box.right-bounds.left-parseFloat(style.paddingRight),box.top-bounds.top+box.height/2);
  }
  context.restore();
}

export async function downloadGanttPdf({documentRef,windowRef,html,styles,settings}){
  const pdfSettings={...settings};
  const capture=documentRef.createElement('div');
  const [width]=paperDimensions(pdfSettings.paper,pdfSettings.orientation);
  capture.className='gantt-pdf-capture';
  capture.innerHTML=`<style>.gantt-pdf-capture{position:fixed;left:-10000px;top:0;width:${width-2*ganttPaperMargin}mm;background:#fff}${styles}</style>${html}`;
  documentRef.body.append(capture);
  try{
    await documentRef.fonts?.ready;
    const pages=[...capture.querySelectorAll('.gantt-print')];
    if(!pages.length)throw new Error('The Gantt export has no pages');
    const signature=capture.querySelector('.signature');
    if(signature)pages.at(-1).append(signature);
    const images=[];
    for(const page of pages){
      const canvas=await windowRef.html2canvas(page,{scale:2,backgroundColor:'#fff',useCORS:true,logging:false,windowWidth:Math.ceil(page.getBoundingClientRect().width)});
      paintGanttTitles(page,canvas,windowRef);
      const jpg=windowRef.atob(canvas.toDataURL('image/jpeg',.94).split(',')[1]);
      images.push({bytes:Uint8Array.from(jpg,char=>char.charCodeAt(0)),pixelWidth:canvas.width,pixelHeight:canvas.height});
    }
    showGanttPdfPreview(documentRef,windowRef,images,pdfSettings);
  } finally {
    capture.remove();
  }
}
