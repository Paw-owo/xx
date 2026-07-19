import assert from 'node:assert/strict';
import fs from 'node:fs';

const tools = fs.readFileSync(new URL('../apps/chat/thread-tools.js', import.meta.url), 'utf8');
const panels = fs.readFileSync(new URL('../apps/chat/thread-panels.js', import.meta.url), 'utf8');
const render = fs.readFileSync(new URL('../apps/chat/thread-render.js', import.meta.url), 'utf8');
const subAgents = fs.readFileSync(new URL('../core/sub-agent-system.js', import.meta.url), 'utf8');

assert.match(tools, /runSubAgent/);
assert.match(tools, /theme-agent/);
assert.match(tools, /review-agent/);
assert.match(tools, /developer-agent/);
assert.match(panels, /sendCardMessage/);
assert.match(panels, /sub_agent_summary_card/);
assert.match(render, /createSubAgentCard/);
assert.match(render, /isSubAgentCardMessage/);
assert.match(subAgents, /processSummary/);
assert.match(subAgents, /resultSummary/);
assert.match(subAgents, /decisionSummary/);
assert.doesNotMatch(tools, /#[0-9a-fA-F]{3,8}/, 'toolbox svg should not hardcode colors');
assert.match(tools, /var\(--chat-icon-line\)/);
assert.match(tools, /var\(--chat-icon-fill\)/);
assert.match(tools, /theme: '<path/);
console.log('chat toolbox sub agents ok');
