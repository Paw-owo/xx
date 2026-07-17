// 全量导入/快照恢复的失败回滚测试；只使用内存数据，不访问浏览器 IndexedDB、云端或生产服务。

const local = new Map();
globalThis.localStorage = {
  getItem: (key) => local.has(key) ? JSON.stringify(local.get(key)) : null,
  setItem: (key, value) => local.set(key, JSON.parse(value)),
  removeItem: (key) => local.delete(key),
  key: (index) => [...local.keys()][index] ?? null,
  get length() { return local.size; }
};
globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.window = { dispatchEvent() {} };

const {
  restoreLocalSnapshot,
  applyLocalSnapshot,
  buildLocalSnapshot,
  isMemorySummaryCheckpointKey,
  __restoreTestHooks
} = await import('../core/storage-manager.js');

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function clone(value) {
  return structuredClone(value);
}

function installMemoryStorage(initialStores, options = {}) {
  const stores = new Map(Object.entries(clone(initialStores)));
  const calls = { clear: [], set: [], localSet: [], remove: [] };
  let clearCount = 0;

  __restoreTestHooks.getAllDBStrict = async (name) => clone(stores.get(name) || []);
  __restoreTestHooks.clearStoreDB = async (name) => {
    calls.clear.push(name);
    clearCount += 1;
    if (options.failClearAt === clearCount) return false;
    stores.set(name, []);
    return true;
  };
  __restoreTestHooks.setDB = async (name, key, record) => {
    calls.set.push({ name, key });
    if (options.failRecordId === record.id) return null;
    const rows = stores.get(name) || [];
    stores.set(name, [...rows.filter((item) => item.id !== key && item.key !== key), clone(record)]);
    return clone(record);
  };
  __restoreTestHooks.setData = async (key, value) => {
    calls.localSet.push(key);
    if (options.failLocalKey === key) return false;
    local.set(key, clone(value));
    return true;
  };
  __restoreTestHooks.removeData = async (key) => {
    calls.remove.push(key);
    local.delete(key);
    return true;
  };

  return { stores, calls };
}

function resetHooks() {
  Object.keys(__restoreTestHooks).forEach((key) => { __restoreTestHooks[key] = null; });
  local.clear();
}

const allowAppSettings = (key, internal = false) => key === 'app_settings' || (internal && key === 'app_cloud_sync_status');

console.log('\n[1] 输入校验失败不改变原数据');
{
  const env = installMemoryStorage({ messages: [{ id: 'old-message', content: 'old' }] });
  local.set('app_settings', { old: true });
  const beforeStore = clone(env.stores.get('messages'));
  const beforeLocal = clone(local.get('app_settings'));
  let failed = false;
  try {
    await restoreLocalSnapshot({
      localStorage: { app_settings: { next: true } },
      indexedDB: { messages: [{ content: 'missing primary key' }], forbidden: [] }
    }, { stores: ['messages'], isAllowedLocalKey: allowAppSettings });
  } catch { failed = true; }
  assert(failed, '无效 store/主键会在写入前被拒绝');
  assert(JSON.stringify(env.stores.get('messages')) === JSON.stringify(beforeStore), '校验失败时 IndexedDB 数据不变');
  assert(JSON.stringify(local.get('app_settings')) === JSON.stringify(beforeLocal), '校验失败时 localStorage 数据不变');
  assert(env.calls.clear.length === 0 && env.calls.set.length === 0, '校验失败时没有执行清空或写入');
  resetHooks();
}

console.log('\n[2] clearStoreDB 失败立即停止');
{
  const env = installMemoryStorage({ messages: [{ id: 'old' }], memories: [{ id: 'old-memory' }] }, { failClearAt: 1 });
  let error;
  try {
    await restoreLocalSnapshot({ localStorage: {}, indexedDB: { messages: [{ id: 'new' }], memories: [{ id: 'new-memory' }] } }, {
      stores: ['messages', 'memories'], isAllowedLocalKey: allowAppSettings
    });
  } catch (caught) { error = caught; }
  assert(Boolean(error), '清空失败不会返回成功');
  assert(env.calls.clear.length === 1, '单个 store 清空失败后不再清空后续 store');
  assert(env.calls.set.length === 0, '清空失败后不进入导入写入');
  resetHooks();
}

console.log('\n[3] 中途 setDB 失败恢复所有已涉及 store');
{
  const original = { messages: [{ id: 'old-message' }], memories: [{ id: 'old-memory' }] };
  const env = installMemoryStorage(original, { failRecordId: 'fail-message' });
  let error;
  try {
    await restoreLocalSnapshot({ localStorage: {}, indexedDB: {
      messages: [{ id: 'new-message' }, { id: 'fail-message' }],
      memories: [{ id: 'new-memory' }]
    } }, { stores: ['messages', 'memories'], isAllowedLocalKey: allowAppSettings });
  } catch (caught) { error = caught; }
  assert(error?.recoveryComplete === true, '中途写入失败明确报告原数据已恢复');
  assert(JSON.stringify(env.stores.get('messages')) === JSON.stringify(original.messages), '失败后恢复 messages 原数据');
  assert(JSON.stringify(env.stores.get('memories')) === JSON.stringify(original.memories), '失败后恢复非故障 store 原数据');
  assert(!env.calls.set.some((call) => call.key === 'new-memory'), '中途失败后不继续写入后续 store');
  resetHooks();
}

console.log('\n[4] setData 失败不更新同步成功状态并回滚数据库');
{
  const original = { messages: [{ id: 'old-message' }] };
  const env = installMemoryStorage(original, { failLocalKey: 'app_cloud_sync_status' });
  let error;
  try {
    await applyLocalSnapshot({ localStorage: {}, indexedDB: { messages: [{ id: 'new-message' }] } });
  } catch (caught) { error = caught; }
  assert(Boolean(error), '同步状态写入失败时快照恢复不返回成功');
  assert(!local.has('app_cloud_sync_status'), '失败时没有留下同步成功状态');
  assert(JSON.stringify(env.stores.get('messages')) === JSON.stringify(original.messages), '同步状态失败时恢复原数据库内容');
  resetHooks();
}

console.log('\n[5] 全部成功保持原导入行为');
{
  const env = installMemoryStorage({ messages: [{ id: 'old-message' }], memories: [{ id: 'old-memory' }] });
  local.set('app_settings', { old: true });
  const result = await restoreLocalSnapshot({
    localStorage: { app_settings: { next: true } },
    indexedDB: { messages: [{ id: 'new-message' }], memories: [{ id: 'new-memory' }] }
  }, { stores: ['messages', 'memories'], isAllowedLocalKey: allowAppSettings });
  assert(result === true, '全部写入成功时返回成功');
  assert(env.stores.get('messages')[0].id === 'new-message' && env.stores.get('memories')[0].id === 'new-memory', '所有 store 正常替换为导入数据');
  assert(local.get('app_settings').next === true, 'localStorage 正常写入导入值');
  resetHooks();
}

console.log('\n[6] 回滚自身失败不伪装完整恢复');
{
  const env = installMemoryStorage({ messages: [{ id: 'old-message' }] }, { failRecordId: 'fail-message', failClearAt: 2 });
  let error;
  try {
    await restoreLocalSnapshot({ localStorage: {}, indexedDB: { messages: [{ id: 'fail-message' }] } }, {
      stores: ['messages'], isAllowedLocalKey: allowAppSettings
    });
  } catch (caught) { error = caught; }
  assert(error?.recoveryComplete === false, '回滚失败返回 recoveryComplete=false');
  assert(String(error?.message).includes('原数据可能未完整恢复'), '回滚失败提供明确风险提示');
  assert(env.calls.clear.length === 2, '发生过导入清空和回滚清空尝试');
  resetHooks();
}

console.log('\n[7] 记忆总结 checkpoint 纳入快照并安全恢复');
{
  local.set('mem_sum_char-a', 'checkpoint-a');
  local.set('mem_sum_char-b', 'checkpoint-b');
  local.set('mem_sum_', 'invalid-empty');
  local.set('mem_sum_bad key', 'invalid-space');
  local.set('not_mem_sum_char-a', 'unrelated');

  const snapshot = await buildLocalSnapshot();
  assert(snapshot.localStorage['mem_sum_char-a'] === 'checkpoint-a', '全量快照收集规范 checkpoint');
  assert(snapshot.localStorage['mem_sum_char-b'] === 'checkpoint-b', '多个角色 checkpoint 均被收集');
  assert(!Object.hasOwn(snapshot.localStorage, 'mem_sum_') && !Object.hasOwn(snapshot.localStorage, 'mem_sum_bad key'), '无效 mem_sum 动态键不进入快照');
  assert(!Object.hasOwn(snapshot.localStorage, 'not_mem_sum_char-a'), '无关 localStorage 键不进入快照');

  local.delete('mem_sum_char-a');
  installMemoryStorage({});
  await restoreLocalSnapshot({ localStorage: { 'mem_sum_char-a': 'checkpoint-a' }, indexedDB: {} }, {
    stores: [],
    isAllowedLocalKey: isMemorySummaryCheckpointKey
  });
  assert(local.get('mem_sum_char-a') === 'checkpoint-a', '恢复后 checkpoint 保持原值');
  resetHooks();
}

console.log('\n[8] 无效动态键被拒绝，旧备份缺少 checkpoint 保持兼容');
{
  installMemoryStorage({});
  let invalidRejected = false;
  try {
    await restoreLocalSnapshot({ localStorage: { 'mem_sum_bad key': 'bad' }, indexedDB: {} }, {
      stores: [],
      isAllowedLocalKey: isMemorySummaryCheckpointKey
    });
  } catch (_) {
    invalidRejected = true;
  }
  assert(invalidRejected, '不规范的 mem_sum 键不能恢复');

  const oldBackupResult = await restoreLocalSnapshot({ localStorage: {}, indexedDB: {} }, {
    stores: [],
    isAllowedLocalKey: isMemorySummaryCheckpointKey
  });
  assert(oldBackupResult === true, '旧备份没有 checkpoint 时仍可恢复');
  resetHooks();
}

console.log('\n[9] checkpoint 写入失败不返回成功并恢复原值');
{
  local.set('mem_sum_char-a', 'old-checkpoint');
  installMemoryStorage({}, { failLocalKey: 'mem_sum_char-a' });
  let error;
  try {
    await restoreLocalSnapshot({ localStorage: { 'mem_sum_char-a': 'new-checkpoint' }, indexedDB: {} }, {
      stores: [],
      isAllowedLocalKey: isMemorySummaryCheckpointKey
    });
  } catch (caught) {
    error = caught;
  }
  assert(Boolean(error), 'checkpoint 写入失败时恢复流程不返回成功');
  assert(local.get('mem_sum_char-a') === 'old-checkpoint', 'checkpoint 写入失败后恢复操作前原值');
  resetHooks();
}

console.log(`\n✅ atomic restore tests passed: ${passed}`);
