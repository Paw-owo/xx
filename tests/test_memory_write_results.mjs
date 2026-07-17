// 记忆写入真实结果测试：仅使用内存 mock，不访问真实 IndexedDB 或 AI/API。

import fs from 'node:fs';

const local = new Map();
globalThis.localStorage = {
  getItem: (key) => local.has(key) ? local.get(key) : null,
  setItem: (key, value) => local.set(key, String(value)),
  removeItem: (key) => local.delete(key)
};
globalThis.window = { AppBus: { emit() {} }, AppEvents: { emit() {} }, dispatchEvent() {} };
globalThis.document = {
  createElement: () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, append() {}, appendChild() {}, addEventListener() {}, querySelector() { return null; } }),
  createTextNode: (text) => ({ textContent: text }),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  head: { appendChild() {} },
  body: { appendChild() {}, contains() { return true; }, style: {} }
};
try {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
} catch {}

const memoryModule = await import('../core/memory.js');
const { addMemory, editMemory, deleteMemory, __testHooks: memoryHooks } = memoryModule;
const threadAi = await import('../apps/chat/thread-ai.js');

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function resetStorageHooks() {
  Object.keys(memoryHooks.memoryStorage).forEach((key) => { memoryHooks.memoryStorage[key] = null; });
}

console.log('\n[1] 新增、编辑、删除只返回真实底层结果');
{
  memoryHooks.memoryStorage.getByIndexDB = async () => [];
  memoryHooks.memoryStorage.setDB = async () => null;
  assert(await addMemory('char-a', '新增失败', 'manual', true) === null, 'addMemory 的 setDB 失败不返回假对象');

  memoryHooks.memoryStorage.getDB = async () => ({ id: 'memory-a', characterId: 'char-a', content: '旧内容' });
  assert(await editMemory('char-a', 'memory-a', '新内容') === null, 'editMemory 的 setDB 失败不返回修改后对象');

  memoryHooks.memoryStorage.deleteDB = async () => false;
  assert(await deleteMemory('char-a', 'memory-a') === false, 'deleteMemory 的 deleteDB 失败不返回 true');
  resetStorageHooks();
}

console.log('\n[2] 角色不匹配时不调用底层写接口');
{
  let setCalls = 0;
  let deleteCalls = 0;
  memoryHooks.memoryStorage.getDB = async () => ({ id: 'memory-b', characterId: 'char-b', content: '旧内容' });
  memoryHooks.memoryStorage.setDB = async () => { setCalls += 1; return {}; };
  memoryHooks.memoryStorage.deleteDB = async () => { deleteCalls += 1; return true; };
  assert(await editMemory('char-a', 'memory-b', '越权编辑') === null, '角色不匹配时禁止编辑');
  assert(await deleteMemory('char-a', 'memory-b') === false, '角色不匹配时禁止删除');
  assert(setCalls === 0 && deleteCalls === 0, '角色不匹配时底层写接口均未调用');
  resetStorageHooks();
}

console.log('\n[3] 混合操作中途失败后停止，applied 仅含真实成功项');
{
  let writes = 0;
  memoryHooks.memoryStorage.getByIndexDB = async () => [];
  memoryHooks.memoryStorage.setDB = async (_store, record) => {
    writes += 1;
    return writes === 1 ? record : null;
  };
  const applied = await memoryHooks.applyMemoryOperations('char-a', [
    { action: 'add', content: '第一条成功记忆' },
    { action: 'add', content: '第二条失败记忆' },
    { action: 'add', content: '第三条不应执行' }
  ], { existingMemories: [], callName: '你' });
  assert(applied.length === 1 && applied[0].memory.content.includes('第一条成功记忆'), 'applied 只包含真实成功的第一项');
  assert(applied.failures?.length === 1 && applied.failures[0].status === 'failed', '失败项以最小失败信息单独返回');
  assert(writes === 2, '中途失败后未执行第三项');
  resetStorageHooks();
}

console.log('\n[4] collectMemoryWrites 映射不伪装失败状态');
{
  const successful = [{ action: 'add', memory: { id: 'ok', characterId: 'char-a', content: '真实成功' } }];
  successful.failures = [{ action: 'edit', status: 'failed', reason: 'storage' }];
  const records = threadAi.__testHooks.mapMemoryOperationRecords([successful], 'char-a');
  assert(records.filter((item) => item.status === 'done').length === 1, '仅真实成功结果映射为 done');
  assert(records.filter((item) => item.status === 'failed').length === 1, '写入失败映射为 failed');
  assert(!records.find((item) => item.status === 'failed').result, '失败记录不暴露记忆正文');
}

console.log('\n[5] 正常新增、编辑、删除保持原返回行为');
{
  const rows = new Map();
  memoryHooks.memoryStorage.getByIndexDB = async () => [];
  memoryHooks.memoryStorage.getDB = async (_store, id) => rows.get(id) || null;
  memoryHooks.memoryStorage.setDB = async (_store, record) => { rows.set(record.id, record); return record; };
  memoryHooks.memoryStorage.deleteDB = async (_store, id) => rows.delete(id) || true;
  const added = await addMemory('char-a', '正常新增', 'manual', true, { id: 'memory-ok' });
  const edited = await editMemory('char-a', 'memory-ok', '正常编辑');
  const deleted = await deleteMemory('char-a', 'memory-ok');
  assert(added?.id === 'memory-ok', '正常新增返回已保存记忆');
  assert(edited?.content === '正常编辑', '正常编辑返回已保存记忆');
  assert(deleted === true && !rows.has('memory-ok'), '正常删除返回 true');
  resetStorageHooks();
}

console.log('\n[6] 手动 UI 成功提示受真实返回值保护');
{
  const chatMemorySource = fs.readFileSync(new URL('../apps/chat/memory.js', import.meta.url), 'utf8');
  const characterSource = fs.readFileSync(new URL('../apps/characters.js', import.meta.url), 'utf8');
  assert(/const saved = await saveMemory\([\s\S]*?if \(!saved\)[\s\S]*?记忆保存失败/.test(chatMemorySource), '消息记忆页保存失败分支阻止成功提示');
  assert(/const deleted = await coreDeleteMemory[\s\S]*?if \(!deleted\)[\s\S]*?记忆删除失败/.test(chatMemorySource), '消息记忆页删除失败分支阻止成功提示');
  assert(/const saved = await addMemory[\s\S]*?if \(!saved\)[\s\S]*?记忆保存失败/.test(characterSource), '角色记忆新增失败分支阻止成功提示');
  assert(/const deleted = await deleteMemory[\s\S]*?if \(!deleted\)[\s\S]*?记忆删除失败/.test(characterSource), '角色记忆删除失败分支阻止成功提示');
  assert(/const saved = await editMemory[\s\S]*?if \(!saved\)[\s\S]*?记忆保存失败/.test(characterSource), '角色记忆编辑失败分支阻止成功提示');
}

console.log(`\n✅ memory write result tests passed: ${passed}`);
