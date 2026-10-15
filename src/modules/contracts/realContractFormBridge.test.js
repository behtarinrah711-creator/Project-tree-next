import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));

describe('KarhaRealContractForm global bridge', () => {
  it('contracts index installs window.KarhaRealContractForm', () => {
    const src = readFileSync(join(dir, 'index.js'), 'utf8');
    assert.match(
      src,
      /window\.KarhaRealContractForm\s*=\s*realContractFormModule/,
      'index.js must assign realContractFormModule to window.KarhaRealContractForm'
    );
  });

  it('routes canonical UI primitives through KarhaUI before legacy fallback', () => {
    const src = readFileSync(join(dir, 'realContractFormModule.js'), 'utf8');
    const helper = src.match(/function helper\(name, \.\.\.args\) \{([\s\S]*?)\n\}/)?.[1] || '';
    assert.match(helper, /window\.KarhaUI\?\.\[name\]/, 'helper must consult KarhaUI');
    assert.match(helper, /return window\.KarhaUI\[name\]\(\.\.\.args\)/, 'helper must call the canonical KarhaUI primitive');
    assert.ok(
      helper.indexOf('window.KarhaUI') < helper.indexOf('legacy(name, ...args)'),
      'KarhaUI must be preferred before the compatibility fallback'
    );
  });

  it('keeps a consumed contract-form entry consumed during synchronous Back dispatch', () => {
    const src = readFileSync(join(dir, 'contractHistoryController.js'), 'utf8');
    assert.match(src, /let formPopDispatchDepth=0/, 'Contract history must track only the transient pop-dispatch boundary');
    assert.match(src, /if\(consumed\) formPopDispatchDepth\+\+/, 'a consumed contract-form pop must enter the dispatch guard');
    assert.match(src, /if\(formPopDispatchDepth>0\) return false/, 'eager form re-entry during onPop must be rejected');
    assert.match(src, /restoreConsumedForm\(transition\)/, 'explicit consumed-entry restoration remains available for Stay');
    assert.match(src, /isConsumedFormTransition\(transition\)/, 'restoration remains restricted to canonical consumed contract-form transitions');
    assert.match(src, /getElementById\('closeContractsPage'\)/, 'contracts list header Back must remain wired');
    assert.match(src, /contractsBackButton\.onclick=requestCanonicalBack/, 'contracts list header Back must use canonical Browser History');
  });
  it('uses the template clause layout while preserving editing and drag behavior', () => {
    const src = readFileSync(join(dir, 'realContractFormModule.js'), 'utf8');
    assert.match(src, /row\.className = isChild \? 'ctf-row ctf-material-row' : 'ctf-row ctf-band-row'/);
    assert.match(src, /actions\.className = isChild \? 'ctf-row-actions ctf-material-actions' : 'ctf-row-actions'/);
    assert.match(src, /actions\.append\(grip, remove\)/);
    assert.match(src, /group\.appendChild\(renderRealContractItem\(child, children, childIndex, true\)\)/);
    assert.match(src, /group\.appendChild\(addChild\)/);
    assert.match(src, /contractItemInteractions\.updateItemText/);
    assert.match(src, /contractItemInteractions\.attachPointerDrag/);
    assert.match(src, /items\.className = 'ctf-groups real-contract-items'/);
    assert.match(src, /preview\.className = 'ctf-preview contract-doc-preview contract-real-print-preview'/);
    assert.match(src, /mountContractPrintPage\(body, preview, 'contract-real-preview-viewport'\)/);
    const template = readFileSync(join(dir, 'contractTemplateFormModule.js'), 'utf8');
    assert.match(template, /export function mountContractPrintPage/);
    assert.match(template, /available\/794/);
  });

  it('shares the template A4 dimensions and pinned row actions', () => {
    const css = readFileSync(join(dir, '../../styles/features/contracts.css'), 'utf8');
    assert.match(css, /\.contract-real-print-preview\{[\s\S]*width:794px!important;[\s\S]*height:1123px!important;/);
    assert.match(css, /\.ctf-row-actions\{[^}]*position:absolute;left:12px/);
    assert.match(css, /\.ctf-material-row \.ctf-material-actions\{left:12px/);
  });

});
