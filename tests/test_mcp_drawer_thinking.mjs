// tests/test_mcp_drawer_thinking.mjs
// 两个尾巴 bug 修复测试：
//   BUG1: 抽屉与 AI 侧工具判断不一致（数据源不统一）
//   BUG2: 过程链泄漏英文原始思路 + 工具名
// 运行：node tests/test_mcp_drawer_thinking.mjs

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg); }
}
function assertNo(haystack, needle, msg) {
  const ok = !String(haystack || '').includes(needle);
  if (ok) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg, '\n    不应包含:', JSON.stringify(needle)); }
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
globalThis.window = { AppBus:{ emit(){} }, AppEvents:{ emit(){} }, refreshDesktopBadges(){} };
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

// 可配置的 localStorage mock
const localStorageStore = new Map();
globalThis.localStorage = {
  getItem: (key) => localStorageStore.has(key) ? localStorageStore.get(key) : null,
  setItem: (key, val) => localStorageStore.set(key, String(val)),
  removeItem: (key) => localStorageStore.delete(key)
};

// ═══════════════════════════════════════
// 加载真实生产模块
// ═══════════════════════════════════════
const { sanitizeThinkingText } = await import('../apps/chat/thinking-pure.js');
const { getMcpDrawerItems, getUsableMcpTools, getMcpServers } = await import('../core/mcp.js');

// ═══════════════════════════════════════
// 1. 给定 enabled:true 的 server，抽屉判定为"已接入"并能列出工具名
// ═══════════════════════════════════════
console.log('\n[1] enabled server → 抽屉列出工具');
{
  // 注入一个 enabled 的 MCP 服务器，含两个工具（一个普通、一个需审批）
  localStorageStore.set('app_settings', JSON.stringify({
    mcpServers: [{
      id: 'srv_ctx7',
      name: 'Context7',
      enabled: true,
      url: 'https://context7.com/mcp',
      tools: [
        { name: 'resolve-library-id', description: '解析库 ID', inputSchema: { properties: { libraryName: { type: 'string' } } } },
        { name: 'get-library-docs', description: '获取库文档', inputSchema: { properties: { libraryId: { type: 'string' } } } }
      ],
      toolSettings: {
        'resolve-library-id': { enabled: true, requireApproval: false },
        'get-library-docs': { enabled: true, requireApproval: true }
      }
    }]
  }));

  const drawerItems = getMcpDrawerItems();
  assert(drawerItems.length === 2, '抽屉列出 2 个工具（含需审批的）');
  assertHas(drawerItems.map(i => i.name).join(','), 'resolve-library-id', '抽屉列出工具名 resolve-library-id');
  assertHas(drawerItems.map(i => i.name).join(','), 'get-library-docs', '抽屉列出工具名 get-library-docs');
  assertHas(drawerItems.map(i => i.serverName).join(','), 'Context7', '抽屉列出来源 Context7');

  // 需审批的工具也显示（带 requireApproval 标记）
  const approvalItem = drawerItems.find(i => i.name === 'get-library-docs');
  assert(approvalItem && approvalItem.requireApproval === true, '需审批工具有 requireApproval:true 标记');
  // 普通工具 requireApproval:false
  const normalItem = drawerItems.find(i => i.name === 'resolve-library-id');
  assert(normalItem && normalItem.requireApproval === false, '普通工具 requireApproval:false');
}

// ═══════════════════════════════════════
// 2. AI 侧 getUsableMcpTools 与抽屉判定对同一份数据得出一致的"有工具"结论
// ═══════════════════════════════════════
console.log('\n[2] 抽屉与 AI 侧数据源一致');
{
  // 沿用场景 1 的配置
  const drawerItems = getMcpDrawerItems();
  const aiTools = await getUsableMcpTools();
  const servers = getMcpServers();

  // 两者都判定"有工具"
  assert(drawerItems.length > 0, '抽屉判定：有工具');
  assert(aiTools.length > 0, 'AI 侧判定：有工具');
  assert(servers.length > 0, 'getMcpServers 判定：有 enabled 服务器');

  // 同一数据源：都来自 app_settings.mcpServers
  // AI 侧过滤 requireApproval:false → 只有 resolve-library-id
  assert(aiTools.length === 1, 'AI 侧过滤后 1 个可用工具（排除了需审批的）');
  assert(aiTools[0].name === 'resolve-library-id', 'AI 侧可用工具是 resolve-library-id');

  // 抽屉显示全部（含需审批），AI 侧只显示可直接调用的
  // 但两者"有无工具"结论一致：都有
  assert(drawerItems.length >= aiTools.length, '抽屉工具数 >= AI 可用工具数（抽屉含需审批的）');

  // 无工具场景：两者都判定无
  localStorageStore.delete('app_settings');
  const emptyDrawer = getMcpDrawerItems();
  const emptyAi = await getUsableMcpTools();
  const emptyServers = getMcpServers();
  assert(emptyDrawer.length === 0, '无配置时抽屉判定：无工具');
  assert(emptyAi.length === 0, '无配置时 AI 侧判定：无工具');
  assert(emptyServers.length === 0, '无配置时 getMcpServers 判定：无服务器');

  // server enabled:false → 两者都不显示
  localStorageStore.set('app_settings', JSON.stringify({
    mcpServers: [{
      id: 'srv_disabled',
      name: '已停用',
      enabled: false,
      url: 'https://example.com/mcp',
      tools: [{ name: 'tool1', description: '工具1', inputSchema: {} }],
      toolSettings: { tool1: { enabled: true, requireApproval: false } }
    }]
  }));
  const disabledDrawer = getMcpDrawerItems();
  const disabledAi = await getUsableMcpTools();
  assert(disabledDrawer.length === 0, 'server enabled:false 时抽屉不显示');
  assert(disabledAi.length === 0, 'server enabled:false 时 AI 侧不显示');
}

// ═══════════════════════════════════════
// 3. thinking 清洗：内部工具名剥离 + 真实 reasoning 原样透传（不再替换为占位）
// ═══════════════════════════════════════
console.log('\n[3] thinking 清洗：工具名剥离 + reasoning 透传');
{
  // 英文原始推理链（真机复现的泄漏文本）
  // Round 7 起：气泡只显示 pill，过程链 sheet 需要真实 reasoning_content，
  // 所以英文 reasoning 原样透传（不再替换为"想了一小会"），只剥内部工具名
  const englishReasoning = 'The user asked me to use MCP to query the library. I already called resolve-library-id to get the library ID, and now I need to call get-library-docs to fetch the documentation. Let me think about how to summarize this for the user.';

  const cleaned = sanitizeThinkingText(englishReasoning);
  console.log('    清洗后:', JSON.stringify(cleaned));
  // 内部工具名仍被剥离
  assertNo(cleaned, 'resolve-library-id', '内部工具名 resolve-library-id 被剥离');
  assertNo(cleaned, 'get-library-docs', '内部工具名 get-library-docs 被剥离');
  // 真实英文 reasoning 原样保留（不再用占位文案替换）
  assertHas(cleaned, 'The user asked me', '英文 reasoning 原句保留（真实透传）');
  assertHas(cleaned, 'called', '英文 reasoning 词 called 保留');
  assertNo(cleaned, '想了一小会', '不再用"想了一小会"占位替换真实 reasoning');

  // 混合中英文（中文为主 + 少量英文工具名）→ 保留中文，剥工具名
  const mixed = '我需要查一下这个库的文档。先调用 resolve-library-id 获取库 ID，再用 get-library-docs 拉文档。';
  const cleanedMixed = sanitizeThinkingText(mixed);
  assertNo(cleanedMixed, 'resolve-library-id', '混合文本中工具名 resolve-library-id 被剥离');
  assertNo(cleanedMixed, 'get-library-docs', '混合文本中工具名 get-library-docs 被剥离');
  assertHas(cleanedMixed, '我需要查一下这个库的文档', '混合文本中中文部分保留（不误杀）');

  // 纯中文思考 → 原样保留（不误杀）
  const chineseThinking = '用户想让我总结对话内容。我先回顾一下刚才聊了什么，然后提取关键信息。';
  const cleanedChinese = sanitizeThinkingText(chineseThinking);
  assertHas(cleanedChinese, '用户想让我总结对话内容', '纯中文思考保留不误杀');
  assertHas(cleanedChinese, '提取关键信息', '纯中文思考保留不误杀');

  // 英文短词原样保留（不再有"误判为推理"的替换逻辑）
  const shortEnglish = 'OK';
  const cleanedShort = sanitizeThinkingText(shortEnglish);
  assert(cleanedShort === 'OK', '短英文文本原样保留');

  // mcp_tool_call 协议词被剥离
  const withProtocol = '我要调用 mcp_tool_call 工具来查资料。';
  const cleanedProtocol = sanitizeThinkingText(withProtocol);
  assertNo(cleanedProtocol, 'mcp_tool_call', 'mcp_tool_call 协议词被剥离');
  assertHas(cleanedProtocol, '我要调用', '协议词剥离后中文部分保留');

  // search_ 前缀工具名被剥离
  const withSearch = '调用 search_docs 搜索一下。';
  const cleanedSearch = sanitizeThinkingText(withSearch);
  assertNo(cleanedSearch, 'search_docs', 'search_ 前缀工具名被剥离');
  assertHas(cleanedSearch, '调用', '工具名剥离后中文部分保留');

  // 空文本不崩溃
  assert(sanitizeThinkingText('') === '', '空文本不崩溃');
  assert(sanitizeThinkingText(null) === '', 'null 不崩溃');
  assert(sanitizeThinkingText(undefined) === '', 'undefined 不崩溃');
}

// ═══════════════════════════════════════
// 结果
// ═══════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`抽屉/过程链尾巴修复测试结果：${pass} 通过，${fail} 失败`);
console.log(`${'═'.repeat(50)}`);
if (fail > 0) {
  console.error('存在失败用例！');
  process.exit(1);
}
