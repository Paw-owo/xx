import assert from 'node:assert/strict';

const styles = new Map();
function makeEl(tag) {
  const node = {
    tagName: tag.toUpperCase(), className: '', textContent: '', innerHTML: '', hidden: false, dataset: {}, style: {}, children: [], attributes: {},
    append(...items) { items.forEach((item) => this.appendChild(item)); },
    appendChild(item) { this.children.push(item); return item; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener(type, fn) { this[`on${type}`] = fn; },
    querySelector() { return null; }
  };
  return node;
}
globalThis.document = {
  getElementById(id) { return styles.get(id) || null; },
  createElement: makeEl,
  head: { appendChild(node) { styles.set(node.id, node); } }
};

const { createSubAgentCard, isSubAgentCardMessage } = await import('../apps/chat/sub-agent-card.js');
const message = {
  type: 'sub_agent_summary_card',
  content: '主题设计完成',
  subAgentResult: {
    status: 'done',
    processSummary: '整理颜色和图片槽位。',
    resultSummary: '准备好主题草稿。',
    decisionSummary: '依据主题 scope 和权限域。',
    thinking: '不应展示的思维链原文'
  },
  subAgentCard: { title: '主题设计完成', visibleSummary: '主题设计完成' }
};
assert.equal(isSubAgentCardMessage(message), true);
const card = createSubAgentCard(message);
assert.equal(card.dataset.open, 'false');
const head = card.children[0];
const detail = card.children[1];
assert.equal(detail.hidden, true);
head.onclick();
assert.equal(card.dataset.open, 'true');
assert.equal(detail.hidden, false);
assert.equal(JSON.stringify(card).includes('不应展示的思维链原文'), false);

const devCard = createSubAgentCard({
  type: 'sub_agent_summary_card',
  content: '修复完成',
  subAgentResult: {
    kind: 'developer',
    task: '修复这个bug',
    status: 'completed',
    resultSummary: '更新了空值处理。',
    modifiedFiles: ['src/a.js'],
    tests: [{ command: 'npm test', summary: '通过' }],
    risks: ['需要关注旧数据。'],
    thinking: '不应出现'
  },
  subAgentCard: { title: '修复完成', visibleSummary: '修复完成' }
});
assert.equal(devCard.dataset.open, 'false');
assert.equal(JSON.stringify(devCard).includes('修改文件：src/a.js'), true);
assert.equal(JSON.stringify(devCard).includes('不应出现'), false);

const reviewCard = createSubAgentCard({
  type: 'sub_agent_summary_card',
  content: '发现3个风险点',
  subAgentResult: { kind: 'review', status: 'completed', resultSummary: '有敏感信息风险。', impact: ['消息链路'], suggestions: ['脱敏后再展示。'] },
  subAgentCard: { title: '发现3个风险点', visibleSummary: '发现3个风险点' }
});
assert.equal(JSON.stringify(reviewCard).includes('问题摘要'), true);
assert.equal(JSON.stringify(reviewCard).includes('影响范围'), true);

const themeCard = createSubAgentCard({
  type: 'sub_agent_summary_card',
  content: '主题设计完成',
  subAgentResult: { kind: 'theme', status: 'completed', themeStyle: '猫猫软窝主题', resourcesUsed: ['app_widget_area_bg'], modifications: ['accent'] },
  subAgentCard: { title: '主题设计完成', visibleSummary: '主题设计完成' }
});
assert.equal(JSON.stringify(themeCard).includes('主题风格'), true);
assert.equal(JSON.stringify(themeCard).includes('使用资源'), true);

const teamCard = createSubAgentCard({
  type: 'sub_agent_summary_card',
  content: '已完成',
  subAgentResult: { kind: 'team', task: '优化聊天APP', status: 'completed', members: [{ agent: 'developer-agent', userSummary: '发现1个问题' }, { agent: 'review-agent', userSummary: '发现2个风险点' }] },
  subAgentCard: { title: '已完成', visibleSummary: '已完成' }
});
assert.equal(JSON.stringify(teamCard).includes('成员结果'), true);
console.log('chat sub agent card ok');
