import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, installHtmlEscape } from './htmlEscape.js';

describe('htmlEscape', () => {
  it('escapes HTML special characters', () => {
    assert.equal(escapeHtml('<b>&"x</b>'), '&lt;b&gt;&amp;&quot;x&lt;/b&gt;');
  });
  it('installs on window', () => {
    const w = {};
    installHtmlEscape({ windowRef: w });
    assert.equal(w.KarhaHtmlEscape.escapeHtml('a<b'), 'a&lt;b');
  });
});
