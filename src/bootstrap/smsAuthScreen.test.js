import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=relative=>readFile(new URL(relative,import.meta.url),'utf8');

test('Saosa login uses the full-screen two-step form instead of browser prompts',async()=>{
  const [controls,html,css]=await Promise.all([
    read('./shellControls.js'),
    read('../../index.html'),
    read('../styles/components/sms-auth.css'),
  ]);
  assert.doesNotMatch(controls,/windowRef\.prompt/);
  assert.match(controls,/smsAuthScreen/);
  assert.match(controls,/autocomplete='one-time-code'/);
  assert.match(html,/id="smsAuthScreen"/);
  assert.match(html,/id="smsAuthForm"/);
  assert.match(css,/position:fixed;inset:0/);
  assert.match(css,/min-height:100dvh/);
});

test('Arvan deploy stamps cache guard with the deployed commit',async()=>{
  const workflow=await read('../../.github/workflows/deploy-arvan.yml');
  assert.match(workflow,/s\/__DEPLOYMENT_VERSION__\/\$\{GITHUB_SHA\}\/g/);
});
