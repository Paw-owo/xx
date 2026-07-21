import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/chat/sensory-ear.js', import.meta.url), 'utf8');

assert.match(source, /let recordStopFallbackTimer = null;/, 'stopRecording fallback timer must be tracked');
assert.match(source, /let settled = false;[\s\S]*?if \(settled\) return;[\s\S]*?settled = true;/, 'recording finish must be guarded once');
assert.match(source, /recordStopFallbackTimer = setTimeout/, 'stop fallback timer must be stored for cleanup');
assert.match(source, /clearTimeout\(recordStopFallbackTimer\)/, 'cleanup must clear stop fallback timer');
assert.match(source, /mediaRecorder\.ondataavailable = null;[\s\S]*?mediaRecorder\.onstop = null;[\s\S]*?mediaRecorder\.onerror = null;/, 'cleanup must detach recorder handlers');
assert.match(source, /let abortHandler = null;[\s\S]*?signal\.addEventListener\('abort', abortHandler/, 'external AbortSignal listener must use a removable handler');
assert.match(source, /finally \{[\s\S]*?clearTimeout\(timer\);[\s\S]*?signal\.removeEventListener\('abort', abortHandler\)/, 'STT request must remove listener and timer in finally');
assert.match(source, /externalAborted && !timedOut/, 'external cancellation must be distinguished from timeout');
assert.match(source, /reason: 'cancelled'/, 'external cancellation should be reported distinctly');

console.log('sensory ear lifecycle static checks passed');
