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
assert.deepEqual(
  presets.map((preset) => preset.name),
  ['奶黄', '奶粉', '奶蓝', '黑红', '奶棕', '黑粉'],
  'default theme names match the shared soft-cute palette set'
);
assert.ok(!presets.some((preset) => preset.name === '焦糖小熊'), 'caramel bear is not kept as a standalone theme name');

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
  'cream-bell-lace',
  'cream-bell-dots',
  'cream-bell-plaid',
  'cream-bell-badge-display',
  'cream-bell-charm-opacity'
];

for (const preset of presets) {
  const applied = theme.setPreset(preset.id);
  for (const key of required) {
    assert.ok(applied.variables[key], `${preset.id} supplies ${key}`);
  }
  assert.equal(document.documentElement.attrs['data-theme'], preset.id, `${preset.id} is applied via theme attribute`);
}

const iconLineColors = presets.map((preset) => theme.setPreset(preset.id).variables['icon-line-stable']);
assert.equal(new Set(iconLineColors).size, presets.length, 'each preset supplies a distinct icon line color so switching themes recolors default app icons');
for (const preset of presets) {
  const applied = theme.setPreset(preset.id);
  assert.match(applied.variables['icon-body-stable'], /var\(--surface-paper\).*var\(--decor-blue\)/, `${preset.id} icon body is derived from theme CSS variables`);
  assert.match(applied.variables['icon-layer-stable'], /var\(--bg-card\).*var\(--decor-blue\)/, `${preset.id} icon layer is derived from theme CSS variables`);
  assert.match(applied.variables['icon-highlight-stable'], /var\(--bg-card\)/, `${preset.id} icon highlight is derived from theme CSS variables`);
}


const cream = theme.setPreset('cream-bell');
assert.equal(cream.variables['cream-bell-badge-display'], 'block', 'cream-bell turns on badge SVG frame');
assert.equal(cream.variables['cream-bell-lace'], 'none', 'cream-bell does not add decorative background lace');
assert.equal(cream.variables['cream-bell-dots'], 'none', 'cream-bell does not add decorative background dots');
assert.equal(cream.variables['cream-bell-plaid'], 'none', 'cream-bell does not add decorative background plaid');

const soda = theme.setPreset('cloud-soda');
assert.equal(soda.variables['cream-bell-badge-display'], 'block', 'other themes share the soft SVG badge frame');
assert.equal(soda.variables['cream-bell-lace'], 'none', 'other themes do not inherit lace resource');
assert.equal(soda.variables['cream-bell-plaid'], 'none', 'other themes do not inherit plaid resource');
assert.equal(document.documentElement.attrs['data-theme'], 'cloud-soda', 'switching away updates data-theme');

const creamAgain = theme.setPreset('cream-bell');
assert.equal(creamAgain.variables['cream-bell-badge-display'], 'block', 'switching back keeps the shared badge SVG frame');
assert.equal(creamAgain.variables['cream-bell-lace'], 'none', 'switching back keeps decorative background lace disabled');
assert.equal(document.documentElement.attrs['data-theme'], 'cream-bell', 'switching back updates data-theme');


const legacyName = theme.setPreset('焦糖小熊');
assert.equal(legacyName.preset, 'cream-bell', 'old stored display names map to the current preset id');
assert.equal(theme.getThemePresets().find((preset) => preset.id === legacyName.preset)?.name, '奶黄', 'old stored display names render through the current preset source');

const legacy = theme.setPreset('dark-chocolate');
assert.equal(legacy.preset, 'cocoa-night', 'legacy dark preset aliases remain compatible');

console.log('theme preset design token checks passed');
