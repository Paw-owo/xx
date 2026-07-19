import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const uiSource = fs.readFileSync(new URL('core/ui.js', root), 'utf8');
const iconBlockMatch = uiSource.match(/const ICON_PATHS = \{([\s\S]*?)\n\};/);
assert.ok(iconBlockMatch, 'ICON_PATHS table exists');

const iconNames = new Set();
for (const match of iconBlockMatch[1].matchAll(/^\s*(?:"([^"]+)"|([A-Za-z0-9_-]+))\s*:/gm)) {
  iconNames.add(match[1] || match[2]);
}

const filesToCheck = [
  'index.html',
  ...walk('apps'),
  ...walk('core')
].filter((file) => /\.(?:js|html)$/.test(file));

const missing = [];
for (const file of filesToCheck) {
  const source = fs.readFileSync(new URL(file, root), 'utf8');
  for (const match of source.matchAll(/createIcon\(\s*['"]([^'"]+)['"]/g)) {
    const name = match[1];
    if (!iconNames.has(name)) missing.push(`${file}: ${name}`);
  }
}

assert.deepEqual(missing, [], `createIcon names must exist in ICON_PATHS:\n${missing.join('\n')}`);
console.log('core icon usage checks passed');

function walk(dir) {
  const absolute = new URL(`${dir}/`, root);
  const result = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result;
}
