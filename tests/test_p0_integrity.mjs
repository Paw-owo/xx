globalThis.localStorage = {
  _data: new Map([
    ['app_settings', '{}'],
    ['chat_char-a_config', '{}'],
    ['mem_sum_char-a', '{}'],
    ['app_lock_unlocked', 'true'],
    ['app_cloud_server', '{}'],
    ['github_tool_token', 'secret'],
    ['unknown_key', 'x']
  ]),
  get length() { return this._data.size; },
  key(index) { return [...this._data.keys()][index] ?? null; },
  getItem(key) { return this._data.get(key) ?? null; },
  setItem(key, value) { this._data.set(key, String(value)); },
  removeItem(key) { this._data.delete(key); }
};

const fs = await import('node:fs/promises');
const { getBackupLocalKeys, isBackupLocalKey } = await import('../core/storage-manager.js');
const { __requestBodyTestHooks: api } = await import('../core/api.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

console.log('[1] 统一备份键边界');
const backupKeys = getBackupLocalKeys();
assert(backupKeys.includes('app_settings'), '静态用户设置进入备份');
assert(backupKeys.includes('chat_char-a_config'), '动态角色配置进入备份');
assert(backupKeys.includes('mem_sum_char-a'), '记忆 checkpoint 进入备份');
assert(!backupKeys.includes('app_lock_unlocked'), '解锁会话状态不进入备份');
assert(backupKeys.includes('app_cloud_server'), '用户主动导出全部时保留云配置');
assert(backupKeys.includes('music_app_settings'), '音乐设置进入备份');
assert(backupKeys.includes('music_current_song'), '音乐播放状态进入备份');
assert(!backupKeys.includes('github_tool_token'), 'GitHub Token 不进入备份');
assert(!isBackupLocalKey('unknown_key'), '未知键不能导入');

console.log('[2] provider 多模态请求体');
const dataUrl = 'data:image/png;base64,QUJD';
const messages = [{ role: 'user', content: [
  { type: 'text', text: '看看图片' },
  { type: 'image_url', image_url: { url: dataUrl } }
] }];
const openai = api.buildOpenAIRequestBody({ messages, model: 'm', stream: false });
assert(openai.messages[0].content.length === 2, 'OpenAI 保留文字和图片块');
const anthropic = api.buildAnthropicRequestBody({ messages, model: 'm', stream: false });
assert(anthropic.messages[0].content.some((item) => item.type === 'image'), 'Anthropic 转换 base64 图片块');
const gemini = api.buildGeminiRequestBody({ messages });
assert(gemini.contents[0].parts.some((item) => item.inline_data?.data === 'QUJD'), 'Gemini 转换 inline_data 图片块');
const ollama = api.buildOllamaRequestBody({ messages, model: 'm', stream: false });
assert(ollama.messages[0].content === '看看图片', '不支持的 Ollama 路径明确保留文字部分');
assert(api.normalizeMessage({ role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl } }] }), '仅图片消息不再被过滤');

console.log('[3] 桌面并发与锁屏保护结构');
const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
assert(/appOpenQueue\.then\(\(\) => openAppNow/.test(html), 'APP 打开通过串行队列执行');
assert(/do \{[\s\S]*?while \(imagesRefreshPending\)/.test(html), '图片刷新在并发请求后补跑');
assert(/desktopEl\.inert = !unlocked/.test(html) && /appLayerEl\.inert = !unlocked/.test(html), '锁定时底层容器 inert');
assert(/lockScreenEl\.inert = unlocked/.test(html), '解锁时隐藏锁屏退出焦点顺序');

console.log('✅ P0 integrity tests passed');
