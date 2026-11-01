import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('./workspacePresentationRuntime.js',import.meta.url),'utf8');
const render=source.slice(source.indexOf('function renderAll(){'),source.indexOf('\nfunction refreshStarredPartial'));
test('background refresh preserves the routed module and footer after rapid navigation',()=>{
 let active='reports',footer='Reports';const mounted=[];
 const context={
  isGlobalWorkspaceRoute:()=>false,
  document:{getElementById:()=>({querySelector:()=>null})},
  window:{get KarhaRoute(){return {moduleId:active};},KarhaApp:{modules:{get:id=>({mount:({projectId})=>mounted.push([id,projectId])})}}},
  getActiveTab:()=> 'p',renderDrawerProjectList:()=>{},
  setBottomNavActive:key=>{footer=key;},
 };
 vm.createContext(context);vm.runInContext(render,context);
 for(const [moduleId,key] of [['reports','Reports'],['accounting','Financial'],['reports','Reports']]){
  active=moduleId;footer=key;context.renderAll();assert.equal(footer,key);
 }
 assert.deepEqual(mounted,[['reports','p'],['accounting','p'],['reports','p']]);
});
