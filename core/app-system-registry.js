// core/app-system-registry.js
// Central declarations for app-owned backup keys, AppBus events and desktop unread sources.
// This file is declarative only: it does not read/write storage by itself.

export const APP_DATA_REGISTRY = Object.freeze({
  chat: {
    localStorageKeys: [
      'chat_unread_counts',
      'chat_group_unread_counts',
      'chat_hidden_private_threads',
      'chat_last_route',
      'chat_active_thread',
      'chat_draft_map',
      'chat_pinned_threads',
      'chat_archived_threads'
    ],
    dynamicKeyPrefixes: ['chat_', 'app_bg_chat_opacity_', 'push_msg_watermark_'],
    backup: true
  },
  moments: {
    localStorageKeys: ['moments_unread_count', 'moment_interaction_state'],
    dynamicKeyPrefixes: ['last_moment_'],
    backup: true
  },
  characters: {
    localStorageKeys: ['user_profiles', 'app_user_profiles', 'active_user_profile_id'],
    dynamicKeyPrefixes: [],
    backup: true
  },
  worldbook: {
    localStorageKeys: ['app_worldbook_visuals'],
    dynamicKeyPrefixes: [],
    backup: true
  },
  wallet: {
    localStorageKeys: ['wallet', 'app_ai_wallets', 'app_wallet_profile'],
    dynamicKeyPrefixes: [],
    backup: true
  },
  shop: {
    localStorageKeys: ['shop_items'],
    dynamicKeyPrefixes: [],
    backup: true
  },
  memo: {
    localStorageKeys: ['memos', 'app_memo_visuals', 'app_memo_memory_syncs'],
    dynamicKeyPrefixes: [],
    backup: true
  },
  anniversary: {
    localStorageKeys: [
      'anniversaries',
      'app_anniversaries',
      'anniversary_list',
      'app_anniversary_visuals',
      'app_anniversary_profile',
      'app_anniversary_greeted'
    ],
    dynamicKeyPrefixes: [],
    backup: true
  },
  games: {
    localStorageKeys: [
      'games_unread_count',
      'app_game_hub_visual',
      'app_game_visuals',
      'app_draw_guess_settings',
      'app_draw_guess_state',
      'app_liars_tavern_settings',
      'tarot_game_state',
      'truth_game_state'
    ],
    dynamicKeyPrefixes: [],
    backup: true
  },
  music: {
    localStorageKeys: ['music_app_settings', 'music_current_song'],
    dynamicKeyPrefixes: [],
    backup: true
  },
  dream: {
    localStorageKeys: ['app_dream_last_gen', 'app_dream_config'],
    dynamicKeyPrefixes: [],
    backup: true
  },
  settings: {
    localStorageKeys: [
      'app_settings',
      'app_theme',
      'app_theme_preset',
      'app_theme_mode',
      'app_icons',
      'app_hidden_icons',
      'app_icon_positions',
      'app_widget_positions',
      'app_widget_backgrounds',
      'desktop_layout_scale',
      'app_custom_font_meta',
      'app_custom_widgets',
      'app_wallpaper_opacity',
      'app_focus_widget',
      'app_first_open_seed',
      'app_api_pool_groups'
    ],
    dynamicKeyPrefixes: [],
    backup: true
  },
  cloud: {
    localStorageKeys: ['app_cloud_server'],
    dynamicKeyPrefixes: [],
    backup: true
  }
});

export const BACKUP_LOCAL_STORAGE_KEYS = Object.freeze(uniqueFlat(
  Object.values(APP_DATA_REGISTRY)
    .filter((item) => item.backup !== false)
    .map((item) => item.localStorageKeys || [])
));

export const BACKUP_DYNAMIC_KEY_PREFIXES = Object.freeze(uniqueFlat(
  Object.values(APP_DATA_REGISTRY)
    .filter((item) => item.backup !== false)
    .map((item) => item.dynamicKeyPrefixes || [])
));

export const APP_UNREAD_SOURCES = Object.freeze([
  {
    appId: 'chat',
    keys: ['chat_unread_counts', 'chat_group_unread_counts'],
    getCount(data = {}) {
      return sumObjectValues(data.chat_unread_counts) + sumObjectValues(data.chat_group_unread_counts);
    },
    clearKeys: ['chat_unread_counts', 'chat_group_unread_counts']
  },
  {
    appId: 'moments',
    keys: ['moments_unread_count'],
    getCount(data = {}) {
      return safeCount(data.moments_unread_count);
    },
    clearKeys: ['moments_unread_count']
  },
  {
    appId: 'games',
    keys: ['games_unread_count'],
    getCount(data = {}) {
      return safeCount(data.games_unread_count);
    },
    clearKeys: ['games_unread_count']
  }
]);

export const APP_EVENT_SPECS = Object.freeze([
  {
    eventName: 'moments:published',
    sourceApp: 'moments',
    payload: ['id', 'content', 'authorId', 'authorName', 'timestamp', 'auto'],
    consumers: ['core/push.js']
  },
  {
    eventName: 'moments:interaction',
    sourceApp: 'moments',
    payload: ['type', 'characterId', 'postId', 'content'],
    consumers: []
  },
  {
    eventName: 'dream:created',
    sourceApp: 'dream',
    payload: ['dreamId', 'characterId', 'mood', 'summary', 'createdAt', 'generationStatus'],
    consumers: ['core/push.js']
  },
  {
    eventName: 'memo:memory-synced',
    sourceApp: 'memo',
    payload: ['memoId', 'characterId', 'title', 'category', 'memoryId', 'action'],
    consumers: []
  },
  {
    eventName: 'games:unread-updated',
    sourceApp: 'games',
    payload: ['source', 'count', 'action'],
    consumers: ['index.html']
  },
  {
    eventName: 'shop:gift',
    sourceApp: 'shop',
    payload: ['characterId', 'direction', 'itemName', 'itemId', 'note', 'characterName'],
    consumers: ['core/chat-event-bridge.js']
  },
  {
    eventName: 'wallet:transfer',
    sourceApp: 'wallet',
    payload: ['characterId', 'direction', 'amount', 'note', 'characterName'],
    consumers: ['core/chat-event-bridge.js']
  },
  {
    eventName: 'chat:ai-reply-finished',
    sourceApp: 'chat',
    payload: ['characterId', 'characterName', 'lastMessage'],
    consumers: ['core/push.js']
  }
]);

export function getAppEventSpecs() {
  return APP_EVENT_SPECS.map((item) => ({ ...item, payload: [...item.payload], consumers: [...item.consumers] }));
}

export function collectBackupLocalStorageKeys() {
  return [...BACKUP_LOCAL_STORAGE_KEYS];
}

export function collectBackupDynamicKeyPrefixes() {
  return [...BACKUP_DYNAMIC_KEY_PREFIXES];
}

export function getRegisteredUnreadSources() {
  return APP_UNREAD_SOURCES;
}

export function buildUnreadMapFromData(data = {}) {
  const map = {};
  for (const source of APP_UNREAD_SOURCES) {
    const count = safeCount(source.getCount(data));
    if (count > 0) map[source.appId] = count;
  }
  return map;
}

function uniqueFlat(groups) {
  return [...new Set(groups.flat().filter(Boolean).map(String))];
}

function sumObjectValues(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Object.values(value).reduce((sum, item) => sum + safeCount(item), 0);
}

function safeCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}
