// 角色删除共用的数据清理边界。聊天消息不属于此清理范围。

import {
  deleteDB,
  getData,
  getAllDBStrict,
  getNow,
  removeData,
  setData,
  setDB
} from './storage.js';

const CHARACTER_PRIVATE_STORES = Object.freeze([
  'memories',
  'dreams',
  'grudges',
  'punishments',
  'relationship_locks',
  'ai_phone_diaries',
  'ai_phone_visits',
  'ai_phone_chat_archives',
  'ai_phone_memos',
  'ai_phone_mailbox',
  'ai_phone_app_locks',
  'ai_phone_action_logs'
]);

const CHARACTER_LOCAL_MAP_KEYS = Object.freeze([
  'chat_unread_counts',
  'chat_hidden_private_threads'
]);

const deletionTestOperations = {
  deleteDB: null,
  getData: null,
  getAllDBStrict: null,
  getNow: null,
  removeData: null,
  setData: null,
  setDB: null
};

export async function deleteCharacterPrivateData(characterId, { includeMessages = false, includeCharacter = false, markSeedDeleted = false } = {}) {
  const id = String(characterId || '').trim();
  if (!id) return { success: false };

  const rollback = [];
  try {
    const stores = includeMessages
      ? [...CHARACTER_PRIVATE_STORES, 'messages']
      : CHARACTER_PRIVATE_STORES;

    // Read everything before making the first change. Besides detecting read errors
    // up front, these records are the undo log if a later operation fails.
    const recordsByStore = new Map();
    for (const storeName of stores) {
      const rows = await callDeletionOperation('getAllDBStrict', storeName);
      recordsByStore.set(storeName, normalizeList(rows).filter((row) => (
        String(row?.characterId || '') === id && row?.id
      )));
    }
    const groups = normalizeList(await callDeletionOperation('getAllDBStrict', 'groups'));
    const character = includeCharacter
      ? normalizeList(await callDeletionOperation('getAllDBStrict', 'characters')).find((row) => String(row?.id || '') === id)
      : null;
    const checkpointMissing = Symbol('checkpoint-missing');
    const checkpointKey = `mem_sum_${id}`;
    const checkpoint = await callDeletionOperation('getData', checkpointKey, checkpointMissing);

    for (const [storeName, records] of recordsByStore) {
      for (const row of records) {
        const deleted = await callDeletionOperation('deleteDB', storeName, row.id);
        if (deleted !== true) throw new Error('private-data-delete-failed');
        rollback.push(() => callDeletionOperation('setDB', storeName, row));
      }
    }

    for (const group of groups) {
      const memberIds = normalizeList(group?.memberIds);
      if (!memberIds.includes(id)) continue;

      const now = await callDeletionOperation('getNow');
      const saved = await callDeletionOperation('setDB', 'groups', {
        ...group,
        memberIds: memberIds.filter((memberId) => memberId !== id),
        updatedAt: now
      });
      if (!saved) throw new Error('group-update-failed');
      rollback.push(() => callDeletionOperation('setDB', 'groups', group));
    }

    const checkpointRemoved = await callDeletionOperation('removeData', checkpointKey);
    if (checkpointRemoved !== true) throw new Error('checkpoint-delete-failed');
    if (checkpoint !== checkpointMissing) {
      rollback.push(() => callDeletionOperation('setData', checkpointKey, checkpoint));
    }

    for (const key of CHARACTER_LOCAL_MAP_KEYS) {
      const previous = await callDeletionOperation('getData', key, checkpointMissing);
      if (previous === checkpointMissing) continue;
      const next = key === 'chat_hidden_private_threads'
        ? normalizeList(previous).filter((item) => String(item) !== id)
        : Object.fromEntries(Object.entries(previous && typeof previous === 'object' ? previous : {}).filter(([itemId]) => itemId !== id));
      const saved = await callDeletionOperation('setData', key, next);
      if (saved !== true) throw new Error('character-local-map-update-failed');
      rollback.push(() => callDeletionOperation('setData', key, previous));
    }

    const route = await callDeletionOperation('getData', 'chat_last_route', checkpointMissing);
    const routeParams = route && typeof route === 'object' ? route.params : null;
    if (route !== checkpointMissing && routeParams && (String(routeParams.characterId || '') === id || String(routeParams.id || '') === id)) {
      const saved = await callDeletionOperation('setData', 'chat_last_route', { name: 'list', params: {} });
      if (saved !== true) throw new Error('character-route-update-failed');
      rollback.push(() => callDeletionOperation('setData', 'chat_last_route', route));
    }

    const directKeys = [`chat_${id}_config`, `chat_${id}_visible_count`];
    for (const key of directKeys) {
      const previous = await callDeletionOperation('getData', key, checkpointMissing);
      if (previous === checkpointMissing) continue;
      const removed = await callDeletionOperation('removeData', key);
      if (removed !== true) throw new Error('character-local-key-delete-failed');
      rollback.push(() => callDeletionOperation('setData', key, previous));
    }

    if (markSeedDeleted) {
      const seedKey = `chat_seed_deleted_${id}`;
      const previous = await callDeletionOperation('getData', seedKey, checkpointMissing);
      const saved = await callDeletionOperation('setData', seedKey, true);
      if (saved !== true) throw new Error('seed-deletion-marker-write-failed');
      rollback.push(() => previous === checkpointMissing
        ? callDeletionOperation('removeData', seedKey)
        : callDeletionOperation('setData', seedKey, previous));
    }

    if (includeCharacter && character) {
      const deleted = await callDeletionOperation('deleteDB', 'characters', id);
      if (deleted !== true) throw new Error('character-delete-failed');
      rollback.push(() => callDeletionOperation('setDB', 'characters', character));
    }

    return { success: true };
  } catch (_) {
    for (const undo of rollback.reverse()) {
      try {
        const restored = await undo();
        if (!restored) console.warn('Character cleanup rollback operation failed');
      } catch (error) {
        console.warn('Character cleanup rollback operation failed', error);
      }
    }
    return { success: false };
  }
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

async function callDeletionOperation(name, ...args) {
  const operation = deletionTestOperations[name] || {
    deleteDB,
    getData,
    getAllDBStrict,
    getNow,
    removeData,
    setData,
    setDB
  }[name];
  return await operation(...args);
}

export const __testHooks = {
  operations: deletionTestOperations,
  privateStores: CHARACTER_PRIVATE_STORES
};
