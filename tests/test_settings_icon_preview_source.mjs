import assert from 'node:assert/strict';
import fs from 'node:fs';

const settings = fs.readFileSync(new URL('../apps/settings.js', import.meta.url), 'utf8');

assert.match(settings, /import \{ createDefaultAppIcon \} from '\.\.\/core\/default-app-icons\.js';/, 'settings imports the desktop default icon factory');
assert.match(settings, /const previewRecord = await readSettingsIconRecord\(app, icons\)/, 'settings icon page reads preview data through the shared precedence helper');
assert.match(settings, /const previewEl = appIconPreview\(app, image, displayName\)/, 'settings icon page uses app icon preview instead of a generic icon fallback');
assert.match(settings, /function appIconPreview\(app, src, label = '应用图标'\)[\s\S]*box\.append\(createDefaultAppIcon\(app, 28\)\)/, 'empty settings icon previews render the default factory output');
assert.match(settings, /img\.addEventListener\('error', renderDefault\)/, 'broken custom preview images fall back to the default factory output');
assert.match(settings, /function getSettingsPrimaryIconKey\(app\) \{ return `app_icon_\$\{app\.id\}`; \}/, 'settings uses the same primary app icon key');
assert.match(settings, /function getSettingsWeakIconKeys\(app\)[\s\S]*`icon_\$\{app\.id\}`[\s\S]*`\$\{app\.id\}_icon`/, 'settings keeps weak legacy aliases tiered separately');
assert.match(settings, /if \(isLegacyDefaultIconPreview\(primaryRecord\)\)[\s\S]*clearSettingsIconKey\(primaryKey\)/, 'settings clears legacy default SVG cache from the primary key');
assert.match(settings, /if \(isLegacyDefaultIconPreview\(record\)\)[\s\S]*clearSettingsIconKey\(key\)/, 'settings clears legacy default SVG cache from weak aliases');
assert.match(settings, /if \(isExplicitUserIconPreview\(record\)\)[\s\S]*migrateSettingsWeakIconRecord\(app, key, record\)/, 'settings migrates explicit user weak-key icons into the primary key');
assert.match(settings, /cozy-app-icon\|icon-badge-frame\|cream-bell\|badge-soft-half\|badge-stitch/, 'settings recognizes old and generated default SVG markers');
assert.doesNotMatch(settings, /const previewEl = imagePreview\(image \|\| '', custom\.name \|\| name, isHidden \? 'settings' : 'star'\)/, 'settings no longer uses star/settings generic icons as default app previews');

console.log('settings icon preview source checks passed');
