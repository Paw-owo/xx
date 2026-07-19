import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_DATA_REGISTRY, APP_EVENT_SPECS, collectBackupLocalStorageKeys } from '../core/app-system-registry.js';

const backupKeys = new Set(collectBackupLocalStorageKeys());
for (const key of ['app_grudge_settings', 'anniversary_items', 'app_anniversary', 'cloud_models']) {
  assert.ok(backupKeys.has(key), `${key} is registered for backup`);
}

assert.ok(APP_DATA_REGISTRY.chat.localStorageKeys.includes('app_grudge_settings'), 'grudge settings are registered with chat data');
assert.ok(APP_DATA_REGISTRY.anniversary.localStorageKeys.includes('anniversary_items'), 'legacy anniversary_items fallback stays backed up');
assert.ok(APP_DATA_REGISTRY.anniversary.localStorageKeys.includes('app_anniversary'), 'legacy app_anniversary fallback stays backed up');
assert.ok(APP_DATA_REGISTRY.settings.localStorageKeys.includes('cloud_models'), 'cloud model settings are backed up as user settings');

const uiSource = fs.readFileSync(new URL('../core/ui.js', import.meta.url), 'utf8');
assert.match(uiSource, /"arrow-right":\s*\[\["path"/, 'arrow-right icon is registered in core icon paths');
assert.match(uiSource, /"chevron-left":\s*\[\["path"/, 'chevron-left icon remains registered in core icon paths');

const event = APP_EVENT_SPECS.find((item) => item.eventName === 'worldbook:updated');
assert.ok(event, 'worldbook updated event is declared');
assert.equal(event.sourceApp, 'worldbook', 'worldbook updated event source app is worldbook');
assert.deepEqual(event.payload, ['entryId', 'deleted', 'saved', 'isEdit'], 'worldbook updated event payload is declared');
assert.deepEqual(event.consumers, [], 'worldbook updated event has no new consumers');

const worldbookSource = fs.readFileSync(new URL('../apps/worldbook.js', import.meta.url), 'utf8');
assert.match(worldbookSource, /worldbook:updated/, 'worldbook app still emits the existing event name');

console.log('phase 5 registry icon event checks passed');
