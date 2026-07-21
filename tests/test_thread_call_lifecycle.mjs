import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const call = readFileSync(new URL('../apps/chat/thread-call.js', import.meta.url), 'utf8');
const panels = readFileSync(new URL('../apps/chat/thread-panels.js', import.meta.url), 'utf8');

assert.match(call, /cleanupDone: true/, 'call state must track one-shot cleanup');
assert.match(call, /export function cleanupThreadCallResources/, 'call cleanup should be available as an explicit lifecycle entry');
assert.match(call, /function cleanupCallResources\(reason = 'close'\) \{[\s\S]*?if \(callState\.cleanupDone\) return false;[\s\S]*?replyController\.abort\(reason\)[\s\S]*?stopTimer\(\);[\s\S]*?stopAll\(\);/, 'call cleanup must abort only call request and stop timer/TTS once');
assert.match(call, /unmountThreadCall\(\) \{[\s\S]*?cleanupCallResources\('unmount'\)/, 'unmount must use the unified call cleanup path');
assert.match(call, /cleanupCallResources\('hangup'\)/, 'hangup must share the unified cleanup path');
assert.match(call, /if \(!callState\.mounted \|\| callState\.callEnded \|\| controller\.signal\.aborted\) return '';/, 'late call replies must not write into an unmounted or ended call');
assert.match(panels, /state\?\.mode === 'group'[\s\S]*?群聊电话先不接/, 'group call remains intentionally not exposed as a fake feature');

console.log('thread call lifecycle static checks passed');
