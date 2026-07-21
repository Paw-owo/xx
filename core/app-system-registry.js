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
      'chat_archived_threads',
      'app_grudge_settings'
    ],
    dynamicKeyPrefixes: ['chat_', 'app_bg_chat_opacity_', 'push_msg_watermark_'],
    indexedDBStores: ['messages', 'group_messages', 'memories', 'stickers', 'groups'],
    backup: true
  },
  moments: {
    localStorageKeys: ['moments_unread_count', 'moment_interaction_state'],
    dynamicKeyPrefixes: ['last_moment_'],
    indexedDBStores: ['moments'],
    backup: true
  },
  gallery: {
    localStorageKeys: [],
    dynamicKeyPrefixes: [],
    indexedDBStores: ['grudges', 'punishments', 'relationship_locks'],
    backup: true
  },
  characters: {
    localStorageKeys: ['user_profiles', 'app_user_profiles', 'active_user_profile_id'],
    dynamicKeyPrefixes: [],
    indexedDBStores: ['characters'],
    backup: true
  },
  worldbook: {
    localStorageKeys: ['app_worldbook_visuals'],
    dynamicKeyPrefixes: [],
    indexedDBStores: ['worldbook'],
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
    indexedDBStores: ['inventory', 'pet'],
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
      'anniversary_items',
      'app_anniversary',
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
    indexedDBStores: ['songs', 'playlists'],
    backup: true
  },
  dream: {
    localStorageKeys: ['app_dream_last_gen', 'app_dream_config'],
    dynamicKeyPrefixes: [],
    indexedDBStores: ['dreams'],
    backup: true
  },
  'theme-center': {
    localStorageKeys: ['theme_center_favorites', 'theme_ai_versions', 'theme_ai_active_version', 'theme_ai_optimization_log'],
    dynamicKeyPrefixes: [],
    backup: true
  },
  settings: {
    localStorageKeys: [
      'app_settings',
      'app_user',
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
      'app_api_pool_groups',
      'cloud_models',
      'app_weather_config',
      'app_weather_settings',
      'weather_config',
      'weather_settings'
    ],
    dynamicKeyPrefixes: [],
    indexedDBStores: ['api_pool', 'blobs'],
    backup: true
  },
  cloud: {
    localStorageKeys: ['app_cloud_server'],
    dynamicKeyPrefixes: [],
    backup: true
  }
});


export const CHAT_CHARACTER_LOCAL_CLEANUP = Object.freeze({
  mapKeys: [
    'chat_unread_counts',
    'chat_group_unread_counts',
    'chat_hidden_private_threads',
    'chat_draft_map',
    'chat_pinned_threads',
    'chat_archived_threads',
    'chat_active_thread'
  ],
  directKeyTemplates: [
    'chat_{id}_config',
    'chat_{id}_visible_count',
    'last_moment_{id}',
    'app_bg_chat_opacity_{id}',
    'push_msg_watermark_{id}'
  ],
  prefixTemplates: [
    'chat_ask_user_state_{id}_'
  ]
});

export function getChatCharacterLocalCleanupSpec(characterId = '') {
  const id = String(characterId || '').trim();
  const apply = (template) => String(template || '').replace('{id}', id);
  return {
    mapKeys: [...CHAT_CHARACTER_LOCAL_CLEANUP.mapKeys],
    directKeys: CHAT_CHARACTER_LOCAL_CLEANUP.directKeyTemplates.map(apply),
    prefixes: CHAT_CHARACTER_LOCAL_CLEANUP.prefixTemplates.map(apply)
  };
}

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
    eventName: 'app:unread-updated',
    sourceApp: 'system',
    payload: ['appId', 'source', 'type', 'count'],
    consumers: ['index.html'],
    note: '统一未读更新事件；写端仍以各自 unread key 为事实来源，桌面收到后重新汇总刷新角标。'
  },
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
    consumers: [],
    consumerStatus: 'record-only',
    note: '当前仓库只有写端；朋友圈内部已直接写入动态和聊天外部互动，此事件暂不承诺额外联动。'
  },
  {
    eventName: 'dream:created',
    sourceApp: 'dream',
    payload: ['dreamId', 'characterId', 'mood', 'summary', 'createdAt'],
    consumers: ['core/push.js']
  },
  {
    eventName: 'memo:memory-synced',
    sourceApp: 'memo',
    payload: ['memoId', 'characterId', 'title', 'category', 'memoryId'],
    consumers: [],
    consumerStatus: 'record-only',
    note: '当前仓库只有备忘录写端；记忆同步已在写端完成，此事件仅作为事件记录。'
  },
  {
    eventName: 'worldbook:updated',
    sourceApp: 'worldbook',
    payload: ['entryId', 'deleted', 'saved', 'isEdit'],
    consumers: [],
    consumerStatus: 'future',
    note: '当前仓库只有世界书写端；聊天上下文按需读取世界书，暂不接假消费者。'
  },
  {
    eventName: 'games:unread-updated',
    sourceApp: 'games',
    payload: ['source', 'count', 'action'],
    consumers: ['index.html']
  },
  {
    eventName: 'anniversary:reminder',
    sourceApp: 'anniversary',
    payload: ['anniversaryId', 'title', 'date', 'characterId', 'days', 'note', 'source', 'createdBy'],
    consumers: ['apps/chat.js']
  },
  {
    eventName: 'chat:external-message',
    sourceApp: 'chat-event-bridge',
    payload: ['threadId', 'characterId', 'sourceApp', 'sourceType', 'isExternalMessage', 'content', 'messageId', 'eventId', 'type', 'message'],
    consumers: ['apps/chat.js'],
    note: '外部来源已由 core/chat-event-bridge.js 落库后发出；chat 只刷新会话与温柔提示，不重复写消息。'
  },
  {
    eventName: 'chat:external-message-failed',
    sourceApp: 'chat-event-bridge',
    payload: ['eventId', 'sourceEventId', 'sourceApp', 'sourceType', 'characterId', 'error', 'stage', 'recoverable', 'messageId'],
    consumers: [],
    consumerStatus: 'record-only',
    note: '外部消息落库或未读保存失败时发出，当前仅事件记录，供后续通知中心或上层兜底订阅。'
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
    eventName: 'wallet:balance-updated',
    sourceApp: 'wallet',
    payload: ['balance', 'type', 'amount', 'description'],
    consumers: [],
    consumerStatus: 'record-only',
    note: '当前仓库只有钱包写端；钱包界面自行刷新余额，不将余额变动伪装成聊天或通知。'
  },
  {
    eventName: 'music:favorite',
    sourceApp: 'music',
    payload: ['source', 'songId', 'title', 'artist', 'favorite'],
    consumers: [],
    consumerStatus: 'record-only',
    note: '当前仓库只有音乐写端；收藏状态已在音乐数据内持久化。'
  },
  {
    eventName: 'music:playlist',
    sourceApp: 'music',
    payload: ['action', 'playlistId', 'songId', 'name', 'songCount'],
    consumers: [],
    consumerStatus: 'record-only',
    note: '当前仓库只有音乐写端；歌单状态已在音乐数据内持久化。'
  },
  {
    eventName: 'music:import',
    sourceApp: 'music',
    payload: ['songId', 'title', 'artist', 'fileName', 'duration'],
    consumers: [],
    consumerStatus: 'record-only',
    note: '当前仓库只有音乐写端；导入结果已由音乐界面展示，不接假消费者。'
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
