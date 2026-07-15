// tests/test_thinking_chain_v2.mjs
// thinking-chain.js 重写后的冒烟测试：
// 验证 hasThinkingChain / createThinkingCard 接口兼容 + 新折叠卡片结构 + 步骤数据转换
// 运行：node tests/test_thinking_chain_v2.mjs

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
function assertNo(haystack, needle, msg) {
  const ok = !String(haystack || '').includes(needle);
  if (ok) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg, '\n    不应包含:', JSON.stringify(needle)); }
}

// ═══════════════════════════════════════
// DOM mock（组件用 document.createElement / createElementNS）
// ═══════════════════════════════════════
function makeFakeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    className: '',
    textContent: '',
    innerHTML: '',
    dataset: {},
    style: {},
    _children: [],
    appendChild(child) { this._children.push(child); return child; },
    append(...kids) { kids.forEach((k) => this._children.push(k)); },
    remove() {},
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener() {},
    removeEventListener() {},
    classList: { add(){}, remove(){}, toggle(){} }
  };
  return el;
}

const headChildren = [];
globalThis.document = {
  createElement: (tag) => makeFakeEl(tag),
  createElementNS: (ns, tag) => makeFakeEl(tag),
  createTextNode: (t) => ({ textContent: String(t), _children: [] }),
  getElementById: () => null,
  head: { appendChild(child) { headChildren.push(child); return child; } },
  body: { appendChild() {}, append() {} }
};
globalThis.window = {};

// 收集注入的 style 文本，用于验证 CSS 不含硬编码色值
let lastStyleText = '';
const origCreateElement = globalThis.document.createElement;
globalThis.document.createElement = function(tag) {
  const node = origCreateElement(tag);
  if (String(tag).toLowerCase() === 'style') {
    let text = '';
    Object.defineProperty(node, 'textContent', {
      get() { return text; },
      set(v) { text = String(v); lastStyleText = text; }
    });
  }
  return node;
};

// ═══════════════════════════════════════
// 加载真实生产模块
// ═══════════════════════════════════════
const { hasThinkingChain, createThinkingCard } = await import('../apps/chat/thinking-chain.js');

// ═══════════════════════════════════════
// 1. hasThinkingChain 接口兼容
// ═══════════════════════════════════════
console.log('\n[1] hasThinkingChain 接口兼容');
{
  // 有 thinking 文本 → true
  assert(hasThinkingChain({ role: 'assistant', thinking: '我在想怎么回应' }) === true, '有 thinking 文本 → true');
  // 有 toolCalls → true
  assert(hasThinkingChain({ role: 'assistant', thinking: '', toolCalls: [{ name: 'search', status: 'done' }] }) === true, '有 toolCalls → true');
  // 有 memoryWrites → true
  assert(hasThinkingChain({ role: 'assistant', thinking: '', memoryWrites: [{ action: 'add', status: 'done' }] }) === true, '有 memoryWrites → true');
  // 空消息 → false
  assert(hasThinkingChain({ role: 'assistant', thinking: '', toolCalls: [], memoryWrites: [], grudgeWrites: [] }) === false, '空消息 → false');
  // user 消息 → false
  assert(hasThinkingChain({ role: 'user', thinking: 'something' }) === false, 'user 消息 → false');
  // null → false
  assert(hasThinkingChain(null) === false, 'null → false');
  // 英文推理被清洗后替换为中性占位"想了一小会"（非空）→ true，但不裸露英文原句
  // hasThinkingChain 返回 true 是对的（有可展示内容），关键是展示层不泄漏英文原文
  assert(hasThinkingChain({ role: 'assistant', thinking: 'The user asked me to call resolve-library-id and think about it carefully' }) === true, '英文推理被替换为中性占位后 → true（有可展示内容）');
}

// ═══════════════════════════════════════
// 2. createThinkingCard 接口兼容：返回 DOM 元素，含外层标题栏
// ═══════════════════════════════════════
console.log('\n[2] createThinkingCard 返回折叠卡片结构');
{
  const message = {
    role: 'assistant',
    thinking: '用户问天气，我需要调工具查一下。',
    thinkingSummary: '查天气',
    toolCalls: [{
      name: 'mcp',
      toolName: 'search_weather',
      status: 'done',
      result: '今天晴天'
    }],
    memoryWrites: [{
      action: 'add',
      status: 'done',
      summary: '用户喜欢晴天'
    }],
    grudgeWrites: []
  };

  const card = createThinkingCard(message, { roleName: '小醒', messageId: 'msg1' });
  assert(card && typeof card.appendChild === 'function', '返回 DOM 元素');

  // 外层标题栏存在
  const header = card._children.find((c) => c.className && c.className.includes('chat-thinking-header'));
  assert(Boolean(header), '含外层标题栏 .chat-thinking-header');

  // 步骤容器存在，默认收起
  const steps = card._children.find((c) => c.className && c.className.includes('chat-thinking-steps'));
  assert(Boolean(steps), '含步骤容器 .chat-thinking-steps');
  assert(steps?.dataset?.expanded === 'false', '步骤容器默认收起 data-expanded=false');

  // 步骤数 = thinking + MCP + 记忆 = 3
  const stepWraps = (steps?._children || []).filter((c) => c.className && c.className.includes('chat-thinking-step-wrap'));
  assert(stepWraps.length === 3, `3 个步骤（thinking + MCP + 记忆），实际: ${stepWraps.length}`);

  // 标题栏文本含 "思考过程 · 3步"
  const headerTitle = header?._children?.find((c) => c.className && c.className.includes('chat-thinking-header-title'));
  assertHas(headerTitle?.textContent, '思考过程', '标题栏含"思考过程"');
  assertHas(headerTitle?.textContent, '3步', '标题栏含"3步"');
}

// ═══════════════════════════════════════
// 3. 普通 thinking（无动作）→ 1 步
// ═══════════════════════════════════════
console.log('\n[3] 普通 thinking → 1 步');
{
  const message = {
    role: 'assistant',
    thinking: '用户跟我打招呼，我要友好回应。',
    thinkingSummary: '打招呼',
    toolCalls: [],
    memoryWrites: [],
    grudgeWrites: []
  };

  const card = createThinkingCard(message, { roleName: '小醒', messageId: 'msg2' });
  const steps = card._children.find((c) => c.className && c.className.includes('chat-thinking-steps'));
  const stepWraps = (steps?._children || []).filter((c) => c.className && c.className.includes('chat-thinking-step-wrap'));
  assert(stepWraps.length === 1, `普通 thinking 1 步，实际: ${stepWraps.length}`);

  // 第一个步骤是 thinking 类型
  const firstStepRow = stepWraps[0]?._children?.[0];
  assert(firstStepRow?.dataset?.type === 'thinking', '步骤类型为 thinking');
  assert(firstStepRow?.dataset?.status === 'done', '步骤状态为 done');
}

// ═══════════════════════════════════════
// 4. 空消息 → 隐藏的空卡片（hasThinkingChain 已拦截，这里兜底）
// ═══════════════════════════════════════
console.log('\n[4] 空消息兜底');
{
  const message = {
    role: 'assistant',
    thinking: '',
    toolCalls: [],
    memoryWrites: [],
    grudgeWrites: []
  };

  const card = createThinkingCard(message, { roleName: '小醒', messageId: 'msg3' });
  assert(card?.style?.display === 'none', '空消息返回隐藏卡片');
}

// ═══════════════════════════════════════
// 5. 步骤状态：running / done / error 三态
// ═══════════════════════════════════════
console.log('\n[5] 步骤三态：running / done / error');
{
  // running 状态
  const runningMsg = {
    role: 'assistant',
    isStreaming: true,
    thinking: '正在想...',
    toolCalls: [{ name: 'mcp', status: 'running', result: '' }],
    memoryWrites: [],
    grudgeWrites: []
  };
  const runningCard = createThinkingCard(runningMsg, { roleName: '小醒', messageId: 'msg4' });
  assert(runningCard.dataset.running === 'true', 'isStreaming 时卡片 data-running=true');
  const runningSteps = runningCard._children.find((c) => c.className && c.className.includes('chat-thinking-steps'));
  const runningWraps = (runningSteps?._children || []).filter((c) => c.className && c.className.includes('chat-thinking-step-wrap'));
  // thinking 步骤 running + mcp 步骤 running
  const runningDots = runningWraps.filter((w) => {
    const row = w._children?.[0];
    return row?.dataset?.status === 'running';
  });
  assert(runningDots.length === 2, `running 状态步骤 2 个，实际: ${runningDots.length}`);

  // error 状态
  const errorMsg = {
    role: 'assistant',
    thinking: '想了一下',
    toolCalls: [{ name: 'mcp', status: 'error', error: '连接失败', result: '' }],
    memoryWrites: [],
    grudgeWrites: []
  };
  const errorCard = createThinkingCard(errorMsg, { roleName: '小醒', messageId: 'msg5' });
  const errorSteps = errorCard._children.find((c) => c.className && c.className.includes('chat-thinking-steps'));
  const errorWraps = (errorSteps?._children || []).filter((c) => c.className && c.className.includes('chat-thinking-step-wrap'));
  // 第二个步骤（MCP）是 error
  const mcpStep = errorWraps[1]?._children?.[0];
  assert(mcpStep?.dataset?.status === 'error', 'MCP 步骤状态为 error');

  // error 步骤的详情含错误信息
  const errorDetail = errorWraps[1]?._children?.[1];
  const errorDetailChildren = errorDetail?._children || [];
  const errorBox = errorDetailChildren.find((c) => c.className && c.className.includes('chat-thinking-step-detail-error'));
  assertHas(errorBox?.textContent, '连接失败', 'error 详情含错误信息');
}

// ═══════════════════════════════════════
// 6. 步骤类型映射：thinking/tool_mcp/tool_memory/tool_app/tool_search
// ═══════════════════════════════════════
console.log('\n[6] 步骤类型映射');
{
  const message = {
    role: 'assistant',
    thinking: '想了一下',
    toolCalls: [
      { name: 'search', toolName: 'web_search', status: 'done', result: '结果' },     // search
      { name: 'mcp', toolName: 'context7', status: 'done', result: '结果' },          // mcp
      { name: 'transfer', status: 'done', amount: 100, result: '转账成功' }           // app
    ],
    memoryWrites: [{ action: 'add', status: 'done', summary: '记了一笔' }],          // memory
    grudgeWrites: []
  };

  const card = createThinkingCard(message, { roleName: '小醒', messageId: 'msg6' });
  const steps = card._children.find((c) => c.className && c.className.includes('chat-thinking-steps'));
  const wraps = (steps?._children || []).filter((c) => c.className && c.className.includes('chat-thinking-step-wrap'));
  const types = wraps.map((w) => w._children?.[0]?.dataset?.type);

  // 顺序：thinking, tool_search, tool_mcp, tool_app, tool_memory
  assert(types[0] === 'thinking', '第1步 thinking');
  assert(types[1] === 'tool_search', '第2步 tool_search');
  assert(types[2] === 'tool_mcp', '第3步 tool_mcp');
  assert(types[3] === 'tool_app', '第4步 tool_app');
  assert(types[4] === 'tool_memory', '第5步 tool_memory');
}

// ═══════════════════════════════════════
// 7. 标签：MCP / 记忆 / APP / 搜索
// ═══════════════════════════════════════
console.log('\n[7] 步骤标签');
{
  const message = {
    role: 'assistant',
    thinking: '想了一下',
    toolCalls: [
      { name: 'search', status: 'done', result: 'r' },
      { name: 'mcp', status: 'done', result: 'r' },
      { name: 'gift', status: 'done', result: 'r' }
    ],
    memoryWrites: [{ action: 'add', status: 'done', summary: 's' }],
    grudgeWrites: []
  };

  const card = createThinkingCard(message, { roleName: '小醒', messageId: 'msg7' });
  const steps = card._children.find((c) => c.className && c.className.includes('chat-thinking-steps'));
  const wraps = (steps?._children || []).filter((c) => c.className && c.className.includes('chat-thinking-step-wrap'));

  // 每个步骤的标签
  const getTag = (wrap) => {
    const row = wrap._children?.[0];
    const textWrap = row?._children?.find((c) => c.className && c.className.includes('chat-thinking-step-text'));
    const titleRow = textWrap?._children?.[0];
    const tag = titleRow?._children?.find((c) => c.className && c.className.includes('chat-thinking-step-tag'));
    return tag?.textContent || '';
  };

  const tags = wraps.map(getTag);
  assert(tags[1] === '搜索', 'search 步骤标签"搜索"');
  assert(tags[2] === 'MCP', 'mcp 步骤标签"MCP"');
  assert(tags[3] === 'APP', 'gift 步骤标签"APP"');
  assert(tags[4] === '记忆', 'memory 步骤标签"记忆"');
  // thinking 步骤无标签
  assert(tags[0] === '', 'thinking 步骤无标签');
}

// ═══════════════════════════════════════
// 8. CSS 不含硬编码色值，全用 CSS 变量
// ═══════════════════════════════════════
console.log('\n[8] CSS 全用变量，不硬编码色值');
{
  // 触发一次 injectStyle
  createThinkingCard({
    role: 'assistant',
    thinking: '想了一下',
    toolCalls: [],
    memoryWrites: [],
    grudgeWrites: []
  }, { roleName: '小醒', messageId: 'msg8' });

  const css = lastStyleText || '';
  // 不应含硬编码 hex 色值
  assert(!/#([0-9a-fA-F]{3,8})\b/.test(css), 'CSS 无硬编码 hex 色值');
  // 不应含 rgb()/rgba() 硬编码
  assert(!/rgb\(\s*\d/.test(css), 'CSS 无硬编码 rgb() 色值');
  // 应含 CSS 变量 var(--...)
  assertHas(css, 'var(--', 'CSS 使用 CSS 变量');
  // 应含弹性缓动 cubic-bezier(.34,1.56,.64,1)
  assertHas(css, 'cubic-bezier(.34,1.56,.64,1)', 'CSS 使用弹性缓动 cubic-bezier(.34,1.56,.64,1)');
  // 应含脉冲动画
  assertHas(css, 'chatThinkingDotPulse', 'CSS 含圆点脉冲动画');
}

// ═══════════════════════════════════════
// 9. 不泄漏原始 JSON / apiKey / arguments
// ═══════════════════════════════════════
console.log('\n[9] 不泄漏原始 JSON / apiKey');
{
  const message = {
    role: 'assistant',
    thinking: '想了一下',
    toolCalls: [{
      name: 'mcp',
      toolName: 'context7',
      status: 'done',
      arguments: { apiKey: 'sk-secret-key-12345', libraryName: 'react' },
      result: '文档内容'
    }],
    memoryWrites: [],
    grudgeWrites: []
  };

  const card = createThinkingCard(message, { roleName: '小醒', messageId: 'msg9' });
  // 收集所有 textContent
  function collectText(node) {
    let text = '';
    if (node?.textContent) text += node.textContent;
    if (node?._children) {
      for (const child of node._children) text += collectText(child);
    }
    return text;
  }
  const allText = collectText(card);
  // 敏感值必须脱敏（apiKey 的值 sk-secret-... 不能出现）
  assertNo(allText, 'sk-secret-key-12345', '不泄漏 apiKey 值（已脱敏为 ***）');
  // 字段名本身不敏感，可以显示（apiKey/libraryName 是普通字段名）
  // 验证脱敏标记存在
  assertHas(allText, '***', '敏感值已脱敏为 ***');
}

// ═══════════════════════════════════════
// 10. SVG 图标存在（非 emoji）
// ═══════════════════════════════════════
console.log('\n[10] SVG 图标存在');
{
  const message = {
    role: 'assistant',
    thinking: '想了一下',
    toolCalls: [{ name: 'mcp', status: 'done', result: 'r' }],
    memoryWrites: [{ action: 'add', status: 'done', summary: 's' }],
    grudgeWrites: []
  };

  const card = createThinkingCard(message, { roleName: '小醒', messageId: 'msg10' });
  // 标题栏图标是 svg
  const header = card._children.find((c) => c.className && c.className.includes('chat-thinking-header'));
  const headerIcon = header?._children?.find((c) => c.className && c.className.includes('chat-thinking-header-icon'));
  const headerSvg = headerIcon?._children?.[0];
  assert(headerSvg?.tagName === 'SVG', '标题栏图标是 SVG');

  // 步骤图标是 svg
  const steps = card._children.find((c) => c.className && c.className.includes('chat-thinking-steps'));
  const firstWrap = (steps?._children || [])[0];
  const firstRow = firstWrap?._children?.[0];
  const iconWrap = firstRow?._children?.find((c) => c.className && c.className.includes('chat-thinking-step-icon'));
  const stepSvg = iconWrap?._children?.[0];
  assert(stepSvg?.tagName === 'SVG', '步骤图标是 SVG');

  // done 状态圆点含打勾 svg
  const dotWrap = firstRow?._children?.find((c) => c.className && c.className.includes('chat-thinking-step-dot'));
  const dotSvg = dotWrap?._children?.[0];
  assert(dotSvg?.tagName === 'SVG', 'done 圆点含打勾 SVG');
}

// ═══════════════════════════════════════
// 结果
// ═══════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`thinking-chain 重写测试结果：${pass} 通过，${fail} 失败`);
console.log(`${'═'.repeat(50)}`);
if (fail > 0) {
  console.error('存在失败用例！');
  process.exit(1);
}
