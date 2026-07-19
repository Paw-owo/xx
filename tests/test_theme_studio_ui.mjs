import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPS } from '../core/app-registry.js';

globalThis.document = {
  getElementById() { return null; },
  createElement(tag) { return { tagName: tag, id: '', textContent: '', style: {}, append() {}, remove() {}, setAttribute() {}, classList: { add() {}, remove() {} } }; },
  createElementNS(_ns, tag) { return { tagName: tag, setAttribute() {}, append() {}, style: {}, classList: { add() {}, remove() {} } }; },
  head: { append() {}, appendChild() {} },
  body: { append() {}, classList: { add() {}, remove() {} } }
};
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const app = APPS.find((item) => item.id === 'theme-studio');
assert.ok(app, 'theme-studio app must be registered');
assert.equal(app.module, './apps/theme-studio.js');
assert.equal(app.ready, true);

const module = await import('../apps/theme-studio.js');
assert.equal(typeof module.mount, 'function');
assert.equal(typeof module.unmount, 'function');

const source = readFileSync(new URL('../apps/theme-studio.js', import.meta.url), 'utf8');
const agentSource = readFileSync(new URL('../core/theme-ai-agent.js', import.meta.url), 'utf8');
assert.match(source, /validateAIThemeResult/);
assert.match(source, /previewTheme/);
assert.match(source, /importThemePackageAsync/);
assert.match(source, /deleteThemeVersionAsync/);
assert.match(source, /saveThemeVersionAsync/);
assert.match(source, /cancelThemePreviewAsync/);
assert.match(source, /confirmThemePreviewAsync/);
assert.match(source, /previewThemeAsync/);
assert.match(source, /confirmThemePreview/);
assert.match(source, /cancelThemePreview/);
assert.match(source, /saveThemeVersion/);
assert.match(source, /deleteThemeVersion/);
assert.match(source, /copyThemeVersion/);
assert.match(source, /resolveThemeGenerator/);
assert.match(source, /silentRequest/);
assert.match(source, /buildAIThemeGenerationContext/);
assert.match(source, /availableImageResources/);
assert.match(source, /uiCapabilities/);
assert.match(source, /handleAssetUrl/);
assert.match(source, /handleAssetUpload/);
assert.match(source, /compressImage/);
assert.match(source, /resolveThemeImageGenerator/);
assert.match(source, /theme-image-generator/);
assert.match(source, /handleAssetGenerate/);
assert.match(source, /buildImageGenerationPayload/);
assert.match(source, /normalizeGeneratedImageResource/);
assert.match(source, /handleAssetSkip/);
assert.match(source, /previewThemeAsync\(state.generatedTheme\)/);
assert.match(source, /listThemeOptimizationLog/);
assert.match(source, /recordThemeOptimization/);
assert.match(source, /editingBaseTheme/);
assert.match(source, /optimize_existing_theme/);
assert.match(source, /handleRollbackTheme/);
assert.match(source, /exportThemePackage/);
assert.match(source, /importThemePackage/);
assert.match(agentSource, /THEME_AI_PACKAGE_SCHEMA_VERSION/);
assert.match(agentSource, /sanitizePackageValue/);
assert.match(source, /handleShareTheme/);
assert.match(source, /handleImportFile/);
assert.match(source, /renderWorkbenchTopbar/);
assert.match(source, /renderConversationPanel/);
assert.match(source, /renderPreviewPanel/);
assert.match(source, /renderActionDock/);
assert.match(source, /handleCancelPreview/);
assert.match(source, /createThemeCover/);
assert.doesNotMatch(source, /from '\.\.\/core\/theme\.js'/);

const settings = readFileSync(new URL('../apps/settings.js', import.meta.url), 'utf8');
assert.match(settings, /主题中心/);
assert.match(settings, /theme-center/);
assert.doesNotMatch(settings, /AI 主题工作室/);
assert.doesNotMatch(settings, /theme-studio/);
