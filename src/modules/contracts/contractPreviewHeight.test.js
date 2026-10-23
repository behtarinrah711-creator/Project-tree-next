import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {mountContractPrintPage}=await import('./contractTemplateFormModule.js');

test('scaled preview reserves the entire document height, including reflow and font changes',()=>{
  const old={document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,requestAnimationFrame:globalThis.requestAnimationFrame};
  let resize;const observed=[];
  const viewport={clientWidth:397,style:{},appendChild(){}};
  globalThis.document={createElement:()=>viewport};
  globalThis.ResizeObserver=class{constructor(fn){resize=fn;}observe(x){observed.push(x);}disconnect(){}};
  globalThis.requestAnimationFrame=fn=>fn();
  try{
    const page={style:{},scrollHeight:3600,offsetHeight:3600};
    mountContractPrintPage({appendChild(){}},page);
    assert.equal(viewport.style.height,'1800px');
    assert.ok(observed.includes(page));
    page.scrollHeight=4200;resize();
    assert.equal(viewport.style.height,'2100px');
    viewport.clientWidth=794;resize();
    assert.equal(viewport.style.height,'4200px');
  }finally{Object.assign(globalThis,old);}
});
