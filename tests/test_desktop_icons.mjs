import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const ids = ['chat', 'moments', 'settings', 'gallery', 'characters', 'worldbook', 'wallet', 'shop', 'memo', 'anniversary', 'games', 'music', 'dream'];

for (const id of ids) {
  assert.match(source, new RegExp(`id: '${id}'.*character: \\{ label:`), `${id} must define its character in APPS`);
}
assert.equal((source.match(/character: \{ label:/g) || []).length, ids.length, 'all registered apps must have exactly one character definition');
assert.match(source, /id: 'gallery'.*label: '鼓脸生气的小猫'.*expression: 'M43 56c3-3 7-3 10 0'.*M34 43l8 3.*M76 31l5-5/, 'gallery must depict an angry cat with a frown, angled brows, folded paws, and an anger mark');
assert.doesNotMatch(source, /id: 'gallery'.*守着记仇相册的小猫/, 'gallery must no longer use the album scene');
assert.match(source, /function createDefaultAppIcon\(app, size = 28\)/, 'one default icon factory must serve every app');
assert.doesNotMatch(source, /createIcon\(app\.icon/, 'desktop and placeholders must not use a second legacy icon mapping');
assert.match(source, /icon\.appendChild\(createDefaultAppIcon\(app, 28\)\)/, 'placeholder starts with the shared default icon');
assert.match(source, /img\.addEventListener\('error', \(\) => \{ icon\.innerHTML = ''; icon\.appendChild\(createDefaultAppIcon\(app, 28\)\); \}\)/, 'placeholder image failures use the shared default icon');
assert.ok((source.match(/resolveAppIconRecord\(app\)/g) || []).length >= 2, 'desktop and placeholder custom image resolution remains shared');
const factory = source.slice(source.indexOf('function createDefaultAppIcon'), source.indexOf('function getLayer'));
assert.doesNotMatch(factory, /data:image|base64,/i, 'default icon factory must only create inline SVG shapes');

console.log(`desktop icon registry: ${ids.length} character icons verified`);
