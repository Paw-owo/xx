import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const files = [
  'style.css',
  'index.html',
  'core/default-app-icons.js',
  'core/theme.js',
  'apps/chat/thread-tools.js'
];

const changedText = files.map((file) => `${file}\n${fs.readFileSync(file, 'utf8')}`).join('\n');

for (const file of fs.readdirSync('assets/ui-skins', { withFileTypes: true })) {
  assert.doesNotMatch(file.name, /^default-.*\.svg$/i, `legacy decorative default skin asset was removed: ${file.name}`);
}

assert.doesNotMatch(changedText, /assets\/ui-skins\/default-[^'"`\s]+\.svg/, 'default decorative SVG skin references were removed');

assert.doesNotMatch(changedText, /奶油铃铛|小铃铛|焦糖小熊/, 'old standalone theme copy has been removed from touched theme files');
assert.doesNotMatch(changedText, /<path class="bell"|<circle class="bell"|\.cozy-app-icon \.icon-decoration \.bell \{ fill/, 'old bell SVG decorations are not rendered');
assert.doesNotMatch(changedText, /data:image\/(?:png|jpe?g|webp)|base64,[A-Za-z0-9+/=]{32,}/, 'no binary data URL was added');
assert.doesNotMatch(changedText, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji were introduced in touched theme files');

const style = fs.readFileSync('style.css', 'utf8');
const sharedStart = style.lastIndexOf('/* 公共软萌主题补齐层');
assert.ok(sharedStart > 0, 'shared soft-cute layer exists');
const sharedBlock = style.slice(sharedStart);
assert.doesNotMatch(sharedBlock, /(^|\n)(?!\s*(?:\/\*|\*|$|@keyframes))(?!(?:\s*:root|\s*}\s*$|\s*[\w-]+:|\s*\)|\s*,|\s*radial-gradient|\s*linear-gradient|\s*color-mix|\s*var\(|\s*transparent|\s*from|\s*to))/m, 'shared soft-cute selectors stay in the root layer');
assert.doesNotMatch(sharedBlock, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:red|blue|green|yellow|black|white)\b/i, 'shared soft-cute layer has no hard-coded colors');
assert.match(sharedBlock, /:root[^{}]*(?:\.phone-desktop|#app-layer > \*)[^{}]*\{[\s\S]*?var\(--bg-primary\)/s, 'shared page backgrounds still resolve through theme variables');
assert.doesNotMatch(sharedBlock, /desktop-journal-layer[\s\S]*?radial-gradient/, 'shared desktop journal layer has no decorative radial background');
assert.match(sharedBlock, /theme-center::before[\s\S]*?content:\s*none/, 'shared layer removes theme center decorative pseudo background');
assert.match(sharedBlock, /dream-hero::before[\s\S]*?content:\s*none/, 'shared layer removes dream hero decorative pseudo background');

const icons = fs.readFileSync('core/default-app-icons.js', 'utf8');
assert.equal((icons.match(/^[ ]{2}['\w-]+:/gm) || []).length, 14, 'icon drawing map covers all default app ids');
assert.doesNotMatch(icons, /CREAM_BELL_DRAWINGS|class="bell"|class="bow"/, 'icon factory no longer keeps old bell or bow drawing set');

for (const file of fs.readdirSync('.', { withFileTypes: true })) {
  if (file.isFile()) assert.doesNotMatch(file.name, /\.(png|jpe?g|webp|ttf|otf)$/i, `no new root binary asset ${file.name}`);
}

console.log('shared soft-cute static theme checks passed');
