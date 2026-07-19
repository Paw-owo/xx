import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
const styleValues = new Map();
globalThis.document = {
  getElementById() { return null; },
  createElement(tag) { return { tagName: tag, id: '', textContent: '', style: {}, append() {}, appendChild() {}, remove() {}, click() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {} } }; },
  createElementNS(_ns, tag) { return { tagName: tag, setAttribute() {}, append() {}, style: {}, classList: { add() {}, remove() {} } }; },
  head: { append() {}, appendChild() {} },
  body: { append() {}, appendChild() {}, classList: { add() {}, remove() {} } },
  documentElement: {
    setAttribute() {},
    style: {
      setProperty: (key, value) => styleValues.set(key, String(value)),
      getPropertyValue: (key) => styleValues.get(key) || '',
      removeProperty: (key) => styleValues.delete(key)
    }
  },
  querySelector() { return null; }
};
const images = new Map();
const writes = [];
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  AppImages: {
    async readImageRecord(key) { return images.get(key) || null; },
    async writeImageRecord(key, record) { writes.push({ key, value: record.value }); images.set(key, { ...record, key }); return images.get(key); },
    async removeImageRecord(key) { images.delete(key); return true; },
    getImageFromRecord(record) { return record?.value || record?.image || ''; }
  }
};
let uuidCount = 0;
Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => `accept-id-${++uuidCount}` }, configurable: true });

const agent = await import('../core/theme-ai-agent.js');
const manager = await import('../core/theme-resource-manager.js');
const center = await import('../apps/theme-center.js');

// A. 创建主题：AI 结果 -> normalize -> validate -> preview -> 图片资源 -> confirm -> 保存版本
const aiResult = {
  themeVariables: { accent: '#f3a7c4', 'bg-primary': '#fff0f6', 'radius-md': '24px' },
  imageSlots: {
    app_wallpaper: { resource: { kind: 'url', value: 'https://example.com/pink-cat.png', opacity: 90 } },
    app_bg_chat: { resource: { kind: 'dataUrl', value: 'data:image/png;base64,QUJD' } },
    app_widget_area_bg: { required: true, reason: '需要装饰图' }
  },
  themeConfig: { themeName: '粉色猫窝风格', description: '柔软、粉色、像猫窝' },
  uiDecorationParameters: { roundness: 0.8, decorDensity: 0.6 }
};
const normalized = agent.createThemeConfig(aiResult);
const validation = agent.validateAIThemeResult(normalized);
assert.equal(validation.ok, true);
assert.equal(validation.missingAssets.length, 1);
const preview = await agent.previewThemeAsync(normalized);
assert.equal(preview.ok, true);
assert.equal(images.get('app_wallpaper').value, 'https://example.com/pink-cat.png');
const confirmed = await agent.confirmThemePreviewAsync();
assert.equal(confirmed.ok, true);
assert.equal(agent.listThemeVersions().length, 1);
assert.equal(agent.getActiveThemeVersion().themeConfig.themeName, '粉色猫窝风格');
assert.equal(manager.getThemeResourceTaskState().status, manager.THEME_RESOURCE_TASK_STATUS.COMPLETED);

// B. 修改主题：读取旧版本 -> parentThemeId -> 新版本 -> 优化记录
const base = confirmed.theme;
const dreamy = await agent.saveThemeVersionAsync({
  ...base,
  themeVariables: { ...base.themeVariables, accent: '#c6a7ff' },
  themeConfig: { themeName: '更梦幻一点', parentThemeId: base.themeConfig.themeId, version: 2, metadata: { aiSummary: '增加梦幻紫色' } }
});
assert.equal(dreamy.ok, true);
assert.notEqual(dreamy.theme.themeConfig.themeId, base.themeConfig.themeId);
assert.equal(dreamy.theme.themeConfig.parentThemeId, base.themeConfig.themeId);
agent.recordThemeOptimization({ themeId: dreamy.theme.themeConfig.themeId, parentThemeId: base.themeConfig.themeId, version: 2, userPrompt: '更梦幻一点', aiSummary: '增加梦幻紫色' });
assert.equal(agent.listThemeOptimizationLog(dreamy.theme.themeConfig.themeId).length, 1);

// C. 资源测试：URL、dataURL、缺失素材、取消预览、确认预览、删除清理
const cancelPreview = await agent.previewThemeAsync({
  themeVariables: { accent: '#abcdef' },
  imageSlots: { app_wallpaper: { resource: { kind: 'url', value: 'https://example.com/cancel-me.png' } } },
  themeConfig: { themeName: '准备取消' }
});
assert.equal(cancelPreview.ok, true);
const cancelled = await agent.cancelThemePreviewAsync();
assert.equal(cancelled.ok, true);
assert.equal(agent.getThemePreviewState(), null);
assert.equal(images.get('app_wallpaper').value, 'https://example.com/pink-cat.png');

const resourceTheme = await agent.saveThemeVersionAsync({
  themeVariables: { accent: '#123456' },
  imageSlots: {
    app_wallpaper: { resource: { kind: 'url', value: 'https://example.com/url-resource.png' } },
    app_bg_chat: { resource: { kind: 'dataUrl', value: 'data:image/png;base64,REVG' } }
  },
  themeConfig: { themeName: '资源测试' }
});
assert.equal(resourceTheme.ok, true);
assert.equal(images.get('app_wallpaper').value, 'https://example.com/url-resource.png');
assert.equal(images.get('app_bg_chat').value, 'data:image/png;base64,REVG');
const deleted = await agent.deleteThemeVersionAsync(resourceTheme.theme.themeConfig.themeId);
assert.equal(deleted.ok, true);
assert.equal(images.has('app_wallpaper'), false);
assert.equal(images.has('app_bg_chat'), false);

// D. 主题中心：查看、收藏、取消收藏、复制、导入、导出、分享、删除、继续调整上下文
center.setThemeFavorite(dreamy.theme.themeConfig.themeId, true);
assert.equal(center.isThemeFavorite(dreamy.theme.themeConfig.themeId), true);
center.setThemeFavorite(dreamy.theme.themeConfig.themeId, false);
assert.equal(center.isThemeFavorite(dreamy.theme.themeConfig.themeId), false);
const copied = agent.copyThemeVersion(dreamy.theme.themeConfig.themeId, { themeName: '梦幻分身' });
assert.equal(copied.ok, true);
assert.equal(copied.theme.themeConfig.parentThemeId, dreamy.theme.themeConfig.themeId);
const exported = agent.exportThemePackage(dreamy.theme.themeConfig.themeId);
assert.equal(exported.ok, true);
const imported = await agent.importThemePackageAsync(JSON.stringify(exported.package));
assert.equal(imported.ok, true);
assert.equal(imported.theme.themeConfig.themeId, undefined);
assert.equal(imported.theme.themeConfig.metadata.importedFromThemeId, dreamy.theme.themeConfig.themeId);
const importedConfirm = await agent.confirmThemePreviewAsync();
assert.equal(importedConfirm.ok, true);
assert.equal(agent.deleteThemeVersion(copied.theme.themeConfig.themeId), true);

// E. 恢复测试：切换主题、刷新后读取 active、回滚旧版本
const switched = await agent.saveThemeVersionAsync(dreamy.theme);
assert.equal(switched.ok, true);
assert.equal(agent.getActiveThemeVersion().themeConfig.themeId, dreamy.theme.themeConfig.themeId);
const restoredActive = agent.getActiveThemeVersion();
assert.equal(restoredActive.themeConfig.themeName, '更梦幻一点');
const rollback = await agent.saveThemeVersionAsync(base);
assert.equal(rollback.ok, true);
assert.equal(agent.getActiveThemeVersion().themeConfig.themeId, base.themeConfig.themeId);
assert.ok(writes.length >= 2);
