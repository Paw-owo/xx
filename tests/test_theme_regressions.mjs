import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key)
};

const styles = new Map();
const attributes = new Map();
globalThis.document = {
  documentElement: {
    style: { setProperty: (key, value) => styles.set(key, value) },
    setAttribute: (key, value) => attributes.set(key, value)
  },
  querySelector: () => null
};

const { importTheme, loadTheme } = await import('../core/theme.js');

importTheme({ preset: 'dark-chocolate', variables: { accent: '#123456' } });
assert.equal(styles.get('--accent'), '#123456', 'an imported variables override is applied');
assert.equal(
  JSON.parse(values.get('app_theme')).customVariables.accent,
  '#123456',
  'variables-only imports are persisted as custom variables'
);

styles.clear();
loadTheme();
assert.equal(styles.get('--accent'), '#123456', 'an imported variables override survives reload');

const savedTheme = JSON.parse(values.get('app_theme'));
assert.equal(
  savedTheme.variables['bubble-user-text'],
  '#28201F',
  'dark user bubbles use a dark foreground instead of light primary text'
);

console.log('theme regression checks passed');
