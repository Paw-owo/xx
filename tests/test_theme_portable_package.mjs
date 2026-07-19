import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
globalThis.document = {
  getElementById() { return null; },
  createElement() { return { style: {}, append() {}, appendChild() {}, remove() {}, setAttribute() {}, classList: { add() {}, remove() {} } }; },
  createElementNS() { return { style: {}, setAttribute() {}, append() {}, classList: { add() {}, remove() {} } }; },
  head: { append() {}, appendChild() {} },
  body: { append() {}, appendChild() {}, classList: { add() {}, remove() {} } },
  documentElement: { setAttribute() {}, style: { setProperty() {}, getPropertyValue() { return ''; }, removeProperty() {} } },
  querySelector() { return null; }
};

const images = new Map();
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  AppImages: {
    async readImageRecord(key) { return images.get(key) || null; },
    async writeImageRecord(key, record) { images.set(key, { ...record, key }); return images.get(key); },
    async removeImageRecord(key) { images.delete(key); return true; },
    getImageFromRecord(record) { return record?.value || record?.image || record?.data || ''; }
  }
};
Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => `portable-${Math.random().toString(16).slice(2)}` }, configurable: true });
globalThis.fetch = async (url) => {
  if (String(url).includes('downloadable')) return new Response(new Blob(['cat'], { type: 'image/png' }), { status: 200, headers: { 'content-type': 'image/png' } });
  return new Response('no', { status: 404 });
};

const agent = await import('../core/theme-ai-agent.js');

const saved = await agent.saveThemeVersionAsync({
  themeVariables: { accent: '#aabbcc' },
  imageSlots: {
    app_wallpaper: { resource: { kind: 'url', value: 'https://asset.test/downloadable.png' } },
    app_bg_chat: { resource: { kind: 'uploaded', value: 'blob:local-chat' } },
    app_bg_dream: { resource: { kind: 'dataUrl', value: 'data:image/png;base64,QUJD' } },
    app_bg_settings: { resource: { kind: 'url', value: 'https://asset.test/missing.png' } }
  },
  themeConfig: { themeName: '可迁移主题包' }
});
assert.equal(saved.ok, true);
images.set('app_bg_chat', { key: 'app_bg_chat', value: 'blob:local-chat', data: new Blob(['blob-cat'], { type: 'image/png' }) });

const exported = await agent.exportThemePackageAsync(saved.theme.themeConfig.themeId);
assert.equal(exported.ok, true);
assert.equal(exported.package.resources.imageSlots.app_wallpaper.status, 'embedded');
assert.match(exported.package.theme.imageSlots.app_wallpaper.resource.value, /^data:image\/png;base64,/);
assert.equal(exported.package.resources.imageSlots.app_bg_chat.status, 'embedded');
assert.match(exported.package.theme.imageSlots.app_bg_chat.resource.value, /^data:image\/png;base64,/);
assert.equal(exported.package.resources.imageSlots.app_bg_dream.status, 'embedded');
assert.equal(exported.package.resources.imageSlots.app_bg_settings.externalDependency, true);

images.clear();
memory.clear();
const imported = await agent.importThemePackageAsync(JSON.stringify(exported.package));
assert.equal(imported.ok, true);
const confirmed = await agent.confirmThemePreviewAsync();
assert.equal(confirmed.ok, true);
assert.match(images.get('app_wallpaper').value, /^data:image\/png;base64,/);
assert.match(images.get('app_bg_chat').value, /^data:image\/png;base64,/);
assert.equal(images.get('app_bg_dream').value, 'data:image/png;base64,QUJD');
console.log('portable theme package ok');
