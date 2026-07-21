// tests/test_partial_snapshot.mjs
// 验证本地快照能区分空 store 与读取失败，且云上传不会把 partial 快照当完整成功。

const local = new Map();
globalThis.localStorage = {
  getItem: (key) => local.has(key) ? JSON.stringify(local.get(key)) : null,
  setItem: (key, value) => local.set(key, JSON.parse(value)),
  removeItem: (key) => local.delete(key),
  key: (index) => [...local.keys()][index] ?? null,
  get length() { return local.size; }
};
globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.window = {
  dispatchEvent() {},
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis)
};

const {
  buildLocalSnapshot,
  uploadSnapshotToCloud,
  __snapshotTestHooks
} = await import('../core/storage-manager.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

function resetHooks() {
  __snapshotTestHooks.getAllDBStrict = null;
  local.clear();
}

console.log('\n[1] store 正常读取且为空：不标记 partial');
{
  __snapshotTestHooks.getAllDBStrict = async () => [];
  const snapshot = await buildLocalSnapshot();
  assert(snapshot.partial === false, '空 store 是完整快照，不产生 partial');
  assert(Array.isArray(snapshot.warnings) && snapshot.warnings.length === 0, '空 store 不产生 warning');
  assert(Array.isArray(snapshot.failedStores) && snapshot.failedStores.length === 0, '空 store 不记录 failedStores');
  assert(Object.values(snapshot.indexedDB).every(Array.isArray), '正常读取的 store 仍写入数组');
  resetHooks();
}

console.log('\n[2] 某个 store 读取失败：标记 partial 且不伪装为空数组');
{
  __snapshotTestHooks.getAllDBStrict = async (storeName) => {
    if (storeName === 'messages') throw new Error('read failed token=super-secret');
    return [];
  };
  const snapshot = await buildLocalSnapshot();
  assert(snapshot.partial === true, '读取失败会标记 partial');
  assert(snapshot.failedStores.some((item) => item.storeName === 'messages'), 'failedStores 记录失败 store');
  assert(snapshot.warnings.some((item) => item.includes('messages')), 'warnings 提醒失败 store');
  assert(!Object.hasOwn(snapshot.indexedDB, 'messages'), '失败 store 不写成普通空数组');
  assert(!/super-secret/.test(JSON.stringify(snapshot.failedStores)), '错误信息会脱敏/截断，不带敏感 token 值');
  resetHooks();
}

console.log('\n[3] 云上传遇到 partial：不推进成功状态');
{
  local.set('app_cloud_server', { enabled: true, endpoint: 'https://cloud.example', apiKey: 'key', status: 'ok' });
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error('should not upload partial'); };
  let error = null;
  try {
    await uploadSnapshotToCloud({ snapshot: { localStorage: {}, indexedDB: {}, partial: true, failedStores: [{ storeName: 'messages' }] } });
  } catch (caught) {
    error = caught;
  }
  const status = local.get('app_cloud_sync_status');
  assert(Boolean(error), 'partial 快照上传会抛出错误');
  assert(fetchCalled === false, 'partial 快照不会发起云端 PUT');
  assert(status?.running === false && /没抱紧/.test(status?.lastError || ''), '同步状态不会当作完整成功推进');
  resetHooks();
}

console.log('partial snapshot tests passed');
