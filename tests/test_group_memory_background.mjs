// 群聊自动记忆后台收尾与按角色串行测试；不调用真实 AI、IndexedDB 或网络。

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

const threadAi = await import('../apps/chat/thread-ai.js');
const hooks = threadAi.__testHooks;

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function reset() {
  hooks.memoryFinalizationQueues.clear();
  hooks.backgroundMemory.finalize = null;
  local.clear();
}

console.log('\n[1] 群聊消息落库后调度立即返回，不等待记忆完成');
{
  const pending = deferred();
  let finalizeCalls = 0;
  local.set('chat_char-a_config', JSON.stringify({ memoryAutoEnabled: true }));
  hooks.backgroundMemory.finalize = async () => { finalizeCalls += 1; await pending.promise; };
  const scheduled = hooks.scheduleGroupMemoryFinalization({
    characterId: 'char-a',
    character: { id: 'char-a' },
    finalMessage: { id: 'message-a', characterId: 'char-a', groupId: 'group-a' },
    groupId: 'group-a'
  });
  assert(scheduled === true && finalizeCalls === 1, '后台收尾已启动且调度函数同步返回');
  pending.resolve();
  await flush();
  reset();
}

console.log('\n[2] 同一角色任务严格串行');
{
  const first = deferred();
  const starts = [];
  const p1 = hooks.enqueueCharacterMemoryFinalization('char-a', async () => {
    starts.push('first');
    await first.promise;
    return 'first-done';
  });
  const p2 = hooks.enqueueCharacterMemoryFinalization('char-a', async () => {
    starts.push('second');
    return 'second-done';
  });
  await flush();
  assert(starts.join(',') === 'first', '前一任务未完成时同角色后一任务未启动');
  first.resolve();
  assert(await p1 === 'first-done' && await p2 === 'second-done', '前一任务完成后同角色后一任务继续');
  assert(starts.join(',') === 'first,second', '同角色执行顺序保持串行');
  reset();
}

console.log('\n[3] 不同角色任务可以并行');
{
  const a = deferred();
  const b = deferred();
  const starts = [];
  const pa = hooks.enqueueCharacterMemoryFinalization('char-a', async () => { starts.push('a'); await a.promise; });
  const pb = hooks.enqueueCharacterMemoryFinalization('char-b', async () => { starts.push('b'); await b.promise; });
  await flush();
  assert(starts.includes('a') && starts.includes('b'), '角色 A 与角色 B 无全局锁并行启动');
  a.resolve();
  b.resolve();
  await Promise.all([pa, pb]);
  reset();
}

console.log('\n[4] 失败或取消后释放队列并允许后续任务');
{
  let secondRan = false;
  const failed = hooks.enqueueCharacterMemoryFinalization('char-a', async () => { throw new Error('memory failure'); });
  const afterFailure = hooks.enqueueCharacterMemoryFinalization('char-a', async () => { secondRan = true; });
  await failed.catch(() => null);
  await afterFailure;
  assert(secondRan, '失败后同角色后续任务仍可执行');
  assert(!hooks.memoryFinalizationQueues.has('char-a'), '失败链完成后角色队列已释放');

  const cancelled = hooks.enqueueCharacterMemoryFinalization('char-a', async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  });
  await cancelled.catch(() => null);
  assert(!hooks.memoryFinalizationQueues.has('char-a'), '取消异常后角色队列同样释放');
  reset();
}

console.log('\n[5] 自动记忆关闭时不创建群聊后台任务');
{
  let finalizeCalls = 0;
  local.set('chat_char-off_config', JSON.stringify({ memoryAutoEnabled: false }));
  hooks.backgroundMemory.finalize = async () => { finalizeCalls += 1; };
  const scheduled = hooks.scheduleGroupMemoryFinalization({ characterId: 'char-off', finalMessage: { id: 'off' } });
  assert(scheduled === false && finalizeCalls === 0, '关闭自动记忆时未启动后台收尾');
  assert(!hooks.memoryFinalizationQueues.has('char-off'), '关闭自动记忆时未创建角色队列');
  reset();
}

console.log('\n[6] 回写目标必须同时匹配消息角色与群聊');
{
  assert(hooks.isMemoryFinalizationTarget({ characterId: 'char-a', groupId: 'group-a' }, 'char-a', 'group-a'), '正确角色和群聊允许回写');
  assert(!hooks.isMemoryFinalizationTarget({ characterId: 'char-b', groupId: 'group-a' }, 'char-a', 'group-a'), '不同角色消息禁止回写');
  assert(!hooks.isMemoryFinalizationTarget({ characterId: 'char-a', groupId: 'group-b' }, 'char-a', 'group-a'), '不同群聊消息禁止回写');
}

console.log(`\n✅ group memory background tests passed: ${passed}`);
