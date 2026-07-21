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
import { getChatCharacterLocalCleanupSpec } from './app-system-registry.js';

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
    const anniversariesRollback = await prepareAnniversaryCleanup(id, checkpointMissing);
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

    rollback.push(anniversariesRollback);
    const anniversariesCleaned = await callAnniversaryCleanup(id);
    if (!anniversariesCleaned) throw new Error('anniversary-cleanup-failed');

    const checkpointRemoved = await callDeletionOperation('removeData', checkpointKey);
    if (checkpointRemoved !== true) throw new Error('checkpoint-delete-failed');
    if (checkpoint !== checkpointMissing) {
      rollback.push(() => callDeletionOperation('setData', checkpointKey, checkpoint));
    }

    const chatLocalCleanup = getChatCharacterLocalCleanupSpec(id);

    for (const key of chatLocalCleanup.mapKeys) {
      const previous = await callDeletionOperation('getData', key, checkpointMissing);
      if (previous === checkpointMissing) continue;
      const next = cleanCharacterLocalMapValue(key, previous, id);
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

    for (const key of chatLocalCleanup.directKeys) {
      const previous = await callDeletionOperation('getData', key, checkpointMissing);
      if (previous === checkpointMissing) continue;
      const removed = await callDeletionOperation('removeData', key);
      if (removed !== true) throw new Error('character-local-key-delete-failed');
      rollback.push(() => callDeletionOperation('setData', key, previous));
    }

    const prefixKeys = getLocalStorageKeys().filter((key) => chatLocalCleanup.prefixes.some((prefix) => key.startsWith(prefix)));
    for (const key of prefixKeys) {
      const previous = await callDeletionOperation('getData', key, checkpointMissing);
      if (previous === checkpointMissing) continue;
      const removed = await callDeletionOperation('removeData', key);
      if (removed !== true) throw new Error('character-prefix-local-key-delete-failed');
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


async function prepareAnniversaryCleanup(id, missing) {
  const list = await callDeletionOperation('getData', 'anniversaries', missing);
  const visuals = await callDeletionOperation('getData', 'app_anniversary_visuals', missing);
  const greeted = await callDeletionOperation('getData', 'app_anniversary_greeted', missing);
  return async () => {
    if (list !== missing) await callDeletionOperation('setData', 'anniversaries', list);
    if (visuals !== missing) await callDeletionOperation('setData', 'app_anniversary_visuals', visuals);
    if (greeted !== missing) await callDeletionOperation('setData', 'app_anniversary_greeted', greeted);
  };
}

async function callAnniversaryCleanup(id) {
  const missing = Symbol('anniversary-missing');
  try {
    const current = await callDeletionOperation('getData', 'anniversaries', []);
    const list = normalizeList(current);
    const removed = list.filter((item) => String(item?.characterId || '') === id);
    if (!removed.length) return true;

    const saved = await callDeletionOperation('setData', 'anniversaries', list.filter((item) => String(item?.characterId || '') !== id));
    if (saved !== true) return false;

    const visuals = await callDeletionOperation('getData', 'app_anniversary_visuals', missing);
    if (visuals !== missing && visuals && typeof visuals === 'object' && !Array.isArray(visuals)) {
      const nextVisuals = { ...visuals };
      let changed = false;
      removed.forEach((item) => {
        if (item?.id && nextVisuals[item.id]) {
          delete nextVisuals[item.id];
          changed = true;
        }
      });
      if (changed) {
        const visualsSaved = await callDeletionOperation('setData', 'app_anniversary_visuals', nextVisuals);
        if (visualsSaved !== true) return false;
      }
    }

    const greeted = await callDeletionOperation('getData', 'app_anniversary_greeted', missing);
    if (Array.isArray(greeted)) {
      const removedIds = new Set(removed.map((item) => String(item?.id || '')).filter(Boolean));
      const greetedSaved = await callDeletionOperation('setData', 'app_anniversary_greeted', greeted.filter((key) => {
        const value = String(key || '');
        return ![...removedIds].some((removedId) => value.startsWith(`${removedId}_`));
      }));
      if (greetedSaved !== true) return false;
    }

    return true;
  } catch (_) {
    return false;
  }
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function cleanCharacterLocalMapValue(key, previous, id) {
  if (key === 'chat_hidden_private_threads') {
    return normalizeList(previous).filter((item) => String(item) !== id);
  }

  const privateKey = `private:${id}`;
  const groupKey = `group:${id}`;

  if (Array.isArray(previous)) {
    return previous.filter((item) => {
      const value = String(item?.id || item?.key || item);
      return value !== id && value !== privateKey && value !== groupKey;
    });
  }

  const source = previous && typeof previous === 'object' ? previous : {};
  return Object.fromEntries(Object.entries(source).filter(([itemId]) => (
    itemId !== id && itemId !== privateKey && itemId !== groupKey
  )));
}

function getLocalStorageKeys() {
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : globalThis.localStorage;
    if (!storage) return [];
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean);
  } catch (_) {
    return [];
  }
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
