import assert from 'node:assert/strict';

const local = new Map();
globalThis.localStorage = {
  getItem: (key) => local.has(key) ? local.get(key) : null,
  setItem: (key, value) => local.set(key, String(value)),
  removeItem: (key) => local.delete(key)
};
const styleValues = new Map();
globalThis.document = {
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
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const images = new Map();
const writes = [];
globalThis.window = {
  AppImages: {
    async readImageRecord(key) { await delay(8); return images.get(key) || null; },
    async writeImageRecord(key, record) { await delay(10); writes.push({ key, value: record.value }); images.set(key, { ...record, key }); return images.get(key); },
    async removeImageRecord(key) { await delay(8); images.delete(key); return true; },
    getImageFromRecord(record) { return record?.value || record?.image || ''; }
  }
};
let uuidCount = 0;
Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => `async-id-${++uuidCount}` }, configurable: true });

const agent = await import('../core/theme-ai-agent.js');
const manager = await import('../core/theme-resource-manager.js');

images.set('app_wallpaper', { key: 'app_wallpaper', value: 'https://example.com/original.png' });
const firstPreview = agent.previewThemeAsync({
  themeVariables: { accent: '#111111' },
  imageSlots: { app_wallpaper: { resource: { kind: 'url', value: 'https://example.com/first.png' } } },
  themeConfig: { themeName: '第一套' }
});
const secondPreview = await agent.previewThemeAsync({
  themeVariables: { accent: '#222222' },
  imageSlots: { app_wallpaper: { resource: { kind: 'url', value: 'https://example.com/second.png' } } },
  themeConfig: { themeName: '第二套' }
});
const firstResult = await firstPreview;
assert.equal(firstResult.ok, false);
assert.equal(secondPreview.ok, true);
assert.equal(images.get('app_wallpaper').value, 'https://example.com/second.png');
assert.equal(manager.getThemeResourceTaskState().status, manager.THEME_RESOURCE_TASK_STATUS.COMPLETED);

const confirmed = await agent.confirmThemePreviewAsync();
assert.equal(confirmed.ok, true);
assert.equal(images.get('app_wallpaper').value, 'https://example.com/second.png');
assert.equal(manager.getThemeResourceTaskState().status, manager.THEME_RESOURCE_TASK_STATUS.COMPLETED);
const writesAfterConfirm = writes.length;

const saved = await agent.saveThemeVersionAsync({
  themeVariables: { accent: '#333333' },
  imageSlots: { app_wallpaper: { resource: { kind: 'url', value: 'https://example.com/saved.png' } } },
  themeConfig: { themeName: '保存资源' }
});
assert.equal(saved.ok, true);
assert.equal(images.get('app_wallpaper').value, 'https://example.com/saved.png');
assert.equal(manager.getThemeResourceTaskState().status, manager.THEME_RESOURCE_TASK_STATUS.COMPLETED);
assert.ok(writes.length > writesAfterConfirm);

const cancelPreview = agent.previewThemeAsync({
  themeVariables: { accent: '#444444' },
  imageSlots: { app_wallpaper: { resource: { kind: 'url', value: 'https://example.com/cancel.png' } } },
  themeConfig: { themeName: '取消资源' }
});
await delay(0);
const cancelled = await agent.cancelThemePreviewAsync();
assert.equal(cancelled.ok, true);
const cancelledPreviewResult = await cancelPreview;
assert.equal(cancelledPreviewResult.ok, false);
assert.equal(agent.getThemePreviewState(), null);

const deleteResult = await agent.deleteThemeVersionAsync(saved.theme.themeConfig.themeId);
assert.equal(deleteResult.ok, true);
assert.equal(manager.getThemeResourceTaskState().status, manager.THEME_RESOURCE_TASK_STATUS.COMPLETED);
assert.equal(images.has('app_wallpaper'), false);
