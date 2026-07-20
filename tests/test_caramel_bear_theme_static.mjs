import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const files = [
  'style.css',
  'index.html',
  'core/default-app-icons.js',
  'core/theme.js',
  'apps/chat/thread-tools.js',
  'assets/ui-skins/default-desktop-wallpaper.svg',
  'assets/ui-skins/default-chat-bg.svg',
  'assets/ui-skins/default-settings-bg.svg',
  'assets/ui-skins/default-dream-bg.svg',
  'assets/ui-skins/default-widget-area.svg'
];

const changedText = files.map((file) => `${file}\n${fs.readFileSync(file, 'utf8')}`).join('\n');

for (const svg of files.filter((file) => file.endsWith('.svg'))) {
  const text = fs.readFileSync(svg, 'utf8');
  assert.doesNotMatch(text, /<pattern\b|patternUnits|url\(#check\)|url\(#paper\)|url\(#dots\)/, `${svg} has no legacy grid, paper, checker, or dot pattern`);
  assert.doesNotMatch(text, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:red|blue|green|yellow|black|white)\b/i, `${svg} uses inherited theme colors only`);
  assert.doesNotMatch(text, /data:image|base64|\.png|\.jpe?g|\.webp/i, `${svg} does not embed binary or external raster assets`);
}

assert.doesNotMatch(changedText, /奶油铃铛|小铃铛/, 'old bell-facing copy has been removed from touched theme files');
assert.doesNotMatch(changedText, /<path class="bell"|<circle class="bell"|\.cozy-app-icon \.icon-decoration \.bell \{ fill/, 'old bell SVG decorations are not rendered');
assert.doesNotMatch(changedText, /data:image\/(?:png|jpe?g|webp)|base64,[A-Za-z0-9+/=]{32,}/, 'no binary data URL was added');
assert.doesNotMatch(changedText, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji were introduced in touched theme files');

const style = fs.readFileSync('style.css', 'utf8');
const caramelStart = style.indexOf('/* 焦糖小熊主题补齐层');
assert.ok(caramelStart > 0, 'caramel bear scoped layer exists');
const caramelBlock = style.slice(caramelStart);
assert.doesNotMatch(caramelBlock, /(^|\n)(?!\s*(?:\/\*|\*|$|@keyframes))(?!(?:\s*:root\[data-theme="cream-bell"\]|\s*}\s*$|\s*[\w-]+:|\s*\)|\s*,|\s*radial-gradient|\s*linear-gradient|\s*color-mix|\s*var\(|\s*transparent|\s*from|\s*to))/m, 'new caramel selectors stay scoped to the target theme');
assert.doesNotMatch(caramelBlock, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:red|blue|green|yellow|black|white)\b/i, 'new caramel layer has no hard-coded colors');

const icons = fs.readFileSync('core/default-app-icons.js', 'utf8');
assert.equal((icons.match(/^[ ]{2}['\w-]+:/gm) || []).length, 14, 'icon drawing map covers all default app ids');
assert.doesNotMatch(icons, /CREAM_BELL_DRAWINGS|class="bell"|class="bow"/, 'icon factory no longer keeps old bell or bow drawing set');

for (const file of fs.readdirSync('.', { withFileTypes: true })) {
  if (file.isFile()) assert.doesNotMatch(file.name, /\.(png|jpe?g|webp|ttf|otf)$/i, `no new root binary asset ${file.name}`);
}

console.log('caramel bear static theme checks passed');
