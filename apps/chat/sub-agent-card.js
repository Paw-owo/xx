// apps/chat/sub-agent-card.js
// 子智能体任务总结卡片：默认折叠，只展示任务摘要、结果和决策依据摘要。

const STYLE_ID = 'chat-sub-agent-card-style-v1';

export function isSubAgentCardMessage(message = {}) {
  return message?.type === 'sub_agent_summary_card' || message?.card?.type === 'sub-agent-summary-card' || message?.subAgentCard;
}

export function createSubAgentCard(message = {}) {
  injectStyle();
  const data = normalizeCardData(message);
  const card = el('section', 'chat-sub-agent-card');
  card.dataset.open = 'false';
  card.dataset.status = data.status;

  const button = el('button', 'chat-sub-agent-head');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.append(createPartnerMark(), createHeadText(data), el('span', 'chat-sub-agent-chevron', '›'));

  const detail = el('div', 'chat-sub-agent-detail');
  detail.hidden = true;
  detail.append(
    ...(data.kind === 'developer'
      ? [
          createDetailBlock('修改说明', data.resultSummary),
          createDetailBlock('测试结果', data.testsSummary),
          createDetailBlock('风险提示', data.riskSummary)
        ]
      : data.kind === 'review'
        ? [
            createDetailBlock('问题摘要', data.resultSummary),
            createDetailBlock('影响范围', data.impactSummary),
            createDetailBlock('建议方案', data.suggestionSummary)
          ]
        : data.kind === 'theme'
          ? [
              createDetailBlock('主题风格', data.themeStyle),
              createDetailBlock('使用资源', data.resourceSummary),
              createDetailBlock('修改内容', data.modificationSummary)
            ]
          : data.kind === 'team'
            ? [
                createDetailBlock('协作摘要', data.resultSummary),
                createDetailBlock('成员结果', data.memberSummary),
                createDetailBlock('权限依据', data.decisionSummary)
              ]
      : [
          createDetailBlock('任务过程摘要', data.processSummary),
          createDetailBlock('结果', data.resultSummary),
          createDetailBlock('决策依据摘要', data.decisionSummary)
        ])
  );

  button.addEventListener('click', () => {
    const nextOpen = card.dataset.open !== 'true';
    card.dataset.open = nextOpen ? 'true' : 'false';
    button.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    detail.hidden = !nextOpen;
  });

  card.append(button, detail);
  return card;
}

function normalizeCardData(message) {
  const card = message.subAgentCard || message.card || {};
  const result = message.subAgentResult || card.internalResult || {};
  return {
    title: String(card.title || message.title || '任务总结').trim(),
    summary: String(card.visibleSummary || message.content || '已经整理好啦').trim(),
    kind: String(result.kind || card.kind || ''),
    status: normalizeStatus(message.status || card.status || result.status || 'done'),
    task: pickText(result.task, card.task, ''),
    processSummary: pickText(result.processSummary, result.process, card.processSummary, '已经按任务范围完成整理。'),
    resultSummary: pickText(result.resultSummary, result.result, card.resultSummary, message.content || card.visibleSummary || '结果已经收好。'),
    decisionSummary: pickText(result.decisionSummary, result.decisionBasis, card.decisionSummary, '依据任务范围、可用工具权限和当前上下文整理。'),
    filesSummary: formatList(result.modifiedFiles?.length ? result.modifiedFiles : result.filesRead, '没有文件变更。'),
    testsSummary: formatTests(result.tests),
    riskSummary: formatList(result.risks, '暂时没有额外风险提示。'),
    impactSummary: formatList(result.impact, '影响范围还需要结合具体落点确认。'),
    suggestionSummary: formatList(result.suggestions, '保持小步修改并补回归测试。'),
    themeStyle: pickText(result.themeStyle, '柔软小手机主题'),
    resourceSummary: formatList(result.resourcesUsed, '使用主题变量和装饰参数。'),
    modificationSummary: formatList(result.modifications, '已生成主题草稿。'),
    memberSummary: formatMembers(result.members)
  };
}

function normalizeStatus(status) {
  const clean = String(status || '').toLowerCase();
  if (['failed', 'error'].includes(clean)) return 'failed';
  if (['running', 'pending', 'analyzing', 'reading', 'modifying', 'testing'].includes(clean)) return 'running';
  return 'done';
}

function pickText(...items) {
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) return sanitizeVisibleText(item);
    if (item && typeof item === 'object') {
      try { return sanitizeVisibleText(JSON.stringify(item, null, 2)); } catch (_) {}
    }
  }
  return '';
}

function sanitizeVisibleText(text) {
  return String(text || '')
    .replace(/<\/?(?:think|thinking|reasoning|chain_of_thought)\b[^>]*>/gi, '')
    .replace(/思维链原文[:：]?[\s\S]*$/i, '')
    .trim();
}

function createHeadText(data) {
  const wrap = el('div', 'chat-sub-agent-head-text');
  wrap.append(el('div', 'chat-sub-agent-title', data.title), el('div', 'chat-sub-agent-summary', `${statusLabel(data.status)} · ${data.summary}`));
  if (data.kind === 'developer') {
    wrap.append(el('div', 'chat-sub-agent-meta', `任务：${data.task || '开发协作'}`), el('div', 'chat-sub-agent-meta', `修改文件：${data.filesSummary}`));
  } else if (data.kind === 'team') {
    wrap.append(el('div', 'chat-sub-agent-meta', `任务：${data.task || '团队协作'}`), el('div', 'chat-sub-agent-meta', data.memberSummary));
  }
  return wrap;
}

function statusLabel(status) {
  if (status === 'failed') return '没有顺利完成';
  if (status === 'running') return '正在整理';
  return '完成';
}

function createDetailBlock(title, text) {
  const block = el('div', 'chat-sub-agent-block');
  block.append(el('div', 'chat-sub-agent-block-title', title), el('div', 'chat-sub-agent-block-text', text || '这里没有更多内容。'));
  return block;
}

function formatList(items, emptyText) {
  const list = Array.isArray(items) ? items.map(String).map((item) => item.trim()).filter(Boolean) : [];
  return list.length ? list.join('、') : emptyText;
}

function formatTests(tests) {
  const list = Array.isArray(tests) ? tests : [];
  if (!list.length) return '还没有测试记录。';
  return list.map((item) => {
    if (typeof item === 'string') return item;
    return `${item.command || '检查'}：${item.summary || item.status || ''}`.trim();
  }).join('\n');
}

function formatMembers(members) {
  const list = Array.isArray(members) ? members : [];
  if (!list.length) return '还没有成员结果。';
  return list.map((item) => `${item.agent || '小伙伴'}：${item.userSummary || '已完成'}`).join('\n');
}

function createPartnerMark() {
  const mark = el('span', 'chat-sub-agent-mark');
  mark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 10.6C5.6 10.6 4.2 12 4.2 13.8C4.2 16.3 7 18.2 12 18.2C17 18.2 19.8 16.3 19.8 13.8C19.8 12 18.4 10.6 16.6 10.6C15.2 10.6 14.2 11.2 13.3 12.1C12.6 12.8 11.4 12.8 10.7 12.1C9.8 11.2 8.8 10.6 7.4 10.6Z"/><circle cx="7.2" cy="7.2" r="2.1"/><circle cx="12" cy="5.8" r="2.2"/><circle cx="16.8" cy="7.2" r="2.1"/></svg>';
  return mark;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .chat-sub-agent-card{position:relative;min-width:min(260px,72vw);max-width:100%;border-radius:var(--radius-lg);background:linear-gradient(145deg,color-mix(in srgb,var(--bg-card) 92%,transparent),color-mix(in srgb,var(--accent-light) 20%,var(--bg-card)));box-shadow:var(--shadow-card),var(--inner-highlight);overflow:hidden;border:1px dashed color-mix(in srgb,var(--accent-dark) 30%,var(--border-soft))}
    .chat-sub-agent-card::after{content:"";position:absolute;left:18px;right:18px;top:0;height:3px;border-radius:999px;background:linear-gradient(90deg,transparent,var(--accent-light),transparent);opacity:.7;pointer-events:none}
    .chat-sub-agent-head{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:12px;border:0;background:transparent;color:var(--text-primary);font:inherit;text-align:left;cursor:pointer}
    .chat-sub-agent-mark{width:36px;height:36px;border-radius:15px;display:inline-flex;align-items:center;justify-content:center;color:var(--icon-detail);background:linear-gradient(145deg,var(--bg-card),var(--accent-light));background-image:var(--ai-companion-decoration-image,none);background-size:cover;background-position:center;border:1px solid color-mix(in srgb,var(--border-soft) 72%,transparent);box-shadow:var(--shadow-sm),inset 0 1px 0 color-mix(in srgb,white 82%,transparent)}
    .chat-sub-agent-mark svg{width:23px;height:23px;fill:currentColor;opacity:.9}
    .chat-sub-agent-head-text{min-width:0;display:flex;flex-direction:column;gap:3px}.chat-sub-agent-title{font-size:14px;font-weight:700;color:var(--text-primary)}.chat-sub-agent-summary,.chat-sub-agent-meta{font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.chat-sub-agent-meta{color:var(--text-hint)}.chat-sub-agent-chevron{font-size:19px;color:var(--accent-dark);transition:transform 180ms ease}.chat-sub-agent-card[data-open="true"] .chat-sub-agent-chevron{transform:rotate(90deg)}
    .chat-sub-agent-detail{display:flex;flex-direction:column;gap:9px;padding:0 12px 12px}.chat-sub-agent-detail[hidden]{display:none}.chat-sub-agent-block{border-radius:var(--radius-md);background:color-mix(in srgb,var(--surface-paper) 76%,var(--surface-muted));border:1px solid color-mix(in srgb,var(--border-soft) 58%,transparent);padding:10px;box-shadow:inset 0 1px 0 color-mix(in srgb,white 70%,transparent)}.chat-sub-agent-block-title{font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:5px}.chat-sub-agent-block-text{font-size:12px;line-height:1.6;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word}  `;
  document.head.appendChild(style);
}
