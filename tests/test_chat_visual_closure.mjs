import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'apps/chat/visual-system.js',
  'apps/chat/thread.js',
  'apps/chat/thread-render.js',
  'apps/chat/thread-tools.js',
  'apps/chat/thread-sheets.js',
  'apps/chat/thread-settings.js',
  'apps/chat/thinking-chain.js',
  'apps/chat/memory.js',
  'apps/chat/github-tool.js',
  'apps/chat/ask-user-card.js',
  'apps/chat/sub-agent-card.js',
  'apps/chat/thread-stickers.js',
  'apps/chat/thread-call.js',
];

const source = Object.fromEntries(files.map(file => [file, readFileSync(file, 'utf8')])) ;
const visual = source['apps/chat/visual-system.js'];

const requiredSelectors = [
  '.chat-list-header',
  '.chat-thread-header',
  '.chat-message-bubble.role-user',
  '.chat-thread-input-bar',
  '.chat-thread-tool-card',
  '.bottom-sheet',
  '.tc-pill',
  '.tc-sheet',
  '.chat-memory-card',
  '.ask-user-card',
  '.chat-sub-agent-card',
  '.gh-sheet',
  '.gh-field',
  '.gh-branch-info',
  '.chat-call-screen',
  '.chat-call-control',
  '.ss-cell',
];
for (const selector of requiredSelectors) {
  assert.ok(visual.includes(selector), `visual closure should cover ${selector}`);
}

assert.ok(visual.includes('prefers-reduced-motion: reduce'), 'Chat visual layer should respect reduced motion');
assert.ok(visual.includes(':focus-visible'), 'Chat visual layer should keep keyboard focus visible');
assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(visual), 'visual-system should not introduce hard-coded color literals');

const introducedEmojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
assert.ok(!introducedEmojiPattern.test(visual), 'visual-system should not use emoji icons');

const styleIds = [];
for (const text of Object.values(source)) {
  for (const match of text.matchAll(/(?:const|var|let)\s+\w*STYLE\w*\s*=\s*['"]([^'"]+)['"]/g)) {
    styleIds.push(match[1]);
  }
}
const duplicates = styleIds.filter((id, index) => styleIds.indexOf(id) !== index);
assert.deepEqual(duplicates, [], 'Chat style ids should stay unique');

const businessAnchors = [
  ['apps/chat/thread-render.js', 'resendThreadMessage'],
  ['apps/chat/thread-render.js', 'deleteThreadMessage'],
  ['apps/chat/thread-tools.js', "tool.id === 'phone'"],
  ['apps/chat/github-tool.js', 'LAST_OPERATION_KEY'],
  ['apps/chat/memory.js', 'MEMORY_STYLE_ID'],
];
for (const [file, anchor] of businessAnchors) {
  assert.ok(source[file].includes(anchor), `${file} should keep business anchor ${anchor}`);
}

console.log('chat visual closure static checks passed');
