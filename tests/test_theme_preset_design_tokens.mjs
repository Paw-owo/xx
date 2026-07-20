import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); }
};

globalThis.document = {
  documentElement: {
    attrs: {},
    style: {
      values: {},
      setProperty(key, value) { this.values[key] = String(value); }
    },
    setAttribute(key, value) { this.attrs[key] = String(value); }
  },
  querySelector() { return null; }
};

globalThis.window = globalThis;

const theme = await import('../core/theme.js');

const presets = theme.getThemePresets();
assert.equal(presets.length, 6, 'six default theme skins are available');
assert.deepEqual(
  presets.map((preset) => preset.id),
  ['cream-bell', 'cloud-soda', 'peach-pudding', 'cocoa-night', 'teddy-nest', 'blueberry-moon'],
  'preset ids describe six independent skins'
);
assert.ok(presets.some((preset) => preset.name === '奶油铃铛'), 'yellow toy palette is a named theme, not anonymous global chrome');

const required = [
  'surface-paper',
  'surface-charm',
  'accent-strong',
  'icon-detail',
  'button-primary-bg',
  'button-soft-bg',
  'badge-bg',
  'decoration-spot',
  'illustration-line',
  'illustration-fill',
  'illustration-accent',
  'chat-icon-line',
  'chat-icon-paper',
  'chat-icon-fill',
  'chat-icon-dot',
  'chat-fold-card-bg',
  'shadow-color',
  'toy-border'
];

for (const preset of presets) {
  const applied = theme.setPreset(preset.id);
  for (const key of required) {
    assert.ok(applied.variables[key], `${preset.id} supplies ${key}`);
  }
  assert.equal(document.documentElement.attrs['data-theme'], preset.id, `${preset.id} is applied via theme attribute`);
}

const legacy = theme.setPreset('dark-chocolate');
assert.equal(legacy.preset, 'cocoa-night', 'legacy dark preset aliases remain compatible');

console.log('theme preset design token checks passed');
