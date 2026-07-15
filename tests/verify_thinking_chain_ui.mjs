// verify_thinking_chain_ui.mjs
// 用 jsdom-like mock 加载真实 thinking-chain.js，验证 pill + sheet 渲染
// 运行：node tests/verify_thinking_chain_ui.mjs

// DOM mock（与回归测试同一套）
// textContent getter 递归拼接所有子节点文本，对齐真实 DOM 行为
// （pill 的文本在子 span 上，pill._text 本身为空，必须靠递归 getter 取到）
function collectText(node) {
  let t = node._text || '';
  if (node._children) {
    for (const c of node._children) t += collectText(c);
  }
  return t;
}

function makeEl(tag) {
  const e = {
    _tag: tag, _class: '', _text: '', _children: [], _attrs: {}, style: {}, dataset: {},
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k] || null; },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this._children.push(c); return c; },
    append(...kids) { this._children.push(...kids); },
    remove() {},
    classList: { add(c) { this._classes = this._classes || new Set(); this._classes.add(c); }, remove(){}, toggle(){} },
  };
  Object.defineProperty(e, 'textContent', {
    get() { return collectText(e); },
    set(v) { e._text = String(v || ''); e._children = []; },
    configurable: true
  });
  Object.defineProperty(e, 'className', {
    get() { return e._class; },
    set(v) { e._class = v; },
    configurable: true
  });
  return e;
}

globalThis.document = {
  createElement: (tag) => {
    const e = makeEl(tag);
    if (tag === 'style') { e._css = ''; Object.defineProperty(e, 'textContent', { get(){return e._css||''}, set(v){e._css=v}, configurable: true }); }
    return e;
  },
  createElementNS: () => makeEl('svg'),
  createTextNode: (t) => { const n = makeEl('#text'); n._text = String(t || ''); return n; },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  head: { appendChild() {}, insertBefore() {} },
  body: { appendChild() {}, append() {}, style: {} },
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
};
globalThis.window = { setTimeout, requestAnimationFrame: (cb) => setTimeout(cb, 0) };
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true }, writable: true, configurable: true
  });
} catch (_) {}

// 加载真实模块
const { hasThinkingChain, createThinkingCard } = await import('../apps/chat/thinking-chain.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg); }
}

console.log('=== 自检 1: 页面加载无崩溃 ===');
try {
  const card = createThinkingCard({
    role: 'assistant',
    thinking: '测试思考',
    toolCalls: [],
    memoryWrites: [],
    grudgeWrites: []
  }, { roleName: '小醒', messageId: 'm1' });
  assert(card && card._class === 'chat-thinking-card', 'createThinkingCard 返回 card 节点');
  pass++; console.log('  ✓ 模块加载无 JS 错误');
} catch (e) {
  fail++; console.log('  ✗ FAIL: 模块加载报错:', e.message);
}

console.log('\n=== 自检 2: 只显示 pill，无工具JSON泄漏 ===');
{
  const card = createThinkingCard({
    role: 'assistant',
    thinking: '用户问天气',
    toolCalls: [{ name: 'mcp_search', status: 'done', result: '晴天' }],
    memoryWrites: [{ name: '新增记忆', status: 'done', content: '喜欢晴天' }],
    grudgeWrites: []
  }, { roleName: '小醒', messageId: 'm2' });
  // card 第一个子节点应是 pill
  const pill = card._children && card._children[0];
  assert(pill && pill._class === 'tc-pill', 'card 第一个子节点是 tc-pill');
  // pill 文本在子 span 上，用 textContent（递归拼接）取全量文本
  const pillText = pill ? pill.textContent : '';
  assert(pillText.includes('思考过程'), 'pill 文本含"思考过程"');
  assert(pillText.includes('3步'), 'pill 显示 3 步（thinking+tool+memory）');
  // card 不含工具 JSON
  const noJson = !JSON.stringify(card._children || []).includes('mcp_tool_call');
  assert(noJson, 'card 无 mcp_tool_call JSON 泄漏');
}

console.log('\n=== 自检 3+6: 纯 thinking 也能显示 pill ===');
{
  const card = createThinkingCard({
    role: 'assistant',
    thinking: '纯思考内容',
    toolCalls: [],
    memoryWrites: [],
    grudgeWrites: []
  }, { roleName: '小醒', messageId: 'm3' });
  const pill = card._children && card._children[0];
  assert(pill && pill._class === 'tc-pill', '纯 thinking 也有 pill');
  const pillText = pill ? pill.textContent : '';
  assert(pillText.includes('1步'), '纯 thinking 显示 1 步');
}

console.log('\n=== 自检 7: 无 thinking 不显示 pill ===');
{
  // hasThinkingChain 返回 false
  const has = hasThinkingChain({
    role: 'assistant',
    thinking: '',
    toolCalls: [],
    memoryWrites: [],
    grudgeWrites: []
  });
  assert(has === false, '无 thinking + 无工具 → hasThinkingChain=false（上层不渲染）');
}
{
  // thinking 含纯协议标记（清洗后为空：剥 think 标签 + 剥"正式：/正文："协议前缀后无残留）
  const has = hasThinkingChain({
    role: 'assistant',
    thinking: '<think>正式：\n正文：</think>',
    toolCalls: [],
    memoryWrites: [],
    grudgeWrites: []
  });
  assert(has === false, '纯协议 thinking 清洗后为空 → hasThinkingChain=false');
}

console.log('\n=== 自检 8: CSS 变量使用 ===');
{
  // 从 document.head.appendChild 捕获 style
  let cssText = '';
  const origCreate = globalThis.document.createElement;
  const origHeadAppend = globalThis.document.head.appendChild;
  globalThis.document.head.appendChild = (el) => {
    if (el && el._css) cssText = el._css;
    return el;
  };
  createThinkingCard({
    role: 'assistant', thinking: 'x', toolCalls: [], memoryWrites: [], grudgeWrites: []
  }, {});
  globalThis.document.head.appendChild = origHeadAppend;
  assert(cssText.includes('var(--accent)'), 'CSS 用 var(--accent)');
  assert(cssText.includes('var(--accent-light)'), 'CSS 用 var(--accent-light)');
  assert(cssText.includes('var(--bg-card)'), 'CSS 用 var(--bg-card)');
  assert(cssText.includes('var(--text-primary)'), 'CSS 用 var(--text-primary)');
  assert(!cssText.includes('#E8E0D4'), 'CSS 无硬编码 #E8E0D4');
  assert(!cssText.includes('#C88888'), 'CSS 无硬编码 #C88888');
  assert(cssText.includes('cubic-bezier(0.34, 1.56, 0.64, 1)'), 'CSS 用 spring 缓动');
  assert(cssText.includes('280ms'), 'sheet 动画 280ms');
}

console.log('\n=== 自检 9: hasThinkingChain 兼容旧调用 ===');
{
  // thread-render.js 仍用 hasThinkingChain(message)
  assert(hasThinkingChain(null) === false, 'null 安全');
  assert(hasThinkingChain({ role: 'user' }) === false, 'user 消息不显示');
  assert(hasThinkingChain({ role: 'assistant', thinking: '有思考' }) === true, 'assistant+thinking 显示');
  assert(hasThinkingChain({ role: 'assistant', thinking: '', toolCalls: [{ name: 't' }] }) === true, '有工具显示');
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`thinking-chain UI 验证结果：${pass} 通过，${fail} 失败`);
console.log(`${'═'.repeat(50)}`);
if (fail > 0) process.exit(1);
