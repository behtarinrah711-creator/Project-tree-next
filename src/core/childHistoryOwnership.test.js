import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const srcRoot=fileURLToPath(new URL('../',import.meta.url));

async function productionJavaScriptFiles(directory=srcRoot){
  const entries=await readdir(directory,{withFileTypes:true});
  const files=await Promise.all(entries.map(entry=>{
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory()) return productionJavaScriptFiles(absolute);
    if(entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) return [absolute];
    return [];
  }));
  return files.flat();
}

test('only the canonical browser-history boundary installs a production popstate listener',async()=>{
  const files=await productionJavaScriptFiles();
  const output=[];
  for(const file of files){
    const source=await readFile(file,'utf8');
    if(/addEventListener\(['"]popstate/.test(source)){
      output.push(path.relative(path.dirname(srcRoot),file).split(path.sep).join('/'));
    }
  }
  output.sort();
  assert.deepEqual(output,['src/core/browserHistory.js']);
});

test('presentation and Contract compatibility contain no browser-history implementation',async()=>{
  for(const relative of ['../ui/workspacePresentationRuntime.js','../modules/contracts/contractCompatibility.js']){
    const source=await readFile(new URL(relative,import.meta.url),'utf8');
    assert.doesNotMatch(source,/history\.(?:pushState|replaceState|back|go)|addEventListener\(['"]popstate/);
  }
  const compatibility=await readFile(new URL('../modules/contracts/contractCompatibility.js',import.meta.url),'utf8');
  assert.doesNotMatch(compatibility,/\blet\s+(?:dirty|state|.*History)/);
  assert.match(compatibility,/KarhaContractFormLifecycle/);
});
