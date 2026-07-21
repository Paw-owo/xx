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
  assert.match(icon.innerHTML, /class="icon-(paper|body|highlight|accent)/, `${app.id} includes a layered illustrated body`);
  return icon.innerHTML;
});
assert.equal(new Set(drawings).size, APPS.length, 'all default silhouettes are distinct');

const gallery = createDefaultAppIcon(APPS.find(({ id }) => id === 'gallery'), 28, fakeDocument).innerHTML;
assert.doesNotMatch(gallery, /<image/i, 'gallery does not use external photo imagery');
assert.match(gallery, /<rect class="icon-paper"[^>]+width="60"[^>]+height="64"/, 'gallery keeps a distinct framed photo silhouette');

const source = fs.readFileSync(new URL('../core/default-app-icons.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i, 'icon source contains no hard-coded colors');
assert.doesNotMatch(source, /https:|data:image|base64|<image/i, 'icon source contains no external or embedded image assets');

const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(page, /artEl\.appendChild\(createDefaultAppIcon\(app, 28\)\)/, 'desktop and Dock use the factory');
assert.match(page, /icon\.className = 'placeholder-icon'; icon\.appendChild\(createDefaultAppIcon\(app, 28\)\)/, 'placeholder uses the factory');
assert.equal((page.match(/addEventListener\('error', \(\) => \{[^}]*createDefaultAppIcon\(app, 28\)/g) || []).length, 2, 'desktop and placeholder image failures use the factory');
assert.match(page, /if \(customImage\)[\s\S]*image\.src = customImage/, 'custom images remain preferred');

console.log('desktop icon checks passed');


const styleSource = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
assert.match(styleSource, /--icon-paper-stable/, 'stable icon paper slot exists');
assert.match(styleSource, /--icon-body-stable/, 'stable icon body slot exists');
assert.match(styleSource, /--icon-line-stable/, 'stable icon line slot exists');
assert.match(styleSource, /--icon-highlight-stable/, 'stable icon highlight slot exists');
assert.match(styleSource, /--icon-shadow-stable/, 'stable icon shadow slot exists');
assert.match(styleSource, /--icon-charm-theme-2/, 'secondary theme accent slot exists');
assert.doesNotMatch(styleSource, /cream-bell-badge-display|caramel-stitch|cookie-dot/, 'old badge and caramel icon variables are removed');
assert.doesNotMatch(styleSource, new RegExp('\n\.desktop-icon-art::before \{'), 'desktop pseudo-elements do not leak globally');
console.log('rewritten desktop visual isolation checks passed');
