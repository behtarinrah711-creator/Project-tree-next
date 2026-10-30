import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppDataStore } from '../data/appDataStore.js';

function element(){
  return {
    children: [], dataset: {}, style:{setProperty(){}}, className: '', hidden: false, innerHTML: '',
    append(...nodes){ nodes.forEach(node=>this.appendChild(node)); },
    appendChild(node){ node.remove?.();Object.defineProperty(node,'parentNode',{value:this,writable:true,configurable:true,enumerable:false});this.children.push(node);return node; },
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);Object.defineProperty(this,'parentNode',{value:null,writable:true,configurable:true,enumerable:false});},
    replaceChildren(...nodes){this.children.forEach(node=>{node.parentNode=null;});this.children=[];this.append(...nodes);},
    addEventListener(type, listener){ this[`on${type}`]=listener; },
    querySelector(selector){
      if(selector === '.wbs-row-dragging,.wbs-work-task.is-dragging') return null;
      return element();
    },
    querySelectorAll(){ return []; },
    setAttribute(){},
  };
}

test('contract list resolves the current project when render has no explicit id', async () => {
  const body=element();
  globalThis.window={
    location:{search:'',hash:'#/projects/p-1/contracts'},
    localStorage:{getItem:key=>key==='ptnext-v1:app-data' ? JSON.stringify({projects:[{id:'p-1',contracts:[]}]}) : null},
    dispatchEvent(){},
  };
  globalThis.document={getElementById:id=>id==='contractsPageBody'?body:null,createElement:element};
  const { contractsModule }=await import(`./contracts/contractsModule.js?regression=${Date.now()}`);

  assert.doesNotThrow(()=>contractsModule.render());
  assert.match(body.children[0].innerHTML,/قراردادهای واقعی پیمانکاران/);
});

test('planning renders hydrated tasks from the canonical AppDataStore snapshot', async () => {
  const content=element();
  const liveProject={id:'p-live',tasks:[{id:'task-live',text:'live',done:false,subtasks:[]}]};
  window.location.hash='#/projects/p-live/planning';
  window.localStorage={getItem:()=>JSON.stringify({projects:[{id:'p-live',tasks:[]}]})};
  window.KarhaAppData=createAppDataStore({storage:window.localStorage});
  window.KarhaAppData.replaceSnapshot({projects:[liveProject]});
  window.KarhaLegacy={ getViewMode:()=> 'simple' };
  document.getElementById=id=>id==='content'?content:null;
  const { default: planningModule }=await import(`./planning/index.js?regression=${Date.now()}`);

  planningModule.mount({projectId:'p-live'});
  assert.match(JSON.stringify(content.children), /ثبت|live|wbs/);
});
