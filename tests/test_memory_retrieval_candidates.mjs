// 记忆候选必须先按既有评分竞争，再执行候选上限和 Top-K 截取。

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

function makeRecord({ id, characterId = 'char-a', content, importance = 1, updatedAt, keywords = [] }) {
  return {
    id,
    characterId,
    content,
    importance,
    keywords,
    source: 'manual',
    createdAt: updatedAt,
    updatedAt
  };
}

function resetStorage() {
  Object.keys(hooks.memoryStorage).forEach((key) => { hooks.memoryStorage[key] = null; });
}

const now = Date.parse('2026-07-17T12:00:00.000Z');
const recentRecords = Array.from({ length: 12 }, (_, index) => makeRecord({
  id: `recent-${index}`,
  content: `最近但无关的普通闲聊 ${index}`,
  updatedAt: new Date(now - index * 60000).toISOString()
}));
const oldRelevant = makeRecord({
  id: 'old-relevant',
  content: '我长期最重要的旅行目的地是冰岛火山和冰川',
  importance: 5,
  keywords: ['冰岛火山', '冰川'],
  updatedAt: '2020-01-01T00:00:00.000Z'
});

console.log('\n[1] 超过原候选上限的旧高相关记忆仍参与评分');
{
  const selected = hooks.selectRelevantMemories(
    [...recentRecords, oldRelevant],
    '冰岛火山冰川旅行',
    { candidateLimit: 10, limit: 3, now }
  );
  assert(selected.some((item) => item.id === oldRelevant.id), '旧高相关、高重要记录进入最终 Top-K');
  assert(selected[0].id === oldRelevant.id, '新但不相关记录不会仅因更新时间挤掉旧高相关记录');
  assert(selected.length === 3, '现有 Top-K 数量保持不变');
}

console.log('\n[2] 角色隔离仍由现有读取边界保证');
{
  const foreignRelevant = { ...oldRelevant, id: 'foreign-relevant', characterId: 'char-b' };
  const queriedCharacters = [];
  hooks.memoryStorage.getByIndexDB = async (_store, _index, characterId) => {
    queriedCharacters.push(characterId);
    return [...recentRecords, oldRelevant, foreignRelevant];
  };

  const selected = await memory.getRelevantMemories('char-a', {
    query: '冰岛火山冰川旅行',
    memoryCandidateLimit: 10,
    memoryInjectLimit: 3
  });
  assert(queriedCharacters.join(',') === 'char-a', '只按当前 characterId 查询');
  assert(selected.some((item) => item.id === oldRelevant.id), '当前角色的旧高相关记忆正常召回');
  assert(!selected.some((item) => item.id === foreignRelevant.id), '其他角色记忆不会混入结果');
  resetStorage();
}

console.log('\n[3] 无查询、空记忆、并列评分及正常短列表不回归');
{
  const tied = [
    makeRecord({ id: 'tie-a', content: '同分 A', importance: 3, updatedAt: '2020-01-01T00:00:00.000Z' }),
    makeRecord({ id: 'tie-b', content: '同分 B', importance: 3, updatedAt: '2020-01-01T00:00:00.000Z' }),
    makeRecord({ id: 'tie-c', content: '同分 C', importance: 3, updatedAt: '2020-01-01T00:00:00.000Z' })
  ];
  const noQuery = hooks.selectRelevantMemories(tied, '', { candidateLimit: 10, limit: 3, now });
  assert(noQuery.map((item) => item.id).join(',') === 'tie-a,tie-b,tie-c', '无查询且并列评分时保持既有稳定顺序');
  assert(hooks.selectRelevantMemories([], '任何查询', { candidateLimit: 10, limit: 3, now }).length === 0, '空记忆返回空结果');

  const normal = hooks.selectRelevantMemories(
    [
      makeRecord({ id: 'normal-related', content: '喜欢喝茉莉花茶', importance: 4, keywords: ['茉莉花茶'], updatedAt: '2026-07-16T00:00:00.000Z' }),
      makeRecord({ id: 'normal-other', content: '普通天气闲聊', importance: 2, updatedAt: '2026-07-17T00:00:00.000Z' })
    ],
    '茉莉花茶',
    { candidateLimit: 10, limit: 3, now }
  );
  assert(normal[0].id === 'normal-related', '现有正常相关性检索仍优先相关记录');
}

console.log(`\n✅ memory retrieval candidate tests passed: ${passed}`);
