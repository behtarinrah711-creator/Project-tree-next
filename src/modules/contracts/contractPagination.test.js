import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateContract} from './contractPagination.js';
globalThis.window={location:{hash:'',search:''}};
const {getContractPageStyles}=await import('./contractTemplateFormModule.js');
// Deterministic layout fixture: ten characters per line, twenty pixels per line.
class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.attrs={};this.ownText='';this.className='';this.classList={contains:name=>this.className.split(' ').includes(name)};}
  setAttribute(name,value){this.attrs[name]=value;}
  getAttribute(name){return this.attrs[name]??null;}
  get childNodes(){return this.children;}
  set textContent(value){this.ownText=value;this.children=[];}
  get textContent(){return this.ownText+this.children.map(x=>x.textContent).join('');}
  appendChild(node){node.remove();node.parent=this;this.children.push(node);return node;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
  cloneNode(deep){const copy=new Element(this.tag);copy.className=this.className;copy.attrs={...this.attrs};copy.ownText=this.ownText;if(deep)this.children.forEach(x=>copy.appendChild(x.cloneNode(true)));return copy;}
  querySelectorAll(selector){const found=[];for(const x of this.children){if(x.classList.contains(selector.slice(1)))found.push(x);found.push(...x.querySelectorAll(selector));}return found;}
  get clientHeight(){return 971;}
  get scrollHeight(){return Math.max(971,this.children.reduce((n,x)=>n+Math.ceil(x.textContent.length/10)*20,0));}
}
const doc={createElement:tag=>new Element(tag),body:new Element('body')};

test('three-photo annex groups stay intact inside separate framed contract sheets with identifying footers',()=>{
  const source=new Element(),terms=new Element();terms.textContent='Contract and signatures';source.appendChild(terms);
  for(const names of [['identity-front','identity-back','permit'],['residence','passport']]){
    const annex=new Element('section');annex.className='contract-document-attachment';
    annex.setAttribute('data-contract-number','CTR-7');
    for(const name of names){const picture=new Element('img');picture.textContent=name;annex.appendChild(picture);}
    source.appendChild(annex);
  }
  const pages=paginateContract(source,doc);
  const sheets=pages.querySelectorAll('.contract-sheet-content');
  assert.equal(sheets.length,3);assert.equal(sheets[0].textContent,'Contract and signatures');
  assert.deepEqual(sheets.slice(1).map(sheet=>sheet.children[0].children.length),[3,2]);
  assert.ok(sheets.slice(1).every(sheet=>sheet.children[0].children.every(child=>child.tag==='img')));
  const footers=pages.querySelectorAll('.contract-sheet-number').map(node=>node.textContent);
  assert.equal(footers[0],'صفحه ۱ از ۳');assert.equal(footers[1],'شماره قرارداد: CTR-7 — صفحه ۲ از ۳');
  assert.equal(footers[2],'شماره قرارداد: CTR-7 — صفحه ۳ از ۳');
});

test('pagination preserves all long text, keeps short blocks whole and labels all pages',()=>{
  const source=new Element();
  for(const text of ['A'.repeat(300),'B'.repeat(300),'C'.repeat(1300),'END']){const node=new Element();node.textContent=text;source.appendChild(node);}
  const pages=paginateContract(source,doc);
  const contents=pages.querySelectorAll('.contract-sheet-content');
  assert.ok(contents.length>=4);
  assert.equal(contents.map(x=>x.textContent).join(''),source.textContent);
  assert.ok(contents.every(x=>x.scrollHeight<=x.clientHeight));
  assert.equal(pages.querySelectorAll('.contract-sheet-number').length,contents.length);
  assert.equal(doc.body.children.length,0);

});

 test('standalone exports reuse the CSS presentation owner rules',()=>{
  const pageRule='.contract-sheet { padding:76px; }';
  const printRule='@media print { .contract-sheet { margin:0; } }';
  const styles=getContractPageStyles({styleSheets:[{cssRules:[{styleSheet:{cssRules:[{cssText:'.contract-pages { width:794px; }'}]},cssText:'@import url(contracts.css);'},{cssText:pageRule},{cssText:'.unrelated { color:red; }'},{cssText:printRule}]}]});
  assert.ok(styles.includes('.contract-pages'));assert.ok(styles.includes(pageRule));assert.ok(styles.includes(printRule));assert.ok(!styles.includes('unrelated'));
});
