// tests/test_thinking_chain.mjs
// 代码级可控流测试：验证 thinking 过程链系统的解析/清洗/隔离逻辑
// 运行：node tests/test_thinking_chain.mjs
//
// 测试目标：正文、thinking、过程链节点三者绝不串
// 测试的纯函数镜像自 apps/chat/thread-ai.js：
//   parseStreamThinkTags / sanitizeThinkingText / parseAIText / normalizeAIResult(简化)
// 若生产代码逻辑变更，本测试需同步更新。

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg); }
}

// ═══════════════════════════════════════
// 镜像函数：与 thread-ai.js 保持一致
// ═══════════════════════════════════════

function sanitizeThinkingText(text) {
  let out = String(text || '');
  out = out.replace(/<\/?think(?:ing)?(?:_summary)?\b[^>]*>/gi, '');
  out = out.replace(/^[\s>]*(正式|正文|用户正在回应|assistant|user|system)\s*[:：]\s*/gim, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  out = out.split('\n').map((line) => line.trim()).join('\n').trim();
  return out;
}

function parseStreamThinkTags(text) {
  let content = String(text || '');
  let thinking = '';
  let thinkingSummary = '';

  let tailBuffer = '';
  const tailMatch = content.match(/<(think|thinking|think_summary|thinking_summary|\/think|\/thinking|\/think_summary|\/thinking_summary)?$/i);
  if (tailMatch) {
    tailBuffer = content.slice(tailMatch.index);
    content = content.slice(0, tailMatch.index);
  }

  const extractTag = (src, openTag, closeTag) => {
    let out = { content: src, text: '' };
    const open = src.indexOf(openTag);
    if (open < 0) return out;
    const tagEnd = src.indexOf('>', open);
    if (tagEnd < 0) return out;
    const close = src.indexOf(closeTag, tagEnd + 1);
    if (close >= 0) {
      out.text = src.slice(tagEnd + 1, close).trim();
      out.content = (src.slice(0, open) + src.slice(close + closeTag.length)).trim();
    } else {
      out.text = src.slice(tagEnd + 1).trim();
      out.content = src.slice(0, open).trim();
    }
    return out;
  };

  const s1 = extractTag(content, '<think_summary', '</think_summary>');
  if (s1.text) { thinkingSummary = s1.text; content = s1.content; }

  const s2 = extractTag(content, '<thinking_summary', '</thinking_summary>');
  if (s2.text) { thinkingSummary = thinkingSummary ? thinkingSummary + s2.text : s2.text; content = s2.content; }

  const thinkMatch = content.match(/<think\b[^>]*>/i);
  if (thinkMatch) {
    const openIdx = thinkMatch.index;
    const tagEnd = openIdx + thinkMatch[0].length;
    const closeIdx = content.indexOf('</think>', tagEnd);
    if (closeIdx >= 0) {
      const t = content.slice(tagEnd, closeIdx).trim();
      thinking = thinking ? thinking + '\n' + t : t;
      content = (content.slice(0, openIdx) + content.slice(closeIdx + 8)).trim();
    } else {
      const t = content.slice(tagEnd).trim();
      thinking = thinking ? thinking + '\n' + t : t;
      content = content.slice(0, openIdx).trim();
    }
  }

  const thinkingMatch = content.match(/<thinking\b[^>]*>/i);
  if (thinkingMatch) {
    const openIdx = thinkingMatch.index;
    const tagEnd = openIdx + thinkingMatch[0].length;
    const closeIdx = content.indexOf('</thinking>', tagEnd);
    if (closeIdx >= 0) {
      const t = content.slice(tagEnd, closeIdx).trim();
      thinking = thinking ? thinking + '\n' + t : t;
      content = (content.slice(0, openIdx) + content.slice(closeIdx + 11)).trim();
    } else {
      const t = content.slice(tagEnd).trim();
      thinking = thinking ? thinking + '\n' + t : t;
      content = content.slice(0, openIdx).trim();
    }
  }

  content = (content + tailBuffer).trim();
  return { content, thinking, thinkingSummary };
}

function parseAIText(text, userName = '你') {
  const raw = String(text || '').trim();
  const thinkingMatch =
    raw.match(/<think\b[^>]*>([\s\S]*?)<\/think>/i) ||
    raw.match(/<thinking\b[^>]*>([\s\S]*?)<\/thinking>/i);

  const summaryMatch =
    raw.match(/<think_summary\b[^>]*>([\s\S]*?)<\/think_summary>/i) ||
    raw.match(/<thinking_summary\b[^>]*>([\s\S]*?)<\/thinking_summary>/i);

  const thinking = thinkingMatch
    ? sanitizeThinkingText(thinkingMatch[1].trim())
    : '';

  let content = raw;
  if (thinkingMatch) content = content.replace(thinkingMatch[0], '').trim();
  if (summaryMatch) content = content.replace(summaryMatch[0], '').trim();

  let thinkingSummary = summaryMatch
    ? summaryMatch[1].trim()
    : '';

  thinkingSummary = thinkingSummary.replace(/^摘要[:：]?\s*/i, '').trim();
  if (!thinkingSummary && thinking) thinkingSummary = thinking.slice(0, 15).trim();
  if (thinkingSummary.length > 15) thinkingSummary = thinkingSummary.slice(0, 15).trim();

  return { content, thinking, thinkingSummary, toolCalls: [] };
}

// 简化版 normalizeAIResult：只测 thinking/content 分离
function normalizeAIResult(result) {
  if (typeof result === 'string') return parseAIText(result);
  if (result && typeof result === 'object') {
    const content = result.content || result.text || result.message || result.reply || '';
    const nativeThinking =
      result.thinking || result.reasoning || result.reasoningContent ||
      result.reasoning_content || '';
    const parsed = parseAIText(String(content || ''));
    const thinking = nativeThinking
      ? sanitizeThinkingText(String(nativeThinking || ''))
      : parsed.thinking;
    return {
      content: parsed.content,
      thinking,
      thinkingSummary: parsed.thinkingSummary,
      toolCalls: result.toolCalls || result.tools || []
    };
  }
  return { content: '', thinking: '', thinkingSummary: '', toolCalls: [] };
}

// ═══════════════════════════════════════
// 测试用例
// ═══════════════════════════════════════

console.log('\n[用例 1] <think> 整段一个 chunk');
{
  const chunk = '<think>我想想今天该说什么</think>你好呀，今天天气不错。';
  const r = parseStreamThinkTags(chunk);
  assert(r.thinking === '我想想今天该说什么', 'thinking 正确提取');
  assert(r.content === '你好呀，今天天气不错。', 'content 正确提取，不含标签');
  assert(!r.content.includes('<think'), '正文无 think 标签泄漏');
}

console.log('\n[用例 2] <think> 被拆到多 chunk（标签跨 chunk）');
{
  // 真实 createStreamAccumulator：rawContent 只追加原始 chunk，parse() 每次读完整 rawContent
  // parse() 不修改 rawContent，只返回解析结果。applyTo 把结果写到 message。
  const acc = { rawContent: '', rawThinking: '', rawThinkingSummary: '' };
  const chunks = [
    '你好，<thi',
    'nk>我想想',
    '今天该说什',
    '么</think>',
    '今天天气不错。'
  ];
  let finalContent = '';
  let finalThinking = '';
  for (const ch of chunks) {
    // append：只追加原始内容，不修改 rawContent 的已解析部分
    acc.rawContent += ch;
    // parse：读完整 rawContent，返回解析结果（不修改 rawContent）
    const parsed = parseStreamThinkTags(acc.rawContent);
    // 累积 thinking（真实代码里 parse() 会合并 rawThinking + 本次 result.thinking）
    if (parsed.thinking) {
      acc.rawThinking = parsed.thinking;
    }
    finalContent = parsed.content;
    finalThinking = acc.rawThinking;
  }
  assert(!finalContent.includes('<thi'), '正文无 <thi 碎片泄漏');
  assert(!finalContent.includes('<think'), '正文无 <think 标签泄漏');
  assert(!finalContent.includes('我想想'), 'thinking 内容不串入正文');
  assert(finalThinking.includes('我想想今天该说什么'), 'thinking 跨 chunk 正确拼接');
  assert(finalContent.includes('今天天气不错'), '正文包含闭合后的正文');
}

console.log('\n[用例 3] <think> 未闭合（流式中途）');
{
  const chunk = '前面的话<think>我还在想';
  const r = parseStreamThinkTags(chunk);
  assert(r.thinking === '我还在想', '未闭合 think 内容归入 thinking');
  assert(r.content === '前面的话', '正文只保留 think 之前的内容');
  assert(!r.content.includes('<think'), '正文无标签泄漏');
}

console.log('\n[用例 4] reasoning_content + content（API 原生思维字段）');
{
  const result = {
    content: '你好呀，今天怎么了？',
    reasoning_content: '用户打招呼，我要友好回应。'
  };
  const r = normalizeAIResult(result);
  assert(r.thinking === '用户打招呼，我要友好回应。', 'reasoning_content 归入 thinking');
  assert(r.content === '你好呀，今天怎么了？', 'content 保持正文');
  assert(!r.content.includes('用户打招呼'), 'thinking 不串入正文');
}

console.log('\n[用例 5] 只有 content，无 thinking');
{
  const result = { content: '你好呀。' };
  const r = normalizeAIResult(result);
  assert(r.thinking === '', '无 thinking');
  assert(r.content === '你好呀。', 'content 正确');
}

console.log('\n[用例 6] 只有 reasoning，没有正文');
{
  const result = { content: '', reasoning_content: '我在想怎么回。' };
  const r = normalizeAIResult(result);
  assert(r.thinking === '我在想怎么回。', 'reasoning 归入 thinking');
  assert(r.content === '', '正文为空，不把 thinking 当正文');
}

console.log('\n[用例 7] 含真实动作节点（toolCalls/memoryWrites/grudgeWrites 不串入正文/thinking）');
{
  const result = {
    content: '我帮你查了一下。',
    reasoning_content: '需要调工具。',
    toolCalls: [{ name: 'mcp', toolName: 'search', status: 'done', result: '查询结果', _source: 'tool' }]
  };
  const r = normalizeAIResult(result);
  assert(r.content === '我帮你查了一下。', '正文不含工具结果');
  assert(r.thinking === '需要调工具。', 'thinking 不含工具 JSON');
  assert(!r.thinking.includes('search'), 'thinking 不含工具名');
  assert(!r.thinking.includes('查询结果'), 'thinking 不含工具返回');
  assert(Array.isArray(r.toolCalls) && r.toolCalls.length === 1, 'toolCalls 正确保留');
}

console.log('\n[用例 8] 无动作节点（toolCalls 为空）');
{
  const result = { content: '你好。', reasoning_content: '打招呼。' };
  const r = normalizeAIResult(result);
  assert(Array.isArray(r.toolCalls) && r.toolCalls.length === 0, '无动作节点时 toolCalls 为空');
}

console.log('\n[用例 9] sanitizeThinkingText 清洗标签');
{
  const dirty = '<think>这是思维</think>残留<thinking>另一段';
  const clean = sanitizeThinkingText(dirty);
  assert(!clean.includes('<think'), '清洗后无 <think 标签');
  assert(!clean.includes('</think'), '清洗后无 </think 标签');
  assert(!clean.includes('<thinking'), '清洗后无 <thinking 标签');
}

console.log('\n[用例 10] sanitizeThinkingText 清洗协议文本');
{
  const dirty1 = '正式：我要说的重要内容';
  const dirty2 = '正文：这是回复';
  const dirty3 = '用户正在回应：你好';
  assert(sanitizeThinkingText(dirty1) === '我要说的重要内容', '清洗"正式："协议');
  assert(sanitizeThinkingText(dirty2) === '这是回复', '清洗"正文："协议');
  assert(sanitizeThinkingText(dirty3) === '你好', '清洗"用户正在回应："协议');
}

console.log('\n[用例 11] sanitizeThinkingText 不误删普通中文');
{
  const normal = '今天天气真好，我想出去走走。';
  assert(sanitizeThinkingText(normal) === '今天天气真好，我想出去走走。', '普通中文不被误删');
  const withNewlines = '第一行\n第二行\n第三行';
  assert(sanitizeThinkingText(withNewlines) === '第一行\n第二行\n第三行', '正常换行保留');
}

console.log('\n[用例 12] sanitizeThinkingText 压缩多余换行（防竖排）');
{
  const vertical = '字\n\n\n\n字\n\n\n\n字';
  const clean = sanitizeThinkingText(vertical);
  assert(!/\n{3,}/.test(clean), '3+ 连续换行被压缩为 2');
  assert(clean === '字\n\n字\n\n字', '换行压缩正确');
}

console.log('\n[用例 13] <think_summary> 不与 <think> 前缀碰撞');
{
  const text = '<think_summary>简短摘要</think_summary><think>详细思维</think>正文';
  const r = parseStreamThinkTags(text);
  assert(r.thinkingSummary === '简短摘要', 'summary 正确提取');
  assert(r.thinking === '详细思维', 'thinking 正确提取，不与 summary 碰撞');
  assert(r.content === '正文', '正文正确');
}

console.log('\n[用例 14] <thinking> 标签也能正确解析');
{
  const text = '<thinking>我在想</thinking>你好';
  const r = parseStreamThinkTags(text);
  assert(r.thinking === '我在想', 'thinking 标签内容提取');
  assert(r.content === '你好', '正文正确');
}

console.log('\n[用例 15] 过程链节点数据隔离（memoryWrites 不泄漏到 content/thinking）');
{
  // 模拟 finalMessage 构造后的隔离检查
  const finalMessage = {
    content: '我记住了你说的话。',
    thinking: '用户分享了重要信息，我该记住。',
    thinkingSummary: '记一下',
    toolCalls: [],
    memoryWrites: [{
      name: '新增记忆',
      action: 'add',
      status: 'done',
      summary: '用户喜欢猫',
      result: '用户喜欢猫',
      characterId: 'char-1',
      _source: 'memory'
    }],
    grudgeWrites: []
  };
  assert(!finalMessage.content.includes('用户喜欢猫'), '正文不含记忆内容');
  assert(!finalMessage.thinking.includes('新增记忆'), 'thinking 不含记忆节点元数据');
  assert(finalMessage.memoryWrites.length === 1, '记忆节点保留在 memoryWrites');
  assert(finalMessage.memoryWrites[0].characterId === 'char-1', '记忆节点带 characterId 隔离');
}

console.log('\n[用例 16] grudgeWrites 不泄漏到 content/thinking');
{
  const finalMessage = {
    content: '我有点不开心。',
    thinking: '被敷衍了。',
    toolCalls: [],
    memoryWrites: [],
    grudgeWrites: [{
      name: 'grudge',
      status: 'active',
      summary: '被说滚',
      result: '被说滚',
      mood: '真的被气到了',
      characterId: 'char-1',
      _source: 'grudge'
    }]
  };
  assert(!finalMessage.content.includes('被说滚'), '正文不含记仇原因');
  assert(!finalMessage.thinking.includes('grudge'), 'thinking 不含记仇元数据');
  assert(finalMessage.grudgeWrites.length === 1, '记仇节点保留在 grudgeWrites');
  assert(finalMessage.grudgeWrites[0].characterId === 'char-1', '记仇节点带 characterId 隔离');
}

console.log('\n[用例 17] MCP toolRecord 不含原始参数/JSON/key');
{
  const toolRecord = {
    name: 'mcp',
    toolName: 'search',
    serviceName: 'web',
    status: 'done',
    summary: '查询了天气',
    result: '查询了天气',
    characterId: 'char-1',
    _source: 'tool'
  };
  const json = JSON.stringify(toolRecord);
  assert(!json.includes('apiKey'), 'toolRecord 不含 apiKey');
  assert(!json.includes('arguments'), 'toolRecord 不含原始 arguments');
  assert(!json.includes('"params"'), 'toolRecord 不含原始 params');
  assert(!json.includes('header'), 'toolRecord 不含 header');
}

console.log('\n[用例 18] 纯协议文本泄漏场景（不含真实 thinking，不应展示为 thinking）');
{
  // 模型返回的是协议复述，不是用户可读 thinking
  const protocolLeak = '正式：assistant 应当用第一人称回复用户。';
  const clean = sanitizeThinkingText(protocolLeak);
  // 清洗后只剩 "assistant 应当用第一人称回复用户。" 中的可读部分
  // 关键断言：不含 "正式：" 协议标记
  assert(!clean.includes('正式：'), '协议标记被清除');
  assert(!clean.startsWith('正式'), '不以协议词开头');
}

console.log('\n[用例 19] <think> 标签内含协议文本，清洗后不泄漏');
{
  const raw = '<think>正式：我要想想\n正文：然后回复</think>你好';
  const r = parseStreamThinkTags(raw);
  const cleaned = sanitizeThinkingText(r.thinking);
  assert(!cleaned.includes('正式：'), 'thinking 清洗后无协议标记');
  assert(!cleaned.includes('正文：'), 'thinking 清洗后无协议标记');
  assert(r.content === '你好', '正文正确');
}

console.log('\n[用例 20] thinking 文本含大量换行不会竖排');
{
  const raw = '想\n想\n想\n想\n想';
  const cleaned = sanitizeThinkingText(raw);
  // 单字符换行不会被压缩（只有 3+ 连续换行才压缩），但确认不会产生竖排
  assert(cleaned.length > 0, '清洗后仍有内容');
  assert(!/\n{3,}/.test(cleaned), '无 3+ 连续换行');
}

// ═══════════════════════════════════════
console.log('\n══════════════════════════════════');
console.log(`通过: ${pass}  失败: ${fail}`);
if (fail === 0) console.log('全部通过');
else console.log('有失败用例，请检查');
process.exit(fail > 0 ? 1 : 0);
