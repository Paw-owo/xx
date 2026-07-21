// core/chat-unread.js
// Chat 未读计数的唯一串行写入口。事实数据仍沿用现有 localStorage key，
// 这里只负责避免 read-modify-write 并发覆盖，并在成功写入后发统一角标事件。

import { getData, setData } from './storage.js';
import { emitUnreadChanged } from './app-bus.js';

export const CHAT_PRIVATE_UNREAD_KEY = 'chat_unread_counts';
export const CHAT_GROUP_UNREAD_KEY = 'chat_group_unread_counts';

const writeQueues = new Map();

export function getChatUnreadKey(type = 'private') {
  return type === 'group' ? CHAT_GROUP_UNREAD_KEY : CHAT_PRIVATE_UNREAD_KEY;
}

export function sumUnreadMap(map) {
  if (!map || typeof map !== 'object') return 0;
  return Object.values(map).reduce((total, value) => total + Math.max(0, Number(value) || 0), 0);
}

export function isActiveChatThread({ type = 'private', threadId = '', characterId = '', groupId = '' } = {}) {
  try {
    const active = typeof window !== 'undefined' ? window.__chatActiveThread : null;
    if (!active) return false;
    if (type === 'group') return active.mode === 'group' && String(active.groupId || '') === String(threadId || groupId || '');
    return active.mode === 'private' && String(active.characterId || '') === String(threadId || characterId || '');
  } catch (_) {
    return false;
  }
}

export async function enqueueChatUnreadWrite(key, writer) {
  const previous = writeQueues.get(key) || Promise.resolve();
  const task = previous.catch(() => null).then(async () => writer());
  writeQueues.set(key, task.catch(() => null));
  try {
    return await task;
  } finally {
    if (writeQueues.get(key) === task) writeQueues.delete(key);
  }
}

export function readUnreadMap(key) {
  const value = getData(key);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function adjustChatUnread({ type = 'private', threadId = '', delta = 0, source = 'chat', eventType = 'message', extra = {} } = {}) {
  const id = String(threadId || '').trim();
  if (!id) return null;
  const key = getChatUnreadKey(type);
  return enqueueChatUnreadWrite(key, () => {
    const counts = readUnreadMap(key);
    const current = Math.max(0, Number(counts[id] || 0));
    const nextCount = Math.max(0, current + Number(delta || 0));
    const nextMap = { ...counts };
    if (nextCount > 0) nextMap[id] = nextCount;
    else delete nextMap[id];
    const saved = setData(key, nextMap);
    if (saved !== true) throw new Error('聊天未读还没能保存');
    emitUnreadChanged({
      appId: 'chat',
      source,
      type: eventType,
      count: getTotalChatUnread(type, nextMap),
      threadId: id,
      characterId: type === 'private' ? id : '',
      groupId: type === 'group' ? id : '',
      unread: nextCount,
      ...extra
    });
    return { key, unreadMap: nextMap, unread: nextCount };
  });
}

export async function clearChatUnread(type, threadId, options = {}) {
  const id = String(threadId || '').trim();
  if (!id) return null;
  const key = getChatUnreadKey(type);
  return enqueueChatUnreadWrite(key, () => {
    const counts = readUnreadMap(key);
    if (!Object.prototype.hasOwnProperty.call(counts, id)) return { key, unreadMap: counts, unread: 0 };
    const nextMap = { ...counts };
    delete nextMap[id];
    const saved = setData(key, nextMap);
    if (saved !== true) throw new Error('聊天未读还没能保存');
    emitUnreadChanged({
      appId: 'chat',
      source: options.source || 'chat',
      type: options.eventType || 'read',
      count: getTotalChatUnread(type, nextMap),
      threadId: id,
      characterId: type === 'private' ? id : '',
      groupId: type === 'group' ? id : '',
      unread: 0
    });
    return { key, unreadMap: nextMap, unread: 0 };
  });
}

function getTotalChatUnread(changedType, changedMap) {
  const privateMap = changedType === 'private' ? changedMap : readUnreadMap(CHAT_PRIVATE_UNREAD_KEY);
  const groupMap = changedType === 'group' ? changedMap : readUnreadMap(CHAT_GROUP_UNREAD_KEY);
  return sumUnreadMap(privateMap) + sumUnreadMap(groupMap);
}
