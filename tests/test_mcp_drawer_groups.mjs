// tests/test_mcp_drawer_groups.mjs
// MCP 抽屉"按服务器分组"形态测试
// 运行：node tests/test_mcp_drawer_groups.mjs

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg); }
}
function assertHas(haystack, needle, msg) {
  const ok = String(haystack || '').includes(needle);
  if (ok) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg, '\n    应包含:', JSON.stringify(needle)); }
}

// ═══════════════════════════════════════
// DOM / 全局 mock
// ═══════════════════════════════════════
const fakeEl = {
  setAttribute(){}, addEventListener(){}, removeEventListener(){},
  appendChild(){}, append(){}, remove(){}, style:{}, dataset:{},
  classList:{ add(){}, remove(){}, toggle(){} },
  textContent:'', innerHTML:'',
  querySelector(){ return null; }, querySelectorAll(){ return []; }
};
globalThis.document = {
  createElement: () => ({ ...fakeEl }),
  createTextNode: (t) => ({ ...fakeEl, textContent: t }),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  head: { appendChild(){}, insertBefore(){} },
  body: { appendChild(){}, append(){}, style:{} }
};
globalThis.window = { AppBus:{ emit(){} }, AppEvents:{ emit(){} }, refreshDesktopBadges(){}, dispatchEvent(){} };
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine:true, clipboard:{ writeText: async()=>{} } },
    writable: true, configurable: true
  });
} catch (_) {
  if (globalThis.navigator && !globalThis.navigator.clipboard) {
    globalThis.navigator.clipboard = { writeText: async()=>{} };
  }
}

const localStorageStore = new Map();
globalThis.localStorage = {
  getItem: (key) => localStorageStore.has(key) ? localStorageStore.get(key) : null,
  setItem: (key, val) => localStorageStore.set(key, String(val)),
  removeItem: (key) => localStorageStore.delete(key)
};

// ═══════════════════════════════════════
// 加载真实生产模块
// ═══════════════════════════════════════
const { getMcpServerGroups, setMcpServerEnabled } = await import('../core/mcp.js');

// ═══════════════════════════════════════
// 1. 2 个 server、每个 3 个工具 → 一级列表 2 行，无重复
// ═══════════════════════════════════════
console.log('\n[1] 2 server × 3 tool → 2 行无重复');
{
  localStorageStore.set('app_settings', JSON.stringify({
    mcpServers: [
      {
        id: 'srv_a', name: 'Tavily上网', enabled: true, url: 'https://tavily.com/mcp',
        tools: [
          { name: 'tavily-search', description: '搜索', inputSchema: {} },
          { name: 'tavily-extract', description: '提取', inputSchema: {} },
          { name: 'tavily-crawl', description: '爬取', inputSchema: {} }
        ],
        toolSettings: {
          'tavily-search': { enabled: true, requireApproval: false },
          'tavily-extract': { enabled: true, requireApproval: false },
          'tavily-crawl': { enabled: false, requireApproval: false }
        }
      },
      {
        id: 'srv_b', name: '眼睛', enabled: true, url: 'https://eyes.com/mcp',
        tools: [
          { name: 'see-image', description: '看图', inputSchema: {} },
          { name: 'see-code', description: '看代码', inputSchema: {} },
          { name: 'see-doc', description: '看文档', inputSchema: {} }
        ],
        toolSettings: {
          'see-image': { enabled: true, requireApproval: false },
          'see-code': { enabled: true, requireApproval: true },
          'see-doc': { enabled: true, requireApproval: false }
        }
      }
    ]
  }));

  const groups = getMcpServerGroups();
  assert(groups.length === 2, '一级列表 2 行（不是 6 行）');

  // 无重复 server.id
  const ids = groups.map(g => g.id);
  assert(new Set(ids).size === 2, '无重复 server.id');

  // 每个 server 3 个工具，无重复工具名
  assert(groups[0].tools.length === 3, 'srv_a 有 3 个工具');
  assert(groups[1].tools.length === 3, 'srv_b 有 3 个工具');
  const toolNamesA = groups[0].tools.map(t => t.name);
  assert(new Set(toolNamesA).size === 3, 'srv_a 工具名无重复');
  const toolNamesB = groups[1].tools.map(t => t.name);
  assert(new Set(toolNamesB).size === 3, 'srv_b 工具名无重复');
}

// ═══════════════════════════════════════
// 2. server 有中文 name → 显示中文 name
// ═══════════════════════════════════════
console.log('\n[2] 中文 name 显示');
{
  // 沿用场景 1 数据
  const groups = getMcpServerGroups();
  assertHas(groups.map(g => g.name).join('|'), 'Tavily上网', '显示中文 name "Tavily上网"');
  assertHas(groups.map(g => g.name).join('|'), '眼睛', '显示中文 name "眼睛"');

  // 不显示工具 id 作为 server 名
  const allNames = groups.map(g => g.name).join(',');
  assert(!allNames.includes('tavily-search'), 'server 名不是工具 id tavily-search');
  assert(!allNames.includes('see-image'), 'server 名不是工具 id see-image');

  // 无 name 时回退到 url
  localStorageStore.set('app_settings', JSON.stringify({
    mcpServers: [{
      id: 'srv_noname', name: '', enabled: true, url: 'https://noname.com/mcp',
      tools: [{ name: 'tool1', description: 't', inputSchema: {} }],
      toolSettings: {}
    }]
  }));
  const noName = getMcpServerGroups();
  assertHas(noName[0].name, 'https://noname.com/mcp', '无 name 时回退到 url');
}

// ═══════════════════════════════════════
// 3. "工具: x/y" 数字正确
// ═══════════════════════════════════════
console.log('\n[3] 工具数胶囊 x/y 正确');
{
  // 重新注入场景 1 数据（srv_a 有 2 启用 1 停用）
  localStorageStore.set('app_settings', JSON.stringify({
    mcpServers: [
      {
        id: 'srv_a', name: 'Tavily上网', enabled: true, url: 'https://tavily.com/mcp',
        tools: [
          { name: 'tavily-search', description: '搜索', inputSchema: {} },
          { name: 'tavily-extract', description: '提取', inputSchema: {} },
          { name: 'tavily-crawl', description: '爬取', inputSchema: {} }
        ],
        toolSettings: {
          'tavily-search': { enabled: true, requireApproval: false },
          'tavily-extract': { enabled: true, requireApproval: false },
          'tavily-crawl': { enabled: false, requireApproval: false }
        }
      },
      {
        id: 'srv_b', name: '眼睛', enabled: true, url: 'https://eyes.com/mcp',
        tools: [
          { name: 'see-image', description: '看图', inputSchema: {} },
          { name: 'see-code', description: '看代码', inputSchema: {} },
          { name: 'see-doc', description: '看文档', inputSchema: {} }
        ],
        toolSettings: {
          'see-image': { enabled: true, requireApproval: false },
          'see-code': { enabled: true, requireApproval: true },
          'see-doc': { enabled: true, requireApproval: false }
        }
      }
    ]
  }));

  const groups = getMcpServerGroups();
  const srvA = groups.find(g => g.id === 'srv_a');
  const srvB = groups.find(g => g.id === 'srv_b');

  // srv_a: 2 启用 / 3 总数
  assert(srvA.toolCount === 3, 'srv_a 总数 3');
  assert(srvA.enabledCount === 2, 'srv_a 启用数 2（tavily-crawl 停用）');

  // srv_b: 3 启用 / 3 总数（requireApproval 不影响 enabledCount）
  assert(srvB.toolCount === 3, 'srv_b 总数 3');
  assert(srvB.enabledCount === 3, 'srv_b 启用数 3（requireApproval 不算停用）');

  // 胶囊文本格式
  const capsuleA = `工具: ${srvA.enabledCount}/${srvA.toolCount}`;
  assert(capsuleA === '工具: 2/3', 'srv_a 胶囊 "工具: 2/3"');
  const capsuleB = `工具: ${srvB.enabledCount}/${srvB.toolCount}`;
  assert(capsuleB === '工具: 3/3', 'srv_b 胶囊 "工具: 3/3"');
}

// ═══════════════════════════════════════
// 4. server 开关切换 → 写回同一 mcpServers 数据源
// ═══════════════════════════════════════
console.log('\n[4] 开关切换写回数据源');
{
  localStorageStore.set('app_settings', JSON.stringify({
    mcpServers: [{
      id: 'srv_toggle', name: '测试开关', enabled: true, url: 'https://test.com/mcp',
      tools: [{ name: 'tool1', description: 't', inputSchema: {} }],
      toolSettings: { tool1: { enabled: true, requireApproval: false } }
    }]
  }));

  // 初始 enabled:true
  let groups = getMcpServerGroups();
  assert(groups[0].enabled === true, '初始状态 enabled:true');

  // 关闭
  setMcpServerEnabled('srv_toggle', false);
  groups = getMcpServerGroups();
  assert(groups[0].enabled === false, '关闭后 enabled:false');

  // 验证写回了同一 app_settings.mcpServers 数据源
  const raw = JSON.parse(localStorageStore.get('app_settings'));
  assert(raw.mcpServers[0].enabled === false, 'app_settings.mcpServers 已写回 enabled:false');

  // 重新开启
  setMcpServerEnabled('srv_toggle', true);
  groups = getMcpServerGroups();
  assert(groups[0].enabled === true, '重新开启后 enabled:true');
  const raw2 = JSON.parse(localStorageStore.get('app_settings'));
  assert(raw2.mcpServers[0].enabled === true, 'app_settings.mcpServers 已写回 enabled:true');

  // 其他 server 不受影响
  localStorageStore.set('app_settings', JSON.stringify({
    mcpServers: [
      { id: 'srv_a', name: 'A', enabled: true, url: 'u1', tools: [], toolSettings: {} },
      { id: 'srv_b', name: 'B', enabled: true, url: 'u2', tools: [], toolSettings: {} }
    ]
  }));
  setMcpServerEnabled('srv_a', false);
  const raw3 = JSON.parse(localStorageStore.get('app_settings'));
  assert(raw3.mcpServers.find(s => s.id === 'srv_a').enabled === false, 'srv_a 关闭');
  assert(raw3.mcpServers.find(s => s.id === 'srv_b').enabled === true, 'srv_b 不受影响');
}

// ═══════════════════════════════════════
// 5. 无 server → 显示空状态文案
// ═══════════════════════════════════════
console.log('\n[5] 无 server → 空状态');
{
  // 完全无配置
  localStorageStore.delete('app_settings');
  let groups = getMcpServerGroups();
  assert(groups.length === 0, '无 app_settings 时返回空数组');

  // mcpServers 为空数组
  localStorageStore.set('app_settings', JSON.stringify({ mcpServers: [] }));
  groups = getMcpServerGroups();
  assert(groups.length === 0, 'mcpServers 为空数组时返回空数组');

  // mcpServers 不存在
  localStorageStore.set('app_settings', JSON.stringify({ otherKey: 1 }));
  groups = getMcpServerGroups();
  assert(groups.length === 0, 'mcpServers 不存在时返回空数组');

  // 空状态判定：groups.length === 0 时抽屉显示"这里还没有接入外部工具"
  // （openMcpSheet 中 if (!groups.length) → createEmptyTip('这里还没有接入外部工具。')）
  assert(groups.length === 0, '空状态判定正确（groups.length === 0）');
}

// ═══════════════════════════════════════
// 6. 去重根因验证：同 server.id 重复 + 同工具名重复
// ═══════════════════════════════════════
console.log('\n[6] 去重根因验证');
{
  // 同一 server.id 出现两次（数据源重复）
  localStorageStore.set('app_settings', JSON.stringify({
    mcpServers: [
      { id: 'srv_dup', name: '重复A', enabled: true, url: 'u1', tools: [{ name: 't1', description: 'd', inputSchema: {} }], toolSettings: {} },
      { id: 'srv_dup', name: '重复B', enabled: true, url: 'u2', tools: [{ name: 't2', description: 'd', inputSchema: {} }], toolSettings: {} }
    ]
  }));
  let groups = getMcpServerGroups();
  assert(groups.length === 1, '同一 server.id 重复只出现一次（取第一个）');
  assert(groups[0].name === '重复A', '取第一个 server 定义');

  // 同一 server 下同名工具重复
  localStorageStore.set('app_settings', JSON.stringify({
    mcpServers: [{
      id: 'srv_tdup', name: '工具重复', enabled: true, url: 'u1',
      tools: [
        { name: 'same_tool', description: '第一份', inputSchema: {} },
        { name: 'same_tool', description: '第二份', inputSchema: {} },
        { name: 'other_tool', description: '其他', inputSchema: {} }
      ],
      toolSettings: {}
    }]
  }));
  groups = getMcpServerGroups();
  assert(groups[0].tools.length === 2, '同名工具去重后 2 个（same_tool 只保留一份）');
  assert(groups[0].toolCount === 2, 'toolCount 去重后 2');
  const names = groups[0].tools.map(t => t.name);
  assert(new Set(names).size === 2, '工具名无重复');
}

// ═══════════════════════════════════════
// 结果
// ═══════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`MCP 抽屉分组形态测试结果：${pass} 通过，${fail} 失败`);
console.log(`${'═'.repeat(50)}`);
if (fail > 0) {
  console.error('存在失败用例！');
  process.exit(1);
}
