import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const appLayer = css.slice(css.indexOf('/* 【全应用软萌组件层】'));

assert.ok(appLayer, 'shared app visual layer exists');
assert.match(appLayer, /#app-layer > \*/, 'every registered app root receives the visual system without a hard-coded app list');
assert.match(appLayer, /\[class\$="-card"\]/, 'app cards share the visual system');
assert.match(appLayer, /\[class\$="-nav"\]/, 'app navigation shares the visual system');
assert.match(appLayer, /button\[class\*="btn"\]/, 'app buttons share the visual system');
assert.match(appLayer, /\[class\$="-item"\]/, 'compact app cards share the visual system');
assert.match(appLayer, /\[class\$="-chip"\]/, 'chips share the capsule visual system');
assert.match(appLayer, /\[class\$="-pill"\]/, 'pills share the capsule visual system');
assert.match(appLayer, /\[class\$="-tag"\]/, 'tags share the capsule visual system');
assert.match(appLayer, /\[class\*="mini-btn"\]/, 'mini buttons keep a dedicated compact treatment');
assert.match(appLayer, /input:not\(\[type="checkbox"\]\)/, 'app fields share the visual system');
assert.match(appLayer, /\[class\$="-empty-icon"\]/, 'app empty illustrations share the visual system');
assert.doesNotMatch(appLayer, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i, 'shared app layer contains no hard-coded colors');
assert.ok(
  [...appLayer.matchAll(/box-shadow:\s*([^;]+);/g)].every(([, value]) => value.trim() === 'none'),
  'shared app layer and later theme overrides do not use box shadows'
);
assert.doesNotMatch(appLayer, /filter:\s*drop-shadow\(/, 'shared app layer and later theme overrides do not use drop shadows');

console.log('kawaii app UI checks passed');
