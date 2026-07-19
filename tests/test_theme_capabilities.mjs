import assert from 'node:assert/strict';

const localData = new Map();
const appliedStyles = new Map();

globalThis.localStorage = {
  getItem(key) { return localData.has(key) ? localData.get(key) : null; },
  setItem(key, value) { localData.set(key, String(value)); },
  removeItem(key) { localData.delete(key); }
};

globalThis.document = {
  documentElement: {
    setAttribute() {},
    style: {
      setProperty(key, value) { appliedStyles.set(key, String(value)); }
    }
  },
  querySelector() { return null; }
};

globalThis.window = { dispatchEvent() {} };
const originalWarn = console.warn;
console.warn = () => {};

const {
  applyThemeFromAgent,
  createThemeExecutionPlan,
  getThemeAgentContext,
  getThemeCapabilityRegistry,
  previewTheme,
  validateThemeJson
} = await import('../core/theme-capabilities.js');

const legalTheme = {
  schemaVersion: 1,
  type: 'ai-phone-theme',
  variables: {
    'bg-primary': '#ffffff',
    'bubble-radius': '28px'
  },
  imageResources: [
    { slotKey: 'app_wallpaper', sourceType: 'urlImage', value: 'https://example.com/wallpaper.png' }
  ]
};

const registry = getThemeCapabilityRegistry();
assert.equal(registry.executionCapabilities.previewTheme.enabled, true);
assert.equal(registry.executionCapabilities.previewTheme.sideEffects, false);
assert.equal(registry.executionCapabilities.applyThemeFromAgent.enabled, true);
assert.equal(registry.executionCapabilities.applyThemeFromAgent.autoApply, false);
assert.equal(registry.executionCapabilities.applyThemeFromAgent.requiresUserConfirmation, true);

const context = getThemeAgentContext();
assert.equal(context.callableCapabilities.previewTheme, true);
assert.equal(context.callableCapabilities.applyThemeFromAgent.autoApply, false);
assert.equal(context.callableCapabilities.requestImageGeneration, false);
assert.equal(context.callableCapabilities.requestImageResourceSave, false);

let validation = validateThemeJson({ schemaVersion: 1, type: 'ai-phone-theme', eventSystem: {} });
assert.equal(validation.valid, false);
assert(validation.errors.some((error) => error.includes('非法字段') || error.includes('禁止修改区域')));

validation = validateThemeJson({ schemaVersion: 1, type: 'ai-phone-theme', variables: { unknownVariable: '#fff' } });
assert.equal(validation.valid, false);
assert(validation.errors.some((error) => error.includes('未知主题变量')));

let result = await applyThemeFromAgent({ schemaVersion: 1, type: 'ai-phone-theme', eventSystem: {} }, { confirmed: true });
assert.equal(result.applied, false);
assert.equal(appliedStyles.size, 0);
assert.equal(localData.has('app_theme'), false);

result = await applyThemeFromAgent({ schemaVersion: 1, type: 'ai-phone-theme', variables: { unknownVariable: '#fff' } }, { confirmed: true });
assert.equal(result.applied, false);
assert.equal(appliedStyles.size, 0);
assert.equal(localData.has('app_theme'), false);

const preview = await previewTheme(legalTheme);
assert(Array.isArray(preview.variables));
assert(preview.variables.some((item) => item.key === 'bg-primary' && item.targetValue === '#ffffff'));
assert(preview.imageResources.some((item) => item.slotKey === 'app_wallpaper' && item.sourceType === 'urlImage'));
assert.equal(appliedStyles.size, 0);
assert.equal(localData.has('app_theme'), false);

const plan = await createThemeExecutionPlan(legalTheme);
assert.equal(plan.valid, true);
assert.equal(plan.normalizedVariables['bg-primary'], '#ffffff');
assert.equal(plan.normalizedVariables['bubble-radius'], '28px');

result = await applyThemeFromAgent(legalTheme);
assert.equal(result.applied, false);
assert(result.errors.some((error) => error.includes('用户确认')));
assert.equal(appliedStyles.size, 0);
assert.equal(localData.has('app_theme'), false);

result = await applyThemeFromAgent(legalTheme, { confirmed: true });
assert.equal(result.applied, true);
assert.equal(appliedStyles.get('--bg-primary'), '#ffffff');
assert.equal(appliedStyles.get('--bubble-radius'), '28px');
assert.equal(localData.has('app_theme'), true);

console.warn = originalWarn;
console.log('theme capability execution tests passed');
