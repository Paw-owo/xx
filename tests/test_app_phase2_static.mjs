import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_DATA_REGISTRY, APP_EVENT_SPECS } from '../core/app-system-registry.js';

const memoSource = fs.readFileSync(new URL('../apps/memo.js', import.meta.url), 'utf8');
assert.match(memoSource, /const MEMORY_SYNC_KEY = 'app_memo_memory_syncs'/, 'memo sync records use a stable localStorage key');
assert.match(memoSource, /buildMemoMemorySyncKey\(memoId, characterId\)/, 'memo sync relation is keyed by memoId and characterId');
assert.match(memoSource, /existingSync\.signature !== signature/, 'memo only writes a new memory when synced content changed');
assert.match(memoSource, /memoryId = memory\?\.id \|\| ''/, 'memo sync record captures memoryId from AppBus result');
assert.match(memoSource, /memo:memory-synced[\s\S]*action/, 'memo sync event includes action for traceability');
assert.ok(APP_DATA_REGISTRY.memo.localStorageKeys.includes('app_memo_memory_syncs'), 'memo sync key is registered for backup');

const dreamSource = fs.readFileSync(new URL('../apps/dream.js', import.meta.url), 'utf8');
assert.match(dreamSource, /generationStatus: 'created'/, 'successful dream generations are marked created');
assert.match(dreamSource, /generationStatus: 'parse_failed'/, 'parse failures are stored with a distinguishable status');
assert.match(dreamSource, /dream:created[\s\S]*generationStatus/, 'dream created event carries generation status');

const momentsSource = fs.readFileSync(new URL('../apps/moments.js', import.meta.url), 'utf8');
assert.match(momentsSource, /moments:published[\s\S]*auto: true/, 'AI auto moments keep the existing event and mark auto=true');

const pushSource = fs.readFileSync(new URL('../core/push.js', import.meta.url), 'utf8');
assert.match(pushSource, /auto: data\.auto === true/, 'moment push payload preserves auto marker for consumers');
assert.match(pushSource, /generation_status: data\.generationStatus/, 'dream push payload preserves generation status for consumers');

const gameKeys = new Set(APP_DATA_REGISTRY.games.localStorageKeys);
for (const key of ['app_draw_guess_settings', 'app_draw_guess_state', 'app_liars_tavern_settings', 'tarot_game_state', 'truth_game_state']) {
  assert.ok(gameKeys.has(key), `${key} remains registered for backup`);
}

const eventSpecs = new Map(APP_EVENT_SPECS.map((item) => [item.eventName, item]));
assert.ok(eventSpecs.get('memo:memory-synced').payload.includes('action'), 'memo event spec includes action');
assert.ok(eventSpecs.get('dream:created').payload.includes('generationStatus'), 'dream event spec includes generationStatus');

console.log('phase 2 app completion static checks passed');
