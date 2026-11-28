const sizes = { A4:[297,210], A3:[420,297] };
const pt = mm => (mm*72/25.4).toFixed(3);

export function ganttPdfBlob(images,paper){
  const [width,height]=sizes[paper] || sizes.A3;
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
    const imageWidth=Math.min(width-24,(height-24)*pixelWidth/pixelHeight);
    const imageHeight=imageWidth*pixelHeight/pixelWidth;
    object(page,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(width)} ${pt(height)}] /Resources << /XObject << /Chart ${page+1} 0 R >> >> /Contents ${page+2} 0 R >>`);
    object(page+1,`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,bytes,'\nendstream');
    const stream=`q ${pt(imageWidth)} 0 0 ${pt(imageHeight)} ${pt(width-12-imageWidth)} ${pt(height-12-imageHeight)} cm /Chart Do Q\n`;
    object(page+2,`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  });
  const xref=length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach(offset=>append(`${String(offset).padStart(10,'0')} 00000 n \n`));
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks,{type:'application/pdf'});
}

export async function downloadGanttPdf({documentRef,windowRef,html,styles,settings}){
  const capture=documentRef.createElement('div');
  const [width]=sizes[settings.paper] || sizes.A3;
  capture.style.cssText=`position:fixed;left:-10000px;top:0;width:${width-24}mm;background:#fff`;
  capture.innerHTML=`<style>${styles}</style>${html}`;
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
      const jpg=windowRef.atob(canvas.toDataURL('image/jpeg',.94).split(',')[1]);
      images.push({bytes:Uint8Array.from(jpg,char=>char.charCodeAt(0)),pixelWidth:canvas.width,pixelHeight:canvas.height});
    }
    const url=windowRef.URL.createObjectURL(ganttPdfBlob(images,settings.paper));
    const link=documentRef.createElement('a');
    link.href=url;
    link.download=`${settings.title || 'نمودار گانت'}.pdf`;
    link.click();
    windowRef.setTimeout(()=>windowRef.URL.revokeObjectURL(url),1000);
  } finally {
    capture.remove();
  }
}
