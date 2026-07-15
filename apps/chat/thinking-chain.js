// apps/chat/thinking-chain.js
// 思考过程链显示组件：可折叠的链式步骤卡片
// 接口（保持兼容，不改对外签名）：
//   hasThinkingChain(message) -> boolean
//   createThinkingCard(message, options) -> HTMLElement
// 数据对接（内部转换，不要求上游改格式）：
//   message.thinking / message.thinkingSummary -> thinking 类型步骤
//   message.toolCalls -> tool_mcp / tool_search / tool_app 类型步骤
//   message.memoryWrites -> tool_memory 类型步骤
//   message.grudgeWrites -> tool_memory 类型步骤（记仇归入记忆类）
// imports:
//   from './thinking-pure.js': sanitizeThinkingText (展示层 sanitizer，与生产层同源)

import { sanitizeThinkingText } from './thinking-pure.js';

const THINKING_CARD_CLASS = 'chat-thinking-card';
const THINKING_STYLE_ID = 'chat-thinking-chain-style-v7';
const FIXED_SUMMARY_TEXT = '想了一小会';
const FIXED_SUMMARY_TEXT_RUNNING = '还在想想';

// ═══════════════════════════════════════
// 【对外接口】
// ═══════════════════════════════════════

export function hasThinkingChain(message) {
  if (!message) return false;
  if (message.role === 'user') return false;
  // 用清洗后的文本判断：纯标签/协议/英文原始推理的 thinking 被清洗后为空则不算
  if (sanitizeDisplayText(message.thinking)) return true;
  if (collectSteps(message).length > 0) return true;
  return false;
}

export function createThinkingCard(message, options = {}) {
  injectStyle();

  const roleName = String(options.roleName || options.characterName || options.name || 'TA').trim();
  const messageId = String(options.messageId || '').trim();
  const isRunning = isMessageRunning(message);

  const steps = collectSteps(message);
  const thinkingText = sanitizeDisplayText(message?.thinking);

  // 没有任何步骤也没有 thinking：不渲染（上层 hasThinkingChain 已拦截，这里兜底）
  if (!steps.length && !thinkingText) {
    const empty = el('section', THINKING_CARD_CLASS);
    empty.style.display = 'none';
    return empty;
  }

  // 若有 thinking 文本，作为第一个步骤（thinking 类型）
  const allSteps = thinkingText
    ? [buildThinkingStep(thinkingText, message, isRunning), ...steps]
    : steps;

  const card = el('section', THINKING_CARD_CLASS);
  card.dataset.running = isRunning ? 'true' : 'false';

  // 外层标题栏：✦图标 + "思考过程 · N步" + 右箭头（默认收起）
  const header = createCardHeader(allSteps.length, isRunning);
  card.appendChild(header);

  // 步骤容器（默认收起）
  const body = el('div', 'chat-thinking-steps');
  body.dataset.expanded = 'false';
  allSteps.forEach((step, index) => {
    body.appendChild(createStepRow(step, index, { roleName }));
  });
  card.appendChild(body);

  // 标题栏点击：展开/收起
  header.addEventListener('click', () => {
    const expanded = body.dataset.expanded === 'true';
    body.dataset.expanded = expanded ? 'false' : 'true';
    header.dataset.expanded = expanded ? 'false' : 'true';
  });

  return card;
}

// ═══════════════════════════════════════
// 【外层标题栏】✦图标 + "思考过程 · N步" + 右箭头
// ═══════════════════════════════════════

function createCardHeader(stepCount, isRunning) {
  const header = safeButton('chat-thinking-header', `展开思考过程，共${stepCount}步`);
  header.dataset.expanded = 'false';

  const iconWrap = el('span', 'chat-thinking-header-icon');
  iconWrap.appendChild(createSparkleIcon());

  const title = el('span', 'chat-thinking-header-title');
  title.textContent = isRunning
    ? `思考过程 · ${stepCount}步`
    : `思考过程 · ${stepCount}步`;

  const arrow = el('span', 'chat-thinking-header-arrow');
  arrow.appendChild(createChevronIcon());

  header.append(iconWrap, title, arrow);
  return header;
}

// ═══════════════════════════════════════
// 【单步骤行】圆点 + 图标 + 标题 + 标签 + 右箭头（默认收起，点开看详情）
// ═══════════════════════════════════════

function createStepRow(step, index, options = {}) {
  const row = safeButton('chat-thinking-step', `第${index + 1}步：${step.title}`);
  row.dataset.status = step.status;
  row.dataset.type = step.type;

  // 左侧连线圆点（running 脉冲 / done 实心打勾 / error 叉号）
  const dot = el('span', 'chat-thinking-step-dot');
  dot.dataset.status = step.status;
  dot.appendChild(createDotMark(step.status));

  // 图标
  const iconWrap = el('span', 'chat-thinking-step-icon');
  iconWrap.appendChild(createStepIcon(step.type));

  // 标题 + 标签
  const textWrap = el('div', 'chat-thinking-step-text');
  const titleRow = el('div', 'chat-thinking-step-title-row');
  titleRow.append(
    el('span', 'chat-thinking-step-title', step.title)
  );
  if (step.tag) {
    titleRow.appendChild(el('span', 'chat-thinking-step-tag', step.tag));
  }
  textWrap.appendChild(titleRow);

  // 右箭头
  const arrow = el('span', 'chat-thinking-step-arrow');
  arrow.appendChild(createChevronIcon());

  row.append(dot, iconWrap, textWrap, arrow);

  // 详情（默认收起）
  const detail = el('div', 'chat-thinking-step-detail');
  detail.dataset.expanded = 'false';
  if (step.detail) {
    detail.appendChild(el('div', 'chat-thinking-step-detail-text', step.detail));
  }
  if (step.error) {
    detail.appendChild(el('div', 'chat-thinking-step-detail-error', step.error));
  }

  // 详情容器（包含在 row 外层 wrapper 里，保持链式连线）
  const wrap = el('div', 'chat-thinking-step-wrap');
  wrap.appendChild(row);
  wrap.appendChild(detail);

  // 点击步骤行：展开/收起详情
  row.addEventListener('click', () => {
    const expanded = detail.dataset.expanded === 'true';
    detail.dataset.expanded = expanded ? 'false' : 'true';
    row.dataset.expanded = expanded ? 'false' : 'true';
  });

  return wrap;
}

// ═══════════════════════════════════════
// 【数据转换】把现有 message 格式转成统一的 step 结构
// 不要求上游改格式，组件内部做转换
// ═══════════════════════════════════════

function collectSteps(message) {
  const steps = [];

  // toolCalls -> tool_mcp / tool_search / tool_app
  normalizeToolCalls(message?.toolCalls).forEach((tool) => {
    steps.push(buildToolStep(tool, 'tool'));
  });

  // memoryWrites -> tool_memory
  normalizeToolCalls(message?.memoryWrites).forEach((memory) => {
    steps.push(buildMemoryStep(memory));
  });

  // grudgeWrites -> tool_memory（记仇归入记忆类，标签区分）
  normalizeToolCalls(message?.grudgeWrites).forEach((grudge) => {
    steps.push(buildGrudgeStep(grudge));
  });

  return steps;
}

function buildThinkingStep(thinkingText, message, isRunning) {
  const status = isRunning ? 'running' : 'done';
  const preview = getThinkingPreviewText(message);
  return {
    type: 'thinking',
    title: isRunning ? FIXED_SUMMARY_TEXT_RUNNING : FIXED_SUMMARY_TEXT,
    tag: null,
    detail: thinkingText,
    status
  };
}

function buildToolStep(tool, fallbackSource) {
  const source = String(tool?._source || fallbackSource || 'tool').toLowerCase();
  const action = detectActionType(tool, source);
  const status = getToolStatus(tool);
  const query = normalizeToolField(scrubSensitiveFields(tool?.arguments || tool?.input || tool?.params || tool?.query || tool?.payload || tool?.request));
  const result = normalizeToolField(scrubSensitiveFields(tool?.result || tool?.output || tool?.content || tool?.summary || tool?.text || tool?.description));
  const error = normalizeToolField(tool?.error || tool?.message);

  // 映射到 step 类型
  let stepType = 'tool_mcp';
  let tag = 'MCP';
  if (action === 'search') { stepType = 'tool_search'; tag = '搜索'; }
  else if (action === 'mcp') { stepType = 'tool_mcp'; tag = 'MCP'; }
  else if (['transfer', 'gift', 'shop_buy', 'call_summary', 'proactive'].includes(action)) {
    stepType = 'tool_app'; tag = 'APP';
  }

  const meta = STEP_COPY_MAP[action] || STEP_COPY_MAP.default;
  const title = resolveStepTitle(meta, tool, status);

  // 详情：状态 + query + result + error 组合
  const detailParts = [];
  detailParts.push(resolveStepSummary(meta, status));
  if (query) detailParts.push(`输入：${truncate(query, 120)}`);
  if (result) detailParts.push(`结果：${truncate(result, 200)}`);

  return {
    type: stepType,
    title,
    tag,
    detail: detailParts.join('\n'),
    error: error || '',
    status
  };
}

function buildMemoryStep(memory) {
  const action = detectActionType(memory, 'memory');
  const status = getToolStatus(memory);
  const meta = STEP_COPY_MAP[action] || STEP_COPY_MAP.memory_add;
  const title = resolveStepTitle(meta, memory, status);
  const content = normalizeToolField(memory?.content || memory?.summary || memory?.text || memory?.result);

  const detailParts = [];
  detailParts.push(resolveStepSummary(meta, status));
  if (content) detailParts.push(`内容：${truncate(content, 200)}`);

  return {
    type: 'tool_memory',
    title,
    tag: '记忆',
    detail: detailParts.join('\n'),
    error: '',
    status
  };
}

function buildGrudgeStep(grudge) {
  const action = detectActionType(grudge, 'grudge');
  const status = getToolStatus(grudge);
  const meta = STEP_COPY_MAP[action] || STEP_COPY_MAP.grudge_add;
  const title = resolveStepTitle(meta, grudge, status);
  const reason = normalizeToolField(grudge?.reason || grudge?.content || grudge?.text || grudge?.result);

  const detailParts = [];
  detailParts.push(resolveStepSummary(meta, status));
  if (reason) detailParts.push(`原因：${truncate(reason, 200)}`);

  return {
    type: 'tool_memory',
    title,
    tag: '记忆',
    detail: detailParts.join('\n'),
    error: '',
    status
  };
}

// ═══════════════════════════════════════
// 【步骤文案映射】
// ═══════════════════════════════════════

const STEP_COPY_MAP = {
  search: {
    running: '正在查资料',
    done: '查了资料',
    error: '查资料失败',
    summaryRunning: '正在翻外面的资料。',
    summaryDone: '去外面补了一点资料。',
    summaryError: '查资料这一步卡住了。'
  },
  mcp: {
    running: '正在调用工具',
    done: '调用了工具',
    error: '工具调用失败',
    summaryRunning: '正在让外部工具帮忙。',
    summaryDone: '借了外部工具把这一步办完。',
    summaryError: '外部工具没接稳。'
  },
  memory_add: {
    running: '正在记下',
    done: '记下了',
    error: '记忆写入失败',
    summaryRunning: '正在把这件事记进记忆。',
    summaryDone: '把重要点放进记忆里了。',
    summaryError: '这一笔没落稳。'
  },
  memory_edit: {
    running: '正在改记忆',
    done: '改了记忆',
    error: '记忆修改失败',
    summaryRunning: '正在把旧记录改准一点。',
    summaryDone: '把旧记忆改好了。',
    summaryError: '改记忆这一步卡住了。'
  },
  memory_delete: {
    running: '正在删记忆',
    done: '删了记忆',
    error: '记忆删除失败',
    summaryRunning: '正在收掉过时的旧记录。',
    summaryDone: '把不再适合的旧记忆收走了。',
    summaryError: '删记忆这一步卡住了。'
  },
  grudge_add: {
    running: '正在记录在意的事',
    done: '记录了在意的事',
    error: '记录失败',
    summaryRunning: '正在往记忆里放一笔。',
    summaryDone: '把在意的事记下来了。',
    summaryError: '记录这一步卡住了。'
  },
  grudge_edit: {
    running: '正在更新记录',
    done: '更新了记录',
    error: '更新失败',
    summaryRunning: '正在整理旧内容。',
    summaryDone: '把旧内容理顺了。',
    summaryError: '更新这一步卡住了。'
  },
  grudge_delete: {
    running: '正在翻过这一页',
    done: '翻过了这一页',
    error: '删除失败',
    summaryRunning: '正在放下不想继续记的事。',
    summaryDone: '已经不想继续记着了，轻轻翻过。',
    summaryError: '翻页这一步卡住了。'
  },
  transfer: {
    running: '正在处理转账',
    done: '处理了转账',
    error: '转账失败',
    summaryRunning: '正在整理转账卡片。',
    summaryDone: '把转账心意整理成卡片了。',
    summaryError: '转账这一步卡住了。'
  },
  gift: {
    running: '正在准备礼物',
    done: '准备了礼物',
    error: '礼物准备失败',
    summaryRunning: '正在整理礼物卡片。',
    summaryDone: '把礼物卡片收拾好了。',
    summaryError: '礼物这一步卡住了。'
  },
  shop_buy: {
    running: '正在挑选小物',
    done: '挑选了小物',
    error: '购买失败',
    summaryRunning: '正在商店里挑东西。',
    summaryDone: '从商店挑了合适的东西。',
    summaryError: '购买这一步卡住了。'
  },
  call_summary: {
    running: '正在整理通话',
    done: '整理了通话',
    error: '整理失败',
    summaryRunning: '正在把通话收成记忆。',
    summaryDone: '把通话重点收进记忆了。',
    summaryError: '整理通话这一步卡住了。'
  },
  proactive: {
    running: '正在主动开口',
    done: '主动开口了',
    error: '主动消息失败',
    summaryRunning: '准备先开口说一句话。',
    summaryDone: '自己先开口说了一句话。',
    summaryError: '主动消息这一步卡住了。'
  },
  tool: {
    running: '正在处理',
    done: '处理完成',
    error: '处理失败',
    summaryRunning: '正在处理这一步。',
    summaryDone: '这一步办好了。',
    summaryError: '这一步卡了一下。'
  },
  default: {
    running: '正在处理',
    done: '处理完成',
    error: '处理失败',
    summaryRunning: '正在处理这一步。',
    summaryDone: '这一步办好了。',
    summaryError: '这一步卡住了。'
  }
};

function resolveStepTitle(meta, tool, status) {
  if (status === 'running') return meta.running || meta.done || '正在处理';
  if (status === 'error') return meta.error || meta.done || '处理失败';
  return meta.done || '处理完成';
}

function resolveStepSummary(meta, status) {
  if (status === 'running') return meta.summaryRunning || meta.summaryDone || '正在处理。';
  if (status === 'error') return meta.summaryError || meta.summaryDone || '这一步卡住了。';
  return meta.summaryDone || '这一步办好了。';
}

// ═══════════════════════════════════════
// 【工具函数】
// ═══════════════════════════════════════

function sanitizeDisplayText(text) {
  return sanitizeThinkingText(text);
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function safeButton(className, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  if (label) btn.setAttribute('aria-label', label);
  return btn;
}

function isMessageRunning(message) {
  if (message?.isPending === true) return true;
  if (message?.isStreaming === true) return true;
  const status = normalizeText(message?.status || message?.streamStatus).toLowerCase();
  return ['streaming', 'thinking', 'running', 'loading', 'pending'].includes(status);
}

function getThinkingPreviewText(message) {
  const custom = sanitizeDisplayText(String(message?.thinkingSummary || ''));
  if (custom) return custom.length > 15 ? `${custom.slice(0, 15).trim()}…` : custom;
  const text = sanitizeDisplayText(String(message?.thinking || '')).replace(/\s+/g, ' ').trim();
  if (text) return text.length > 15 ? `${text.slice(0, 15).trim()}…` : text;
  return FIXED_SUMMARY_TEXT;
}

function normalizeToolCalls(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === false) return [];
  if (typeof value === 'string') return value.trim() ? [{ name: value.trim(), result: value.trim() }] : [];
  return [value].filter(Boolean);
}

function getToolStatus(tool) {
  const status = normalizeText(tool?.status || tool?.state).toLowerCase();
  if (['running', 'loading', 'pending', 'calling', 'streaming'].includes(status)) return 'running';
  if (['error', 'failed', 'fail'].includes(status)) return 'error';
  return 'done';
}

function normalizeToolField(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      return '';
    }
  }
  return String(value || '').trim();
}

// 脱敏：工具参数/结果里可能含 apiKey/token/secret/password 等敏感字段，绝不进展示层
// 对象：递归把敏感 key 的值替换成 ***；字符串：剥掉疑似 key=value 形态的敏感片段
const SENSITIVE_KEY_RE = /^(api[_-]?key|token|secret|password|auth|authorization|bearer|credential)$/i;
function scrubSensitiveFields(value) {
  if (!value) return value;
  if (typeof value === 'object') {
    const cleaned = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        cleaned[k] = '***';
      } else if (v && typeof v === 'object') {
        cleaned[k] = scrubSensitiveFields(v);
      } else {
        cleaned[k] = v;
      }
    }
    return cleaned;
  }
  if (typeof value === 'string') {
    return value.replace(/(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?[^\s"',}]+/gi, '$1=***');
  }
  return value;
}

function normalizeText(value) {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value).replace(/\s+/g, ' ').trim();
    } catch (_) {
      return '';
    }
  }
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncate(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function inferToolSource(tool) {
  const name = normalizeText(tool?.name || tool?.toolName || tool?.title || '').toLowerCase();
  if (name.includes('记忆')) return 'memory';
  if (name.includes('记仇') || name.includes('小本本')) return 'grudge';
  return 'tool';
}

function detectActionType(tool, source) {
  const name = normalizeText(tool?.name || tool?.toolName || tool?.title || tool?.action).toLowerCase();
  const query = normalizeText(tool?.arguments || tool?.input || tool?.params || tool?.query).toLowerCase();
  const result = normalizeText(tool?.result || tool?.output || tool?.content || tool?.summary || tool?.text).toLowerCase();
  const text = `${name}\n${query}\n${result}`;

  if (source === 'memory') {
    if (/(删|删除|移除)/.test(text)) return 'memory_delete';
    if (/(改|编辑|更新|修正)/.test(text)) return 'memory_edit';
    return 'memory_add';
  }
  if (source === 'grudge') {
    if (/(删|删除|移除|翻掉)/.test(text)) return 'grudge_delete';
    if (/(改|编辑|更新|修正)/.test(text)) return 'grudge_edit';
    return 'grudge_add';
  }
  if (/(mcp|tool|外部工具|server)/.test(text)) return 'mcp';
  if (/(搜|搜索|search|上网|网页|web|资料)/.test(text)) return 'search';
  if (/(转账|付款|pay|红包)/.test(text)) return 'transfer';
  if (/(礼物|gift)/.test(text)) return 'gift';
  if (/(商店|购买|下单|buy|shop|小物)/.test(text)) return 'shop_buy';
  if (/(电话|通话|call|summary|总结)/.test(text)) return 'call_summary';
  if (/(主动消息|proactive)/.test(text)) return 'proactive';
  return 'tool';
}

// ═══════════════════════════════════════
// 【图标】inline SVG，stroke-width 1.5-2px，禁止 emoji
// ═══════════════════════════════════════

// ✦ 星星/sparkle（外层标题 + thinking 类型）
function createSparkleIcon() {
  const svg = createSvgBase(18);
  addPath(svg, 'M12 3l1.8 4.6L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.9L12 3Z');
  addPath(svg, 'M18.5 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z');
  return svg;
}

// thinking 类型步骤图标（星星）
function createThoughtIcon() {
  return createSparkleIcon();
}

// tool_mcp（链接/插头）
function createMcpIcon() {
  const svg = createSvgBase();
  addPath(svg, 'M9 12l2 2 4-4');
  addPath(svg, 'M5.75 7.25h12.5A1.5 1.5 0 0 1 19.75 8.75v6.5a1.5 1.5 0 0 1-1.5 1.5H5.75a1.5 1.5 0 0 1-1.5-1.5v-6.5a1.5 1.5 0 0 1 1.5-1.5Z');
  addPath(svg, 'm8.4 10.1-2 2 2 2');
  addPath(svg, 'M11.6 14.1h4');
  return svg;
}

// tool_memory（书签）
function createMemoryIcon() {
  const svg = createSvgBase();
  addPath(svg, 'M7 4.75h10a1.75 1.75 0 0 1 1.75 1.75v12.5l-6.75-3.5-6.75 3.5V6.5A1.75 1.75 0 0 1 7 4.75Z');
  return svg;
}

// tool_app（手机/网格）
function createAppIcon() {
  const svg = createSvgBase();
  addPath(svg, 'M7 3.75h10a1.75 1.75 0 0 1 1.75 1.75v13A1.75 1.75 0 0 1 17 20.25H7A1.75 1.75 0 0 1 5.25 18.5v-13A1.75 1.75 0 0 1 7 3.75Z');
  addPath(svg, 'M10 17.75h4');
  return svg;
}

// tool_search（放大镜）
function createSearchIcon() {
  const svg = createSvgBase();
  addCircle(svg, '11', '11', '5.25');
  addPath(svg, 'M15.2 15.2 19 19');
  return svg;
}

// 右箭头（展开/收起指示）
function createChevronIcon() {
  const svg = createSvgBase(16);
  addPath(svg, 'm9 6 6 6-6 6');
  return svg;
}

// 圆点状态标记：done 打勾 / error 叉号 / running 空（脉冲动画在 CSS 上）
function createDotMark(status) {
  if (status === 'done') {
    const svg = createSvgBase(12);
    addPath(svg, 'm3 6.5 2.5 2.5 5-5');
    return svg;
  }
  if (status === 'error') {
    const svg = createSvgBase(12);
    addPath(svg, 'M4 4l5 5');
    addPath(svg, 'M9 4l-5 5');
    return svg;
  }
  // running：空圆点，脉冲靠 CSS 动画
  return el('span', 'chat-thinking-step-dot-pulse');
}

function createStepIcon(type) {
  switch (type) {
    case 'thinking': return createThoughtIcon();
    case 'tool_mcp': return createMcpIcon();
    case 'tool_memory': return createMemoryIcon();
    case 'tool_app': return createAppIcon();
    case 'tool_search': return createSearchIcon();
    default: return createThoughtIcon();
  }
}

function createSvgBase(size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  return svg;
}

function addPath(svg, d) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
}

function addCircle(svg, cx, cy, r) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  node.setAttribute('cx', cx);
  node.setAttribute('cy', cy);
  node.setAttribute('r', r);
  svg.appendChild(node);
}

// ═══════════════════════════════════════
// 【样式注入】Soft Cozy Minimal，全 CSS 变量，不硬编码色值
// ═══════════════════════════════════════

function injectStyle() {
  const old = document.getElementById(THINKING_STYLE_ID);
  if (old) old.remove();

  const style = document.createElement('style');
  style.id = THINKING_STYLE_ID;
  style.textContent = `
    .chat-thinking-card{
      width:100%;
      display:flex;
      flex-direction:column;
      gap:0;
    }

    /* 外层标题栏 */
    .chat-thinking-header{
      width:100%;
      display:flex;
      align-items:center;
      gap:9px;
      padding:9px 13px;
      border:none;
      outline:none;
      border-radius:16px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      box-shadow:inset 0 1px 0 color-mix(in srgb, var(--bg-card) 82%, transparent), var(--shadow-sm);
      font:inherit;
      font-size:13px;
      font-weight:600;
      text-align:left;
      cursor:pointer;
      transition:all 240ms cubic-bezier(.34,1.56,.64,1);
      touch-action:manipulation;
    }
    .chat-thinking-header:active{transform:scale(.98);}
    .chat-thinking-header-icon{
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      color:var(--accent-dark);
    }
    .chat-thinking-header-icon svg{width:17px;height:17px;}
    .chat-thinking-header-title{
      flex:1;
      min-width:0;
      color:var(--text-primary);
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .chat-thinking-header-arrow{
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      color:var(--text-hint);
      transition:transform 240ms cubic-bezier(.34,1.56,.64,1);
    }
    .chat-thinking-header-arrow svg{width:15px;height:15px;}
    .chat-thinking-header[data-expanded="true"] .chat-thinking-header-arrow{
      transform:rotate(90deg);
    }

    /* 步骤容器：默认收起，弹性动画展开 */
    .chat-thinking-steps{
      display:flex;
      flex-direction:column;
      gap:0;
      max-height:0;
      overflow:hidden;
      opacity:0;
      transition:max-height 260ms cubic-bezier(.34,1.56,.64,1),
                 opacity 220ms ease,
                 padding 260ms cubic-bezier(.34,1.56,.64,1);
      padding:0 0 0 0;
    }
    .chat-thinking-steps[data-expanded="true"]{
      max-height:2400px;
      opacity:1;
      padding:8px 0 4px 4px;
    }

    /* 单步骤 wrapper（含连线） */
    .chat-thinking-step-wrap{
      position:relative;
      display:flex;
      flex-direction:column;
      padding-left:14px;
    }
    .chat-thinking-step-wrap::before{
      content:"";
      position:absolute;
      left:23px;
      top:24px;
      bottom:-4px;
      width:2px;
      border-radius:999px;
      background:color-mix(in srgb, var(--accent) 16%, transparent);
    }
    .chat-thinking-step-wrap:last-child::before{display:none;}

    /* 步骤行 */
    .chat-thinking-step{
      width:100%;
      display:flex;
      align-items:center;
      gap:10px;
      padding:9px 11px;
      border:none;
      outline:none;
      border-radius:14px;
      background:var(--surface-muted);
      box-shadow:inset 0 1px 0 color-mix(in srgb, var(--bg-card) 84%, transparent), var(--shadow-sm);
      font:inherit;
      text-align:left;
      cursor:pointer;
      transition:transform 220ms cubic-bezier(.34,1.56,.64,1);
      touch-action:manipulation;
    }
    .chat-thinking-step:active{transform:scale(.985);}

    /* 圆点：running 脉冲 / done 实心打勾 / error 叉号 */
    .chat-thinking-step-dot{
      width:22px;
      height:22px;
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
      position:relative;
      z-index:1;
    }
    .chat-thinking-step-dot svg{
      width:13px;
      height:13px;
      color:var(--bg-card);
    }
    .chat-thinking-step-dot[data-status="done"]{
      background:var(--accent);
    }
    .chat-thinking-step-dot[data-status="error"]{
      background:color-mix(in srgb, var(--text-secondary) 72%, transparent);
    }
    .chat-thinking-step-dot[data-status="running"]{
      background:var(--bg-card);
      box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent), var(--shadow-sm);
      animation:chatThinkingDotPulse 1.2s ease-in-out infinite;
    }
    .chat-thinking-step-dot-pulse{
      width:10px;
      height:10px;
      border-radius:999px;
      background:var(--accent);
    }

    /* 步骤图标 */
    .chat-thinking-step-icon{
      width:26px;
      height:26px;
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:color-mix(in srgb, var(--bg-card) 90%, transparent);
      color:var(--accent-dark);
      box-shadow:var(--shadow-sm);
    }
    .chat-thinking-step[data-status="running"] .chat-thinking-step-icon{
      animation:chatThinkingIconBlink 1.2s ease-in-out infinite;
    }
    .chat-thinking-step-icon svg{width:14px;height:14px;}

    /* 标题 + 标签 */
    .chat-thinking-step-text{
      flex:1;
      min-width:0;
    }
    .chat-thinking-step-title-row{
      display:flex;
      align-items:center;
      gap:7px;
    }
    .chat-thinking-step-title{
      color:var(--text-primary);
      font-size:13px;
      font-weight:600;
      line-height:1.35;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .chat-thinking-step-tag{
      flex:0 0 auto;
      padding:2px 8px;
      border-radius:999px;
      background:color-mix(in srgb, var(--accent) 14%, transparent);
      color:var(--accent-dark);
      font-size:10.5px;
      font-weight:600;
      line-height:1.4;
    }

    /* 右箭头 */
    .chat-thinking-step-arrow{
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      color:var(--text-hint);
      transition:transform 220ms cubic-bezier(.34,1.56,.64,1);
    }
    .chat-thinking-step-arrow svg{width:14px;height:14px;}
    .chat-thinking-step[data-expanded="true"] .chat-thinking-step-arrow{
      transform:rotate(90deg);
    }

    /* 步骤详情：默认收起 */
    .chat-thinking-step-detail{
      max-height:0;
      overflow:hidden;
      opacity:0;
      transition:max-height 240ms cubic-bezier(.34,1.56,.64,1),
                 opacity 200ms ease,
                 padding 240ms cubic-bezier(.34,1.56,.64,1);
      padding:0 12px 0 36px;
    }
    .chat-thinking-step-detail[data-expanded="true"]{
      max-height:600px;
      opacity:1;
      padding:6px 12px 10px 36px;
    }
    .chat-thinking-step-detail-text{
      color:var(--text-secondary);
      font-size:12.5px;
      line-height:1.7;
      white-space:pre-line;
      word-break:break-word;
    }
    .chat-thinking-step-detail-error{
      margin-top:6px;
      padding:8px 11px;
      border-radius:12px;
      background:color-mix(in srgb, var(--text-secondary) 10%, transparent);
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.6;
      word-break:break-word;
    }

    @keyframes chatThinkingDotPulse{
      0%,100%{transform:scale(.92);opacity:.65;}
      50%{transform:scale(1.06);opacity:1;}
    }
    @keyframes chatThinkingIconBlink{
      0%,100%{opacity:.6;}
      50%{opacity:1;}
    }

    @media(max-width:520px){
      .chat-thinking-header{padding:8px 11px;font-size:12.5px;}
      .chat-thinking-step{padding:8px 10px;}
      .chat-thinking-step-detail[data-expanded="true"]{padding:6px 10px 10px 32px;}
    }

    @media(prefers-reduced-motion:reduce){
      .chat-thinking-header,
      .chat-thinking-header-arrow,
      .chat-thinking-steps,
      .chat-thinking-step,
      .chat-thinking-step-arrow,
      .chat-thinking-step-detail,
      .chat-thinking-step-dot[data-status="running"],
      .chat-thinking-step[data-status="running"] .chat-thinking-step-icon{
        transition:none;
        animation:none;
      }
      .chat-thinking-steps[data-expanded="true"]{
        max-height:none;
      }
      .chat-thinking-step-detail[data-expanded="true"]{
        max-height:none;
      }
    }
  `;
  document.head.appendChild(style);
}
