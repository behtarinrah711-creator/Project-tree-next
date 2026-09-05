import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stylesRoot = join(root, 'src', 'styles');
const read = path => readFileSync(join(root, path), 'utf8');
const stripQuery = value => String(value || '').split('?')[0];
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
const cssFiles = walk(stylesRoot).filter(path => path.endsWith('.css'));
const jsFiles = walk(join(root, 'src')).filter(path => path.endsWith('.js') && !path.endsWith('.test.js'));

test('the application has one deterministic CSS manifest and no embedded application CSS', () => {
  const html = read('index.html');
  const linkedCss = [...html.matchAll(/<link\b[^>]*href="([^"]+\.css(?:\?[^\"]*)?)"[^>]*>/g)]
    .map(match => stripQuery(match[1]));
  assert.deepEqual(linkedCss, ['src/styles/index.css']);
  assert.equal(/<style\b/i.test(html), false);
  assert.equal(/\sstyle\s*=/i.test(html), false);

  const manifest = read('src/styles/index.css');
  const imports = [...manifest.matchAll(/@import url\("\.\/([^"\n]+\.css(?:\?[^\"]*)?)"\);/g)]
    .map(match => stripQuery(match[1]));
  assert.equal(imports.length, new Set(imports).size, 'each owner must be imported once');
  assert.deepEqual(imports, [
    'tokens.css', 'base.css', 'utilities.css', 'workspace/chrome.css', 'features/tasks.css',
    'components/dialogs.css', 'widgets/numpad.css', 'features/task-details.css',
    'workspace/drawer.css', 'components/feedback.css', 'workspace/workspace.css',
    'features/contacts.css', 'features/accounting-settings.css', 'components/forms.css',
    'features/contracts-layout.css', 'features/project-management.css', 'components/export.css',
    'features/contact-exit.css', 'features/contracts.css', 'features/contact-custom-select.css', 'widgets/search-template.css',
    'features/contract-search-trigger.css', 'workspace/back-navigation.css',
    'components/form-template.css', 'features/contact-form-template.css', 'workspace/navigation.css',
    'features/wbs-home.css', 'features/wbs-timeline-sticky.css', 'features/wbs-timeline-details.css',
    'features/wbs-costline.css',
  ]);
  assert.deepEqual(new Set(imports.map(path => join(stylesRoot, path))), new Set(cssFiles.filter(path => !path.endsWith('/index.css'))));
});

test('tokens have one canonical owner and style modules contain no application logic', () => {
  const rootOwners = cssFiles.filter(path => /:root\s*\{/.test(readFileSync(path, 'utf8')));
  assert.deepEqual(rootOwners.map(path => relative(root, path)), ['src/styles/tokens.css']);
  for(const path of cssFiles){
    const css = readFileSync(path, 'utf8');
    assert.doesNotMatch(css, /\b(?:AppDataStore|projectRepository|childHistoryController|Firestore|firebaseSession|Router|Sync)\b/);
  }
});

test('feature selectors stay with approved presentation owners', () => {
  const owners = new Map(cssFiles.map(path => [relative(stylesRoot, path), readFileSync(path, 'utf8')]));
  const assertOwned = (prefix, allowed) => {
    for(const [path, css] of owners){
      if(!allowed.includes(path)) assert.equal(css.includes(prefix), false, `${prefix} leaked into ${path}`);
    }
  };
  assertOwned('.contract-', ['features/contracts.css', 'features/contracts-layout.css', 'features/contract-search-trigger.css', 'components/form-template.css']);
  assertOwned('.contact-', ['features/contacts.css', 'features/contact-exit.css', 'features/contact-custom-select.css', 'features/contact-form-template.css']);
  assertOwned('.stpl-', ['widgets/search-template.css', 'features/contract-search-trigger.css']);
  assert.equal(owners.has('legacy.css'), false);
});

test('static feature CSS is not injected by production JavaScript', () => {
  for(const path of jsFiles){
    const js = readFileSync(path, 'utf8');
    assert.doesNotMatch(js, /createElement\(\s*['"]style['"]\s*\)/, relative(root, path));
    assert.doesNotMatch(js, /setAttribute\(\s*['"]style['"]/, relative(root, path));
  }
});

test('remaining direct style mutations are intentional runtime geometry or generated exports', () => {
  const allowlist = new Set([
    'src/core/softDelete.js',
    'src/ui/numpad.js',
    'src/modules/tasks/taskView.js',
    'src/modules/contracts/contractTemplateFormModule.js',
    'src/modules/export/exportView.js',
    'src/modules/wbs/homeView.js',
  ]);
  const offenders = jsFiles.filter(path => /\.style(?:\.|\s*=)|cssText/.test(readFileSync(path, 'utf8')))
    .map(path => relative(root, path)).filter(path => !allowlist.has(path));
  assert.deepEqual(offenders, []);
});

test('deleted delivery and legacy injection selectors do not return', () => {
  assert.equal(cssFiles.some(path => path.endsWith('/legacy.css')), false);
  assert.equal(cssFiles.some(path => readFileSync(path, 'utf8').includes('#contract-edit-no-draft-style')), false);
  assert.equal(read('index.html').includes('src/styles/legacy.css'), false);
});
