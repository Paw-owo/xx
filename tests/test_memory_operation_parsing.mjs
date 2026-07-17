// 自动记忆 action 白名单与异常输入拒绝测试；仅使用内存存储 mock。

globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {}
};

const memory = await import('../core/memory.js');
const hooks = memory.__testHooks;

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function resetStorage() {
  Object.keys(hooks.memoryStorage).forEach((key) => { hooks.memoryStorage[key] = null; });
}

console.log('\n[1] NONE 与所有空输入均解析为零操作');
{
  const inputs = [
    null,
    '',
    '   ',
    [],
    { operations: [] },
    '{"operations":[]}',
    { operations: [{ action: 'NONE', content: '不得写入' }] },
    '{"operations":[{"action":"none","content":"不得写入"}]}'
  ];
  for (const input of inputs) {
    assert(hooks.parseMemoryOperations(input).length === 0, `零操作输入被安全忽略：${JSON.stringify(input)}`);
  }
}

console.log('\n[2] 未知、拼错、缺失 action 和异常对象均被拒绝');
{
  const invalid = [
    { operations: [{ action: 'create', content: '未知 action' }] },
    { operations: [{ action: 'udpate', content: '拼写错误' }] },
    { operations: [{ content: '缺失 action' }] },
    { operations: [null, 42, 'add'] },
    { action: '', content: '空 action' },
    { remember: '旧隐式新增字段不得再触发' }
  ];
  for (const input of invalid) {
    assert(hooks.parseMemoryOperations(input).length === 0, `无效操作被拒绝：${JSON.stringify(input)}`);
  }
}

console.log('\n[3] 非 JSON 文本和夹杂文本不再逐行降级为 ADD');
{
  const invalidText = [
    '请记住我喜欢咖啡',
    '- 第一条\n- 第二条',
    '无',
    '说明文字 {"operations":[{"action":"add","content":"夹带 JSON"}]}',
    '```json\n{"operations":[{"action":"add","content":"未闭合代码块"}]}'
  ];
  for (const input of invalidText) {
    assert(hooks.parseMemoryOperations(input).length === 0, `非 JSON 文本零操作：${JSON.stringify(input)}`);
  }
}

console.log('\n[4] 明确白名单和现有代码别名保持兼容');
{
  const operations = hooks.parseMemoryOperations({ operations: [
    { action: 'ADD', content: '新增' },
    { action: 'edit', id: 'edit-id', content: '编辑' },
    { action: 'UPDATE', id: 'update-id', content: '更新' },
    { action: 'modify', id: 'modify-id', content: '修改别名' },
    { action: 'DELETE', id: 'delete-id' },
    { action: 'remove', id: 'remove-id' },
    { action: 'drop', id: 'drop-id' }
  ] });
  assert(operations.map((item) => item.action).join(',') === 'add,edit,edit,edit,delete,delete,delete', 'ADD/EDIT/UPDATE/DELETE 与现有明确别名正确归一');

  const fenced = hooks.parseMemoryOperations('```json\n{"operations":[{"action":"add","content":"合法 fenced JSON"}]}\n```');
  assert(fenced.length === 1 && fenced[0].action === 'add', '完整 JSON 代码块仍兼容');
}

console.log('\n[5] 混合批次只执行有效项，NONE/无效项零写入');
{
  const parsed = hooks.parseMemoryOperations({ operations: [
    { action: 'ADD', content: '合法新增' },
    { action: 'NONE', content: '明确不执行' },
    { action: 'create', content: '未知操作' },
    { content: '缺失 action' },
    { action: 'udpate', content: '拼错操作' }
  ] });
  let writes = 0;
  hooks.memoryStorage.getByIndexDB = async () => [];
  hooks.memoryStorage.setDB = async (_store, record) => { writes += 1; return record; };
  const applied = await hooks.applyMemoryOperations('char-a', parsed, { existingMemories: [], callName: '你' });
  assert(parsed.length === 1, '混合批次解析后只保留一个有效操作');
  assert(writes === 1 && applied.length === 1 && applied[0].action === 'add', '混合批次只落库有效 ADD');
  assert(applied.failures.length === 0 && applied.skipped.length === 0, 'NONE 与解析无效项不进入 failures/skipped');
  resetStorage();
}

console.log('\n[6] 手动记忆接口保持原行为');
{
  hooks.memoryStorage.getByIndexDB = async () => [];
  hooks.memoryStorage.setDB = async (_store, record) => record;
  const saved = await memory.addMemory('char-manual', '手动新增不依赖 AI action', 'manual', true, { id: 'manual-id' });
  assert(saved?.id === 'manual-id', '手动 addMemory 不受自动解析收紧影响');
  resetStorage();
}

console.log(`\n✅ memory operation parsing tests passed: ${passed}`);
