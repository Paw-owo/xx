import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_DATA_REGISTRY, APP_EVENT_SPECS } from '../core/app-system-registry.js';

const hubSource = fs.readFileSync(new URL('../apps/games.js', import.meta.url), 'utf8');
const childFiles = [
  '../apps/games/draw-guess.js',
  '../apps/games/liars-tavern.js',
  '../apps/games/tarot.js',
  '../apps/games/truth.js'
];
const childSources = childFiles.map((file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');

const existingGameLocalKeys = new Set([
  ...[...hubSource.matchAll(/const\s+BADGE_KEY\s*=\s*'([^']+)'/g)].map((match) => match[1]),
  ...[...childSources.matchAll(/const\s+(?:SETTINGS_KEY|GAME_KEY|STATE_KEY)\s*=\s*'([^']+)'/g)].map((match) => match[1])
]);

const registeredGameKeys = new Set(APP_DATA_REGISTRY.games.localStorageKeys);
for (const key of existingGameLocalKeys) {
  assert.ok(registeredGameKeys.has(key), `${key} is declared in the games backup registry`);
}

for (const key of ['app_draw_guess_settings', 'app_draw_guess_state', 'app_liars_tavern_settings', 'tarot_game_state', 'truth_game_state']) {
  assert.ok(existingGameLocalKeys.has(key), `${key} exists in current game code`);
  assert.ok(registeredGameKeys.has(key), `${key} remains registered for backup`);
}

const plannedEntries = [...hubSource.matchAll(/status:\s*'planned'[\s\S]*?\n\s*}/g)];
assert.ok(plannedEntries.length > 0, 'planned games remain present in the hub config');
const openGameBody = hubSource.match(/async function openGame\(gameId\) \{([\s\S]*?)\n}\n\nasync function openCustomHtmlGame/)?.[1] || '';
const plannedGuardIndex = openGameBody.indexOf("game.status === 'planned'");
const importIndex = openGameBody.indexOf('import(game.module)');
assert.ok(plannedGuardIndex >= 0, 'planned games are guarded before loading');
assert.ok(importIndex >= 0, 'ready games still use dynamic imports');
assert.ok(plannedGuardIndex < importIndex, 'planned guard runs before dynamic import');
assert.match(openGameBody, /showToast\('这个小世界还在搭建'\)/, 'planned click keeps the current status message');

const gameEvent = APP_EVENT_SPECS.find((item) => item.eventName === 'games:unread-updated');
assert.ok(gameEvent, 'games unread event remains declared');
for (const field of ['source', 'count', 'previousCount', 'action', 'updatedAt']) {
  assert.ok(gameEvent.payload.includes(field), `games unread event payload declares ${field}`);
  assert.match(hubSource, new RegExp(field), `games unread event emit includes ${field}`);
}
assert.doesNotMatch(hubSource, /setData\(BADGE_KEY,\s*[^\n]+\)(?![\s\S]*?games:unread-updated)/, 'badge writes stay behind the unread update event helper');

assert.match(hubSource, /const CUSTOM_HTML_GAME_KEY = 'app_custom_html_game'/, 'custom HTML game uses the established blob key');
assert.match(hubSource, /setDB\('blobs', CUSTOM_HTML_GAME_KEY/, 'custom HTML game saves to the blobs store');
assert.match(hubSource, /deleteDB\('blobs', CUSTOM_HTML_GAME_KEY\)/, 'custom HTML game clears its blob record');
assert.ok(APP_DATA_REGISTRY.games.indexedDBKeys?.blobs?.includes('app_custom_html_game'), 'custom HTML blob key is documented in the game data registry');
assert.ok(APP_DATA_REGISTRY.games.indexedDBKeyPrefixes?.blobs?.includes('app_game_icon_'), 'game icon blob prefix is documented in the game data registry');

console.log('game app integrity checks passed');
