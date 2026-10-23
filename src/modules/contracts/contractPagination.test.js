import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateContract,contractPageStyles} from './contractPagination.js';
// Deterministic layout fixture: ten characters per line, twenty pixels per line.
class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.ownText='';this.className='';this.classList={contains:name=>this.className.split(' ').includes(name)};}
  get childNodes(){return this.children;}
  set textContent(value){this.ownText=value;this.children=[];}
  get textContent(){return this.ownText+this.children.map(x=>x.textContent).join('');}
  appendChild(node){node.remove();node.parent=this;this.children.push(node);return node;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
  cloneNode(deep){const copy=new Element(this.tag);copy.className=this.className;copy.ownText=this.ownText;if(deep)this.children.forEach(x=>copy.appendChild(x.cloneNode(true)));return copy;}
  querySelectorAll(selector){const found=[];for(const x of this.children){if(x.classList.contains(selector.slice(1)))found.push(x);found.push(...x.querySelectorAll(selector));}return found;}
  get clientHeight(){return 971;}
  get scrollHeight(){return Math.max(971,this.children.reduce((n,x)=>n+Math.ceil(x.textContent.length/10)*20,0));}
}
const doc={createElement:tag=>new Element(tag),body:new Element('body')};

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
  assert.match(contractPageStyles,/padding:76px/);
  assert.match(contractPageStyles,/inset:38px;border:1px/);
});
