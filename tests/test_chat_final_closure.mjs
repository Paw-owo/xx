import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const thread = readFileSync(new URL('../apps/chat/thread.js', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../apps/chat/thread-actions.js', import.meta.url), 'utf8');
const render = readFileSync(new URL('../apps/chat/thread-render.js', import.meta.url), 'utf8');
const tools = readFileSync(new URL('../apps/chat/thread-tools.js', import.meta.url), 'utf8');
const registry = readFileSync(new URL('../core/app-system-registry.js', import.meta.url), 'utf8');
const list = readFileSync(new URL('../apps/chat/list.js', import.meta.url), 'utf8');

assert.doesNotMatch(render, /转发|撤回|收藏/, 'message menu must not expose unsupported forward/recall/favorite fake actions');
assert.match(render, /复制[\s\S]*引用[\s\S]*编辑[\s\S]*删除/, 'message menu keeps real implemented actions visible');
assert.match(actions, /buildAskUserStateKey[\s\S]*removeData\(key\)/, 'deleting a message must clean its ask-user state');
assert.match(list, /clearAskUserStateForThread\(item\.id\)/, 'clearing private or group conversations must clean ask-user state');
assert.match(tools, /isGroupMode[\s\S]*tool\.id === 'phone'/, 'group mode hides unsupported phone entry instead of showing a fake call button');
assert.match(registry, /chat:external-message-failed[\s\S]*stage[\s\S]*recoverable[\s\S]*messageId/, 'external failure event registry must match emitted payload fields');
assert.match(thread, /role', 'status'\)[\s\S]*aria-live', 'polite'/, 'thread status should provide a polite live region');
assert.match(thread, /focus-visible[\s\S]*outline:2px solid var\(--accent\)/, 'thread controls should have theme-variable focus-visible outlines');
assert.doesNotMatch(actions, /写入数据库失败/, 'user-facing chat errors should not expose database wording');

console.log('chat final closure static checks passed');
