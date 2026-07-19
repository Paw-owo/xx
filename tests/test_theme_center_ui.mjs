import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPS } from '../core/app-registry.js';
import { BACKUP_LOCAL_STORAGE_KEYS } from '../core/app-system-registry.js';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = {
  getElementById() { return null; },
  createElement(tag) { return { tagName: tag, id: '', textContent: '', style: {}, append() {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {} } }; },
  createElementNS(_ns, tag) { return { tagName: tag, setAttribute() {}, append() {}, style: {}, classList: { add() {}, remove() {} } }; },
  head: { append() {}, appendChild() {} },
  body: { append() {}, appendChild() {}, classList: { add() {}, remove() {} } },
  documentElement: { setAttribute() {}, style: { setProperty() {}, getPropertyValue() { return ''; }, removeProperty() {} } },
  querySelector() { return null; }
};

const app = APPS.find((item) => item.id === 'theme-center');
assert.ok(app, 'theme-center app must be registered');
assert.equal(app.module, './apps/theme-center.js');
assert.equal(app.ready, true);
assert.ok(BACKUP_LOCAL_STORAGE_KEYS.includes('theme_center_favorites'));

const source = readFileSync(new URL('../apps/theme-center.js', import.meta.url), 'utf8');
assert.match(source, /listThemeVersions/);
assert.match(source, /saveThemeVersion/);
assert.match(source, /copyThemeVersion/);
assert.match(source, /deleteThemeVersion/);
assert.match(source, /exportThemePackage/);
assert.match(source, /importThemePackage/);
assert.match(source, /previewTheme/);
assert.match(source, /importThemePackageAsync/);
assert.match(source, /deleteThemeVersionAsync/);
assert.match(source, /saveThemeVersionAsync/);
assert.match(source, /cancelThemePreviewAsync/);
assert.match(source, /confirmThemePreviewAsync/);
assert.match(source, /previewThemeAsync/);
assert.match(source, /confirmThemePreview/);
assert.match(source, /cancelThemePreview/);
assert.match(source, /getActiveThemeVersion/);
assert.match(source, /openApp\?\.\('theme-studio'/);
assert.match(source, /editingTheme/);
assert.match(source, /我的小世界/);
assert.match(source, /换上它/);
assert.match(source, /继续调整/);
assert.match(source, /查看成长记录/);
assert.match(source, /分享/);
assert.match(source, /收进小仓库/);
assert.match(source, /放进珍藏/);
assert.match(source, /取消珍藏/);
assert.match(source, /导入主题小包/);
assert.match(source, /\.theme\.json/);
assert.doesNotMatch(source, /from '\.\.\/core\/theme\.js'/);
assert.doesNotMatch(source, /localStorage\.(getItem|setItem|removeItem)/);
assert.match(source, /THEME_CENTER_FAVORITES_KEY/);
assert.match(source, /listFavoriteThemeIds/);
assert.match(source, /setThemeFavorite/);
assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}/);
assert.match(source, /var\(--bg-primary\)/);
assert.match(source, /var\(--bg-card\)/);
assert.match(source, /var\(--radius-lg\)/);

const studioSource = readFileSync(new URL('../apps/theme-studio.js', import.meta.url), 'utf8');
assert.match(studioSource, /hydrateInitialEditingTheme/);
assert.match(studioSource, /editingTheme/);
assert.match(studioSource, /themePrompt/);

const settingsSource = readFileSync(new URL('../apps/settings.js', import.meta.url), 'utf8');
assert.match(settingsSource, /主题中心/);
assert.match(settingsSource, /theme-center/);
assert.doesNotMatch(settingsSource, /AI 主题工作室/);
assert.doesNotMatch(settingsSource, /theme-studio/);

const centerModule = await import('../apps/theme-center.js');
const agent = await import('../core/theme-ai-agent.js');
Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => 'favorite-id' }, configurable: true });
const saved = agent.saveThemeVersion({ themeVariables: { accent: '#aabbcc' }, themeConfig: { themeName: '珍藏测试' } });
assert.equal(saved.ok, true);
const versionCount = agent.listThemeVersions().length;
const themeId = saved.theme.themeConfig.themeId;
centerModule.setThemeFavorite(themeId, true);
assert.equal(centerModule.isThemeFavorite(themeId), true);
assert.deepEqual(centerModule.listFavoriteThemeIds(), [themeId]);
assert.equal(agent.listThemeVersions().length, versionCount);
centerModule.setThemeFavorite(themeId, false);
assert.equal(centerModule.isThemeFavorite(themeId), false);
assert.deepEqual(centerModule.listFavoriteThemeIds(), []);
assert.equal(agent.listThemeVersions().length, versionCount);
