import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const memoryStorage = new Map();
globalThis.localStorage = {
  get length() { return memoryStorage.size; },
  key(index) { return [...memoryStorage.keys()][index] || null; },
  getItem(key) { return memoryStorage.has(key) ? memoryStorage.get(key) : null; },
  setItem(key, value) { memoryStorage.set(key, String(value)); },
  removeItem(key) { memoryStorage.delete(key); },
  clear() { memoryStorage.clear(); }
};
globalThis.window = { AppEvents: { emit() {} }, dispatchEvent() {} };

const unread = await import('../core/chat-unread.js');
const storage = await import('../core/storage.js');

memoryStorage.clear();
await Promise.all([
  unread.adjustChatUnread({ type: 'private', threadId: 'char-a', delta: 1, source: 'test', eventType: 'external-message' }),
  unread.adjustChatUnread({ type: 'private', threadId: 'char-a', delta: 1, source: 'test', eventType: 'external-message' })
]);
assert.equal(storage.getData('chat_unread_counts')['char-a'], 2, '并发私聊未读不会互相覆盖');

memoryStorage.clear();
await Promise.all([
  unread.adjustChatUnread({ type: 'group', threadId: 'group-a', delta: 1, source: 'test', eventType: 'group-message' }),
  unread.adjustChatUnread({ type: 'group', threadId: 'group-a', delta: 1, source: 'test', eventType: 'group-message' })
]);
assert.equal(storage.getData('chat_group_unread_counts')['group-a'], 2, '并发群聊未读不会互相覆盖');

const chatSource = readFileSync('apps/chat.js', 'utf8');
assert.match(chatSource, /appendExternalChatMessage[\s\S]*await recordExternalInteraction/, '外部 sendMessage 先落可见消息再写记忆');
const sendMessageBlock = chatSource.match(/async sendMessage\(characterId, text, extra = \{\}\) \{[\s\S]*?\n    \},/)?.[0] || '';
assert.doesNotMatch(sendMessageBlock, /return recordExternalInteraction\(/, '外部 sendMessage 不再只写记忆就返回');

const bridgeSource = readFileSync('core/chat-event-bridge.js', 'utf8');
assert.doesNotMatch(bridgeSource, /deleteDB\('messages',[\s\S]*emitExternalMessageFailed/, '未读失败不删除已落库消息');
assert.match(bridgeSource, /emitExternalMessageFailed\(payload, error\)/, '未读失败仍发恢复信号');

console.log('chat data closure checks passed');
