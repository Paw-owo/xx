import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
globalThis.document = { getElementById() { return null; }, createElement() { return { id: '', textContent: '', className: '', style: {}, append() {}, appendChild() {}, addEventListener() {}, setAttribute() {} }; }, head: { appendChild() {} } };
globalThis.window = {};
globalThis.atob = (value) => Buffer.from(String(value), 'base64').toString('binary');
globalThis.btoa = (value) => Buffer.from(String(value), 'binary').toString('base64');

const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, opts });
  const u = String(url);
  if (u.includes('/git/trees/main')) {
    return json({ tree: [
      { path: 'src/feature.js', type: 'blob', sha: 'sha-feature' },
      { path: 'src/feature.test.js', type: 'blob', sha: 'sha-test' },
      { path: 'assets/logo.png', type: 'blob', sha: 'sha-bin' }
    ] });
  }
  if (u.includes('/contents/src/feature.js')) {
    return json({ path: 'src/feature.js', sha: 'sha-feature', encoding: 'base64', content: Buffer.from("import x from './x.js';\n// TODO fix bug\nexport const value = 1;\n").toString('base64') });
  }
  if (u.includes('/contents/src/feature.test.js')) {
    return json({ path: 'src/feature.test.js', sha: 'sha-test', encoding: 'base64', content: Buffer.from("import { value } from './feature.js';\n").toString('base64') });
  }
  if (u.includes('/git/ref/heads/main')) return json({ object: { sha: 'base-sha' } });
  if (u.endsWith('/git/refs')) return json({ ref: 'refs/heads/ai-phone/feature-js-test' }, { status: 201 });
  if (u.includes('/contents/src/feature.js') && opts.method === 'PUT') return json({ content: { sha: 'new-sha' } });
  if (u.endsWith('/pulls')) return json({ html_url: 'https://github.com/octo/demo/pull/1' }, { status: 201 });
  return json({});
};
function json(body, init = {}) { return new Response(JSON.stringify(body), { status: init.status || 200, headers: { 'content-type': 'application/json' } }); }

const { setData } = await import('../core/storage.js');
const { ensureDeveloperAgentRegistered } = await import('../apps/chat/developer-agent.js');
const { runSubAgent, getSubAgent, SUB_AGENT_SCOPES } = await import('../core/sub-agent-system.js');
const { canUseAITool, AI_TOOL_SCOPES } = await import('../core/ai-tool-registry.js');

setData('github_tool_token', 'token');
setData('github_tool_config', { owner: 'octo', repo: 'demo', branch: 'main' });
ensureDeveloperAgentRegistered();
assert.equal(getSubAgent('developer-agent').scope, SUB_AGENT_SCOPES.DEVELOPMENT);
assert.equal(canUseAITool('github-developer-tool', { permissionDomain: AI_TOOL_SCOPES.DEVELOPMENT, usageScope: AI_TOOL_SCOPES.DEVELOPMENT, write: true }).ok, true);
assert.equal(canUseAITool('github-developer-tool', { permissionDomain: AI_TOOL_SCOPES.THEME_RESOURCE_GENERATION, usageScope: AI_TOOL_SCOPES.THEME_RESOURCE_GENERATION }).ok, false);

const readOnly = await runSubAgent('developer-agent', { scope: SUB_AGENT_SCOPES.DEVELOPMENT, prompt: '帮我检查这个功能', files: ['src/feature.js'] });
assert.equal(readOnly.ok, true);
assert.equal(readOnly.internalResult.kind, 'developer');
assert.equal(readOnly.internalResult.filesRead.includes('src/feature.js'), true);
assert.equal(readOnly.internalResult.modifiedFiles.length, 0);
assert.match(readOnly.userSummary, /发现|完成|问题/);

const write = await runSubAgent('developer-agent', {
  scope: SUB_AGENT_SCOPES.DEVELOPMENT,
  prompt: '修复这个bug',
  allowWrite: true,
  files: ['src/feature.js'],
  changes: [{ path: 'src/feature.js', search: 'export const value = 1;', replace: 'export const value = 2;' }],
  commitMessage: 'fix: update feature value'
});
assert.equal(write.ok, true);
assert.deepEqual(write.internalResult.modifiedFiles, ['src/feature.js']);
assert.equal(write.internalResult.prUrl, 'https://github.com/octo/demo/pull/1');
assert.equal(calls.some((call) => call.opts.method === 'PUT'), true);
assert.equal(calls.some((call) => String(call.url).endsWith('/pulls')), true);
console.log('developer agent github ok');
