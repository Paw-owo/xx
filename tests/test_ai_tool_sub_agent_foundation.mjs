import assert from 'node:assert/strict';

const tools = await import('../core/ai-tool-registry.js');
const agents = await import('../core/sub-agent-system.js');

tools.clearAIToolRegistry();
assert.equal(tools.getAITool('theme-image-generator').permissionDomain, tools.AI_TOOL_SCOPES.THEME_RESOURCE_GENERATION);
assert.equal(tools.canUseAITool('theme-image-generator', { permissionDomain: tools.AI_TOOL_SCOPES.THEME_RESOURCE_GENERATION, usageScope: tools.AI_TOOL_SCOPES.THEME_RESOURCE_GENERATION, write: true }).ok, true);
assert.equal(tools.canUseAITool('theme-image-generator', { permissionDomain: tools.AI_TOOL_SCOPES.DEVELOPMENT, usageScope: tools.AI_TOOL_SCOPES.DEVELOPMENT }).ok, false);

assert.equal(tools.registerAITool({ id: 'github-agent', name: '代码仓库伙伴', permissionDomain: tools.AI_TOOL_SCOPES.DEVELOPMENT, inputSchema: {}, outputSchema: {}, allowWrite: true, usageScopes: [tools.AI_TOOL_SCOPES.DEVELOPMENT] }).ok, true);
assert.equal(tools.canUseAITool('github-agent', { permissionDomain: tools.AI_TOOL_SCOPES.THEME_RESOURCE_GENERATION }).ok, false);

agents.clearSubAgentRegistry();
assert.equal(agents.getSubAgent('theme-agent').scope, agents.SUB_AGENT_SCOPES.THEME);
assert.equal(agents.getSubAgent('developer-agent').scope, agents.SUB_AGENT_SCOPES.DEVELOPMENT);
const run = await agents.runSubAgent('theme-agent', { scope: agents.SUB_AGENT_SCOPES.THEME, prompt: '做一套柔软主题' });
assert.equal(run.ok, true);
assert.equal(run.userSummary, '主题设计完成');
assert.equal(run.card.collapsed, true);
assert.equal(run.card.title, '主题设计完成');
assert.equal(run.card.detailTitle, '任务总结');
assert.equal(run.card.decoration.resourceVar, '--ai-companion-decoration-image');
assert.equal(await agents.runSubAgent('theme-agent', { scope: agents.SUB_AGENT_SCOPES.DEVELOPMENT }).then((r) => r.ok), false);
console.log('ai tool and sub agent foundation ok');
