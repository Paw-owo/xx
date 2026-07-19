import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectBackupLocalStorageKeys, APP_EVENT_SPECS, getRegisteredUnreadSources } from '../core/app-system-registry.js';

const backupKeys = new Set(collectBackupLocalStorageKeys());
assert.ok(backupKeys.has('app_memo_memory_syncs'), 'memo memory sync map is registered for backup');

const eventSpecs = new Map(APP_EVENT_SPECS.map((item) => [item.eventName, item]));
assert.deepEqual(eventSpecs.get('moments:published')?.payload, ['id', 'content', 'authorId', 'authorName', 'timestamp', 'auto'], 'moments published payload keeps auto field');
assert.ok(eventSpecs.has('dream:created'), 'dream created event remains registered');
assert.ok(eventSpecs.has('memo:memory-synced'), 'memo memory sync event remains registered');
assert.ok(eventSpecs.has('games:unread-updated'), 'games unread event remains registered');

const momentsSource = fs.readFileSync(new URL('../apps/moments.js', import.meta.url), 'utf8');
assert.match(momentsSource, /moments:published[\s\S]*auto:\s*true/, 'auto moments still emit moments:published with auto true');
assert.match(momentsSource, /moments:published[\s\S]*auto:\s*false/, 'user moments emit moments:published with explicit auto false');

const dreamSource = fs.readFileSync(new URL('../apps/dream.js', import.meta.url), 'utf8');
assert.match(dreamSource, /generationStatus:\s*'generated'/, 'parsed dreams are marked generated');
assert.match(dreamSource, /generationStatus:\s*'parse_failed'/, 'parse failures are marked parse_failed');
assert.match(dreamSource, /if \(dream\.generationStatus === 'parse_failed'\) return;/, 'parse_failed dreams are not handled as normal generated dreams');
assert.doesNotMatch(dreamSource, /deleteDB\('dreams'[\s\S]*parse_failed/, 'parse_failed compatibility does not delete dreams');

const memoSource = fs.readFileSync(new URL('../apps/memo.js', import.meta.url), 'utf8');
assert.match(memoSource, /const MEMORY_SYNCS_KEY = 'app_memo_memory_syncs'/, 'memo sync map key remains declared');
assert.match(memoSource, /getMemoSync\(syncs, memoId, syncCharacterId\)/, 'memo save checks previous memory sync before writing');
assert.match(memoSource, /editMemory\(syncCharacterId, previousSync\.memoryId/, 'memo edit reuses existing synced memory');
assert.match(memoSource, /memo:memory-synced/, 'memo sync event remains emitted');

const gamesSource = fs.readFileSync(new URL('../apps/games.js', import.meta.url), 'utf8');
assert.match(gamesSource, /const BADGE_KEY = 'games_unread_count'/, 'games unread count key remains the badge source');
assert.match(gamesSource, /setData\(BADGE_KEY, next\)[\s\S]*games:unread-updated/, 'games unread writes emit the unified event');
assert.match(gamesSource, /status:\s*'planned'/, 'planned games remain visible in the hub declaration');

const unreadAppIds = getRegisteredUnreadSources().map((item) => item.appId);
assert.deepEqual(unreadAppIds, ['chat', 'moments', 'games'], 'phase 4 does not add new desktop unread sources');

console.log('phase 4 app integrity checks passed');
