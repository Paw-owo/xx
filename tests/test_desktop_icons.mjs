import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APPS } from '../core/app-registry.js';
import { createDefaultAppIcon, DEFAULT_APP_ICON_IDS } from '../core/default-app-icons.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.classList = { values: [], add: (...names) => this.classList.values.push(...names) };
    this.innerHTML = '';
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

const fakeDocument = { createElementNS: (_namespace, tagName) => new FakeElement(tagName) };
const registryIds = APPS.map(({ id }) => id);

assert.equal(APPS.length, 14, 'the sole registry still contains 14 apps');
assert.deepEqual(DEFAULT_APP_ICON_IDS, registryIds, 'the factory covers registry apps in registry order');

const drawings = APPS.map((app) => {
  const icon = createDefaultAppIcon(app, 28, fakeDocument);
  assert.ok(icon, `${app.id} has a default icon`);
  assert.equal(icon.attributes.get('viewBox'), '0 0 96 96');
  assert.ok(icon.classList.values.includes(`cozy-app-icon-${app.id}`));
  assert.match(icon.innerHTML, /class="icon-line"|class="icon-dot"/, `${app.id} includes a complete rounded line drawing`);
  return icon.innerHTML;
});
assert.equal(new Set(drawings).size, APPS.length, 'all default silhouettes are distinct');

const gallery = createDefaultAppIcon(APPS.find(({ id }) => id === 'gallery'), 28, fakeDocument).innerHTML;
assert.doesNotMatch(gallery, /<image/i, 'gallery does not use external photo imagery');
assert.match(gallery, /badge-soft-half/, 'default icons use the preview-like cool left patch');
assert.match(gallery, /M21 16h54c8 0 14 6 14 14v36c0 8-6 14-14 14H21c-8 0-14-6-14-14V30c0-8 6-14 14-14Z/, 'default icons use the preview-like dashed stitched inner frame');
assert.match(gallery, /M22 28h52c5 0 9 4 9 9v34c0 5-4 9-9 9H22c-5 0-9-4-9-9V37c0-5 4-9 9-9Z/, 'gallery uses a preview-style rounded photo outline');

const source = fs.readFileSync(new URL('../core/default-app-icons.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i, 'icon source contains no hard-coded colors');
assert.doesNotMatch(source, /https:|data:image|base64|<image/i, 'icon source contains no external or embedded image assets');
assert.doesNotMatch(source, /class=\"(?:fur|bow|bell|cream-bell|icon-decoration)\"/, 'icon source does not keep the old bear, wool, bell, or badge-decoration language');

const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(page, /artEl\.appendChild\(createDefaultAppIcon\(app, 28\)\)/, 'desktop and Dock use the factory');
assert.match(page, /icon\.className = 'placeholder-icon'; icon\.appendChild\(createDefaultAppIcon\(app, 28\)\)/, 'placeholder uses the factory');
assert.equal((page.match(/addEventListener\('error', \(\) => \{[^}]*createDefaultAppIcon\(app, 28\)/g) || []).length, 2, 'desktop and placeholder image failures use the factory');
assert.match(page, /if \(customImage\)[\s\S]*image\.src = customImage/, 'custom images remain preferred');

assert.match(page, /function isLegacyDefaultAppIconRecord/, 'desktop has a compatibility guard for stale generated SVG icon records');
assert.match(page, /clearIconImageKey\(primaryKey\)/, 'stale generated primary icon records are cleared before falling back to the default SVG factory');
assert.match(page, /clearIconImageKey\(key\)/, 'stale generated weak alias icon records are cleared before they can override the default SVG factory');
assert.match(page, /artEl\.replaceChildren\(createDefaultAppIcon\(app, 28\)\)/, 'cleared stale icon records fall back to the default SVG factory');

console.log('desktop icon checks passed');


const styleSource = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
assert.match(styleSource, /:root \.desktop-icon-art/, 'soft desktop icon styling is shared by all themes');
assert.match(styleSource, /:root \.cozy-app-icon \.badge-gloss/, 'shared icon styling supports the preview-like soft gloss');
assert.match(styleSource, /badge-soft-half/, 'shared icon styling supports the preview-like half patch');
assert.doesNotMatch(styleSource, new RegExp('\n\\.desktop-icon-art::before \\{'), 'cream-bell desktop pseudo-elements do not leak globally');
console.log('shared soft-cute visual checks passed');
