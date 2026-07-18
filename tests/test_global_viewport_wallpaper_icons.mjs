import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const thread = readFileSync(new URL('../apps/chat/thread.js', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../apps/settings.js', import.meta.url), 'utf8');
const viewport = readFileSync(new URL('../core/viewport.js', import.meta.url), 'utf8');

assert.match(index, /initViewportManager\(\)/, 'desktop shell must initialize the shared viewport manager');
assert.match(viewport, /visualViewport/);
assert.match(viewport, /offsetTop/);
assert.match(viewport, /--app-viewport-height/);
assert.match(viewport, /--app-keyboard-inset/);
assert.doesNotMatch(thread, /chat-keyboard-offset|keyboardViewportHandler/, 'chat must not subtract keyboard height a second time');
assert.doesNotMatch(styles, /\.bottom-sheet\s*\{[^}]*--app-keyboard-inset/s, 'bottom sheets sized by the visual viewport must not also move by the full keyboard inset');
assert.doesNotMatch(readFileSync(new URL('../core/ui.js', import.meta.url), 'utf8'), /\.bottom-sheet\s*\{[^}]*--app-keyboard-inset/s, 'shared bottom sheets must consume the visual viewport only once');
assert.match(styles, /\.phone-desktop\.has-image \.desktop-soft-layer\s*\{\s*display: none;/);
assert.ok(settings.includes('window.AppImages.removeImageRecord(key)'), 'wallpaper clear must remove legacy aliases through the existing image source');
assert.ok(settings.includes('window.AppImages.removeAppIconImage(id)'), 'icon clear must use the unified image source');
assert.match(index, /function getAppIconImageKeys\(app\)[\s\S]*app_icon_\$\{app\.id\}[\s\S]*app_\$\{app\.id\}_icon[\s\S]*icon_\$\{app\.id\}/, 'icon reads and clears must share all compatibility aliases');
assert.match(index, /const image = blobImage \|\| localImage;/, 'the current canonical icon record must win over stale local cache fields');
assert.match(index, /collectObjectUrls[\s\S]*revokeObjectUrls/, 'image deletion must release obsolete Blob URLs');
assert.match(index, /const preserved = Object\.fromEntries/, 'icon clearing must preserve non-image custom properties');

console.log('global viewport, icon background, and wallpaper checks passed');
