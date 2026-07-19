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

const {
  getThemeAgentProtocolSpec,
  handleThemeAgentRequest,
  parseThemeAgentRequest,
  validateGeneratedThemeResult
} = await import('../core/theme-agent-protocol.js');

const spec = getThemeAgentProtocolSpec();
assert.equal(spec.protocolVersion, 1);
assert(spec.supportedActions.includes('readThemeContext'));
assert(spec.supportedActions.includes('previewTheme'));
assert.equal(spec.reservedToolCalls.imageGeneration.enabled, false);
assert.equal(spec.reservedToolCalls.imageGeneration.sideEffects, false);
assert.equal(spec.reservedToolCalls.imageGeneration.network, false);
assert.equal(spec.reservedToolCalls.imageResourceImport.writesStorage, false);
assert(spec.generatedThemeFormat.requiredFields.includes('uiDecorationParameters'));

let parsed = parseThemeAgentRequest({ action: 'readThemeContext', requestId: 'req-1' });
assert.equal(parsed.valid, true);
assert.equal(parsed.action, 'readThemeContext');

parsed = parseThemeAgentRequest({ action: 'deleteUserData' });
assert.equal(parsed.valid, false);
assert(parsed.errors.some((error) => error.includes('未知 action')));

let response = await handleThemeAgentRequest({ action: 'readThemeContext', requestId: 'ctx' });
assert.equal(response.ok, true);
assert.equal(response.responseType, 'context');
assert.equal(response.context.protocolVersion, 1);
assert(response.context.supportedActions.includes('previewTheme'));
assert.equal(response.context.requestFormat.actionField, 'action');
assert(response.context.responseFormat.responseTypes.includes('capabilityDenied'));

const legalGeneratedTheme = {
  schemaVersion: 1,
  type: 'ai-phone-theme',
  themeName: '协议测试主题',
  themeVariables: {
    'bg-primary': '#ffffff',
    accent: '#111111'
  },
  imageSlots: [],
  themeConfig: {
    mode: 'light'
  },
  uiDecorationParameters: {
    tone: 'soft'
  }
};

let generatedValidation = validateGeneratedThemeResult(legalGeneratedTheme);
assert.equal(generatedValidation.valid, true);
assert.equal(generatedValidation.normalizedThemeJson.variables['bg-primary'], '#ffffff');
assert.equal(generatedValidation.normalizedThemeJson.customVariables.accent, '#111111');

const illegalGeneratedTheme = {
  ...legalGeneratedTheme,
  css: '.app { display:none }'
};

generatedValidation = validateGeneratedThemeResult(illegalGeneratedTheme);
assert.equal(generatedValidation.valid, false);
assert(generatedValidation.errors.some((error) => error.includes('非法字段')));

generatedValidation = validateGeneratedThemeResult({ schemaVersion: 1, type: 'ai-phone-theme' });
assert.equal(generatedValidation.valid, false);
assert(generatedValidation.errors.some((error) => error.includes('缺少字段')));

response = await handleThemeAgentRequest({
  action: 'previewTheme',
  requestId: 'preview-1',
  payload: { generatedTheme: illegalGeneratedTheme }
});
assert.equal(response.ok, false);
assert.equal(response.responseType, 'validationResult');
assert.equal(appliedStyles.size, 0);
assert.equal(localData.has('app_theme'), false);

response = await handleThemeAgentRequest({
  action: 'previewTheme',
  requestId: 'preview-2',
  payload: { generatedTheme: legalGeneratedTheme }
});
assert.equal(response.ok, true);
assert.equal(response.responseType, 'previewResult');
assert(response.previewResult.variables.some((item) => item.key === 'bg-primary' && item.targetValue === '#ffffff'));
assert.equal(response.executionPlan.valid, true);
assert.equal(appliedStyles.size, 0);
assert.equal(localData.has('app_theme'), false);

response = await handleThemeAgentRequest({ action: 'requestAsset', requestId: 'asset-1' });
assert.equal(response.ok, false);
assert.equal(response.responseType, 'capabilityDenied');
assert(response.errors.some((error) => error.includes('当前关闭')));
assert.equal(appliedStyles.size, 0);
assert.equal(localData.has('app_theme'), false);

response = await handleThemeAgentRequest({ action: 'generateTheme', requestId: 'gen-1' });
assert.equal(response.ok, false);
assert.equal(response.responseType, 'capabilityDenied');
assert.equal(appliedStyles.size, 0);
assert.equal(localData.has('app_theme'), false);

console.log('theme agent protocol tests passed');
