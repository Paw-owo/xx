import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_DATA_REGISTRY, APP_EVENT_SPECS, buildUnreadMapFromData, collectBackupDynamicKeyPrefixes, collectBackupLocalStorageKeys, getRegisteredUnreadSources } from '../core/app-system-registry.js';
import { getBackupLocalKeys, isBackupLocalKey } from '../core/storage-manager.js';

const requiredBackupKeys = [
  'memos',
  'app_memo_visuals',
  'app_memo_memory_syncs',
  'wallet',
  'app_ai_wallets',
  'app_wallet_profile',
  'shop_items',
  'user_profiles',
  'app_user_profiles',
  'active_user_profile_id',
  'app_worldbook_visuals',
  'app_draw_guess_settings',
  'app_draw_guess_state',
  'app_liars_tavern_settings',
  'tarot_game_state',
  'truth_game_state'
];

const backupKeys = collectBackupLocalStorageKeys();
for (const key of requiredBackupKeys) {
  assert.ok(backupKeys.includes(key), `${key} is registered for backup`);
  assert.ok(isBackupLocalKey(key), `${key} is accepted by restore allow-list`);
}

assert.ok(collectBackupDynamicKeyPrefixes().includes('last_moment_'), 'moment cooldown dynamic prefix is registered');
assert.ok(collectBackupDynamicKeyPrefixes().includes('chat_'), 'existing chat dynamic prefix remains registered');
assert.equal(isBackupLocalKey('app_lock_unlocked'), false, 'lock session state remains excluded');
assert.equal(isBackupLocalKey('github_tool_token'), false, 'sensitive tool token remains excluded');

const fakeStorageKeys = ['memos', 'last_moment_char-a', 'github_tool_token', 'app_lock_unlocked'];
const fakeStorage = {
  get length() { return fakeStorageKeys.length; },
  key(index) { return fakeStorageKeys[index] || null; }
};
const liveKeys = getBackupLocalKeys(fakeStorage);
assert.ok(liveKeys.includes('memos'), 'static app registry key appears in backup local keys');
assert.ok(liveKeys.includes('last_moment_char-a'), 'registered dynamic app key appears in backup local keys');
assert.equal(liveKeys.includes('github_tool_token'), false, 'unregistered sensitive key is not collected');
assert.equal(liveKeys.includes('app_lock_unlocked'), false, 'excluded lock state is not collected');

const unreadMap = buildUnreadMapFromData({
  chat_unread_counts: { a: 2, b: 3 },
  chat_group_unread_counts: { g: 4 },
  moments_unread_count: 1,
  games_unread_count: 7
});
assert.deepEqual(unreadMap, { chat: 9, moments: 1, games: 7 }, 'registered unread sources preserve existing counts');
assert.deepEqual(buildUnreadMapFromData({}), {}, 'empty unread data produces no badges');
assert.deepEqual(getRegisteredUnreadSources().map((item) => item.appId), ['chat', 'moments', 'games'], 'existing badge apps migrated to registry');

for (const appId of ['memo', 'wallet', 'shop', 'characters', 'worldbook', 'games']) {
  assert.ok(APP_DATA_REGISTRY[appId], `${appId} has an app data declaration`);
}

const eventNames = APP_EVENT_SPECS.map((item) => item.eventName);
for (const name of ['moments:published', 'dream:created', 'memo:memory-synced', 'games:unread-updated']) {
  assert.ok(eventNames.includes(name), `${name} has an event spec`);
}

const momentsSource = fs.readFileSync(new URL('../apps/moments.js', import.meta.url), 'utf8');
assert.match(momentsSource, /moments:published[\s\S]*auto: true/, 'AI moments emit the existing published event with auto marker');

const memoSource = fs.readFileSync(new URL('../apps/memo.js', import.meta.url), 'utf8');
assert.match(memoSource, /memo:memory-synced/, 'memo emits a memory sync event after AppBus memory write');
assert.match(memoSource, /app_memo_memory_syncs/, 'memo sync records have a stable storage key');

const gamesSource = fs.readFileSync(new URL('../apps/games.js', import.meta.url), 'utf8');
assert.match(gamesSource, /games:unread-updated/, 'games unread changes emit a source event');

const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(page, /buildUnreadMapFromData\(data\)/, 'desktop badges use registered unread source builder');
assert.match(page, /getRegisteredUnreadSources\(\)/, 'desktop reads unread keys from registry');
assert.doesNotMatch(page, /let chatTotal = 0/, 'desktop no longer hard-codes chat badge aggregation');

console.log('app system registry checks passed');
