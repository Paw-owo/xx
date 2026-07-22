import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(page, /window\.__AI_PHONE_BOOT_STATE/, 'boot state is created before the module starts');

const bootStateIndex = page.indexOf('const bootState = window.__AI_PHONE_BOOT_STATE');
const bootCallIndex = page.indexOf('boot();');
assert.ok(bootStateIndex > -1 && bootCallIndex > -1 && bootStateIndex < bootCallIndex, 'boot state is initialized before boot and optional stages use it');
assert.match(page, /window\.addEventListener\('error'[\s\S]*module:loading/, 'module import failures show a boot error instead of waking forever');
assert.match(page, /bootState\.stage = stage;[\s\S]*console\.info\(`\[boot\] start \$\{stage\}`\)/, 'boot logs and records the active stage before each core task');
assert.match(page, /bootState\.ready = true;[\s\S]*hideBootLoading\(\)/, 'successful boot marks ready before hiding the loading layer');
assert.match(page, /renderBootError\(error\)[\s\S]*loading-detail/, 'core boot failures render a visible stage detail');

assert.match(page, /function logDesktopFailure\(stage, error, meta = \{\}\)/, 'desktop recoverable failures have a shared logger');
assert.match(page, /catch \(error\) \{\s*logDesktopFailure\('dock-app', error, \{ appId \}\);\s*\}/, 'a single dock app failure is isolated with app id');
assert.match(page, /catch \(error\) \{\s*logDesktopFailure\('desktop-app', error, \{ appId: app\.id \}\);\s*\}/, 'a single desktop app failure is isolated with app id');
assert.match(page, /catch \(error\) \{\s*logDesktopFailure\('widget', error, \{ widgetId: widget\.id \}\);\s*\}/, 'a single built-in widget failure is isolated');
assert.match(page, /catch \(error\) \{\s*logDesktopFailure\('custom-widget', error, \{ widgetId: widget\?\.id \|\| index \}\);\s*\}/, 'a single custom widget failure is isolated');

assert.match(page, /safeApplyImageStage\('app-icons', applyAppIconImages\)/, 'app icon image application is an optional image stage');
assert.match(page, /async function safelyApplyAppIconImage\(iconEl\)/, 'each app icon image is applied independently');
assert.match(page, /const nextNodes = \[\];[\s\S]*artEl\.replaceChildren\(\.\.\.nextNodes\.filter\(Boolean\)\)/, 'app icon replacement builds the next content before replacing old nodes');
assert.match(page, /catch \(error\) \{\s*logDesktopFailure\('app-icon', error, \{ appId: app\.id \}\);[\s\S]*artEl\.replaceChildren\(createDefaultAppIcon\(app, 28\)\)/, 'icon cache failures fall back per app without stopping the desktop');
assert.doesNotMatch(page, /artEl\.innerHTML = '';\s*artEl\.classList\.toggle\('has-custom-image'/, 'icon image application no longer clears before all cache parsing succeeds');

console.log('desktop boot resilience checks passed');
