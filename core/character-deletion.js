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
  'relationship_locks'
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

export async function deleteCharacterPrivateData(characterId, { includeMessages = false } = {}) {
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
