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

assert.doesNotMatch(changedText, /奶油铃铛|小铃铛/, 'old bell-facing copy has been removed from touched theme files');
assert.doesNotMatch(changedText, /<path class="bell"|<circle class="bell"|\.cozy-app-icon \.icon-decoration \.bell \{ fill/, 'old bell SVG decorations are not rendered');
assert.doesNotMatch(changedText, /data:image\/(?:png|jpe?g|webp)|base64,[A-Za-z0-9+/=]{32,}/, 'no binary data URL was added');
assert.doesNotMatch(changedText, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji were introduced in touched theme files');

const style = fs.readFileSync('style.css', 'utf8');
assert.match(style, /\/\* Rewritten desktop icon color system/, 'rewritten desktop icon system layer exists');
assert.doesNotMatch(style, /cream-bell-badge-display|caramel-stitch|cookie-dot/, 'old caramel badge icon tokens are gone');
assert.doesNotMatch(style, /\.cozy-app-icon \.icon-badge-frame/, 'old shared badge frame styling is gone');
assert.match(style, /--icon-paper-stable/, 'stable paper token is present');
assert.match(style, /--icon-body-stable/, 'stable body token is present');
assert.match(style, /--icon-line-stable/, 'stable line token is present');
assert.match(style, /--icon-highlight-stable/, 'stable highlight token is present');
assert.match(style, /--icon-shadow-stable/, 'stable shadow token is present');
assert.match(style, /--icon-charm-theme-2/, 'secondary small accent token is present');

const icons = fs.readFileSync('core/default-app-icons.js', 'utf8');
assert.equal((icons.match(/^[ ]{2}['\w-]+:/gm) || []).length, 14, 'icon drawing map covers all default app ids');
assert.doesNotMatch(icons, /CREAM_BELL_DRAWINGS|class="bell"|class="bow"/, 'icon factory no longer keeps old bell or bow drawing set');

for (const file of fs.readdirSync('.', { withFileTypes: true })) {
  if (file.isFile()) assert.doesNotMatch(file.name, /\.(png|jpe?g|webp|ttf|otf)$/i, `no new root binary asset ${file.name}`);
}

console.log('caramel bear static theme checks passed');
