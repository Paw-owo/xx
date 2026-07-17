// 角色删除共用的数据清理边界。聊天消息不属于此清理范围。

import {
  deleteDB,
  getAllDBStrict,
  getNow,
  removeData,
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
  getAllDBStrict: null,
  getNow: null,
  removeData: null,
  setDB: null
};

export async function deleteCharacterPrivateData(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return { success: false };

  try {
    for (const storeName of CHARACTER_PRIVATE_STORES) {
      const rows = await callDeletionOperation('getAllDBStrict', storeName);
      for (const row of normalizeList(rows)) {
        if (String(row?.characterId || '') !== id || !row?.id) continue;
        const deleted = await callDeletionOperation('deleteDB', storeName, row.id);
        if (deleted !== true) throw new Error('private-data-delete-failed');
      }
    }

    const groups = await callDeletionOperation('getAllDBStrict', 'groups');
    for (const group of normalizeList(groups)) {
      const memberIds = normalizeList(group?.memberIds);
      if (!memberIds.includes(id)) continue;

      const now = await callDeletionOperation('getNow');
      const saved = await callDeletionOperation('setDB', 'groups', {
        ...group,
        memberIds: memberIds.filter((memberId) => memberId !== id),
        updatedAt: now
      });
      if (!saved) throw new Error('group-update-failed');
    }

    const checkpointRemoved = await callDeletionOperation('removeData', `mem_sum_${id}`);
    if (checkpointRemoved !== true) throw new Error('checkpoint-delete-failed');

    return { success: true };
  } catch (_) {
    return { success: false };
  }
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

async function callDeletionOperation(name, ...args) {
  const operation = deletionTestOperations[name] || {
    deleteDB,
    getAllDBStrict,
    getNow,
    removeData,
    setDB
  }[name];
  return await operation(...args);
}

export const __testHooks = {
  operations: deletionTestOperations,
  privateStores: CHARACTER_PRIVATE_STORES
};
