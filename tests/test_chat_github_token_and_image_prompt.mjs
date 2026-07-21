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
globalThis.document = {
  getElementById() { return null; },
  createElement(tag) { return { tagName: tag, id: '', textContent: '', style: {}, append() {}, appendChild() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } }; },
  head: { appendChild() {} },
  body: { appendChild() {} }
};

const storage = await import('../core/storage.js');
const github = await import('../apps/chat/github-tool.js');
const { getBackupLocalKeys, isBackupLocalKey } = await import('../core/storage-manager.js');
const threadAi = await import('../apps/chat/thread-ai.js');

storage.setData('github_tool_token', 'ghp_secret_should_not_export');
storage.setData('github_tool_config', { owner: 'octo', repo: 'demo', branch: 'main' });
assert.equal(github.getGithubDeveloperConfigSummary().hasToken, true, 'GitHub Token 配置能力仍可用');
assert.equal(isBackupLocalKey('github_tool_token'), false, 'GitHub Token 不允许导入');
assert.equal(getBackupLocalKeys().includes('github_tool_token'), false, 'GitHub Token 不进入普通备份键');
assert.equal(github.clearGithubToken(), true, '清除 Token 入口真实清除');
assert.equal(github.getGithubDeveloperConfigSummary().hasToken, false, '清除后后续配置读取不再复用旧 Token');

const dataUrl = 'data:image/png;base64,QUJDREVGRw==';
const promptText = threadAi.__testHooks.formatMessageForPrompt({ type: 'image', role: 'user', content: '给你看', imageBase64: dataUrl, images: [dataUrl] }, 'private', '你');
assert.equal(promptText, '[图片] 给你看', '普通 prompt 序列化只保留图片占位和配文');
assert.doesNotMatch(promptText, /data:image|base64|QUJDREVGRw/, '普通 prompt 序列化不含图片 base64');

const threadAiSource = readFileSync('apps/chat/thread-ai.js', 'utf8');
assert.match(threadAiSource, /await analyzeImages\([\s\S]*images: imageList[\s\S]*captionLine[\s\S]*note/, '图片上下文先交给识图助手，再把配文和隐藏纸条放入同轮文本上下文');
assert.match(threadAiSource, /const chatMessages = promptMessages\.filter\(\(m\) => m\.role !== 'system'\)/, '主模型请求使用 promptMessages 派生内容');

console.log('chat github token and image prompt checks passed');
