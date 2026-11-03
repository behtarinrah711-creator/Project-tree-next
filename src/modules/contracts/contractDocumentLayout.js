/** Preserve the existing three-row photo area; portrait pairs span its first two rows. */
export function planContractAnnexes(documents=[],images=[]){
  const portraits=[],landscapes=[];
  documents.forEach((file,sourceIndex)=>{
    const width=Number(images[sourceIndex]?.width || file?.width);
    const height=Number(images[sourceIndex]?.height || file?.height);
    const portrait=width>0 && height>width;
    (portrait?portraits:landscapes).push({sourceIndex,portrait});
  });
  const pages=[];
  for(let index=0;index<portraits.length;index+=2){
    const page=portraits.slice(index,index+2).map((photo,column)=>({...photo,row:1,column:column+1}));
    if(landscapes.length)page.push({...landscapes.shift(),row:3});
    pages.push(page);
  }
  for(let index=0;index<landscapes.length;index+=3){
    pages.push(landscapes.slice(index,index+3).map((photo,row)=>({...photo,row:row+1})));
  }
  return pages;
}
