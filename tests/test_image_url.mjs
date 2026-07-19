import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PUBLIC_IMAGE_HOST, normalizeHttpImageUrl } from '../core/image-url.js';

assert.equal(normalizeHttpImageUrl('  https://example.com/a.png  '), 'https://example.com/a.png');
assert.equal(normalizeHttpImageUrl('http://example.com/a.jpg'), 'http://example.com/a.jpg');
assert.equal(normalizeHttpImageUrl('data:image/png;base64,abc'), '');
assert.equal(normalizeHttpImageUrl('javascript:alert(1)'), '');
assert.equal(normalizeHttpImageUrl('not a url'), '');
assert.equal(PUBLIC_IMAGE_HOST.url, 'https://postimages.org/');

const customImageModules = [
  'apps/settings.js', 'apps/characters.js', 'apps/chat/thread-settings.js',
  'apps/anniversary.js', 'apps/memo.js', 'apps/worldbook.js', 'apps/wallet.js',
  'apps/games.js', 'apps/games/draw-guess.js', 'apps/games/liars-tavern.js',
  'apps/games/tarot.js', 'apps/games/truth.js', 'apps/shop.js', 'apps/music.js'
];

for (const file of customImageModules) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.match(source, /promptForRemoteImage/, `${file} must reuse the shared URL validator`);
  assert.match(source, /图片 URL/, `${file} must expose an image URL action`);
  assert.match(source, /清除|清背景|清图片/, `${file} must expose a clear action`);
}

console.log('image URL validation tests passed');
