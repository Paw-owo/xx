import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APPS } from '../core/app-registry.js';
import {
  createDefaultAppIcon,
  DEFAULT_APP_ICON_IDS,
  DEFAULT_APP_ICON_VERSION,
  LEGACY_APP_ICON_VERSIONS
} from '../core/default-app-icons.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.classList = { values: [], add: (...names) => this.classList.values.push(...names) };
    this.innerHTML = '';
    this.children = [];
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  appendChild(child) { this.children.push(child); return child; }
}

const fakeDocument = { createElementNS: (_namespace, tagName) => new FakeElement(tagName) };
const registryIds = APPS.map(({ id }) => id);

assert.equal(APPS.length, 14, 'the sole registry still contains 14 apps');
assert.deepEqual(DEFAULT_APP_ICON_IDS, registryIds, 'the factory covers registry apps in registry order');
assert.equal(DEFAULT_APP_ICON_VERSION, 'plump-v1', 'current default icon generation is plump-v1');
assert.ok(
  LEGACY_APP_ICON_VERSIONS.includes('toy-shop-v2'),
  'the retired stroke-layer generation stays listed so its cached icons are cleaned'
);
assert.ok(
  !LEGACY_APP_ICON_VERSIONS.includes(DEFAULT_APP_ICON_VERSION),
  'the current generation is never treated as legacy'
);

const drawings = APPS.map((app) => {
  const icon = createDefaultAppIcon(app, 28, fakeDocument);
  assert.ok(icon, `${app.id} has a default icon`);
  assert.equal(icon.attributes.get('viewBox'), '0 0 48 48');
  assert.ok(icon.classList.values.includes('cozy-app-icon'));
  assert.ok(icon.classList.values.includes(`cozy-app-icon-${app.id}`));
  assert.equal(icon.attributes.get('data-default-icon-version'), DEFAULT_APP_ICON_VERSION);
  assert.equal(icon.attributes.get('aria-hidden'), 'true', `${app.id} icon is decorative for screen readers`);
  assert.equal(icon.attributes.get('fill'), 'none');
  const group = icon.children[0];
  assert.ok(group, `${app.id} renders a drawing group`);
  assert.equal(group.getAttribute('data-tiny-decoration'), 'on', `${app.id} keeps decoration at desktop size`);
  // 双层填充体系：每个图标至少命中一个主题色槽，且不含硬编码色
  assert.match(
    group.innerHTML,
    /var\(--app-icon-(?:ink|fill)\)/,
    `${app.id} fills through the shared theme colour slots`
  );
  assert.doesNotMatch(group.innerHTML, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i, `${app.id} has no hard-coded colour`);
  return group.innerHTML;
});
assert.equal(new Set(drawings).size, APPS.length, 'all default silhouettes are distinct');

// 小尺寸收起装饰
const tiny = createDefaultAppIcon(APPS[0], 20, fakeDocument);
assert.equal(tiny.children[0].getAttribute('data-tiny-decoration'), 'off', 'small sizes drop extra decoration');

const gallery = createDefaultAppIcon(APPS.find(({ id }) => id === 'gallery'), 28, fakeDocument).children[0].innerHTML;
assert.doesNotMatch(gallery, /<image/i, 'gallery does not use external photo imagery');
assert.match(gallery, /var\(--app-icon-fill\)/, 'gallery uses the shared fill slot');

const source = fs.readFileSync(new URL('../core/default-app-icons.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i, 'icon source contains no hard-coded colors');
assert.doesNotMatch(source, /https:|data:image|base64|<image/i, 'icon source contains no external or embedded image assets');
// 两个色槽都必须真的被用到，否则换肤会有一层不跟随
assert.ok(source.includes('var(--app-icon-ink)'), 'icon source uses the ink slot');
assert.ok(source.includes('var(--app-icon-fill)'), 'icon source uses the fill slot');


const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(page, /artEl\.appendChild\(createDefaultAppIcon\(app, 28\)\)/, 'desktop and Dock use the factory');
assert.match(page, /icon\.className = 'placeholder-icon'; icon\.appendChild\(createDefaultAppIcon\(app, 28\)\)/, 'placeholder uses the factory');
assert.equal((page.match(/addEventListener\('error', \(\) => \{[^}]*createDefaultAppIcon\(app, 28\)/g) || []).length, 2, 'desktop and placeholder image failures use the factory');
assert.match(page, /if \(customImage\)[\s\S]*image\.src = customImage/, 'custom images remain preferred');

assert.match(page, /function isLegacyDefaultAppIconRecord/, 'desktop has a compatibility guard for stale generated SVG icon records');
assert.match(page, /async function clearLegacyDefaultIconBlobKey\(key\)[\s\S]*deleteDB\('blobs', key\)/, 'stale generated icon blobs are cleared from the matched compatibility key');
assert.match(page, /function clearLegacyDefaultIconLocalKey\(key\)[\s\S]*setData\(key, preserved\)/, 'local stale generated defaults are cleaned without deleting unrelated blob records');
assert.match(page, /async function cleanupLegacyDefaultIconResidue\(app, candidateKeys\)[\s\S]*for \(const key of candidateKeys\)[\s\S]*Object\.entries\(icons\)/, 'desktop scans all alias keys and weak local icon entries for stale generated defaults');
assert.match(page, /if \(\/user\|upload\|url\/\.test\(meta\)\) return false;/, 'user-provided svg metadata is protected from stale default cleanup while local legacy generated SVG can migrate');
assert.match(page, /data-default-icon-version=\[\"'\]\(\[\^\"'\]\+\)\[\"'\]/, 'legacy default cleanup checks default icon version markers');
assert.match(page, /versionMatch\[1\] !== 'plump-v1'/, 'current default icon SVG cache is not cleaned as stale');
assert.match(page, /Object\.entries\(current\)\.filter\(\(\[field\]\) => !APP_ICON_IMAGE_FIELDS\.has\(field\)\)/, 'app_icons cleanup preserves non-image fields');
assert.match(page, /artEl\.appendChild\(createDefaultAppIcon\(app, 28\)\)/, 'cleared stale icon records fall back to the default SVG factory');
assert.match(page, /\.desktop-icon-art:not\(\.has-custom-image\):has\(\.cozy-app-icon\)[\s\S]*?\.icon-decoration\{display:block!important\}/, 'runtime desktop fix restores decoration only for default SVG icons');
assert.match(page, /\.desktop-icon-art\.has-custom-image[\s\S]*?background:transparent!important/, 'runtime desktop fix keeps custom image icon cleanup scoped to has-custom-image');


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
// 双色填充体系：色槽在 theme.js 里派生，CSS 只负责关掉描边、不再维护 14 个 tone 类
assert.match(
  styleSource,
  /\.cozy-app-icon g \{\s*fill: none;\s*stroke: none;\s*\}/,
  'the plump fill体系 disables inherited stroke so icon paths keep their own fills'
);
assert.doesNotMatch(
  styleSource,
  /\.cozy-app-icon \.(?:fur|paper|face|blush|charm|highlight|badge-paper|badge-stitch|icon-badge-frame)\b/,
  'retired stroke-layer icon rules are fully removed'
);
assert.doesNotMatch(styleSource, new RegExp('\n\\.desktop-icon-art::before \\{'), 'cream-bell desktop pseudo-elements do not leak globally');

const themeSource = fs.readFileSync(new URL('../core/theme.js', import.meta.url), 'utf8');
// 换肤跟随的真正保护点：两个色槽必须在基础变量和每套预设里都被派生出来
assert.ok(
  (themeSource.match(/'app-icon-ink':/g) || []).length >= 2,
  'the ink slot is derived in both base variables and presets'
);
assert.ok(
  (themeSource.match(/'app-icon-fill':/g) || []).length >= 2,
  'the fill slot is derived in both base variables and presets'
);
assert.match(themeSource, /'app-icon-ink':[^\n]*color-mix/, 'ink slot is theme-derived, not a flat literal');
assert.match(themeSource, /'app-icon-fill':[^\n]*color-mix/, 'fill slot is theme-derived, not a flat literal');
assert.match(themeSource, /dark\s*\n?\s*\?[^\n]*app-icon|app-icon-ink':\s*dark/, 'icon slots branch for dark presets');
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
