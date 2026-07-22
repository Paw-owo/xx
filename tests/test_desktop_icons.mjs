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
  assert.match(icon.innerHTML, /class="fur"/, `${app.id} includes a complete character body`);
  return icon.innerHTML;
});
assert.equal(new Set(drawings).size, APPS.length, 'all default silhouettes are distinct');

const gallery = createDefaultAppIcon(APPS.find(({ id }) => id === 'gallery'), 28, fakeDocument).innerHTML;
assert.doesNotMatch(gallery, /<image/i, 'gallery does not use external photo imagery');
assert.match(gallery, /badge-soft-half/, 'default icons use the preview-like cool left patch');
assert.match(gallery, /M22 17h52c8 0 14 6 14 14v34c0 8-6 14-14 14H22c-8 0-14-6-14-14V31c0-8 6-14 14-14Z/, 'default icons use the preview-like dashed stitched inner frame');
assert.match(gallery, /M19 25h58c5 0 9 4 9 9v39c0 5-4 9-9 9H19c-5 0-9-4-9-9V34c0-5 4-9 9-9Z/, 'gallery uses a newly redrawn simple rounded photo outline');

const source = fs.readFileSync(new URL('../core/default-app-icons.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i, 'icon source contains no hard-coded colors');
assert.doesNotMatch(source, /https:|data:image|base64|<image/i, 'icon source contains no external or embedded image assets');

const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(page, /artEl\.appendChild\(createDefaultAppIcon\(app, 28\)\)/, 'desktop and Dock use the factory');
assert.match(page, /icon\.className = 'placeholder-icon'; icon\.appendChild\(createDefaultAppIcon\(app, 28\)\)/, 'placeholder uses the factory');
assert.equal((page.match(/addEventListener\('error', \(\) => \{[^}]*createDefaultAppIcon\(app, 28\)/g) || []).length, 2, 'desktop and placeholder image failures use the factory');
assert.match(page, /if \(customImage\)[\s\S]*image\.src = customImage/, 'custom images remain preferred');

assert.match(page, /function isLegacyDefaultAppIconRecord/, 'desktop has a compatibility guard for stale generated SVG icon records');
assert.match(page, /async function clearLegacyDefaultIconBlobKey\(key\)[\s\S]*deleteDB\('blobs', key\)/, 'stale generated icon blobs are cleared from the matched compatibility key');
assert.match(page, /function clearLegacyDefaultIconLocalKey\(key\)[\s\S]*setData\(key, preserved\)/, 'local stale generated defaults are cleaned without deleting unrelated blob records');
assert.match(page, /async function cleanupLegacyDefaultIconResidue\(app, candidateKeys\)[\s\S]*for \(const key of candidateKeys\)[\s\S]*Object\.entries\(icons\)/, 'desktop scans all alias keys and weak local icon entries for stale generated defaults');
assert.match(page, /if \(\/user\|local\|upload\|url\/\.test\(meta\)\) return false;/, 'user-provided svg metadata is protected from stale default cleanup');
assert.match(page, /Object\.entries\(current\)\.filter\(\(\[field\]\) => !APP_ICON_IMAGE_FIELDS\.has\(field\)\)/, 'app_icons cleanup preserves non-image fields');
assert.match(page, /artEl\.appendChild\(createDefaultAppIcon\(app, 28\)\)/, 'cleared stale icon records fall back to the default SVG factory');


assert.match(page, /\.phone-desktop:not\(\.boot-ready\) \{[\s\S]*?visibility: hidden;[\s\S]*?pointer-events: none;[\s\S]*?\}/, 'desktop shell stays hidden while boot loading is visible');
assert.match(page, /function revealDesktopAfterBoot\(\) \{[\s\S]*?desktopEl\?\.classList\.add\('boot-ready'\);[\s\S]*?\}/, 'desktop is revealed only by the boot completion gate');
assert.match(page, new RegExp("console\\.info\\('\\[boot\\] desktop ready'\\);\\s*revealDesktopAfterBoot\\(\\);\\s*hideBootLoading\\(\\);"), 'boot completion reveals the desktop before dismissing loading');
assert.match(page, new RegExp("function resetBootLoading\\(\\) \\{\\s*desktopEl\\?\\.classList\\.remove\\('boot-ready'\\);"), 'retry boot returns to loading-only shell');

assert.match(page, /function assertDesktopRootReady\(\)[\s\S]*throw new Error\('desktop root missing'\)/, 'missing desktop root remains a core boot failure');
assert.match(page, /await runDesktopRenderPart\('dock', \(\) => renderDock\(\)\);[\s\S]*await runDesktopRenderPart\('widgets', \(\) => renderWidgets\(\)\);[\s\S]*await runDesktopRenderPart\('app-grid', \(\) => renderAppGrid\(hiddenIcons\)\);/, 'desktop render is split into dock, widgets, and app-grid stages');
assert.match(page, /async function runDesktopRenderPart\(stage, task\)[\s\S]*console\.error\(`\[desktop:render\] \$\{stage\} failed`, error\)[\s\S]*return null;/, 'desktop render stages log and continue after local failures');
assert.match(page, /function renderDock\(\)[\s\S]*console\.error\('\[desktop:render\] dock app skipped'/, 'dock app failures are isolated');
assert.match(page, /function renderAppGrid\(hiddenIcons\)[\s\S]*console\.error\('\[desktop:render\] app icon skipped'/, 'single app icon failures are isolated');
assert.match(page, /async function renderCustomWidgets\(\)[\s\S]*console\.error\('\[desktop:render\] custom widget skipped'/, 'custom widget failures are isolated');
assert.match(page, /async function renderWidgets\(\)[\s\S]*console\.error\('\[desktop:render\] widget skipped'/, 'widget failures are isolated');

console.log('desktop icon checks passed');


const styleSource = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
assert.match(styleSource, /:root \.desktop-icon-art/, 'soft desktop icon styling is shared by all themes');
assert.match(styleSource, /\.cozy-app-icon \.icon-badge-frame \{ display: none; \}/, 'cream-bell badge frame is hidden outside the preset');
assert.match(styleSource, /:root \.cozy-app-icon \.icon-badge-frame/, 'badge frame is restored by the shared soft-cute layer');
assert.match(styleSource, /badge-soft-half/, 'shared icon styling supports the preview-like half patch');
assert.doesNotMatch(styleSource, new RegExp('\n\\.desktop-icon-art::before \\{'), 'cream-bell desktop pseudo-elements do not leak globally');
console.log('shared soft-cute visual checks passed');

const settingsSource = fs.readFileSync(new URL('../apps/settings.js', import.meta.url), 'utf8');
assert.match(settingsSource, /import \{ createDefaultAppIcon \} from '\.\.\/core\/default-app-icons\.js';/, 'settings imports the shared default icon factory');
assert.match(settingsSource, /function appIconPreview\(app, src = '', label = '应用图标'\)/, 'settings has a default app icon preview helper');
assert.match(settingsSource, /box\.append\(createDefaultAppIcon\(app, 28\)\)/, 'settings default icon previews use the same SVG factory as the desktop');
assert.match(settingsSource, /if \(src\) return imagePreview\(src, label, 'image'\);/, 'settings keeps custom icon images ahead of the default SVG');
assert.doesNotMatch(settingsSource, /imagePreview\(image \|\| '', custom\.name \|\| name, isHidden \? 'settings' : 'star'\)/, 'settings no longer falls back to generic star/settings previews');
assert.match(settingsSource, /const previewEl = appIconPreview\(app, image \|\| '', custom\.name \|\| name\);/, 'hidden apps keep the same default icon preview source');
assert.match(settingsSource, /function getSettingsAppIconImageKeys\(app\)[\s\S]*app_icon_\$\{app\.id\}[\s\S]*app_\$\{app\.id\}_icon[\s\S]*icon_\$\{app\.id\}/, 'settings reads the same icon compatibility aliases as the desktop');
assert.match(settingsSource, /async function cleanupSettingsLegacyDefaultIconResidue\(app, candidateKeys\)[\s\S]*for \(const key of candidateKeys\)[\s\S]*Object\.entries\(icons\)/, 'settings clears stale generated defaults from all alias keys and weak entries before previewing');
console.log('settings icon preview checks passed');
