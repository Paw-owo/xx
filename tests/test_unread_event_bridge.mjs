// tests/test_unread_event_bridge.mjs
// 静态校验未读更新统一事件：外部聊天写入后发事件，桌面订阅统一事件，旧游戏事件保留桥接。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => memoryStorage.has(key) ? memoryStorage.get(key) : null,
  setItem: (key, value) => { memoryStorage.set(key, String(value)); },
  removeItem: (key) => { memoryStorage.delete(key); },
  clear: () => { memoryStorage.clear(); }
};

const { UNREAD_CHANGED_EVENT, emitUnreadChanged } = await import('../core/app-bus.js');

const appBus = readFileSync('core/app-bus.js', 'utf8');
const chatBridge = readFileSync('core/chat-event-bridge.js', 'utf8');
const indexHtml = readFileSync('index.html', 'utf8');
const registry = readFileSync('core/app-system-registry.js', 'utf8');

assert.equal(UNREAD_CHANGED_EVENT, 'app:unread-updated', '统一未读事件名保持稳定');
assert.match(appBus, /export function emitUnreadChanged/, 'AppBus 暴露 emitUnreadChanged helper');
assert.match(registry, /eventName: 'app:unread-updated'/, '事件注册表声明统一未读事件');

assert.match(chatBridge, /import \{ on, emit, emitUnreadChanged \} from '\.\/app-bus\.js';/, '外部聊天桥接使用 AppBus 未读 helper');
assert.match(chatBridge, /setData\('chat_unread_counts', nextUnreadMap\)[\s\S]*emitChatUnreadChanged/, 'chat_unread_counts 写入成功后才发未读更新');
assert.match(chatBridge, /shouldIncrementUnread && !isActivePrivate/, '当前会话内仍不虚增未读');
assert.doesNotMatch(chatBridge, /refreshDesktopBadges\(\);\n\s*}\n\s*catch[\s\S]*通知 chat\.js/, '外部聊天桥接不再把直接刷新作为主链路');

assert.match(indexHtml, /busOn\(UNREAD_CHANGED_EVENT, \(\) => refreshBadges\(\)\)/, '桌面订阅统一未读事件刷新角标');
assert.match(indexHtml, /busOn\('games:unread-updated'[\s\S]*busEmit\(UNREAD_CHANGED_EVENT/, '旧 games:unread-updated 事件桥接到统一未读事件');
assert.match(indexHtml, /buildUnreadMapFromData\(data\)/, '桌面仍从注册表汇总 unread 数据恢复角标');

let captured = null;
globalThis.window = {
  dispatchEvent() {},
  AppEvents: {
    emit(name, payload) { captured = { name, payload }; }
  }
};
const emitted = emitUnreadChanged({ appId: 'chat', source: 'shop', type: 'external-message', count: 3, extra: 'kept' });
assert.equal(emitted, true, 'emitUnreadChanged 在事件中心可用时返回成功');
assert.deepEqual(captured, {
  name: 'app:unread-updated',
  payload: { appId: 'chat', source: 'shop', type: 'external-message', count: 3, extra: 'kept' }
}, 'emitUnreadChanged payload 包含 appId/source/type/count 并保留扩展字段');
delete globalThis.window;

console.log('unread event bridge checks passed');
