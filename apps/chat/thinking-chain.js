// apps/chat/thinking-chain.js
// 思考过程步骤卡片：把 AI 响应事件渲染为链式步骤卡片 UI
// 每个 step = 一个 AI 事件（reasoning / tool call / memory write / app action）
// 外层块默认折叠，点击展开所有步骤；每个步骤默认折叠，点击展开详情
// imports:
//   from './thinking-pure.js': sanitizeThinkingText (展示层 sanitizer，与生产层同源)

import { sanitizeThinkingText } from './thinking-pure.js';

const THINKING_STYLE_ID = 'chat-thinking-chain-style-v7';

// 模块级展开状态：跨流式重渲染持久化（renderThreadMessages 每次重建 DOM）
// key = messageId（不用 fingerprint，因为流式时 fingerprint 会变）
const expandedCards = new Set();
const expandedSteps = new Set();

// 安全展示兼容：旧消息的 thinking 可能含残留标签/协议文本/过多换行
// 在展示层做最后一道清洗，不修改原始数据库
// 复用 thinking-pure.js 的 sanitizeThinkingText，消除两份漂移 copy
function sanitizeDisplayText(text) {
  return sanitizeThinkingText(text);
}

// ═══════════════════════════════════════
// 【公开接口】与 thread-render.js 的契约
// ═══════════════════════════════════════

export function hasThinkingChain(message) {
  if (!message) return false;
  if (message.role === 'user') return false;
  if (sanitizeDisplayText(message.thinking)) return true;
  if (collectTools(message).length > 0) return true;
  return false;
}

export function createThinkingCard(message, options = {}) {
  injectStyle();

  const roleName = String(options.roleName || options.characterName || options.name || 'TA').trim();
  const messageId = String(options.messageId || '').trim();
  const isRunning = isMessageRunning(message);

  const steps = buildSteps(message);
  if (!steps.length) {
    return el('section', 'chat-thinking-card');
  }

  return createStepCard(steps, { roleName, messageId, isRunning });
}

// ═══════════════════════════════════════
// 【步骤构建】把 message 数据转成统一 step 数组
// ═══════════════════════════════════════

function buildSteps(message) {
  const steps = [];
  const isRunning = isMessageRunning(message);

  // 1. thinking 步骤（如果有）
  const thinkingText = sanitizeDisplayText(message?.thinking);
  if (thinkingText) {
    steps.push({
      type: 'thinking',
      icon: 'sparkle',
      title: getThinkingPreviewText(message) || '分析意图',
      tag: null,
      detail: thinkingText,
      status: isRunning ? 'running' : 'done'
    });
  }

  // 2. 工具调用 / 记忆写入 / 记仇写入
  const tools = collectTools(message);
  tools.forEach((tool, index) => {
    const detail = buildToolDetailData(tool, index, message, {});
    steps.push(toolToStep(tool, detail));
  });

  return steps;
}

function toolToStep(tool, detail) {
  const source = String(detail.source || 'tool').toLowerCase();
  const action = String(detail.action || 'tool').toLowerCase();

  let type, tag, icon;

  if (source === 'memory' || source === 'grudge') {
    type = 'tool_memory';
    tag = '记忆';
    icon = 'bookmark';
  } else if (action === 'mcp') {
    type = 'tool_mcp';
    tag = 'MCP';
    icon = 'link';
  } else if (action === 'search') {
    type = 'tool_search';
    tag = null;
    icon = 'search';
  } else {
    type = 'tool_app';
    tag = 'APP';
    icon = 'phone';
  }

  // 拼接详情文本
  const parts = [];
  if (detail.summary) parts.push(detail.summary);
  if (detail.query) parts.push('输入：' + detail.query);
  if (detail.result) parts.push((detail.resultLabel || '结果') + '：' + detail.result);
  if (detail.error) parts.push('问题：' + detail.error);
  detail.extraRows.forEach((row) => {
    parts.push(row.label + '：' + row.value);
  });

  return {
    type,
    icon,
    title: detail.title,
    tag,
    detail: parts.join('\n') || '这一步没有留下更多内容。',
    status: detail.status
  };
}

// ═══════════════════════════════════════
// 【渲染】步骤卡片
// ═══════════════════════════════════════

function createStepCard(steps, options) {
  const messageId = String(options.messageId || '').trim();
  const isRunning = Boolean(options.isRunning);

  const card = el('section', 'chat-thinking-card');
  card.dataset.running = isRunning ? 'true' : 'false';

  // 外层 header（始终可见，点击展开/折叠所有步骤）
  const isCardExpanded = expandedCards.has(messageId);

  const header = safeButton('chat-thinking-header', '展开思考过程');
  header.dataset.expanded = isCardExpanded ? 'true' : 'false';

  const headerIcon = el('span', 'chat-thinking-header-icon');
  headerIcon.appendChild(createSparkleIcon());

  const headerText = el('span', 'chat-thinking-header-text', `思考过程 · ${steps.length}步`);

  const headerChevron = el('span', 'chat-thinking-header-chevron');
  headerChevron.appendChild(createChevronIcon());

  header.append(headerIcon, headerText, headerChevron);

  // 步骤容器（默认折叠）
  const stepsWrap = el('div', 'chat-thinking-steps');
  stepsWrap.dataset.expanded = isCardExpanded ? 'true' : 'false';

  steps.forEach((step, index) => {
    stepsWrap.appendChild(createStepRow(step, index, messageId));
  });

  header.addEventListener('click', () => {
    const next = stepsWrap.dataset.expanded !== 'true';
    stepsWrap.dataset.expanded = next ? 'true' : 'false';
    header.dataset.expanded = next ? 'true' : 'false';
    if (next) {
      expandedCards.add(messageId);
    } else {
      expandedCards.delete(messageId);
    }
  });

  card.append(header, stepsWrap);
  return card;
}

function createStepRow(step, index, messageId) {
  const stepKey = `${messageId}:${index}`;
  const isStepExpanded = expandedSteps.has(stepKey);

  const stepEl = el('div', 'chat-thinking-step');
  stepEl.dataset.status = step.status;
  stepEl.dataset.type = step.type;
  stepEl.dataset.expanded = isStepExpanded ? 'true' : 'false';

  // 步骤行（点击展开/折叠详情）
  const row = safeButton('chat-thinking-step-row', `查看第${index + 1}步详情`);

  const dot = el('span', 'chat-thinking-step-dot');
  dot.dataset.status = step.status;

  const iconWrap = el('span', 'chat-thinking-step-icon');
  iconWrap.appendChild(createStepIcon(step.icon));

  const textWrap = el('span', 'chat-thinking-step-text');
  textWrap.appendChild(el('span', 'chat-thinking-step-title', step.title));
  if (step.tag) {
    textWrap.appendChild(el('span', 'chat-thinking-step-tag', step.tag));
  }

  const chevron = el('span', 'chat-thinking-step-chevron');
  chevron.appendChild(createChevronIcon());

  row.append(dot, iconWrap, textWrap, chevron);

  // 详情（默认折叠）
  const detail = el('div', 'chat-thinking-step-detail');
  detail.appendChild(el('div', 'chat-thinking-step-detail-text', step.detail));

  row.addEventListener('click', () => {
    const next = stepEl.dataset.expanded !== 'true';
    stepEl.dataset.expanded = next ? 'true' : 'false';
    if (next) {
      expandedSteps.add(stepKey);
    } else {
      expandedSteps.delete(stepKey);
    }
  });

  stepEl.append(row, detail);
  return stepEl;
}

// ═══════════════════════════════════════
// 【DOM 辅助】
// ═══════════════════════════════════════

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

// ═══════════════════════════════════════
// 【数据提取】从 message 收集工具/记忆/记仇事件
// ═══════════════════════════════════════

function collectTools(message) {
  const tools = [];
  normalizeToolCalls(message?.toolCalls).forEach((tool) => {
    tools.push({ ...tool, _source: 'tool' });
  });
  normalizeToolCalls(message?.memoryWrites).forEach((memory) => {
    tools.push({
      ...memory,
      name: resolveMemoryToolName(memory),
      status: memory.status || memory.state || 'done',
      result: memory.content || memory.summary || memory.text || '',
      detailSummary: memory.detailSummary || memory.summary || '',
      _source: 'memory'
    });
  });
  normalizeToolCalls(message?.grudgeWrites).forEach((grudge) => {
    tools.push({
      ...grudge,
      name: resolveGrudgeToolName(grudge),
      status: grudge.status || grudge.state || 'done',
      result: grudge.reason || grudge.content || grudge.text || '',
      detailSummary: grudge.detailSummary || grudge.summary || '',
      _source: 'grudge'
    });
  });
  return tools;
}

function resolveMemoryToolName(memory) {
  const raw = normalizeText(memory?.name || memory?.action || memory?.type || '').toLowerCase();
  if (/(删|删除|移除)/.test(raw)) return '轻轻删掉一条记忆';
  if (/(改|编辑|更新|修正)/.test(raw)) return '顺手改了改记忆';
  return '悄悄记下一笔';
}

function resolveGrudgeToolName(grudge) {
  const raw = normalizeText(grudge?.name || grudge?.action || grudge?.type || '').toLowerCase();
  if (/(删|删除|移除)/.test(raw)) return '把小本本翻掉一页';
  if (/(改|编辑|更新|修正)/.test(raw)) return '把小本本改了改';
  return '在小本本上画圈圈';
}

function resolveToolDisplayName(tool, index) {
  const source = String(tool?._source || 'tool').toLowerCase();
  const rawName = normalizeText(tool?.name || tool?.toolName || tool?.title || tool?.action).toLowerCase();

  if (source === 'memory') return resolveMemoryToolName(tool);
  if (source === 'grudge') return resolveGrudgeToolName(tool);

  if (/(mcp|外部工具|server|web.*tool)/.test(rawName)) return '叫了外部小工具';
  if (/(搜|搜索|search|上网|网页|web|资料)/.test(rawName)) return '去查了查';
  if (/(转账|付款|pay|红包)/.test(rawName)) return '递了一张小票据';
  if (/(礼物|gift)/.test(rawName)) return '递了一份小礼物';
  if (/(商店|购买|下单|buy|shop|小物)/.test(rawName)) return '去小物商店逛了逛';
  if (/(电话|通话|call|summary|总结)/.test(rawName)) return '把电话收成一小段记忆';
  if (/(主动消息|proactive)/.test(rawName)) return '想主动和你说句话';

  const name = normalizeText(tool?.name || tool?.toolName || tool?.title || tool?.action);
  return name || `第 ${index + 1} 步`;
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

function buildToolDetailData(tool, index, message, options = {}) {
  const source = String(tool?._source || inferToolSource(tool)).toLowerCase();
  const status = getToolStatus(tool);
  const action = detectActionType(tool, source);
  const query = normalizeToolField(tool?.arguments || tool?.input || tool?.params || tool?.query || tool?.payload || tool?.request);
  const result = normalizeToolField(tool?.result || tool?.output || tool?.content || tool?.summary || tool?.text || tool?.description);
  const error = normalizeToolField(tool?.error || tool?.message);
  const amount = normalizeAmount(tool);
  const targetName = normalizeText(tool?.characterName || tool?.targetName || tool?.receiverName || tool?.toName || tool?.memberName);
  const itemName = normalizeText(tool?.itemName || tool?.name || tool?.giftName || tool?.productName || tool?.title);
  const modelName = normalizeText(tool?.model || tool?.modelName);
  const endpointName = normalizeText(tool?.endpoint || tool?.server || tool?.provider || tool?.serviceName);

  const meta = TOOL_COPY_MAP[action] || TOOL_COPY_MAP.default;
  const title = resolveToolDisplayTitle(meta, tool, index, source, action, status);
  const summary = resolveToolSummary(meta, tool, { status, query, result, amount, targetName, itemName, endpointName });
  const resultLabel = resolveResultLabel(action, source);
  const extraRows = [];

  if (status === 'running') {
    extraRows.push({ label: '状态', value: '还在慢慢处理' });
  } else if (status === 'error') {
    extraRows.push({ label: '状态', value: '这一步卡了一下' });
  } else {
    extraRows.push({ label: '状态', value: '已经弄好啦' });
  }

  if (modelName) extraRows.push({ label: '模型', value: modelName });
  if (endpointName) extraRows.push({ label: '来源', value: endpointName });
  if (amount > 0) extraRows.push({ label: '金额', value: `¥${formatAmount(amount)}` });
  if (targetName) extraRows.push({ label: '对象', value: targetName });
  if (action === 'transfer' && itemName) extraRows.push({ label: '标题', value: itemName });
  if (['gift', 'shop_buy'].includes(action) && itemName) extraRows.push({ label: '小物', value: itemName });

  return {
    source,
    action,
    status,
    icon: meta.icon,
    title,
    summary,
    query,
    result,
    resultLabel,
    error,
    extraRows
  };
}

function resolveToolDisplayTitle(meta, tool, index, source, action, status) {
  if (status === 'running' && meta.runningTitle) return meta.runningTitle;
  if (status === 'error' && meta.errorTitle) return meta.errorTitle;
  if (meta.titleBuilder) return meta.titleBuilder(tool, index);
  return meta.title || resolveToolDisplayName(tool, index);
}

function resolveToolSummary(meta, tool, context) {
  if (typeof meta.summaryBuilder === 'function') {
    return meta.summaryBuilder(tool, context);
  }
  if (context.status === 'running') {
    return meta.runningSummary || '我正在悄悄做这一步，还没有完全收尾。';
  }
  if (context.status === 'error') {
    return meta.errorSummary || '这一步刚刚卡了一下，暂时没顺利走完。';
  }
  return meta.summary || '这一步已经处理好了。';
}

function resolveResultLabel(action, source) {
  if (source === 'memory') return '我记下了什么';
  if (source === 'grudge') return '我记到小本本里的内容';
  if (action === 'search') return '我翻到的内容';
  if (action === 'mcp') return '工具给我的结果';
  if (action === 'transfer') return '这张小卡片里写了什么';
  if (action === 'gift' || action === 'shop_buy') return '这份小礼物的内容';
  if (action === 'call_summary') return '我整理好的电话记忆';
  return '我处理出来的内容';
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

function normalizeAmount(tool) {
  const raw = Number(tool?.amount || tool?.price || tool?.transferAmount || tool?.itemPrice || 0);
  return Number.isFinite(raw) ? raw : 0;
}

function summarizeText(text, max = 20) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
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

function formatAmount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toFixed(2);
}

function buildFingerprint(message) {
  const thinking = String(message?.thinking || '').trim();
  const summary = String(message?.thinkingSummary || '').trim();
  const tools = collectTools(message);
  const toolHash = tools.map((t) => `${t.name}:${t.status}:${String(t.result || '').slice(0, 40)}`).join('|');
  return hashString(`${summary}|${thinking}|${toolHash}`).slice(0, 12);
}

function hashString(text) {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) % 1000000007;
  }
  return value.toString(36);
}

function getThinkingPreviewText(message) {
  const custom = sanitizeDisplayText(String(message?.thinkingSummary || ''));
  if (custom) return custom.length > 15 ? `${custom.slice(0, 15).trim()}…` : custom;
  const text = sanitizeDisplayText(String(message?.thinking || '')).replace(/\s+/g, ' ').trim();
  if (text) return text.length > 15 ? `${text.slice(0, 15).trim()}…` : text;
  return '想了一小会';
}

function isMessageRunning(message) {
  if (message?.isPending === true) return true;
  if (message?.isStreaming === true) return true;
  const status = normalizeText(message?.status || message?.streamStatus).toLowerCase();
  return ['streaming', 'thinking', 'running', 'loading', 'pending'].includes(status);
}

// ═══════════════════════════════════════
// 【SVG 图标】inline SVG，无 emoji，无外部库
// ═══════════════════════════════════════

function createSparkleIcon() {
  const svg = createSvgBase();
  addPath(svg, 'M12 3l1.9 5.6a2 2 0 0 0 1.3 1.3L21 12l-5.6 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.6a2 2 0 0 0-1.3-1.3L3 12l5.6-1.9a2 2 0 0 0 1.3-1.3L12 3Z');
  return svg;
}

function createLinkIcon() {
  const svg = createSvgBase();
  addPath(svg, 'M9.5 14.5l5-5');
  addPath(svg, 'M8.5 17.5l-1 1a3.5 3.5 0 0 1-5-5l2-2a3.5 3.5 0 0 1 5 0');
  addPath(svg, 'M15.5 6.5l1-1a3.5 3.5 0 0 1 5 5l-2 2a3.5 3.5 0 0 1-5 0');
  return svg;
}

function createBookmarkIcon() {
  const svg = createSvgBase();
  addPath(svg, 'M7 4.75h10A1.75 1.75 0 0 1 18.75 6.5v13.5l-6.75-4-6.75 4V6.5A1.75 1.75 0 0 1 7 4.75Z');
  return svg;
}

function createPhoneIcon() {
  const svg = createSvgBase();
  addPath(svg, 'M7.5 4.5h9A1.5 1.5 0 0 1 18 6v12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 18V6a1.5 1.5 0 0 1 1.5-1.5Z');
  addPath(svg, 'M10 18h4');
  addPath(svg, 'M9 6.5h6');
  addPath(svg, 'M10.5 9h3');
  addPath(svg, 'M10.5 11.5h3');
  addPath(svg, 'M10.5 14h3');
  return svg;
}

function createSearchIcon() {
  const svg = createSvgBase();
  addCircle(svg, '11', '11', '5.25');
  addPath(svg, 'M15.2 15.2 19 19');
  return svg;
}

function createChevronIcon() {
  const svg = createSvgBase();
  addPath(svg, 'm9.5 6.8 5 5.2-5 5.2');
  return svg;
}

function createStepIcon(name) {
  if (name === 'sparkle') return createSparkleIcon();
  if (name === 'link') return createLinkIcon();
  if (name === 'bookmark') return createBookmarkIcon();
  if (name === 'phone') return createPhoneIcon();
  if (name === 'search') return createSearchIcon();
  return createSparkleIcon();
}

function createSvgBase() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
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
// 【工具文案映射】
// ═══════════════════════════════════════

const TOOL_COPY_MAP = {
  search: {
    icon: 'search',
    runningTitle: '去查了查',
    title: '去查了查',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我正在翻外面的资料，怕漏掉关键信息。';
      if (context.status === 'error') return '我本来想去外面找点资料，结果这一步刚刚卡了一下。';
      return '我先去外面补了一点资料，再回来把答案整理得更贴你。';
    }
  },
  mcp: {
    icon: 'link',
    runningTitle: '叫了外部小工具',
    title: '叫了外部小工具',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我正在让外部工具帮我办这一步，还没完全收回来。';
      if (context.status === 'error') return '我本来想让外部工具帮忙，结果它刚刚没接稳。';
      return '我借了一下外部小工具的手，把这一步悄悄办完了。';
    }
  },
  memory_add: {
    icon: 'bookmark',
    runningTitle: '正在记下一笔',
    title: '记下一小笔',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我觉得这件事以后可能还会用到，所以先记着。';
      if (context.status === 'error') return '我本来想把这件事记住，结果这一笔刚刚没落稳。';
      return '我把这次聊出来的重要点放进记忆里了，这样下次不用你再重说一遍。';
    }
  },
  memory_edit: {
    icon: 'bookmark',
    runningTitle: '正在改记忆',
    title: '顺手改了改记忆',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把旧记录改得更准一点，免得以后用错。';
      if (context.status === 'error') return '我本来想把旧记录改准一点，结果这一步卡住了。';
      return '我把旧记忆里不够准的地方轻轻改好了，后面就不会别扭。';
    }
  },
  memory_delete: {
    icon: 'bookmark',
    runningTitle: '正在删记忆',
    title: '轻轻删掉一条记忆',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把过时或者不准的旧记录收掉。';
      if (context.status === 'error') return '我本来想把不合适的旧记录删掉，结果这一页卡住了。';
      return '我把一条不再适合留下的旧记忆收走了，省得以后跑偏。';
    }
  },
  grudge_add: {
    icon: 'bookmark',
    runningTitle: '正在写小本本',
    title: '在小本本上画圈圈',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我有一点点在意，所以先往小本本里放一笔。';
      if (context.status === 'error') return '我本来想把这件在意的事记到小本本里，结果刚刚卡了一下。';
      return '这件让我有点在意的事，我已经记到小本本里了。';
    }
  },
  grudge_edit: {
    icon: 'bookmark',
    runningTitle: '正在改小本本',
    title: '把小本本改了改',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在整理小本本里的旧内容，让它更贴近现在的心情。';
      if (context.status === 'error') return '我本来想调整一下小本本里的内容，结果这一笔卡住了。';
      return '我把小本本里的旧内容理顺了一点，更贴近现在的心情。';
    }
  },
  grudge_delete: {
    icon: 'bookmark',
    runningTitle: '正在翻掉一页',
    title: '把小本本翻掉一页',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把一件已经不想继续记着的事轻轻放下。';
      if (context.status === 'error') return '我本来想把这一页翻过去，结果刚刚没翻顺。';
      return '有一页我已经不想继续记着了，就轻轻翻过去啦。';
    }
  },
  transfer: {
    icon: 'phone',
    runningTitle: '正在递小票据',
    title: '递了一张小票据',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在整理这张转账小卡片，准备把小心意递过去。';
      if (context.status === 'error') return '我本来想把这张小票据递过去，结果刚刚卡了一下。';
      return '我把这份转账小心意整理成卡片，方便你一眼看清。';
    }
  },
  gift: {
    icon: 'phone',
    runningTitle: '正在递小礼物',
    title: '递了一份小礼物',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把这份礼物的小卡片整理好。';
      if (context.status === 'error') return '我本来想把礼物递过去，结果这一步有点卡。';
      return '我把这份礼物的小卡片收拾好了，内容和小图也会一起带上。';
    }
  },
  shop_buy: {
    icon: 'phone',
    runningTitle: '正在逛小物商店',
    title: '去小物商店逛了逛',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我正在商店里挑东西，想看看哪一件更合适。';
      if (context.status === 'error') return '我本来想去商店里挑东西，结果这一趟刚刚卡住了。';
      return '我从小物商店里挑了合适的东西，顺手把卡片也整理好了。';
    }
  },
  call_summary: {
    icon: 'phone',
    runningTitle: '正在整理电话余温',
    title: '把电话收成一小段记忆',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把刚刚通话里的情绪和重点收成一小段记忆。';
      if (context.status === 'error') return '我本来想把电话里的重点收一下，结果刚刚卡住了。';
      return '通话结束后，我把那一点点余温和重点收进了记忆里。';
    }
  },
  proactive: {
    icon: 'phone',
    runningTitle: '想主动和你说话',
    title: '想主动和你说句话',
    summaryBuilder() {
      return '这是我自己想先开口的一小步，不是被硬推出来的。';
    }
  },
  tool: {
    icon: 'phone',
    runningTitle: '悄悄办点小事',
    title: '悄悄办点小事',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我正在把这一步慢慢办完。';
      if (context.status === 'error') return '这一步本来快弄好了，结果刚刚卡了一下。';
      return '我顺手把这一步办好了。';
    }
  },
  default: {
    icon: 'phone',
    title: '悄悄办点小事',
    summary: '我顺手把这一步办好了。'
  }
};

// ═══════════════════════════════════════
// 【样式注入】遵循现有 CSS 变量，不硬编码色值
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

    /* ── 外层 header ── */
    .chat-thinking-header{
      width:fit-content;
      max-width:100%;
      min-height:34px;
      display:flex;
      align-items:center;
      gap:7px;
      padding:6px 13px;
      border:none;
      outline:none;
      border-radius:999px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      box-shadow:inset 0 1px 0 color-mix(in srgb, var(--bg-card) 82%, transparent), var(--shadow-sm);
      font:inherit;
      font-size:13px;
      font-weight:500;
      line-height:1.4;
      text-align:left;
      cursor:pointer;
      transition:all 200ms cubic-bezier(.34,1.56,.64,1);
      touch-action:manipulation;
    }

    .chat-thinking-header:active{
      transform:scale(.97);
    }

    .chat-thinking-header[data-expanded="true"]{
      color:var(--text-primary);
    }

    .chat-thinking-header-icon{
      width:16px;
      height:16px;
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      color:var(--accent-dark);
    }

    .chat-thinking-header-icon svg{
      width:15px;
      height:15px;
    }

    .chat-thinking-card[data-running="true"] .chat-thinking-header-icon{
      animation:chatThinkingSparkle 2s ease-in-out infinite;
    }

    .chat-thinking-header-text{
      min-width:0;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .chat-thinking-header-chevron{
      width:14px;
      height:14px;
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      color:var(--text-hint);
      transition:transform 280ms cubic-bezier(.34,1.56,.64,1);
    }

    .chat-thinking-header-chevron svg{
      width:13px;
      height:13px;
    }

    .chat-thinking-header[data-expanded="true"] .chat-thinking-header-chevron{
      transform:rotate(90deg);
    }

    /* ── 步骤容器 ── */
    .chat-thinking-steps{
      max-height:0;
      overflow:hidden;
      padding-left:10px;
      transition:max-height 320ms cubic-bezier(.34,1.56,.64,1), opacity 240ms ease;
      opacity:0;
    }

    .chat-thinking-steps[data-expanded="true"]{
      max-height:3000px;
      opacity:1;
      padding-top:10px;
    }

    /* 时间轴竖线 */
    .chat-thinking-steps::before{
      content:"";
      position:absolute;
      left:19px;
      top:18px;
      bottom:10px;
      width:2px;
      border-radius:999px;
      background:color-mix(in srgb, var(--accent) 16%, transparent);
    }

    .chat-thinking-steps{
      position:relative;
    }

    /* ── 单个步骤 ── */
    .chat-thinking-step{
      position:relative;
      display:flex;
      flex-direction:column;
      gap:0;
    }

    .chat-thinking-step + .chat-thinking-step{
      margin-top:8px;
    }

    .chat-thinking-step-row{
      width:100%;
      display:flex;
      align-items:center;
      gap:10px;
      padding:0;
      border:none;
      outline:none;
      background:transparent;
      font:inherit;
      text-align:left;
      cursor:pointer;
      transition:transform 200ms cubic-bezier(.34,1.56,.64,1);
      touch-action:manipulation;
    }

    .chat-thinking-step-row:active{
      transform:scale(.985);
    }

    .chat-thinking-step-dot{
      width:20px;
      height:20px;
      flex:0 0 auto;
      position:relative;
      border-radius:999px;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
      z-index:1;
    }

    .chat-thinking-step-dot::before{
      content:"";
      position:absolute;
      inset:5px;
      border-radius:999px;
      background:var(--accent-light);
      transition:background 200ms ease;
    }

    .chat-thinking-step-dot[data-status="running"]::before{
      background:var(--accent);
      animation:chatThinkingDotPulse 1.2s ease-in-out infinite;
    }

    .chat-thinking-step-dot[data-status="error"]::before{
      background:color-mix(in srgb, var(--text-secondary) 78%, transparent);
    }

    .chat-thinking-step-icon{
      width:28px;
      height:28px;
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:color-mix(in srgb, var(--bg-card) 90%, transparent);
      color:var(--accent-dark);
      box-shadow:var(--shadow-sm);
      position:relative;
      z-index:1;
    }

    .chat-thinking-step-icon svg{
      width:14px;
      height:14px;
    }

    .chat-thinking-step-text{
      flex:1;
      min-width:0;
      display:flex;
      align-items:center;
      gap:7px;
      padding:9px 12px;
      border-radius:16px;
      background:var(--surface-muted);
      box-shadow:inset 0 1px 0 color-mix(in srgb, var(--bg-card) 84%, transparent), var(--shadow-sm);
    }

    .chat-thinking-step-title{
      color:var(--text-primary);
      font-size:12.5px;
      font-weight:600;
      line-height:1.35;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      min-width:0;
    }

    .chat-thinking-step-tag{
      flex:0 0 auto;
      padding:2px 8px;
      border-radius:999px;
      background:color-mix(in srgb, var(--accent) 14%, transparent);
      color:var(--accent-dark);
      font-size:10px;
      font-weight:600;
      line-height:1.5;
      letter-spacing:.02em;
    }

    .chat-thinking-step-chevron{
      width:16px;
      height:16px;
      flex:0 0 auto;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      color:var(--text-hint);
      transition:transform 280ms cubic-bezier(.34,1.56,.64,1);
    }

    .chat-thinking-step-chevron svg{
      width:13px;
      height:13px;
    }

    .chat-thinking-step[data-expanded="true"] .chat-thinking-step-chevron{
      transform:rotate(90deg);
    }

    /* ── 步骤详情 ── */
    .chat-thinking-step-detail{
      max-height:0;
      overflow:hidden;
      padding-left:58px;
      transition:max-height 280ms cubic-bezier(.34,1.56,.64,1), opacity 220ms ease;
      opacity:0;
    }

    .chat-thinking-step[data-expanded="true"] .chat-thinking-step-detail{
      max-height:1200px;
      opacity:1;
      padding-top:6px;
      padding-bottom:4px;
    }

    .chat-thinking-step-detail-text{
      padding:10px 13px;
      border-radius:14px;
      background:color-mix(in srgb, var(--bg-card) 60%, transparent);
      box-shadow:inset 0 1px 0 color-mix(in srgb, var(--bg-card) 70%, transparent);
      color:var(--text-secondary);
      font-size:12.5px;
      line-height:1.75;
      white-space:pre-line;
      word-break:break-word;
    }

    /* ── 动画 ── */
    @keyframes chatThinkingDotPulse{
      0%,100%{transform:scale(.85);opacity:.55}
      50%{transform:scale(1.12);opacity:1}
    }

    @keyframes chatThinkingSparkle{
      0%,100%{transform:scale(1);opacity:.8}
      50%{transform:scale(1.15);opacity:1}
    }

    /* ── 响应式 ── */
    @media(max-width:520px){
      .chat-thinking-step-text{
        padding:9px 11px;
      }

      .chat-thinking-step-detail{
        padding-left:52px;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .chat-thinking-header,
      .chat-thinking-header-chevron,
      .chat-thinking-step-row,
      .chat-thinking-step-chevron,
      .chat-thinking-steps,
      .chat-thinking-step-detail,
      .chat-thinking-step-dot[data-status="running"]::before,
      .chat-thinking-card[data-running="true"] .chat-thinking-header-icon{
        transition:none;
        animation:none;
      }
    }
  `;
  document.head.appendChild(style);
}
