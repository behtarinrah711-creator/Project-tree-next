import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadApplicationRuntime } from './applicationRuntimeLoader.js';

function createDocumentHarness(){
  let runtimeScript = null;
  const runtimeScripts = [];
  const template = { innerHTML:'', content:{ firstElementChild:{nodeName:'DIV'} } };
  const documentRef = {
    querySelector(){ return runtimeScript; },
    createElement(tagName){
      if(tagName === 'template') return template;
      assert.equal(tagName, 'script');
      const listeners = new Map();
      return {
        async: true,
        dataset: {},
        addEventListener(type, callback){ listeners.set(type, callback); },
        dispatch(type){ listeners.get(type)?.(); },
      };
    },
    body: {
      appendChild(script){
        runtimeScript = script;
        runtimeScripts.push(script);
        queueMicrotask(() => script.dispatch('load'));
      },
    },
  };
  return { documentRef, template, getRuntimeScript: () => runtimeScript, runtimeScripts };
}

test('legacy loader installs required global HTML helper before classic runtime', async () => {
  const harness = createDocumentHarness();
  const windowRef = {};
  await loadApplicationRuntime({ documentRef: harness.documentRef, windowRef, sourceUrl: '/applicationRuntime.js' });

  assert.equal(typeof windowRef.elFromHtml, 'function');
  assert.equal(windowRef.elFromHtml(' <div>x</div> '), harness.template.content.firstElementChild);
  assert.equal(harness.template.innerHTML, '<div>x</div>');
});

test('application runtime fragments load sequentially in declared order', async () => {
  const harness = createDocumentHarness();
  await loadApplicationRuntime({
    documentRef: harness.documentRef,
    windowRef: {},
    sourceUrls: ['/foundation.js', '/history.js', '/startup.js'],
  });
  assert.deepEqual(harness.runtimeScripts.map(script => script.src), [
    '/foundation.js', '/history.js', '/startup.js',
  ]);
  assert.ok(harness.runtimeScripts.every(script => script.dataset.loaded === 'true'));
});

test('legacy loader creates one ordered classic script', async () => {
  const harness = createDocumentHarness();
  const windowRef = {};
  const first = await loadApplicationRuntime({ documentRef: harness.documentRef, windowRef, sourceUrl: '/applicationRuntime.js' });
  const second = await loadApplicationRuntime({ documentRef: harness.documentRef, windowRef, sourceUrl: '/applicationRuntime.js' });

  assert.equal(first, second);
  assert.equal(first.src, '/applicationRuntime.js');
  assert.equal(first.async, false);
  assert.equal(first.type, undefined);
  assert.equal(first.dataset.loaded, 'true');
});

test('HTML has production entries without condemned share controls', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="src\/bootstrap\/shellEntry\.js"><\/script>/);
  assert.match(html, /<script type="module" src="src\/bootstrap\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script[^>]+src="src\/legacy\/applicationRuntime\.js"/);
  assert.doesNotMatch(html, /share(?:DialogSub|EmailInput|CancelBtn|ConfirmBtn)/);
  assert.doesNotMatch(html, /آدرس جیمیل فردی که می‌خواهید به این پروژه دسترسی بدهید را وارد کنید/);
});

test('application runtime remains a classic-script source without module declarations', async () => {
  const source = await readFile(new URL('./applicationRuntime.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*(?:import|export)\s/m);
  assert.match(source, /installLegacyCompatibilityBoundary\(\);\s*\nloadData\(\);/);
});
