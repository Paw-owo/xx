globalThis.localStorage = {
  _data: new Map(),
  get length() { return this._data.size; },
  key(index) { return [...this._data.keys()][index] ?? null; },
  getItem(key) { return this._data.get(key) ?? null; },
  setItem(key, value) { this._data.set(key, String(value)); },
  removeItem(key) { this._data.delete(key); }
};

const fs = await import('node:fs/promises');
const { __storageTestHooks } = await import('../core/storage.js');
const { buildLocalSnapshot } = await import('../core/storage-manager.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ${message}`);
}

console.log('[1] 存储循环引用边界');
const cyclic = { id: 'cyclic' };
cyclic.self = cyclic;
let cycleRejected = false;
try {
  __storageTestHooks.cleanForDB(cyclic);
} catch (error) {
  cycleRejected = error instanceof TypeError;
}
assert(cycleRejected, '循环引用被明确拒绝');
const shared = { value: 1 };
const cleaned = __storageTestHooks.cleanForDB({ left: shared, right: shared });
assert(cleaned.left.value === 1 && cleaned.right.value === 1, '非循环的共享引用仍可保存');

console.log('[2] 云快照不携带解锁会话');
localStorage.setItem('app_lock_unlocked', 'true');
localStorage.setItem('app_settings', JSON.stringify({ fontSize: 15 }));
const snapshot = await buildLocalSnapshot();
assert(!Object.hasOwn(snapshot.localStorage, 'app_lock_unlocked'), '解锁状态不进入云快照');
assert(Object.hasOwn(snapshot.localStorage, 'app_settings'), '持久设置仍进入云快照');

console.log('[3] AI、电话与天气状态闭环');
const actions = await fs.readFile(new URL('../apps/chat/thread-actions.js', import.meta.url), 'utf8');
const call = await fs.readFile(new URL('../apps/chat/thread-call.js', import.meta.url), 'utf8');
const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
const ai = await fs.readFile(new URL('../apps/chat/thread-ai.js', import.meta.url), 'utf8');
assert(/if \(!generated\)[\s\S]*?setDB\(store, cleanForDB\(target\)\)/.test(actions), '重新生成失败会恢复原消息');
assert(/finally \{[\s\S]*?state\.aiGenerating = false;[\s\S]*?state\.renderOnly\?\.\(\)/.test(actions), 'AI 请求结束会刷新生成状态');
assert(/replyController\?\.abort\(\)/.test(call) && /signal: controller\.signal/.test(call), '电话挂断与卸载会取消当前请求');
assert(/setTimeout\(\(\) => controller\.abort\(\), 8000\)/.test(html), '天气请求具备超时回退');
assert(/return getData\('anniversaries'\)/.test(ai), 'AI 优先读取纪念日 APP 的规范键');

console.log('P1/P2 safety tests passed');
