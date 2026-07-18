// 两条角色删除路径共用同一角色私有数据清理入口；聊天消息明确不在清理范围。

globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {}
};

const fs = await import('node:fs/promises');
const deletion = await import('../core/character-deletion.js');
const hooks = deletion.__testHooks;

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function installStorage({ failDelete = null, failCheckpoint = false } = {}) {
  const stores = new Map([
    ['characters', [
      { id: 'char-a', name: 'A' },
      { id: 'char-b', name: 'B' }
    ]],
    ['messages', [
      { id: 'message-a', characterId: 'char-a', content: '必须保留' },
      { id: 'message-b', characterId: 'char-b', content: '其他角色消息' }
    ]],
    ['memories', [
      { id: 'memory-a', characterId: 'char-a' },
      { id: 'memory-b', characterId: 'char-b' }
    ]],
    ['dreams', [{ id: 'dream-a', characterId: 'char-a' }, { id: 'dream-b', characterId: 'char-b' }]],
    ['grudges', [{ id: 'grudge-a', characterId: 'char-a' }, { id: 'grudge-b', characterId: 'char-b' }]],
    ['punishments', [{ id: 'punishment-a', characterId: 'char-a' }, { id: 'punishment-b', characterId: 'char-b' }]],
    ['relationship_locks', [{ id: 'lock-a', characterId: 'char-a' }, { id: 'lock-b', characterId: 'char-b' }]],
    ['ai_phone_diaries', [{ id: 'diary-a', characterId: 'char-a' }, { id: 'diary-b', characterId: 'char-b' }]],
    ['groups', [{ id: 'group-1', memberIds: ['char-a', 'char-b'] }]]
  ]);
  const localKeys = new Set(['mem_sum_char-a', 'mem_sum_char-b']);
  const calls = [];

  hooks.operations.getAllDBStrict = async (storeName) => {
    calls.push(['read', storeName]);
    return structuredClone(stores.get(storeName) || []);
  };
  hooks.operations.getData = async (key, fallback) => localKeys.has(key) ? { cursor: 7 } : fallback;
  hooks.operations.deleteDB = async (storeName, id) => {
    calls.push(['delete', storeName, id]);
    if (failDelete === `${storeName}:${id}`) return false;
    stores.set(storeName, (stores.get(storeName) || []).filter((row) => row.id !== id));
    return true;
  };
  hooks.operations.setDB = async (storeName, record) => {
    calls.push(['set', storeName, record.id]);
    const rows = stores.get(storeName) || [];
    stores.set(storeName, rows.some((row) => row.id === record.id)
      ? rows.map((row) => row.id === record.id ? record : row)
      : [...rows, record]);
    return record;
  };
  hooks.operations.removeData = async (key) => {
    calls.push(['removeData', key]);
    if (failCheckpoint) return false;
    localKeys.delete(key);
    return true;
  };
  hooks.operations.setData = async (key) => {
    calls.push(['setData', key]);
    localKeys.add(key);
    return true;
  };
  hooks.operations.getNow = async () => '2026-07-17T12:00:00.000Z';

  return { stores, localKeys, calls };
}

function resetStorage() {
  Object.keys(hooks.operations).forEach((key) => { hooks.operations[key] = null; });
}

console.log('\n[1] 两条 UI 路径调用同一个共用入口');
{
  const characterSource = await fs.readFile(new URL('../apps/characters.js', import.meta.url), 'utf8');
  const chatListSource = await fs.readFile(new URL('../apps/chat/list.js', import.meta.url), 'utf8');
  assert(characterSource.includes("from '../core/character-deletion.js'"), '角色管理导入共用清理入口');
  assert(chatListSource.includes("from '../../core/character-deletion.js'"), '聊天列表导入同一共用清理入口');
  assert(/deleteCharacterPrivateData\(characterId, \{ includeCharacter: true, markSeedDeleted: true \}\)/.test(characterSource), '角色管理通过共用事务删除角色');
  assert(/deleteCharacterPrivateData\(id, \{ includeMessages: true, includeCharacter: true, markSeedDeleted: true \}\)/.test(chatListSource), '聊天列表通过共用事务删除角色和消息');
  assert(!/deleteDB\('characters', characterId\)/.test(characterSource), '角色管理不再事务外删除角色主记录');
  assert(!/deleteDB\('characters', id\)/.test(chatListSource), '聊天列表不再事务外删除角色主记录');
  assert(!chatListSource.includes("deleteIndexedByCharacter('memories'"), '聊天列表不再保留平行 memories 清理清单');
}

console.log('\n[2b] 聊天列表删除范围包含消息');
{
  const env = installStorage();
  const result = await deletion.deleteCharacterPrivateData('char-a', { includeMessages: true });
  assert(result.success === true, '包含消息的清理成功');
  assert(!env.stores.get('messages').some((row) => row.characterId === 'char-a'), '当前角色消息被清理');
  assert(env.stores.get('messages').some((row) => row.id === 'message-b'), '其他角色消息保留');
  resetStorage();
}

console.log('\n[2c] 主记录与 ai_phone 私有数据在同一回滚边界');
{
  const env = installStorage();
  const result = await deletion.deleteCharacterPrivateData('char-a', { includeCharacter: true, markSeedDeleted: true });
  assert(result.success === true, '角色事务删除成功');
  assert(!env.stores.get('characters').some((row) => row.id === 'char-a'), '角色主记录被删除');
  assert(!env.stores.get('ai_phone_diaries').some((row) => row.characterId === 'char-a'), 'ai_phone 私有记录被删除');
  assert(env.stores.get('ai_phone_diaries').some((row) => row.characterId === 'char-b'), '其他角色 ai_phone 记录保留');
  resetStorage();
}

console.log('\n[2] 清理当前角色私有数据与 checkpoint，但保留聊天和其他角色数据');
{
  const env = installStorage();
  const result = await deletion.deleteCharacterPrivateData('char-a');
  assert(result.success === true, '全部清理成功时返回明确成功');
  assert(!env.stores.get('memories').some((row) => row.characterId === 'char-a'), '当前角色 memories 被清理');
  assert(!env.localKeys.has('mem_sum_char-a'), '当前角色 mem_sum checkpoint 被清理');
  assert(env.localKeys.has('mem_sum_char-b'), '其他角色 checkpoint 保留');
  assert(env.stores.get('messages').some((row) => row.id === 'message-a'), '当前角色聊天记录保持不变');
  assert(!env.calls.some((call) => call[1] === 'messages'), '共用入口不读取或删除 messages store');
  assert(env.stores.get('memories').some((row) => row.id === 'memory-b'), '其他角色 memories 保留');
  assert(env.stores.get('groups')[0].memberIds.join(',') === 'char-b', '沿用既有范围移除群组中的当前角色成员关系');
  assert(env.stores.get('characters').some((row) => row.id === 'char-a'), '共用工具不删除当前角色主记录');
  assert(env.stores.get('characters').some((row) => row.id === 'char-b'), '其他角色记录保留');
  resetStorage();
}

console.log('\n[5] 记忆清理入口同步清 checkpoint');
{
  const settingsSource = await fs.readFile(new URL('../apps/settings.js', import.meta.url), 'utf8');
  assert(/store === 'memories'[\s\S]*?clearMemorySummaryCheckpoints\(\)/.test(settingsSource), '单独清记忆时同步清理 checkpoint');
  assert(/clearStoreDB\('memories'\)[\s\S]*?clearMemorySummaryCheckpoints\(\)/.test(settingsSource), '清聊天相关数据时同步清理 checkpoint');
  assert(/getMemorySummaryCheckpointKeys\(\)[\s\S]*?removeData\(key\)/.test(settingsSource), '仅通过规范 checkpoint 键清单执行清理');
  assert(/getBackupLocalKeys\(\)\.forEach[\s\S]*?data\.localStorage\[key\]/.test(settingsSource), '全量导出使用统一备份键清单');
  assert(/isAllowedLocalKey:\s*isBackupLocalKey/.test(settingsSource), '全量导入使用统一备份键判定');
}

console.log('\n[3] 任一步失败不返回成功，UI 不显示成功提示');
{
  const env = installStorage({ failDelete: 'memories:memory-a' });
  const result = await deletion.deleteCharacterPrivateData('char-a');
  assert(result.success === false, '私有数据删除失败时返回明确失败');
  assert(env.stores.get('characters').some((row) => row.id === 'char-a'), '中途失败时不继续删除角色主记录');

  const characterSource = await fs.readFile(new URL('../apps/characters.js', import.meta.url), 'utf8');
  const chatListSource = await fs.readFile(new URL('../apps/chat/list.js', import.meta.url), 'utf8');
  assert(/if \(!deletion\.success\)[\s\S]*?角色删除失败，请重试[\s\S]*?return;/.test(characterSource), '角色管理失败分支阻止成功提示');
  assert(/if \(!deletion\.success\)[\s\S]*?角色删除失败，请重试[\s\S]*?return;/.test(chatListSource), '聊天列表失败分支阻止成功提示');
  resetStorage();
}

console.log('\n[4] checkpoint 清理失败同样不伪造成功');
{
  const env = installStorage({ failCheckpoint: true });
  const result = await deletion.deleteCharacterPrivateData('char-a');
  assert(result.success === false, 'checkpoint 删除失败返回失败');
  assert(env.localKeys.has('mem_sum_char-a'), '失败的 checkpoint 未被伪装为已清理');
  assert(env.stores.get('memories').some((row) => row.id === 'memory-a'), 'checkpoint 失败时恢复先前删除的私有数据');
  assert(env.stores.get('groups')[0].memberIds.includes('char-a'), 'checkpoint 失败时恢复群组成员关系');
  assert(env.stores.get('characters').some((row) => row.id === 'char-a'), 'checkpoint 失败后不删除角色主记录');
  resetStorage();
}

console.log(`\n✅ character private deletion tests passed: ${passed}`);
