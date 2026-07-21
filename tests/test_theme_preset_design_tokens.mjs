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
assert.deepEqual(presets.map((preset) => preset.name), ['奶粉糖霜', '奶蓝云朵', '奶黄布丁', '黑红莓夜', '奶棕暖窝', '黑粉莓月'], 'six preset names match the rewritten soft color families');

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
  'toy-border',
  'icon-paper-stable',
  'icon-body-stable',
  'icon-line-stable',
  'icon-highlight-stable',
  'icon-shadow-stable',
  'icon-charm-theme',
  'icon-charm-theme-2'
];

for (const preset of presets) {
  const applied = theme.setPreset(preset.id);
  for (const key of required) {
    assert.ok(applied.variables[key], `${preset.id} supplies ${key}`);
  }
  assert.equal(document.documentElement.attrs['data-theme'], preset.id, `${preset.id} is applied via theme attribute`);
}


const cream = theme.setPreset('cream-bell');
assert.equal(cream.variables['icon-charm-theme'], '#D889A2', 'milk pink changes only the small icon accent token');
assert.equal(cream.variables['icon-body-stable'], '#E8C9B8', 'stable icon body remains shared');

const soda = theme.setPreset('cloud-soda');
assert.equal(soda.variables['icon-charm-theme'], '#8AB8D0', 'milk blue changes only the small icon accent token');
assert.equal(soda.variables['icon-body-stable'], '#E8C9B8', 'stable icon body remains shared after theme switch');
assert.equal(document.documentElement.attrs['data-theme'], 'cloud-soda', 'switching away updates data-theme');

const creamAgain = theme.setPreset('cream-bell');
assert.equal(creamAgain.variables['icon-charm-theme'], '#D889A2', 'switching back restores the milk pink accent token');
assert.equal(document.documentElement.attrs['data-theme'], 'cream-bell', 'switching back updates data-theme');

const legacy = theme.setPreset('dark-chocolate');
assert.equal(legacy.preset, 'cocoa-night', 'legacy dark preset aliases remain compatible');

console.log('theme preset design token checks passed');
