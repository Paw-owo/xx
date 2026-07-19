import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectBackupLocalStorageKeys, APP_EVENT_SPECS, getRegisteredUnreadSources } from '../core/app-system-registry.js';

const backupKeys = new Set(collectBackupLocalStorageKeys());

const requiredByApp = {
  wallet: ['wallet', 'app_ai_wallets', 'app_wallet_profile'],
  shop: ['shop_items'],
  characters: ['user_profiles', 'app_user_profiles', 'active_user_profile_id'],
  worldbook: ['app_worldbook_visuals'],
  games: [
    'games_unread_count',
    'app_game_hub_visual',
    'app_game_visuals',
    'app_draw_guess_settings',
    'app_draw_guess_state',
    'app_liars_tavern_settings',
    'tarot_game_state',
    'truth_game_state'
  ],
  settingsFallbacksUsedByGames: ['app_settings', 'app_user']
};

for (const [appId, keys] of Object.entries(requiredByApp)) {
  for (const key of keys) {
    assert.ok(backupKeys.has(key), `${appId} localStorage key ${key} is registered for backup`);
  }
}

const eventNames = new Set(APP_EVENT_SPECS.map((item) => item.eventName));
assert.ok(eventNames.has('wallet:transfer'), 'wallet transfer event remains registered');
assert.ok(eventNames.has('shop:gift'), 'shop gift event remains registered');

const unreadAppIds = getRegisteredUnreadSources().map((item) => item.appId);
assert.deepEqual(unreadAppIds, ['chat', 'moments', 'games'], 'phase 3 does not add wallet/shop independent unread badges');

const sourceExpectations = [
  ['apps/wallet.js', ['WALLET_KEY', 'AI_WALLETS_KEY', 'PROFILE_KEY'], ['wallet:transfer']],
  ['apps/shop.js', ['SHOP_KEY'], ['shop:gift']],
  ['apps/characters.js', ['USER_PROFILES_KEY', 'LEGACY_USER_PROFILES_KEY', 'ACTIVE_PROFILE_KEY'], []],
  ['apps/worldbook.js', ['VISUALS_KEY'], []],
  ['apps/games.js', ['HUB_PROFILE_KEY', 'GAME_VISUALS_KEY', 'BADGE_KEY'], ['games:unread-updated']],
  ['apps/games/draw-guess.js', ['SETTINGS_KEY', 'GAME_KEY'], []],
  ['apps/games/liars-tavern.js', ['SETTINGS_KEY'], []],
  ['apps/games/tarot.js', ['STATE_KEY'], []],
  ['apps/games/truth.js', ['STATE_KEY'], []]
];

for (const [file, constants, snippets] of sourceExpectations) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const constantName of constants) {
    assert.match(source, new RegExp(`const\\s+${constantName}\\s*=`), `${file} still declares ${constantName}`);
  }
  for (const snippet of snippets) {
    assert.ok(source.includes(snippet), `${file} still contains ${snippet}`);
  }
}

const gamesHubSource = fs.readFileSync(new URL('../apps/games.js', import.meta.url), 'utf8');
assert.match(gamesHubSource, /status:\s*'planned'/, 'planned games remain declared');
assert.doesNotMatch(gamesHubSource, /setData\([^)]*app_custom_html_game/, 'custom HTML game is not treated as localStorage state');

console.log('phase 3 app data registry checks passed');
