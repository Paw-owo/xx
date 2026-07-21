import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const thread = readFileSync(new URL('../apps/chat/thread.js', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../apps/chat/thread-actions.js', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../apps/chat/thread-ai.js', import.meta.url), 'utf8');

assert.match(thread, /messageQueue\.push\(\{[\s\S]*?id:[\s\S]*?threadKey:[\s\S]*?type:/, 'queued sends must retain saved message id and thread identity');
assert.match(thread, /sendImageTextMessage\(state, \{[\s\S]*?triggerAI: false[\s\S]*?\}\)/, 'queued image messages must save without starting a parallel AI job');
assert.match(thread, /queuedMessageIds: batch\.map\(\(item\) => item\.id\)/, 'queue consumption must trigger AI from persisted queued messages without re-saving them');
assert.match(thread, /state\.messageQueue\.filter\(\(item\) => item\?\.threadKey === getThreadQueueKey\(\)\)\.length/, 'queue status must be scoped to the active thread');
assert.match(thread, /openThreadSettingsPanel\(state,[\s\S]*?appState: state\.appState/, 'opening thread settings should use the internal panel path');
assert.doesNotMatch(thread.match(/function openSettingsPage\(\) \{[\s\S]*?\n\}/)?.[0] || '', /unmountChatThread\(/, 'opening settings must not unmount and abort an active reply');
assert.match(thread, /repairStaleThreadPendingMessages\(state\)/, 'mount should repair stale pending assistant placeholders');
assert.match(actions, /triggerAI !== false/, 'image text sends need an explicit triggerAI false path for queueing');
assert.match(ai, /export async function repairStaleThreadPendingMessages/, 'stale pending repair must be exported for thread remount');
assert.match(ai, /function finalizeMessageState/, 'assistant terminal state writes should use one finalize helper');
assert.match(ai, /isFinalMessageState/, 'duplicate finalize calls must be idempotent');

console.log('chat queue lifecycle static checks passed');
