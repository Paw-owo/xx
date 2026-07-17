// 角色级自动记忆权限与写入强度测试；只使用内存 mock，不调用真实 IndexedDB 或 AI/API。

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

const memory = await import('../core/memory.js');
const threadAi = await import('../apps/chat/thread-ai.js');
const memoryHooks = memory.__testHooks;
const threadHooks = threadAi.__testHooks;

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function setCharacterConfig(characterId, config) {
  local.set(`chat_${characterId}_config`, JSON.stringify(config));
}

function resetHooks() {
  Object.keys(threadHooks.memoryCollection).forEach((key) => { threadHooks.memoryCollection[key] = null; });
  Object.keys(memoryHooks.memoryStorage).forEach((key) => { memoryHooks.memoryStorage[key] = null; });
  local.clear();
}

console.log('\n[1] 自动写关闭后不调用逐轮提取和阶段总结');
{
  let importantCalls = 0;
  let summaryCalls = 0;
  setCharacterConfig('char-off', { memoryAutoEnabled: false });
  threadHooks.memoryCollection.checkImportantInfo = async () => { importantCalls += 1; return []; };
  threadHooks.memoryCollection.checkAndSummarize = async () => { summaryCalls += 1; return []; };
  const records = await threadHooks.collectMemoryWrites('char-off', [], {
    character: { id: 'char-off', name: '关闭角色' },
    userProfile: { name: '用户' }
  });
  assert(records.length === 0, '自动写关闭时不生成 memoryWrites');
  assert(importantCalls === 0 && summaryCalls === 0, '两个自动记忆入口均未调用');
  resetHooks();
}

console.log('\n[2] 配置按角色 ID 隔离且旧角色默认开启');
{
  const calls = [];
  setCharacterConfig('char-off', { memoryAutoEnabled: false });
  setCharacterConfig('char-on', { memoryAutoEnabled: true, memoryWriteIntensity: 'high' });
  threadHooks.memoryCollection.checkImportantInfo = async (id, _messages, options) => { calls.push({ id, options }); return []; };
  threadHooks.memoryCollection.checkAndSummarize = async (id, _options) => { calls.push({ id, summary: true }); return []; };
  await threadHooks.collectMemoryWrites('char-off', [], { character: { id: 'char-off' }, userProfile: {} });
  await threadHooks.collectMemoryWrites('char-on', [], { character: { id: 'char-on' }, userProfile: {} });
  await threadHooks.collectMemoryWrites('char-old', [], { character: { id: 'char-old' }, userProfile: {} });
  assert(!calls.some((item) => item.id === 'char-off'), '关闭角色不会串用其他角色的开启配置');
  assert(calls.filter((item) => item.id === 'char-on').length === 2, '开启角色独立运行两个入口');
  assert(calls.filter((item) => item.id === 'char-old').length === 2, '缺少新字段的旧角色默认保持自动记忆');
  assert(calls.find((item) => item.id === 'char-on' && item.options)?.options.memoryWriteIntensity === 'high', '现有 high 强度值传入判断入口');
  resetHooks();
}

console.log('\n[3] weak/normal/strong 判断约束真实不同并兼容 low/high');
{
  const weak = memoryHooks.buildMemoryIntensityRule('weak');
  const normal = memoryHooks.buildMemoryIntensityRule('normal');
  const strong = memoryHooks.buildMemoryIntensityRule('strong');
  assert(new Set([weak, normal, strong]).size === 3, '三档强度生成三个不同判断约束');
  assert(weak.includes('门槛较高') && weak.includes('忽略临时情绪'), 'weak 提高长期稳定且重要信息门槛');
  assert(normal.includes('门槛为标准'), 'normal 明确沿用当前标准');
  assert(strong.includes('门槛较宽') && strong.includes('仍不得逐条写入'), 'strong 放宽持续价值细节但禁止逐句记录');
  assert(memoryHooks.buildMemoryIntensityRule('low') === weak, '现有 UI low 值等价 weak');
  assert(memoryHooks.buildMemoryIntensityRule('high') === strong, '现有 UI high 值等价 strong');
}

console.log('\n[4] AI 编辑/删除权限只过滤对应操作，允许新增正常落库');
{
  const rows = new Map([
    ['edit-id', { id: 'edit-id', characterId: 'char-a', content: '可编辑旧记忆' }],
    ['delete-id', { id: 'delete-id', characterId: 'char-a', content: '可删除旧记忆' }]
  ]);
  let deleteCalls = 0;
  memoryHooks.memoryStorage.getByIndexDB = async () => [...rows.values()];
  memoryHooks.memoryStorage.getDB = async (_store, id) => rows.get(id) || null;
  memoryHooks.memoryStorage.setDB = async (_store, record) => { rows.set(record.id, record); return record; };
  memoryHooks.memoryStorage.deleteDB = async () => { deleteCalls += 1; return true; };
  const applied = await memoryHooks.applyMemoryOperations('char-a', [
    { action: 'edit', id: 'edit-id', content: '不允许的 AI 编辑' },
    { action: 'add', content: '允许的 AI 新增' },
    { action: 'delete', id: 'delete-id' }
  ], {
    existingMemories: [...rows.values()],
    autoEnabled: true,
    allowEdit: false,
    allowDelete: false,
    callName: '你'
  });
  assert(applied.length === 1 && applied[0].action === 'add', '禁用编辑删除时允许的新增仍正常落库');
  assert(applied.skipped?.map((item) => item.action).join(',') === 'edit,delete', '仅对应 edit/delete 被标记 skipped');
  assert(rows.get('edit-id').content === '可编辑旧记忆' && deleteCalls === 0, '被禁止的 AI 操作未调用底层编辑或删除');
  resetHooks();
}

console.log('\n[5] 手动记忆 API 不读取自动记忆权限');
{
  const rows = new Map();
  setCharacterConfig('char-manual', { memoryAutoEnabled: false, memoryAllowEdit: false, memoryAllowDelete: false });
  memoryHooks.memoryStorage.getByIndexDB = async () => [];
  memoryHooks.memoryStorage.getDB = async (_store, id) => rows.get(id) || null;
  memoryHooks.memoryStorage.setDB = async (_store, record) => { rows.set(record.id, record); return record; };
  memoryHooks.memoryStorage.deleteDB = async (_store, id) => rows.delete(id) || true;
  const added = await memory.addMemory('char-manual', '手动新增', 'manual', true, { id: 'manual-id' });
  const edited = await memory.editMemory('char-manual', 'manual-id', '手动编辑');
  const deleted = await memory.deleteMemory('char-manual', 'manual-id');
  assert(Boolean(added) && edited?.content === '手动编辑' && deleted === true, '关闭 AI 权限不影响手动新增、编辑、删除 API');
  resetHooks();
}

console.log(`\n✅ memory permission tests passed: ${passed}`);
