import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
const styleValues = new Map();
globalThis.document = {
  getElementById() { return null; },
  createElement() { return { id: '', textContent: '', className: '', style: {}, append() {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {} } }; },
  createElementNS() { return { style: {}, setAttribute() {}, append() {}, classList: { add() {}, remove() {} } }; },
  head: { append() {}, appendChild() {} },
  body: { append() {}, appendChild() {}, classList: { add() {}, remove() {} } },
  documentElement: { setAttribute() {}, style: { setProperty: (k, v) => styleValues.set(k, String(v)), getPropertyValue: (k) => styleValues.get(k) || '', removeProperty: (k) => styleValues.delete(k) } },
  querySelector() { return null; }
};
globalThis.window = {
  addEventListener() {}, removeEventListener() {},
  AppImages: { async readImageRecord() { return null; }, async writeImageRecord(_k, r) { return r; }, async removeImageRecord() { return true; } }
};
globalThis.atob = (value) => Buffer.from(String(value), 'base64').toString('binary');
globalThis.btoa = (value) => Buffer.from(String(value), 'binary').toString('base64');
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/git/trees/main')) return json({ tree: [{ path: 'apps/chat/thread.js', type: 'blob', sha: 'sha-thread' }] });
  if (u.includes('/contents/apps/chat/thread.js')) return json({ path: 'apps/chat/thread.js', sha: 'sha-thread', encoding: 'base64', content: Buffer.from("import x from './x.js';\n// TODO review chat app\n").toString('base64') });
  return json({});
};
function json(body) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }

const { setData } = await import('../core/storage.js');
await import('../apps/chat/developer-agent.js');
await import('../apps/chat/review-agent.js');
await import('../apps/chat/theme-agent.js');
const { runSubAgent, SUB_AGENT_SCOPES } = await import('../core/sub-agent-system.js');
const { runSubAgentTeam, planSubAgentTeamTask, assessSubAgentNeed } = await import('../core/ai-agent-coordinator.js');
const { canUseAITool, AI_TOOL_SCOPES } = await import('../core/ai-tool-registry.js');

setData('github_tool_token', 'token');
setData('github_tool_config', { owner: 'octo', repo: 'demo', branch: 'main' });

const review = await runSubAgent('review-agent', { scope: SUB_AGENT_SCOPES.REVIEW, prompt: '审查聊天APP风险', files: [{ path: 'apps/chat/thread.js', content: 'const token = "x"; // TODO' }] });
assert.equal(review.ok, true);
assert.equal(review.internalResult.kind, 'review');
assert.ok(review.internalResult.risks.length >= 1);
assert.equal(canUseAITool('review-analysis-tool', { permissionDomain: AI_TOOL_SCOPES.AUDIT, usageScope: AI_TOOL_SCOPES.AUDIT, write: true }).ok, false);

const theme = await runSubAgent('theme-agent', { scope: SUB_AGENT_SCOPES.THEME, prompt: '做一个猫猫主题' });
assert.equal(theme.ok, true);
assert.equal(theme.internalResult.kind, 'theme');
assert.match(theme.userSummary, /主题设计/);
assert.equal(canUseAITool('theme-image-generator', { permissionDomain: AI_TOOL_SCOPES.DEVELOPMENT, usageScope: AI_TOOL_SCOPES.DEVELOPMENT }).ok, false);

const plan = planSubAgentTeamTask({ prompt: '帮我优化聊天APP，顺便看看UI和风险' });
assert.deepEqual(plan.map((item) => item.agent).sort(), ['developer-agent', 'review-agent', 'theme-agent'].sort());
const team = await runSubAgentTeam({ prompt: '帮我优化聊天APP，顺便看看UI和风险', files: ['apps/chat/thread.js'] });
assert.equal(team.ok, true);
assert.equal(team.internalResult.kind, 'team');
assert.equal(team.internalResult.members.length, 3);
assert.equal(team.internalResult.status, 'completed');
assert.ok(team.internalResult.statusTimeline.some((item) => item.status === 'planning'));
assert.ok(team.internalResult.statusTimeline.some((item) => item.status === 'delegating'));
assert.ok(team.internalResult.statusTimeline.some((item) => item.status === 'summarizing'));

const casual = assessSubAgentNeed({ prompt: '今天想和你聊聊天' });
assert.equal(casual.needSubAgent, false);
assert.equal(casual.calledCount, 0);
assert.deepEqual(planSubAgentTeamTask({ prompt: 'GitHub是什么？' }), []);
const explicitGithub = assessSubAgentNeed({ prompt: '帮我看看这个仓库哪里有问题' });
assert.equal(explicitGithub.needSubAgent, true);
assert.ok(explicitGithub.calledCount >= 1);
const explicitTheme = assessSubAgentNeed({ prompt: '帮我设计一个猫猫主题' });
assert.equal(explicitTheme.needSubAgent, true);
assert.ok(explicitTheme.reasons.some((item) => item.includes('theme')));
console.log('multi agent coordination ok');
