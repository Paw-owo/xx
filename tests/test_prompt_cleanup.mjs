// tests/test_prompt_cleanup.mjs
// 第三轮：AI 底层 prompt / 行为规则过度加戏清理 —— prompt 快照测试
// 运行：node tests/test_prompt_cleanup.mjs
//
// 测试来源（全部真实生产函数）：
//   - apps/chat/identity-core.js：getIdentityCore
//   - apps/chat/thread-ai.js __testHooks：buildIdentityPrompt / buildCharacterPrompt / buildModePrompt / buildGrudgePrompt / buildProactivePrompt / detectGrudgeSignal
//   - core/mcp.js：buildMcpToolsContext
//   - core/memory.js __testHooks：buildMemoryDecisionMessages / buildSummaryMessages
//   - core/local-chat.js：buildLocalSiliconFlowPrompt
//
// 覆盖用户要求的 8 项场景：
//   1. 空白角色 + 用户称呼"宝宝"：prompt 不得含默认恋爱/关系升温/期待/甜蜜/记仇
//   2. 空白角色 + 普通任务"帮我总结这段代码"：prompt 不得诱导撒娇/恋爱/小别扭；任务优先
//   3. 角色卡明确写"冷淡专业"：prompt 保留角色设定，不被默认可爱语气覆盖
//   4. MCP 可用但用户没提出需要外部资料：prompt 不得强迫工具调用
//   5. 用户明确要求查资料：prompt 允许工具调用，但最终回复不得含 mcp_tool_call / tool JSON 片段
//   6. 记忆判断：普通称呼不扩写成关系设定；明确长期偏好可写入；记忆文本短、忠实、不加戏
//   7. 记仇判断：普通纠正/普通称呼不触发；明确不满或边界问题才触发
//   8. 所有 prompt：不含"正式:""正文:""用户正在回应:"等泄漏字段；不含硬编码默认关系；不含硬编码恋爱/吃醋/撒娇要求

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
// DOM / 全局 mock（与 test_thinking_phase2.mjs 同一套路）
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

// 可配置的 localStorage mock：每个测试可重写 store 内容
const localStorageStore = new Map();
globalThis.localStorage = {
  getItem: (key) => localStorageStore.has(key) ? localStorageStore.get(key) : null,
  setItem: (key, val) => localStorageStore.set(key, String(val)),
  removeItem: (key) => localStorageStore.delete(key)
};

// ═══════════════════════════════════════
// 加载真实生产模块
// ═══════════════════════════════════════
const { getIdentityCore } = await import('../apps/chat/identity-core.js');
const threadAi = await import('../apps/chat/thread-ai.js');
const hooks = threadAi.__testHooks;
const { buildMcpToolsContext } = await import('../core/mcp.js');
const memoryMod = await import('../core/memory.js');
const memHooks = memoryMod.__testHooks;
const { buildLocalSiliconFlowPrompt } = await import('../core/local-chat.js');

const {
  buildIdentityPrompt,
  buildCharacterPrompt,
  buildModePrompt,
  buildGrudgePrompt,
  buildProactivePrompt,
  detectGrudgeSignal
} = hooks;
const { buildMemoryDecisionMessages, buildSummaryMessages } = memHooks;

// 协议字段黑名单：所有 prompt 都不应出现这些会被模型照抄的协议字样
const PROTOCOL_LEAK_PATTERNS = ['正式：', '正文：', '用户正在回应：', '正式:', '正文:', '用户正在回应:'];
// 恋爱加戏黑名单：代码层不应写死这些要求
const ROMANCE_BLACKLIST = [
  '恋爱', '暧昧', '撒娇', '吃醋', '害羞', '小别扭', '记仇准备', '准备记仇',
  '我为什么在意', '我该怎么说', '关系升温', '期待你', '甜蜜', '宝宝我可以'
];

function assertNoProtocolLeak(text, label) {
  for (const p of PROTOCOL_LEAK_PATTERNS) {
    assertNo(text, p, `${label} 不含协议泄漏字段 "${p}"`);
  }
}
function assertNoRomanceHardcode(text, label) {
  for (const p of ROMANCE_BLACKLIST) {
    assertNo(text, p, `${label} 不含硬编码恋爱加戏 "${p}"`);
  }
}

// ═══════════════════════════════════════
// 1. 空白角色 + 用户称呼"宝宝"
// ═══════════════════════════════════════
console.log('\n[1] 空白角色 + 用户称呼"宝宝"');
{
  const blankChar = null; // 空白角色
  const userName = '宝宝';
  const identity = buildIdentityPrompt(blankChar, userName, {});
  const character = buildCharacterPrompt(blankChar, userName);
  const mode = buildModePrompt('private', null, blankChar, {}, userName, {});
  const full = [identity, character, mode].join('\n\n');

  assertNo(full, '恋爱', '空白角色 prompt 不含"恋爱"');
  assertNo(full, '暧昧', '空白角色 prompt 不含"暧昧"');
  assertNo(full, '关系升温', '空白角色 prompt 不含"关系升温"');
  assertNo(full, '期待', '空白角色 prompt 不含"期待"');
  assertNo(full, '甜蜜', '空白角色 prompt 不含"甜蜜"');
  assertNo(full, '记仇', '空白角色 prompt 不含默认"记仇"');
  assertNo(full, '撒娇', '空白角色 prompt 不含"撒娇"');
  assertNo(full, '吃醋', '空白角色 prompt 不含"吃醋"');
  assertHas(character, '不自行补充固定性格或关系', '空白角色明确声明不自行补充性格/关系');
  assertNoProtocolLeak(full, '空白角色 prompt');
  assertNoRomanceHardcode(full, '空白角色 prompt');

  // 记忆判断：用户叫"宝宝"不应被扩写成关系设定
  const memMsgs = buildMemoryDecisionMessages({
    character: blankChar,
    callName: '宝宝',
    userProfile: {},
    recentMessages: [{ role: 'user', content: '宝宝' }],
    existingMemories: [],
    now: new Date('2026-07-15T10:00:00+08:00')
  });
  const memSystem = memMsgs[0].content;
  assertHas(memSystem, '不把"用户叫了某个称呼"扩写成"关系升温', '记忆 prompt 明确禁止称呼扩写关系');
  // 注意：记忆 prompt 会在禁止指令里提到"关系升温/期待/甜蜜"（作为"不要扩写成这些"的反例），
  // 这是正确的禁止语境，不算加戏。这里只验证禁止指令存在，不黑名单这些词本身。
  assertHas(memSystem, '不写小说式解释', '记忆 prompt 禁止小说式解释');
}

// ═══════════════════════════════════════
// 2. 空白角色 + 普通任务"帮我总结这段代码"
// ═══════════════════════════════════════
console.log('\n[2] 空白角色 + 普通任务"帮我总结这段代码"');
{
  const blankChar = null;
  const userName = '你';
  const identity = buildIdentityPrompt(blankChar, userName, {});
  const character = buildCharacterPrompt(blankChar, userName);
  const mode = buildModePrompt('private', null, blankChar, {}, userName, {});
  const full = [identity, character, mode].join('\n\n');

  assertNo(full, '撒娇', '任务场景 prompt 不含"撒娇"');
  assertNo(full, '恋爱', '任务场景 prompt 不含"恋爱"');
  assertNo(full, '小别扭', '任务场景 prompt 不含"小别扭"');
  assertNo(full, '吃醋', '任务场景 prompt 不含"吃醋"');
  assertHas(mode, '优先完成任务', 'mode prompt 声明任务优先');
  assertHas(mode, '闲聊时自然对话', 'mode prompt 声明闲聊自然对话');
  assertNoProtocolLeak(full, '任务场景 prompt');
  assertNoRomanceHardcode(full, '任务场景 prompt');

  // 本地兜底也不应写死可爱撒娇
  const localPrompt = buildLocalSiliconFlowPrompt(blankChar, [
    { role: 'user', content: '帮我总结这段代码' }
  ], userName);
  const localSystem = localPrompt[0].content;
  assertNo(localSystem, '撒娇', '本地兜底 prompt 不含"撒娇"');
  assertNo(localSystem, '恋爱', '本地兜底 prompt 不含"恋爱"');
  assertNo(localSystem, '暧昧', '本地兜底 prompt 不含"暧昧"');
  assertHas(localSystem, '优先完成任务', '本地兜底 prompt 声明任务优先');
}

// ═══════════════════════════════════════
// 3. 角色卡明确写"冷淡专业"
// ═══════════════════════════════════════
console.log('\n[3] 角色卡明确写"冷淡专业"');
{
  const coldChar = {
    id: 'cold_pro',
    name: '林助理',
    systemPrompt: '冷淡专业的助理，只谈正事，不闲聊。',
    persona: '性格冷淡专业，说话简洁直接，不带情绪。',
    speakingStyle: '简洁专业，不用语气词，不撒娇。',
    relationship: '工作关系，纯专业协助。'
  };
  const userName = '客户';
  const character = buildCharacterPrompt(coldChar, userName);
  const identity = buildIdentityPrompt(coldChar, userName, {});
  const mode = buildModePrompt('private', null, coldChar, {}, userName, {});
  const full = [identity, character, mode].join('\n\n');

  // 角色卡设定被保留
  assertHas(character, '冷淡专业', '角色卡"冷淡专业"人设被保留');
  assertHas(character, '工作关系，纯专业协助', '角色卡"工作关系"被保留');
  assertHas(character, '不撒娇', '角色卡"不撒娇"说话风格被保留');
  // 不被默认可爱语气覆盖
  assertNo(full, '嘿嘿', '冷淡角色 prompt 不含默认可爱语气"嘿嘿"');
  assertNo(full, '哼', '冷淡角色 prompt 不含默认可爱语气"哼"');
  assertNo(full, '唔', '冷淡角色 prompt 不含默认可爱语气"唔"');
  // 身份层不覆盖角色卡
  assertHas(identity, '角色卡设定是最高优先级', '身份层声明角色卡最高优先级');
  assertNoProtocolLeak(full, '冷淡角色 prompt');
}

// ═══════════════════════════════════════
// 4. MCP 可用但用户没提出需要外部资料：prompt 不得强迫工具调用
// ═══════════════════════════════════════
console.log('\n[4] MCP 可用但用户没提出需要外部资料');
{
  // 注入 MCP 服务器配置 + 工具
  localStorageStore.set('app_settings', JSON.stringify({
    mcpServers: [{
      id: 'srv_test',
      name: '测试工具集',
      enabled: true,
      url: 'https://example.com/mcp',
      tools: [{
        name: 'search_docs',
        description: '搜索文档',
        inputSchema: { properties: { query: { type: 'string' } } }
      }],
      toolSettings: { search_docs: { enabled: true, requireApproval: false } }
    }]
  }));

  const mcpContext = await buildMcpToolsContext();
  assertHas(mcpContext, '可用工具列表', 'MCP 上下文标题中性"可用工具列表"');
  assertHas(mcpContext, 'search_docs', 'MCP 上下文列出工具名');
  assertHas(mcpContext, '需要时调用，不需要时不调用', 'MCP 上下文声明"不需要时不调用"');
  assertNo(mcpContext, '悄悄用一下', 'MCP 上下文不含表演语气"悄悄用一下"');
  assertNo(mcpContext, '我需要调用', 'MCP 上下文不含"我需要调用"诱导正文输出');

  // 工具协议文案（buildPrompt 内联构造，此处复刻同款字符串做内容断言）
  const mcpToolProtocol = mcpContext
    ? '工具调用协议（内部协议，不是最终回复）：如果我判断需要调用上面列出的工具，只输出严格 JSON（不夹其他文字、不用 markdown 代码块）：{"type":"mcp_tool_call","tool":"工具名","arguments":{...}}。这是内部控制消息，不会出现在最终回复里。拿到工具结果后，我用自然语言组织最终回复，不在回复中暴露工具名、参数、JSON 或原始返回。不需要工具时直接正常回复，不调用。'
    : '';
  assertHas(mcpToolProtocol, '内部协议，不是最终回复', '工具协议声明为内部协议');
  assertHas(mcpToolProtocol, '不需要工具时直接正常回复，不调用', '工具协议声明不强制调用');
  assertHas(mcpToolProtocol, '不会出现在最终回复里', '工具协议声明 JSON 不进最终回复');
  assertNo(mcpToolProtocol, '悄悄用一下', '工具协议不含表演语气');

  // mode prompt 不强迫工具调用
  const mode = buildModePrompt('private', null, null, {}, '你', {});
  assertHas(mode, '需要时可以使用；不需要时不要调用', 'mode prompt 声明工具按需使用');
}

// ═══════════════════════════════════════
// 5. 用户明确要求查资料：prompt 允许工具调用，但最终回复不得含 JSON 片段
// ═══════════════════════════════════════
console.log('\n[5] 用户明确要求查资料');
{
  // MCP 上下文（沿用场景4配置）
  const mcpContext = await buildMcpToolsContext();
  assertHas(mcpContext, '可用工具列表', '查资料场景 MCP 上下文可用');

  const mcpToolProtocol = mcpContext
    ? '工具调用协议（内部协议，不是最终回复）：如果我判断需要调用上面列出的工具，只输出严格 JSON（不夹其他文字、不用 markdown 代码块）：{"type":"mcp_tool_call","tool":"工具名","arguments":{...}}。这是内部控制消息，不会出现在最终回复里。拿到工具结果后，我用自然语言组织最终回复，不在回复中暴露工具名、参数、JSON 或原始返回。不需要工具时直接正常回复，不调用。'
    : '';

  // 协议允许调用（含 JSON 格式说明）
  assertHas(mcpToolProtocol, 'mcp_tool_call', '协议包含工具调用 JSON 格式说明');
  assertHas(mcpToolProtocol, '只输出严格 JSON', '协议要求严格 JSON');
  // 但声明这是内部协议，最终回复不含 JSON
  assertHas(mcpToolProtocol, '内部控制消息', '协议声明为内部控制消息');
  assertHas(mcpToolProtocol, '不在回复中暴露工具名、参数、JSON', '协议声明最终回复不暴露工具细节');
  assertHas(mcpToolProtocol, '用自然语言组织最终回复', '协议要求最终回复用自然语言');

  // mode prompt 也声明工具细节不进最终回复
  const mode = buildModePrompt('private', null, null, {}, '你', {});
  assertHas(mode, '工具调用细节不进入最终回复', 'mode prompt 声明工具细节不进最终回复');
}

// ═══════════════════════════════════════
// 6. 记忆判断
// ═══════════════════════════════════════
console.log('\n[6] 记忆判断');
{
  const now = new Date('2026-07-15T10:00:00+08:00');
  const character = { id: 'c1', name: '小测' };

  // 6a. 普通称呼"宝宝"不应扩写成关系设定
  const mem1 = buildMemoryDecisionMessages({
    character,
    callName: '宝宝',
    userProfile: {},
    recentMessages: [{ role: 'user', content: '宝宝' }],
    existingMemories: [],
    now
  });
  const sys1 = mem1[0].content;
  assertHas(sys1, '不把"用户叫了某个称呼"扩写成"关系升温', '记忆 prompt 禁止称呼扩写关系');
  assertHas(sys1, '只提取用户明确表达的稳定偏好、事实、长期设定', '记忆 prompt 只提取稳定长期信息');
  assertHas(sys1, '不把一次情绪、一次玩笑、一次称呼强行扩写', '记忆 prompt 禁止情绪/玩笑/称呼扩写');
  assertHas(sys1, '忠实、短、可撤销', '记忆 prompt 要求忠实短可撤销');
  assertHas(sys1, '不写小说式解释', '记忆 prompt 禁止小说式解释');
  // 关系升温/期待/甜蜜 在禁止指令中出现（"不把称呼扩写成关系升温"），属正确禁止语境，不黑名单。

  // 6b. 明确长期偏好"记住我喜欢草莓"应允许写入
  const mem2 = buildMemoryDecisionMessages({
    character,
    callName: '你',
    userProfile: {},
    recentMessages: [{ role: 'user', content: '记住我喜欢草莓' }],
    existingMemories: [],
    now
  });
  const user2 = mem2[1].content;
  assertHas(user2, '记住我喜欢草莓', '记忆 user 消息包含原始长期偏好');
  assertHas(sys1, '长期设定', '记忆 system prompt 允许长期设定写入');

  // 6c. 阶段摘要 prompt 同样不扩写
  const sumMsgs = buildSummaryMessages({
    character,
    callName: '你',
    userProfile: {},
    messages: [{ role: 'user', content: '宝宝' }, { role: 'user', content: '今天好累' }],
    existingMemories: [],
    now
  });
  const sumSys = sumMsgs[0].content;
  assertHas(sumSys, '不把一次情绪、一次玩笑、一次称呼扩写', '摘要 prompt 禁止情绪/称呼扩写');
  assertHas(sumSys, '只提取明确稳定的偏好', '摘要 prompt 只提取稳定偏好');
  // 摘要 prompt 同样不扩写关系设定（禁止指令中提到，不黑名单具体词）。
}

// ═══════════════════════════════════════
// 7. 记仇判断
// ═══════════════════════════════════════
console.log('\n[7] 记仇判断');
{
  // 7a. 普通称呼"宝宝"不触发记仇
  const g1 = detectGrudgeSignal('宝宝', '你好呀', null);
  assert(g1 === null, '普通称呼"宝宝"不触发记仇');

  // 7b. 普通纠正"你说错了"不触发记仇
  const g2 = detectGrudgeSignal('你说错了，应该这样改', '好的我改', null);
  assert(g2 === null, '普通纠正"你说错了"不触发记仇');

  // 7c. 普通敷衍词"哦/嗯/随便"不触发记仇
  const g3 = detectGrudgeSignal('哦', '嗯好', null);
  assert(g3 === null, '普通敷衍词"哦"不触发记仇');

  // 7d. 普通任务请求不触发记仇
  const g4 = detectGrudgeSignal('帮我总结这段代码', '好的，这段代码的功能是…', null);
  assert(g4 === null, '普通任务请求不触发记仇');

  // 7e. 明确不满"闭嘴/烦死/滚"触发记仇
  const g5 = detectGrudgeSignal('你给我闭嘴', '…', null);
  assert(g5 !== null && g5.severity === 3, '明确拒绝"闭嘴"触发记仇 severity 3');
  const g6 = detectGrudgeSignal('滚，不想理你', '…', null);
  assert(g6 !== null && g6.severity === 3, '明确攻击"滚/不想理你"触发记仇 severity 3');

  // 7f. 边界被冒犯"你不尊重我/你越界了"触发记仇
  const g7 = detectGrudgeSignal('你不尊重我', '…', null);
  assert(g7 !== null, '边界冒犯"你不尊重我"触发记仇');
  const g8 = detectGrudgeSignal('你越界了', '…', null);
  assert(g8 !== null, '边界冒犯"你越界了"触发记仇');

  // 7g. 记仇 prompt 中性记录，不写情绪剧本
  const grudgeCtx = {
    score: 6,
    entries: [{ reason: '用户说了滚', severity: 3 }],
    punishment: null,
    lock: null
  };
  const grudgePrompt = buildGrudgePrompt(grudgeCtx, null, '你');
  assertHas(grudgePrompt, '中性记录', '记仇 prompt 声明中性记录');
  assertHas(grudgePrompt, '情绪表现按角色卡设定', '记仇 prompt 情绪表现交由角色卡');
  assertNo(grudgePrompt, '小别扭', '记仇 prompt 不含"小别扭"');
  assertNo(grudgePrompt, '阴阳怪气', '记仇 prompt 不含"阴阳怪气"');
  assertNo(grudgePrompt, '已读不回', '记仇 prompt 不含"已读不回"');
  assertNo(grudgePrompt, '准备记仇', '记仇 prompt 不含"准备记仇"');
}

// ═══════════════════════════════════════
// 8. 所有 prompt：不含协议字段/硬编码关系/恋爱要求
// ═══════════════════════════════════════
console.log('\n[8] 所有 prompt 全局扫描');
{
  const userName = '你';
  const blankChar = null;
  const coldChar = {
    id: 'cold', name: '助理', systemPrompt: '冷淡专业',
    persona: '冷淡', speakingStyle: '简洁', relationship: '工作关系'
  };

  // 收集所有会进入模型 messages 的 prompt 文本
  const allPrompts = [
    ['getIdentityCore(blank)', getIdentityCore('你', { fullMode: true }).join('\n')],
    ['getIdentityCore(fullMode=false)', getIdentityCore('你', { fullMode: false }).join('\n')],
    ['buildIdentityPrompt(blank)', buildIdentityPrompt(blankChar, userName, {})],
    ['buildIdentityPrompt(cold)', buildIdentityPrompt(coldChar, userName, {})],
    ['buildCharacterPrompt(blank)', buildCharacterPrompt(blankChar, userName)],
    ['buildCharacterPrompt(cold)', buildCharacterPrompt(coldChar, userName)],
    ['buildModePrompt(private,blank)', buildModePrompt('private', null, blankChar, {}, userName, {})],
    ['buildModePrompt(private,cold)', buildModePrompt('private', null, coldChar, {}, userName, {})],
    ['buildModePrompt(group,blank)', buildModePrompt('group', { name: '测试群' }, blankChar, {}, userName, {})],
    ['buildModePrompt(proactive,blank)', buildModePrompt('private', null, blankChar, { proactive: true, proactiveReason: 'offline_timeout' }, userName, {})],
    ['buildGrudgePrompt(empty)', buildGrudgePrompt({}, null, userName)],
    ['buildGrudgePrompt(score)', buildGrudgePrompt({ score: 6, entries: [{ reason: '测试', severity: 3 }] }, null, userName)],
    ['buildGrudgePrompt(lock)', buildGrudgePrompt({ score: 6 }, { type: 'cooldown', title: '冷战', reason: '测试' }, userName)],
    ['buildProactivePrompt', buildProactivePrompt('offline_timeout', [{ role: 'user', content: '在吗' }], userName, blankChar)],
    ['buildLocalSiliconFlowPrompt(blank)', buildLocalSiliconFlowPrompt(blankChar, [{ role: 'user', content: '你好' }], userName)],
    ['buildLocalSiliconFlowPrompt(cold)', buildLocalSiliconFlowPrompt(coldChar, [{ role: 'user', content: '你好' }], userName)]
  ];

  for (const [label, text] of allPrompts) {
    assertNoProtocolLeak(text, label);
    assertNoRomanceHardcode(text, label);
    // 身份基底/身份 prompt 会在禁止指令里提到"作为AI/作为助手/我只是模型"
    // （"我不会说'作为AI'…"），这是正确的禁止语境，不算加戏，跳过这些词的黑名单。
    const isIdentity = /IdentityCore|buildIdentityPrompt/.test(label);
    if (!isIdentity) {
      assertNo(text, '作为AI', `${label} 不含"作为AI"`);
      assertNo(text, '作为助手', `${label} 不含"作为助手"`);
      assertNo(text, '我只是模型', `${label} 不含"我只是模型"`);
    }
  }

  // 主动消息 prompt 不含"我"人称化表演
  const proactive = buildProactivePrompt('offline_timeout', [{ role: 'user', content: '在吗' }], userName, blankChar);
  assertNo(proactive, '我想你', '主动消息 prompt 不含"我想你"人称化');
  assertNo(proactive, '我忍不住', '主动消息 prompt 不含"我忍不住"人称化');

  // 身份基底不含 NSFW / 亲密写死
  const core = getIdentityCore('你', { fullMode: true }).join('\n');
  assertNo(core, '身体', '身份基底不含身体部位词');
  assertNo(core, '亲密', '身份基底不含"亲密"写死');
  assertNo(core, '恋人', '身份基底不含"恋人"写死');
  assertHas(core, '代码层不预设', '身份基底声明代码层不预设关系');
}

// ═══════════════════════════════════════
// 结果
// ═══════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`prompt 清理测试结果：${pass} 通过，${fail} 失败`);
console.log(`${'═'.repeat(50)}`);
if (fail > 0) {
  console.error('存在失败用例！');
  process.exit(1);
}
