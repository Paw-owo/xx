import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync(new URL('../core/chat-event-bridge.js', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../apps/chat.js', import.meta.url), 'utf8');
const list = readFileSync(new URL('../apps/chat/list.js', import.meta.url), 'utf8');
const thread = readFileSync(new URL('../apps/chat/thread.js', import.meta.url), 'utf8');
const render = readFileSync(new URL('../apps/chat/thread-render.js', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../apps/chat/thread-ai.js', import.meta.url), 'utf8');
const github = readFileSync(new URL('../apps/chat/github-tool.js', import.meta.url), 'utf8');
const abortUtil = readFileSync(new URL('../core/abort-utils.js', import.meta.url), 'utf8');

assert.match(bridge, /stage,\n\s*recoverable: stage === 'unread_update'/, 'external failure event must distinguish write and unread stages');
assert.match(chat, /chat:external-message-failed[\s\S]*shownExternalFailureIds/, 'chat app must consume external failure events with dedupe');
assert.match(chat, /stage === 'unread_update'[\s\S]*角标稍后会自己对齐/, 'unread-only failure must not be shown as message send failure');

assert.match(ai, /const activeProactiveTasks = new Set\(\)/, 'proactive checks must prevent same-character concurrency');
assert.match(ai, /isProactiveConfigEnabled\(config\)/, 'proactive checks must skip disabled configs before model work');
assert.match(ai, /isProactiveDueNow\(config, Date\.now\(\)\)/, 'proactive checks must respect next due time');
assert.match(ai, /scheduleNextProactiveCheck\(characterId, refreshedConfig, \{ failed: true \}\)/, 'proactive failures must back off');
assert.match(list, /document\.visibilityState !== 'visible'/, 'list proactive polling must stop while hidden');

assert.match(render, /const source = q \? list : list\.slice/, 'search must scan full history while normal render stays paged');
assert.match(thread, /searchRenderTimer[\s\S]*setTimeout\(\(\) => \{[\s\S]*refreshMessageAreaOnly\(\)/, 'search input should debounce message refresh');
assert.doesNotMatch(thread, /setTimeout\(\(\) => \{ input\.remove\(\); \}, 1000\)/, 'image picker must not remove input after a fixed one second delay');
assert.match(thread, /window\.addEventListener\('focus', handleFocusReturn\)/, 'image picker must clean after focus return or change');

assert.match(ai, /createStreamRenderScheduler[\s\S]*requestAnimationFrame/, 'stream updates must be RAF coalesced');
assert.match(ai, /if \(!toolResult \|\| toolResult\.blocked \|\| toolResult\.blockedByApproval \|\| toolResult\.isError\)[\s\S]*status: 'error'/, 'MCP failure must enter process chain as an error');
assert.doesNotMatch(ai + readFileSync(new URL('../apps/chat/thread-call.js', import.meta.url), 'utf8'), /AbortSignal\.timeout/, 'chat code should use compatibility timeout helper instead of direct AbortSignal.timeout');
assert.match(abortUtil, /createTimeoutSignal[\s\S]*AbortSignal\.timeout[\s\S]*removeEventListener/, 'timeout helper must support native timeout and cleanup listeners');

assert.match(github, /LAST_OPERATION_KEY = 'github_tool_last_operation'/, 'GitHub tool must persist resumable PR state after commit');
assert.match(github, /prStatus: 'failed'[\s\S]*retryError/, 'PR failure after commit must store retryable state');
assert.match(github, /重试创建 PR[\s\S]*createPullRequest/, 'GitHub tool must retry PR creation without re-committing files');
assert.doesNotMatch(github.match(/function saveLastGithubOperation[\s\S]*?\n\}/)?.[0] || '', /token|Authorization/i, 'GitHub recovery record must not store credentials');

console.log('chat round3 resilience static checks passed');
