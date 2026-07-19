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

const images = new Map();
globalThis.window = {
  AppImages: {
    async readImageRecord(key) { return images.get(key) || null; },
    async writeImageRecord(key, record) { images.set(key, { ...record, key }); return images.get(key); },
    async removeImageRecord(key) { images.delete(key); return true; },
    getImageFromRecord(record) { return record?.value || record?.image || ''; }
  }
};

let uuidCount = 0;
Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => `resource-id-${++uuidCount}` }, configurable: true });

const agent = await import('../core/theme-ai-agent.js');
const manager = await import('../core/theme-resource-manager.js');

images.set('app_wallpaper', { key: 'app_wallpaper', value: 'https://example.com/original.png', opacity: 77 });
const preview = agent.previewTheme({
  themeVariables: { accent: '#aabbcc' },
  imageSlots: { app_wallpaper: { resource: { kind: 'url', value: 'https://example.com/preview.png', opacity: 55 } } },
  themeConfig: { themeName: '预览资源主题' },
  uiDecorationParameters: { roundness: 1, spacingScale: 0.5, motionScale: 0.25, decorEnabled: 0 }
});
assert.equal(preview.ok, true);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(images.get('app_wallpaper').value, 'https://example.com/preview.png');
assert.equal(styleValues.get('--radius-md'), '33px');
assert.equal(styleValues.get('--theme-decor-enabled'), '0');

const cancelled = agent.cancelThemePreview();
assert.equal(cancelled.ok, true);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(images.get('app_wallpaper').value, 'https://example.com/original.png');

const saved = agent.saveThemeVersion({
  themeVariables: { accent: '#ddeeff' },
  imageSlots: {
    app_wallpaper: { resource: { kind: 'url', value: 'https://example.com/saved.png' } },
    app_bg_chat: { resource: { kind: 'dataUrl', value: 'data:image/png;base64,AAAA' } }
  },
  themeConfig: { themeName: '保存资源主题' },
  uiDecorationParameters: { desktopWallpaperSoft: 0.2, decorDensity: 0.8 }
});
assert.equal(saved.ok, true);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(images.get('app_wallpaper').value, 'https://example.com/saved.png');
assert.equal(images.get('app_bg_chat').value, 'data:image/png;base64,AAAA');
assert.equal(styleValues.get('--desktop-wallpaper-soft'), '0.2');
const owners = JSON.parse(local.get(manager.THEME_RESOURCE_OWNERS_KEY));
assert.equal(owners.app_wallpaper, saved.theme.themeConfig.themeId);
assert.equal(owners.app_bg_chat, saved.theme.themeConfig.themeId);

assert.equal(agent.deleteThemeVersion(saved.theme.themeConfig.themeId), true);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(images.has('app_wallpaper'), false);
assert.equal(images.has('app_bg_chat'), false);
