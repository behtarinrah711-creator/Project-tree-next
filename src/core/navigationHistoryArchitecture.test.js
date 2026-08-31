import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
async function files(dir=root){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isDirectory())out.push(...await files(f));else if(entry.name.endsWith('.js')&&!entry.name.endsWith('.test.js'))out.push(f);}return out;}

test('browser History API and popstate ownership cannot escape canonical boundary',async()=>{
  const violations=[];
  for(const file of await files()){
    const source=await readFile(file,'utf8');
    const relative=path.relative(path.dirname(root),file).split(path.sep).join('/');
    if(relative==='src/core/browserHistory.js') continue;
    if(/addEventListener\(['"]popstate|\bhistory\.(?:back|go|pushState|replaceState)\s*\(/.test(source))violations.push(relative);
  }
  assert.deepEqual(violations,[]);
});

test('route and same-route owners register through the narrow canonical dispatcher',async()=>{
  const router=await readFile(new URL('./router.js',import.meta.url),'utf8');
  const child=await readFile(new URL('./childHistoryController.js',import.meta.url),'utf8');
  assert.match(router,/register\('route'/);
  assert.match(child,/register\('child'/);
  assert.doesNotMatch(router,/stateForChild/);
  assert.doesNotMatch(child,/stateForRoute/);
});

test('obsolete trapping and suppression machinery stays deleted',async()=>{
  const joined=(await Promise.all((await files()).map(file=>readFile(file,'utf8')))).join('\n');
  assert.doesNotMatch(joined,/ignoreNextPop|skipPop|SuppressWorkspaceBack|suppressWorkspaceBack|KarhaBackGestureGuard/);
  assert.doesNotMatch(joined,/popstate[\s\S]{0,300}pushState/);
});
