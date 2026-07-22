import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(page, /function getPrimaryAppIconImageKey\(app\) \{ return `app_icon_\$\{app\.id\}`; \}/, 'app_icon id is the primary icon source');
assert.match(page, /function getWeakAppIconImageKeys\(app\)[\s\S]*`icon_\$\{app\.id\}`[\s\S]*`\$\{app\.id\}_icon`/, 'weak legacy keys are separated from the primary key');
assert.match(page, /const primaryRecord = await readStoredImageRecordExact\(primaryKey\)/, 'primary icon reads bypass alias expansion');
assert.match(page, /for \(const key of weakKeys\)[\s\S]*readStoredImageRecordExact\(key\)/, 'weak icon reads are exact and explicitly tiered');
assert.match(page, /if \(isLegacyDefaultAppIconRecord\(primaryRecord\)\)[\s\S]*clearIconImageKey\(primaryKey\)/, 'legacy primary default SVG cache is cleared');
assert.match(page, /if \(isLegacyDefaultAppIconRecord\(record\)\)[\s\S]*clearIconImageKey\(key\)/, 'legacy weak default SVG cache is cleared');
assert.match(page, /if \(isExplicitUserCustomIconRecord\(record\)\)[\s\S]*migrateWeakIconRecord\(app, key, record\)/, 'explicit user weak-key icon records are migrated before use');
assert.match(page, /function isExplicitUserCustomIconRecord\(record\)[\s\S]*user\|local\|upload\|url[\s\S]*!image\.startsWith\('data:image\/svg'\)/, 'user uploads, URLs, blobs, and non-SVG images remain custom icons');
assert.match(page, /function isLegacyDefaultAppIconRecord\(record\)[\s\S]*cozy-app-icon\|icon-badge-frame\|cream-bell\|badge-soft-half\|badge-stitch/, 'old and generated default SVG markers are recognized as default cache');
assert.doesNotMatch(page, /for \(const key of candidateKeys\) \{ const record = await readImageRecord\(key\)/, 'icon precedence no longer lets readImageRecord alias expansion make weak keys compete as primary');

console.log('desktop icon cache precedence checks passed');
