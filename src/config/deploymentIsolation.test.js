import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPLOYMENT_CONFIG, STORAGE_KEYS } from './deploymentConfig.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');

function runtimeFiles(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name==='node_modules' || entry.name.endsWith('.test.js') || entry.name==='README.md') continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...runtimeFiles(full));
    else if(/\.(?:js|html|json)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('isolated deployment has its own storage namespace and cloud is disabled until configured',()=>{
  assert.equal(DEPLOYMENT_CONFIG.cloudEnabled,false);
  assert.equal(DEPLOYMENT_CONFIG.firebase,null);
  for(const value of Object.values(STORAGE_KEYS)) assert.match(value,/^ptnext-v1:/);
});

test('runtime source contains no production Firebase project or production app-data key',()=>{
  const files=[...runtimeFiles(path.join(root,'src')),path.join(root,'index.html'),path.join(root,'sw.js')];
  const source=files.map(file=>fs.readFileSync(file,'utf8')).join('\n');
  assert.doesNotMatch(source,/tree-d92af/);
  assert.doesNotMatch(source,/gtasks-clone-v2/);
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.match(sw,/key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(sw,/filter\(key => key !== RUNTIME_CACHE\)/);
});
