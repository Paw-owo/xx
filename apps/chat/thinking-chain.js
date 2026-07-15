// apps/chat/thinking-chain.js
// 思维链显示 UI：Pill + Bottom Sheet 两层交互
//   聊天气泡只显示一行 pill [✦ 思考过程 · N步 ›]
//   点 pill → 底部弹出 Bottom Sheet「概要页」(步骤列表)
//   点某步 → sheet 内切换到「详情页」(thinking文本 / 工具参数+结果 / 记忆内容 / APP动作详情)
// imports:
//   from './thinking-pure.js': sanitizeThinkingText (展示层 sanitizer，与生产层同源)

import { sanitizeThinkingText } from './thinking-pure.js';

// 兼容旧版 class 名（thread-render.js 可能引用容器 class）
const THINKING_CARD_CLASS = 'chat-thinking-card';
const THINKING_BODY_CLASS = 'chat-thinking-body';
const THINKING_STYLE_ID = 'chat-thinking-chain-style-v7';

// 当前打开的思维链 sheet 句柄；与具体 sheet 实例绑定，关闭时成对清理 esc 监听
let activeSheetHandle = null;

// 安全展示兼容：旧消息的 thinking 可能含残留标签/协议文本/过多换行
// 在展示层做最后一道清洗，不修改原始数据库
// 展示层与生产层（thread-ai.js）使用同一份 sanitizer 实现
function sanitizeDisplayText(text) {
  return sanitizeThinkingText(text);
}

// ═══════════════════════════════════════
// 【对外接口】hasThinkingChain / createThinkingCard
// 保留原签名，thread-render.js 零改动继续工作
// ═══════════════════════════════════════

export function hasThinkingChain(message) {
  if (!message) return false;
  if (message.role === 'user') return false;
  // 用清洗后的文本判断：纯标签/协议的 thinking 不算有效 thinking
  if (sanitizeDisplayText(message.thinking)) return true;
  if (collectTools(message).length > 0) return true;
  return false;
}

export function createThinkingCard(message, options = {}) {
  injectStyle();

  const roleName = String(options.roleName || options.characterName || options.name || 'TA').trim();
  const messageId = String(options.messageId || '').trim();
  const isRunning = isMessageRunning(message);

  const card = el('section', THINKING_CARD_CLASS);
  card.dataset.running = isRunning ? 'true' : 'false';

  // 构造步骤数据：thinking 一步 + 每个工具/记忆/记仇各一步
  const steps = buildSteps(message);
  const stepCount = steps.length;

  // 无步骤时不显示 pill（hasThinkingChain 在上层已拦截，这里做兜底）
  if (stepCount === 0) {
    const body = el('div', THINKING_BODY_CLASS);
    card.appendChild(body);
    return card;
  }

  // 聊天气泡只显示一行 pill
  const pill = createThinkingPill(stepCount, isRunning, message, { roleName, messageId });
  card.appendChild(pill);

  const body = el('div', THINKING_BODY_CLASS);
  card.appendChild(body);
  return card;
}

// ═══════════════════════════════════════
// 【Pill】聊天气泡里的单行入口
// [✦ 思考过程 · N步 ›]
// ═══════════════════════════════════════

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function createThinkingPill(stepCount, isRunning, message, ctx) {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'tc-pill';
  pill.setAttribute('aria-label', `查看思考过程，共${stepCount}步`);

  // sparkle 图标
  const iconSvg = createSvgBase(14, 14);
  addPath(iconSvg, 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z');
  iconSvg.classList.add('tc-pill-icon');

  // 文本：思考过程 · N步 / 还在想想 · N步
  const label = isRunning ? `还在想想 · ${stepCount}步` : `思考过程 · ${stepCount}步`;
  const textNode = el('span', 'tc-pill-text', label);

  // 右侧 › 箭头
  const chevronSvg = createSvgBase(12, 12);
  addPath(chevronSvg, 'M9 6l6 6-6 6');
  chevronSvg.classList.add('tc-pill-chevron');

  pill.append(iconSvg, textNode, chevronSvg);

  pill.addEventListener('click', () => {
    openSheet(message, { ...ctx, initialView: 'overview' });
  });

  return pill;
}

// ═══════════════════════════════════════
// 【Bottom Sheet】概要页 + 详情页
// ═══════════════════════════════════════

function openSheet(message, options = {}) {
  closeSheet();

  // 隐藏可能存在的其他 bottom-sheet（设置抽屉等），避免层叠
  const oldBottomSheet = document.querySelector('.bottom-sheet');
  const oldSheetOverlay = document.querySelector('.sheet-overlay');
  const savedBottomSheetDisplay = oldBottomSheet ? oldBottomSheet.style.display : '';
  const savedSheetOverlayDisplay = oldSheetOverlay ? oldSheetOverlay.style.display : '';
  if (oldBottomSheet) oldBottomSheet.style.display = 'none';
  if (oldSheetOverlay) oldSheetOverlay.style.display = 'none';

  const mask = el('div', 'tc-sheet-mask');
  const sheet = el('section', 'tc-sheet');

  // 容器：概要页 + 详情页共享，通过 data-view 切换
  const sheetInner = el('div', 'tc-sheet-inner');
  sheet.appendChild(sheetInner);

  // 渲染初始视图
  renderOverview(sheetInner, message, options);

  document.body.append(mask, sheet);

  let closed = false;
  let currentView = 'overview'; // overview | detail

  const restoreHiddenSheet = () => {
    if (activeSheetHandle) return; // 还有新 sheet 打开，由它恢复
    if (oldBottomSheet) oldBottomSheet.style.display = savedBottomSheetDisplay;
    if (oldSheetOverlay) oldSheetOverlay.style.display = savedSheetOverlayDisplay;
  };

  const escHandler = (event) => {
    if (event.key === 'Escape') {
      if (currentView === 'detail') {
        // 详情页按 esc 先回概要页
        renderOverview(sheetInner, message, options);
        currentView = 'overview';
      } else {
        closeSheet();
      }
    }
  };
  document.addEventListener('keydown', escHandler);

  // 下滑关闭支持
  let dragStartY = 0;
  let dragCurrentY = 0;
  let isDragging = false;
  const handle = el('div', 'tc-sheet-handle');
  sheet.insertBefore(handle, sheetInner);

  const onTouchStart = (e) => {
    const touch = e.touches ? e.touches[0] : e;
    dragStartY = touch.clientY;
    isDragging = true;
  };
  const onTouchMove = (e) => {
    if (!isDragging) return;
    const touch = e.touches ? e.touches[0] : e;
    dragCurrentY = touch.clientY - dragStartY;
    if (dragCurrentY > 0) {
      sheet.style.transform = `translateY(${dragCurrentY}px)`;
      sheet.style.transition = 'none';
    }
  };
  const onTouchEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = '';
    if (dragCurrentY > 80) {
      closeSheet();
    } else {
      sheet.style.transform = '';
    }
    dragCurrentY = 0;
  };
  handle.addEventListener('touchstart', onTouchStart, { passive: true });
  handle.addEventListener('touchmove', onTouchMove, { passive: true });
  handle.addEventListener('touchend', onTouchEnd);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', escHandler);
    handle.removeEventListener('touchstart', onTouchStart);
    handle.removeEventListener('touchmove', onTouchMove);
    handle.removeEventListener('touchend', onTouchEnd);
    if (activeSheetHandle && activeSheetHandle.closer === closer) {
      activeSheetHandle = null;
    }
  };

  const closer = () => {
    if (closed) return;
    mask.dataset.show = 'false';
    sheet.dataset.show = 'false';
    sheet.style.transform = '';
    window.setTimeout(() => {
      mask.remove();
      sheet.remove();
      restoreHiddenSheet();
    }, 280);
    cleanup();
  };

  mask.addEventListener('click', closer);

  activeSheetHandle = {
    closer,
    cleanup,
    // 供详情页返回概要页用
    backToOverview() {
      renderOverview(sheetInner, message, options);
      currentView = 'overview';
    },
    goToDetail(stepIndex) {
      renderDetail(sheetInner, message, options, stepIndex, () => {
        renderOverview(sheetInner, message, options);
        currentView = 'overview';
      });
      currentView = 'detail';
    }
  };

  requestAnimationFrame(() => {
    mask.dataset.show = 'true';
    sheet.dataset.show = 'true';
  });
}

function closeSheet() {
  if (activeSheetHandle) {
    const handle = activeSheetHandle;
    activeSheetHandle = null;
    handle.closer();
  }
}

// ═══════════════════════════════════════
// 【概要页】步骤列表
// ═══════════════════════════════════════

function renderOverview(container, message, options = {}) {
  container.innerHTML = '';
  container.dataset.view = 'overview';

  const steps = buildSteps(message);

  // 头部：× 关闭 + 居中标题「概要」
  const header = el('div', 'tc-sheet-header');
  const closeBtn = createIconButton('close', '关闭');
  closeBtn.addEventListener('click', () => closeSheet());
  const title = el('span', 'tc-sheet-title', '概要');
  header.append(closeBtn, title);
  container.appendChild(header);

  // 步骤列表
  const list = el('div', 'tc-steps-list');
  steps.forEach((step, index) => {
    list.appendChild(createStepRow(step, index, () => {
      if (activeSheetHandle) activeSheetHandle.goToDetail(index);
    }));
  });
  container.appendChild(list);
}

function createStepRow(step, index, onClick) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'tc-step-row';

  // 圆点：done实心 / running脉冲 / error红点 / pending空心
  const dot = el('div', `tc-step-dot ${step.status}`);
  row.appendChild(dot);

  // 内容：图标 + 标题 + 可选tag
  const content = el('div', 'tc-step-content');
  const iconWrap = el('span', 'tc-step-icon');
  iconWrap.appendChild(createStepIcon(step.icon));
  content.appendChild(iconWrap);
  content.appendChild(el('span', 'tc-step-title', step.title));
  if (step.tag) {
    content.appendChild(el('span', 'tc-step-tag', step.tag));
  }
  row.appendChild(content);

  // 右侧 › 箭头
  const arrowSvg = createSvgBase(14, 14);
  addPath(arrowSvg, 'M9 6l6 6-6 6');
  arrowSvg.classList.add('tc-step-arrow');
  row.appendChild(arrowSvg);

  row.addEventListener('click', onClick);
  return row;
}

// ═══════════════════════════════════════
// 【详情页】单步详情
// ═══════════════════════════════════════

function renderDetail(container, message, options = {}, stepIndex, onBack) {
  container.innerHTML = '';
  container.dataset.view = 'detail';

  const steps = buildSteps(message);
  const step = steps[stepIndex];
  if (!step) {
    renderOverview(container, message, options);
    return;
  }

  // 头部：‹ 返回 + 居中标题（思考过程 / 工具调用 / 记忆写入 / APP联动）
  const header = el('div', 'tc-sheet-header');
  const backBtn = createIconButton('back', '返回');
  backBtn.addEventListener('click', onBack);
  const title = el('span', 'tc-sheet-title', step.detailTitle || '详情');
  header.append(backBtn, title);
  container.appendChild(header);

  // body
  const body = el('div', 'tc-detail-body');

  // meta 行：图标 + tag + 标题
  const meta = el('div', 'tc-detail-meta');
  const metaIconWrap = el('span', 'tc-step-icon');
  metaIconWrap.appendChild(createStepIcon(step.icon));
  meta.appendChild(metaIconWrap);
  if (step.tag) {
    const tag = el('span', `tc-step-tag ${step.status === 'error' ? 'tc-tag-error' : ''}`, step.tag);
    meta.appendChild(tag);
  }
  meta.appendChild(el('span', `tc-detail-meta-title ${step.status === 'error' ? 'tc-text-error' : ''}`, step.title));
  body.appendChild(meta);

  // 正文内容（按类型渲染）
  if (step.type === 'think') {
    // thinking 文本
    const text = el('div', 'tc-detail-text', step.detail || '这一小会没有留下更多心里话。');
    body.appendChild(text);
  } else {
    // 工具/记忆/记仇/APP：summary + 参数 + 结果 + 错误
    if (step.summary) {
      body.appendChild(el('div', 'tc-detail-text', step.summary));
    }
    if (step.query) {
      body.appendChild(createDetailSection('参数', step.query));
    }
    if (step.result) {
      body.appendChild(createDetailSection(step.resultLabel || '结果', step.result));
    }
    if (step.extraRows && step.extraRows.length) {
      step.extraRows.forEach((row) => {
        body.appendChild(createDetailSection(row.label, row.value));
      });
    }
    if (step.error) {
      body.appendChild(createDetailSection('错误信息', step.error, true));
    }
  }

  container.appendChild(body);
}

function createDetailSection(label, text, isError) {
  const section = el('div', 'tc-detail-section');
  section.appendChild(el('div', `tc-detail-section-label ${isError ? 'tc-text-error' : ''}`, label));
  const code = el('div', `tc-detail-code ${isError ? 'tc-detail-code-error' : ''}`, text || '没有留下内容。');
  section.appendChild(code);
  return section;
}

// ═══════════════════════════════════════
// 【步骤数据构造】把 message 的 thinking/toolCalls/memoryWrites/grudgeWrites
// 映射成参考HTML的 step 结构 { type, icon, title, tag, detail, status, ... }
// ═══════════════════════════════════════

function buildSteps(message) {
  const steps = [];
  const tools = collectTools(message);
  const thinkingText = sanitizeDisplayText(message?.thinking);

  // thinking 一步（如果有）
  if (thinkingText) {
    steps.push({
      type: 'think',
      icon: 'sparkle',
      title: '分析意图',
      tag: '',
      detail: thinkingText,
      detailTitle: '思考过程',
      status: isMessageRunning(message) ? 'running' : 'done'
    });
  }

  // 工具/记忆/记仇/APP 各一步
  tools.forEach((tool, index) => {
    const detail = buildToolDetailData(tool, index, message, {});
    const tag = resolveStepTag(detail.source, detail.action);
    const detailTitle = resolveDetailTitle(detail.source, detail.action);
    steps.push({
      type: detail.source || 'tool',
      icon: detail.icon,
      title: detail.title,
      tag,
      summary: detail.summary,
      query: detail.query,
      result: detail.result,
      resultLabel: detail.resultLabel,
      error: detail.error,
      extraRows: detail.extraRows,
      detailTitle,
      status: detail.status
    });
  });

  return steps;
}

function resolveStepTag(source, action) {
  if (source === 'memory') return '记忆';
  if (source === 'grudge') return '记忆';
  if (action === 'mcp') return 'MCP';
  if (action === 'search') return '搜索';
  if (action === 'transfer' || action === 'gift' || action === 'shop_buy') return 'APP';
  if (action === 'call_summary' || action === 'proactive') return 'APP';
  if (source === 'tool') return 'MCP';
  return '';
}

function resolveDetailTitle(source, action) {
  if (source === 'memory') return '记忆写入';
  if (source === 'grudge') return '记忆写入';
  if (action === 'mcp' || source === 'tool') return '工具调用';
  if (action === 'search') return '工具调用';
  if (action === 'transfer' || action === 'gift' || action === 'shop_buy') return 'APP联动';
  if (action === 'call_summary' || action === 'proactive') return 'APP联动';
  return '详情';
}

// ═══════════════════════════════════════
// 【数据收集】collectTools + buildToolDetailData
// 以下函数保留原实现，仅做展示层适配
// ═══════════════════════════════════════

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

function isMessageRunning(message) {
  if (message?.isPending === true) return true;
  if (message?.isStreaming === true) return true;
  const status = normalizeText(message?.status || message?.streamStatus).toLowerCase();
  return ['streaming', 'thinking', 'running', 'loading', 'pending'].includes(status);
}

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
  const subtitle = resolveToolSubtitle(meta, tool, { status, query, result, amount, targetName, itemName, endpointName });
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
    subtitle,
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

function resolveToolSubtitle(meta, tool, context) {
  if (typeof meta.subtitleBuilder === 'function') {
    return meta.subtitleBuilder(tool, context);
  }
  if (context.status === 'running') {
    if (context.query) return summarizeText(context.query, 18);
    return '还在办这一步';
  }
  if (context.status === 'error') {
    return '这一步刚刚有点卡';
  }
  if (context.result) return summarizeText(context.result, 18);
  if (context.query) return summarizeText(context.query, 18);
  return meta.subtitle || '点开看看细节';
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

// ═══════════════════════════════════════
// 【图标】
// ═══════════════════════════════════════

function createStepIcon(name) {
  // sparkle 用于 thinking
  if (name === 'sparkle') {
    const svg = createSvgBase(14, 14);
    addPath(svg, 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z');
    return svg;
  }
  return createToolKindIcon(name);
}

function createIconButton(kind, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tc-icon-btn';
  btn.setAttribute('aria-label', label);
  const svg = createSvgBase(16, 16);
  if (kind === 'close') {
    addPath(svg, 'M6 6l12 12');
    addPath(svg, 'M18 6L6 18');
  } else if (kind === 'back') {
    addPath(svg, 'M15 6l-6 6 6 6');
  }
  btn.appendChild(svg);
  return btn;
}

function createToolKindIcon(name) {
  const svg = createSvgBase(14, 14);

  if (name === 'search') {
    addCircle(svg, '11', '11', '5.25');
    addPath(svg, 'M15.2 15.2 19 19');
    return svg;
  }

  if (name === 'memory') {
    addPath(svg, 'M7 6.75h10a1.75 1.75 0 0 1 1.75 1.75v8.75A1.75 1.75 0 0 1 17 19H7A1.75 1.75 0 0 1 5.25 17.25V8.5A1.75 1.75 0 0 1 7 6.75Z');
    addPath(svg, 'M8.5 10h7');
    addPath(svg, 'M8.5 13.5h5.2');
    return svg;
  }

  if (name === 'memory-edit') {
    addPath(svg, 'M6.5 17.8 9.8 17l7.6-7.6a1.45 1.45 0 1 0-2-2L7.8 15l-.8 2.8Z');
    addPath(svg, 'M13.7 8.3l2 2');
    return svg;
  }

  if (name === 'memory-delete') {
    addPath(svg, 'M7.5 8.25h9');
    addPath(svg, 'M9.4 8.25V6.9a.9.9 0 0 1 .9-.9h3.4a.9.9 0 0 1 .9.9v1.35');
    addPath(svg, 'M8.3 8.25l.8 8.6a1.2 1.2 0 0 0 1.2 1.1h3.4a1.2 1.2 0 0 0 1.2-1.1l.8-8.6');
    return svg;
  }

  if (name === 'grudge') {
    addPath(svg, 'M12 18.5c-4.2-2.6-6.8-5-6.8-8.4A3.9 3.9 0 0 1 9.1 6c1 0 1.97.42 2.9 1.35C12.93 6.42 13.9 6 14.9 6a3.9 3.9 0 0 1 3.9 4.1c0 3.4-2.6 5.8-6.8 8.4Z');
    return svg;
  }

  if (name === 'transfer') {
    addCircle(svg, '12', '12', '6.5');
    addPath(svg, 'M12 8.4v7.2');
    addPath(svg, 'M9.6 10.2c.5-.9 1.35-1.35 2.4-1.35 1.28 0 2.2.58 2.2 1.65 0 .98-.78 1.5-2.02 1.8l-.36.08c-1.4.32-2.24.88-2.24 2.02 0 1.02.88 1.86 2.46 1.86 1.05 0 1.98-.38 2.62-1.2');
    return svg;
  }

  if (name === 'gift') {
    addPath(svg, 'M7 10h10v8.25A1.75 1.75 0 0 1 15.25 20h-6.5A1.75 1.75 0 0 1 7 18.25V10Z');
    addPath(svg, 'M5.5 10h13');
    addPath(svg, 'M12 10v10');
    addPath(svg, 'M9.4 7.4c0-1.05.78-1.9 1.75-1.9 1.2 0 1.78 1.02 1.78 2.5v2');
    addPath(svg, 'M14.6 7.4c0-1.05-.78-1.9-1.75-1.9-1.2 0-1.78 1.02-1.78 2.5v2');
    return svg;
  }

  if (name === 'shop') {
    addPath(svg, 'M6.5 9.2h11l-1 8.7a1.5 1.5 0 0 1-1.49 1.31H8.99A1.5 1.5 0 0 1 7.5 17.9l-1-8.7Z');
    addPath(svg, 'M8.5 9.2V8a3.5 3.5 0 0 1 7 0v1.2');
    addPath(svg, 'M10 12.1h4');
    return svg;
  }

  if (name === 'mcp') {
    addPath(svg, 'M5.75 7.25h12.5A1.5 1.5 0 0 1 19.75 8.75v6.5a1.5 1.5 0 0 1-1.5 1.5H5.75a1.5 1.5 0 0 1-1.5-1.5v-6.5a1.5 1.5 0 0 1 1.5-1.5Z');
    addPath(svg, 'm8.4 10.1-2 2 2 2');
    addPath(svg, 'M11.6 14.1h4');
    return svg;
  }

  if (name === 'call') {
    addPath(svg, 'M7.1 5.5h2.4l1.2 3-1.75 1.75a10 10 0 0 0 4.82 4.82l1.75-1.75 3 1.2v2.4c0 .9-.73 1.63-1.63 1.63-6.42 0-11.62-5.2-11.62-11.62 0-.9.73-1.63 1.63-1.63Z');
    return svg;
  }

  if (name === 'proactive') {
    addPath(svg, 'M12 5.5v13');
    addPath(svg, 'M7.5 10l4.5-4.5 4.5 4.5');
    return svg;
  }

  if (name === 'tool') {
    addCircle(svg, '12', '12', '2.6');
    addPath(svg, 'M12 4.7v2');
    addPath(svg, 'M12 17.3v2');
    addPath(svg, 'M19.3 12h-2');
    addPath(svg, 'M6.7 12h-2');
    addPath(svg, 'm17 7-1.4 1.4');
    addPath(svg, 'm8.4 15.6-1.4 1.4');
    addPath(svg, 'm17 17-1.4-1.4');
    addPath(svg, 'M8.4 8.4 7 7');
    return svg;
  }

  addPath(svg, 'M6.5 8.5h11');
  addPath(svg, 'M8.5 12h7');
  addPath(svg, 'M10.5 15.5h3');
  return svg;
}

function createSvgBase(width, height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(width || 16));
  svg.setAttribute('height', String(height || 16));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
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
// 【工具文案映射】保留原实现
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
    icon: 'mcp',
    runningTitle: '叫了外部小工具',
    title: '叫了外部小工具',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我正在让外部工具帮我办这一步，还没完全收回来。';
      if (context.status === 'error') return '我本来想让外部工具帮忙，结果它刚刚没接稳。';
      return '我借了一下外部小工具的手，把这一步悄悄办完了。';
    }
  },
  memory_add: {
    icon: 'memory',
    runningTitle: '正在记下一笔',
    title: '记下一小笔',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我觉得这件事以后可能还会用到，所以先记着。';
      if (context.status === 'error') return '我本来想把这件事记住，结果这一笔刚刚没落稳。';
      return '我把这次聊出来的重要点放进记忆里了，这样下次不用你再重说一遍。';
    }
  },
  memory_edit: {
    icon: 'memory-edit',
    runningTitle: '正在改记忆',
    title: '顺手改了改记忆',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把旧记录改得更准一点，免得以后用错。';
      if (context.status === 'error') return '我本来想把旧记录改准一点，结果这一步卡住了。';
      return '我把旧记忆里不够准的地方轻轻改好了，后面就不会别扭。';
    }
  },
  memory_delete: {
    icon: 'memory-delete',
    runningTitle: '正在删记忆',
    title: '轻轻删掉一条记忆',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把过时或者不准的旧记录收掉。';
      if (context.status === 'error') return '我本来想把不合适的旧记录删掉，结果这一页卡住了。';
      return '我把一条不再适合留下的旧记忆收走了，省得以后跑偏。';
    }
  },
  grudge_add: {
    icon: 'grudge',
    runningTitle: '正在写小本本',
    title: '在小本本上画圈圈',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我有一点点在意，所以先往小本本里放一笔。';
      if (context.status === 'error') return '我本来想把这件在意的事记到小本本里，结果刚刚卡了一下。';
      return '这件让我有点在意的事，我已经记到小本本里了。';
    }
  },
  grudge_edit: {
    icon: 'grudge',
    runningTitle: '正在改小本本',
    title: '把小本本改了改',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在整理小本本里的旧内容，让它更贴近现在的心情。';
      if (context.status === 'error') return '我本来想调整一下小本本里的内容，结果这一笔卡住了。';
      return '我把小本本里的旧内容理顺了一点，更贴近现在的心情。';
    }
  },
  grudge_delete: {
    icon: 'grudge',
    runningTitle: '正在翻掉一页',
    title: '把小本本翻掉一页',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把一件已经不想继续记着的事轻轻放下。';
      if (context.status === 'error') return '我本来想把这一页翻过去，结果刚刚没翻顺。';
      return '有一页我已经不想继续记着了，就轻轻翻过去啦。';
    }
  },
  transfer: {
    icon: 'transfer',
    runningTitle: '正在递小票据',
    title: '递了一张小票据',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在整理这张转账小卡片，准备把小心意递过去。';
      if (context.status === 'error') return '我本来想把这张小票据递过去，结果刚刚卡了一下。';
      return '我把这份转账小心意整理成卡片，方便你一眼看清。';
    }
  },
  gift: {
    icon: 'gift',
    runningTitle: '正在递小礼物',
    title: '递了一份小礼物',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把这份礼物的小卡片整理好。';
      if (context.status === 'error') return '我本来想把礼物递过去，结果这一步有点卡。';
      return '我把这份礼物的小卡片收拾好了，内容和小图也会一起带上。';
    }
  },
  shop_buy: {
    icon: 'shop',
    runningTitle: '正在逛小物商店',
    title: '去小物商店逛了逛',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我正在商店里挑东西，想看看哪一件更合适。';
      if (context.status === 'error') return '我本来想去商店里挑东西，结果这一趟刚刚卡住了。';
      return '我从小物商店里挑了合适的东西，顺手把卡片也整理好了。';
    }
  },
  call_summary: {
    icon: 'call',
    runningTitle: '正在整理电话余温',
    title: '把电话收成一小段记忆',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我在把刚刚通话里的情绪和重点收成一小段记忆。';
      if (context.status === 'error') return '我本来想把电话里的重点收一下，结果刚刚卡住了。';
      return '通话结束后，我把那一点点余温和重点收进了记忆里。';
    }
  },
  proactive: {
    icon: 'proactive',
    runningTitle: '想主动和你说话',
    title: '想主动和你说句话',
    summaryBuilder() {
      return '这是我自己想先开口的一小步，不是被硬推出来的。';
    }
  },
  tool: {
    icon: 'tool',
    runningTitle: '悄悄办点小事',
    title: '悄悄办点小事',
    summaryBuilder(tool, context) {
      if (context.status === 'running') return '我正在把这一步慢慢办完。';
      if (context.status === 'error') return '这一步本来快弄好了，结果刚刚卡了一下。';
      return '我顺手把这一步办好了。';
    }
  },
  default: {
    icon: 'tool',
    title: '悄悄办点小事',
    summary: '我顺手把这一步办好了。'
  }
};

// ═══════════════════════════════════════
// 【样式注入】Pill + Bottom Sheet
// 全部走 CSS 变量，不硬编码色值
// error 色用 color-mix 兜底（项目无 --color-error 变量）
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
      gap:8px;
    }
    .chat-thinking-body{display:none}

    /* ===== Pill ===== */
    .tc-pill{
      display:inline-flex;
      align-items:center;
      gap:6px;
      width:fit-content;
      padding:6px 12px 6px 8px;
      border:1px solid var(--accent-light);
      border-radius:999px;
      background:color-mix(in srgb, var(--accent-light) 36%, var(--bg-card));
      color:var(--text-secondary);
      font:inherit;
      font-size:12px;
      font-weight:600;
      cursor:pointer;
      user-select:none;
      transition:all 200ms ease;
      touch-action:manipulation;
    }
    .tc-pill:hover{background:var(--accent-light)}
    .tc-pill:active{transform:scale(0.96)}
    .tc-pill-icon{
      width:14px;height:14px;
      flex:0 0 auto;
      color:var(--accent-dark);
    }
    .tc-pill-text{
      min-width:0;
      white-space:nowrap;
    }
    .tc-pill-chevron{
      width:12px;height:12px;
      flex:0 0 auto;
      color:var(--text-hint);
      margin-left:2px;
    }

    /* ===== Sheet 容器 ===== */
    .tc-sheet-mask{
      position:fixed;
      inset:0;
      z-index:10040;
      background:var(--bg-overlay);
      opacity:0;
      pointer-events:none;
      transition:opacity 200ms ease;
    }
    .tc-sheet-mask[data-show="true"]{
      opacity:1;
      pointer-events:auto;
    }
    .tc-sheet{
      position:fixed;
      left:0;right:0;bottom:0;
      z-index:10041;
      width:100vw;
      max-height:80vh;
      display:flex;
      flex-direction:column;
      border-radius:28px 28px 0 0;
      background:var(--bg-card);
      box-shadow:0 -8px 32px rgba(0,0,0,0.12);
      transform:translateY(108%);
      transition:transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
      overflow:hidden;
    }
    .tc-sheet[data-show="true"]{transform:translateY(0)}

    .tc-sheet-handle{
      width:36px;height:4px;
      flex:0 0 auto;
      margin:10px auto 0;
      border-radius:999px;
      background:var(--accent-light);
      cursor:grab;
    }

    .tc-sheet-inner{
      flex:1;
      min-height:0;
      display:flex;
      flex-direction:column;
      overflow:hidden;
    }

    /* ===== Sheet 头部 ===== */
    .tc-sheet-header{
      flex:0 0 auto;
      display:flex;
      align-items:center;
      padding:14px 20px 12px;
      position:relative;
    }
    .tc-sheet-title{
      position:absolute;
      left:50%;
      transform:translateX(-50%);
      font-size:16px;
      font-weight:700;
      color:var(--text-primary);
    }
    .tc-icon-btn{
      width:32px;height:32px;
      flex:0 0 auto;
      border:none;
      border-radius:999px;
      background:color-mix(in srgb, var(--accent-light) 36%, var(--bg-card));
      color:var(--text-secondary);
      cursor:pointer;
      display:flex;
      align-items:center;
      justify-content:center;
      transition:all 180ms ease;
      touch-action:manipulation;
    }
    .tc-icon-btn:hover{background:var(--accent-light)}
    .tc-icon-btn:active{transform:scale(0.94)}
    .tc-icon-btn svg{width:16px;height:16px}

    /* ===== 步骤列表（概要页） ===== */
    .tc-steps-list{
      flex:1;
      min-height:0;
      overflow-y:auto;
      padding:8px 20px calc(20px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling:touch;
    }
    .tc-step-row{
      display:flex;
      align-items:center;
      gap:14px;
      width:100%;
      padding:12px 0;
      border:none;
      background:transparent;
      font:inherit;
      text-align:left;
      cursor:pointer;
      position:relative;
      transition:opacity 150ms ease;
      touch-action:manipulation;
    }
    .tc-step-row:active{opacity:0.7}

    /* 竖线连接 */
    .tc-step-row:not(:last-child)::after{
      content:'';
      position:absolute;
      left:7px;
      top:28px;
      bottom:-12px;
      width:1.5px;
      background:linear-gradient(to bottom, var(--accent-light), transparent);
    }

    /* 圆点 */
    .tc-step-dot{
      width:16px;height:16px;
      flex:0 0 auto;
      border-radius:999px;
      border:2px solid var(--accent-light);
      background:var(--bg-card);
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .tc-step-dot.done{
      background:var(--accent);
      border-color:var(--accent);
    }
    .tc-step-dot.done::after{
      content:'';
      width:5px;height:5px;
      border-radius:50%;
      background:var(--bg-card);
    }
    .tc-step-dot.running{
      animation:tc-pulse-dot 1.4s ease-in-out infinite;
    }
    .tc-step-dot.error{
      border-color:var(--tc-error, #d96060);
      background:var(--tc-error, #d96060);
    }
    .tc-step-dot.error::after{
      content:'';
      width:5px;height:5px;
      border-radius:50%;
      background:var(--bg-card);
    }

    @keyframes tc-pulse-dot{
      0%,100%{border-color:var(--accent-light)}
      50%{border-color:var(--accent-dark);box-shadow:0 0 6px color-mix(in srgb, var(--accent) 50%, transparent)}
    }

    .tc-step-content{
      flex:1;
      min-width:0;
      display:flex;
      align-items:center;
      gap:8px;
    }
    .tc-step-icon{
      width:14px;height:14px;
      flex:0 0 auto;
      color:var(--text-secondary);
      display:inline-flex;
      align-items:center;
      justify-content:center;
    }
    .tc-step-icon svg{width:14px;height:14px}
    .tc-step-title{
      font-size:14px;
      font-weight:500;
      color:var(--text-primary);
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }
    .tc-step-tag{
      flex:0 0 auto;
      font-size:10px;
      font-weight:600;
      padding:2px 7px;
      border-radius:999px;
      background:color-mix(in srgb, var(--accent-light) 36%, var(--bg-card));
      color:var(--accent-dark);
      border:1px solid var(--accent-light);
    }
    .tc-tag-error{
      background:color-mix(in srgb, var(--tc-error, #d96060) 16%, var(--bg-card));
      color:var(--tc-error, #d96060);
      border-color:color-mix(in srgb, var(--tc-error, #d96060) 32%, transparent);
    }
    .tc-step-arrow{
      width:14px;height:14px;
      flex:0 0 auto;
      color:var(--text-hint);
    }

    /* ===== 详情页 ===== */
    .tc-detail-body{
      flex:1;
      min-height:0;
      overflow-y:auto;
      padding:8px 24px calc(28px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling:touch;
    }
    .tc-detail-meta{
      display:flex;
      align-items:center;
      gap:8px;
      margin-bottom:16px;
      padding-bottom:12px;
      border-bottom:1px solid var(--accent-light);
    }
    .tc-detail-meta-title{
      font-size:14px;
      font-weight:600;
      color:var(--text-secondary);
    }
    .tc-text-error{color:var(--tc-error, #d96060)}
    .tc-detail-text{
      font-size:14px;
      line-height:1.8;
      color:var(--text-primary);
      white-space:pre-line;
      word-break:break-word;
    }
    .tc-detail-section{
      margin-top:12px;
    }
    .tc-detail-section-label{
      font-size:11px;
      font-weight:600;
      color:var(--accent-dark);
      margin-bottom:6px;
    }
    .tc-detail-code{
      background:color-mix(in srgb, var(--accent-light) 24%, var(--bg-card));
      border-radius:16px;
      padding:10px 14px;
      font-size:12px;
      line-height:1.7;
      color:var(--text-secondary);
      font-family:'SF Mono','Menlo',monospace;
      white-space:pre-wrap;
      word-break:break-word;
    }
    .tc-detail-code-error{
      background:color-mix(in srgb, var(--tc-error, #d96060) 12%, var(--bg-card));
      color:var(--tc-error, #d96060);
    }

    @media(prefers-reduced-motion:reduce){
      .tc-pill,
      .tc-sheet-mask,
      .tc-sheet,
      .tc-icon-btn,
      .tc-step-dot.running{
        transition:none;
        animation:none;
      }
    }
  `;
  document.head.appendChild(style);
}
