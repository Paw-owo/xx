import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
globalThis.document = {
  documentElement: { setAttribute() {}, style: { setProperty() {} } },
  querySelector() { return null; }
};

let uuidCount = 0;
Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => `test-id-${++uuidCount}` }, configurable: true });

const agent = await import('../core/theme-ai-agent.js');

const context = agent.getThemeAIContext();
assert.equal(context.protocolVersion, agent.THEME_AI_PROTOCOL_VERSION);
assert.ok(context.allowedVariables.some((group) => group.variables.includes('accent')));
assert.ok(context.allowedImageSlots.includes('app_wallpaper'));

const invalid = agent.validateAIThemeResult({
  themeVariables: { accent: 'url("https://evil.example/a.png")', unknown: '#fff' },
  preset: 'dark-chocolate',
  appBusinessLogic: {}
});
assert.equal(invalid.ok, false);
assert.ok(invalid.errors.includes('forbidden_core_field:preset'));
assert.ok(invalid.errors.includes('unknown_field:appBusinessLogic'));
assert.ok(invalid.errors.includes('unknown_theme_variable:unknown'));
assert.ok(invalid.errors.includes('illegal_css_value:accent'));

const missing = agent.validateAIThemeResult({
  themeConfig: { themeName: '樱花主题', description: '测试' },
  imageSlots: { app_wallpaper: { required: true, reason: '需要壁纸' } }
});
assert.equal(missing.ok, true);
assert.deepEqual(missing.missingAssets, [{ slot: 'app_wallpaper', reason: '需要壁纸' }]);

const saved = agent.saveThemeVersion({
  themeVariables: { accent: '#ffccdd', 'radius-md': '20px' },
  imageSlots: { app_wallpaper: { resource: { kind: 'url', value: 'https://example.com/wallpaper.png', opacity: 80 } } },
  themeConfig: { themeName: '樱花主题', description: '测试' },
  uiDecorationParameters: { decorDensity: 0.5 }
});
assert.equal(saved.ok, true);
assert.equal(saved.theme.themeConfig.themeId, 'theme_test-id-1');
assert.equal(agent.listThemeVersions().length, 1);
assert.equal(agent.getActiveThemeVersion().themeConfig.themeName, '樱花主题');

const copied = agent.copyThemeVersion('theme_test-id-1', { themeName: '樱花主题副本' });
assert.equal(copied.ok, true);
assert.equal(agent.listThemeVersions().length, 2);
assert.equal(agent.deleteThemeVersion('theme_test-id-1'), true);
assert.equal(agent.listThemeVersions().length, 1);

const themeModule = await import('../core/theme.js');
const formalThemeBeforePreview = JSON.parse(memory.get('app_theme'));
const preview = agent.previewTheme({
  themeVariables: { accent: '#112233', 'radius-md': '18px' },
  themeConfig: { themeName: '预览主题', description: '只预览不保存' }
});
assert.equal(preview.ok, true);
assert.equal(preview.preview.status, agent.THEME_AI_PREVIEW_STATUS.ACTIVE);
assert.equal(agent.getThemePreviewState().previewId, preview.preview.previewId);
assert.equal(themeModule.getCurrentTheme().variables.accent, '#112233');
assert.deepEqual(JSON.parse(memory.get('app_theme')), formalThemeBeforePreview);
assert.equal(agent.listThemeVersions().length, 1);

const cancelled = agent.cancelThemePreview();
assert.equal(cancelled.ok, true);
assert.equal(cancelled.preview.status, agent.THEME_AI_PREVIEW_STATUS.CANCELLED);
assert.equal(agent.getThemePreviewState(), null);
assert.equal(themeModule.getCurrentTheme().variables.accent, formalThemeBeforePreview.variables.accent);
assert.deepEqual(JSON.parse(memory.get('app_theme')), formalThemeBeforePreview);

const illegalPreview = agent.previewTheme({ themeVariables: { accent: 'url(https://evil.example/a.png)' } });
assert.equal(illegalPreview.ok, false);
assert.equal(agent.getThemePreviewState(), null);

const confirmPreview = agent.previewTheme({
  themeVariables: { accent: '#445566' },
  themeConfig: { themeName: '确认主题' }
});
assert.equal(confirmPreview.ok, true);
const confirmed = agent.confirmThemePreview();
assert.equal(confirmed.ok, true);
assert.equal(confirmed.preview.status, agent.THEME_AI_PREVIEW_STATUS.CONFIRMED);
assert.equal(agent.getThemePreviewState(), null);
assert.equal(agent.listThemeVersions().length, 2);
assert.equal(JSON.parse(memory.get('app_theme')).customVariables.accent, '#445566');
assert.equal(agent.confirmThemePreview().ok, false);

const optimized = agent.saveThemeVersion({
  themeVariables: { accent: '#667788' },
  imageSlots: { app_wallpaper: { required: true, reason: '导入后需要壁纸' } },
  themeConfig: {
    themeName: '确认主题优化版',
    parentThemeId: confirmed.theme.themeConfig.themeId,
    version: 2,
    metadata: { aiSummary: '调整为更可爱', apiKey: 'must-not-export', privateToken: 'must-not-export' }
  }
});
assert.equal(optimized.ok, true);
const logItem = agent.recordThemeOptimization({
  themeId: optimized.theme.themeConfig.themeId,
  parentThemeId: confirmed.theme.themeConfig.themeId,
  version: optimized.theme.themeConfig.version,
  userPrompt: '更可爱一点',
  aiSummary: '调整为更可爱'
});
assert.equal(logItem.themeId, optimized.theme.themeConfig.themeId);
assert.equal(agent.listThemeOptimizationLog(optimized.theme.themeConfig.themeId).length, 1);
assert.equal(agent.listThemeOptimizationLog(confirmed.theme.themeConfig.themeId).length, 1);

const exported = agent.exportThemePackage(optimized.theme.themeConfig.themeId);
assert.equal(exported.ok, true);
assert.equal(exported.package.type, agent.THEME_AI_PACKAGE_TYPE);
assert.equal(exported.package.schemaVersion, agent.THEME_AI_PACKAGE_SCHEMA_VERSION);
assert.equal(exported.package.shareInfo.themeName, '确认主题优化版');
assert.equal(exported.package.themeVariables.accent, '#667788');
assert.equal(exported.package.theme.themeVariables.accent, '#667788');
assert.equal(exported.package.versionInfo.parentThemeId, confirmed.theme.themeConfig.themeId);
assert.equal(exported.package.theme.themeConfig.metadata.apiKey, undefined);
assert.equal(exported.package.themeConfig.metadata.privateToken, undefined);
assert.equal(JSON.stringify(exported.package).includes('must-not-export'), false);
assert.ok(Array.isArray(exported.package.optimizationLog));
assert.equal(exported.package.optimizationLog[0].aiSummary, '调整为更可爱');
assert.equal(exported.package.theme.themeConfig.metadata.aiSummary, '调整为更可爱');

const imported = agent.importThemePackage(JSON.stringify(exported.package));
assert.equal(imported.ok, true);
assert.equal(imported.theme.themeConfig.themeName, '确认主题优化版');
assert.equal(imported.theme.themeConfig.metadata.importedFromThemeId, optimized.theme.themeConfig.themeId);
assert.equal(imported.theme.themeConfig.themeId, undefined);
assert.equal(imported.theme.imageSlots.app_wallpaper?.resource?.value || '', '');
assert.equal(imported.missingAssets.length, 1);
assert.equal(imported.preview.status, agent.THEME_AI_PREVIEW_STATUS.ACTIVE);

const illegalImported = agent.importThemePackage({ schemaVersion: agent.THEME_AI_PACKAGE_SCHEMA_VERSION, theme: { themeVariables: { unknown: '#fff' } } });
assert.equal(illegalImported.ok, false);
assert.ok(illegalImported.errors.includes('unknown_theme_variable:unknown'));

const missingSchema = agent.importThemePackage({ theme: exported.package.theme });
assert.equal(missingSchema.ok, false);
assert.ok(missingSchema.errors.includes('theme_package_schemaVersion_required'));

const topLevelImport = agent.importThemePackage({
  schemaVersion: agent.THEME_AI_PACKAGE_SCHEMA_VERSION,
  shareInfo: { themeName: '顶层主题包' },
  themeConfig: exported.package.themeConfig,
  themeVariables: exported.package.themeVariables,
  imageSlots: exported.package.imageSlots,
  uiDecorationParameters: exported.package.uiDecorationParameters
});
assert.equal(topLevelImport.ok, true);
assert.equal(topLevelImport.theme.themeConfig.themeName, '确认主题优化版');
assert.equal(topLevelImport.theme.themeConfig.themeId, undefined);

const packageWithUnknownRoot = agent.importThemePackage({
  schemaVersion: agent.THEME_AI_PACKAGE_SCHEMA_VERSION,
  theme: exported.package.theme,
  userData: { name: 'should-not-import' }
});
assert.equal(packageWithUnknownRoot.ok, false);
assert.ok(packageWithUnknownRoot.errors.includes('unknown_package_field:userData'));

const packageWithSensitiveImportMetadata = agent.importThemePackage({
  schemaVersion: agent.THEME_AI_PACKAGE_SCHEMA_VERSION,
  theme: {
    ...exported.package.theme,
    themeConfig: {
      ...exported.package.theme.themeConfig,
      metadata: { aiSummary: '安全导入', apiKey: 'drop-me', privateToken: 'drop-me' }
    }
  }
});
assert.equal(packageWithSensitiveImportMetadata.ok, true);
assert.equal(packageWithSensitiveImportMetadata.theme.themeConfig.metadata.apiKey, undefined);
assert.equal(packageWithSensitiveImportMetadata.theme.themeConfig.metadata.privateToken, undefined);
assert.equal(packageWithSensitiveImportMetadata.theme.themeConfig.metadata.aiSummary, '安全导入');
