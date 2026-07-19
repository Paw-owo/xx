// core/sub-agent-system.js
// 子智能体基础框架：主 AI 调用专用能力，默认只给用户展示简短总结。

export const SUB_AGENT_SCOPES = Object.freeze({
  THEME: 'theme',
  DEVELOPMENT: 'development',
  REVIEW: 'review',
  DESIGN: 'design'
});

const agents = new Map();

export function registerSubAgent(agent = {}) {
  const normalized = normalizeAgent(agent);
  if (!normalized.ok) return normalized;
  agents.set(normalized.agent.id, normalized.agent);
  return { ok: true, agent: publicAgent(normalized.agent) };
}

export function listSubAgents(filter = {}) {
  const scope = String(filter.scope || '').trim();
  return [...agents.values()].filter((agent) => !scope || agent.scope === scope).map(publicAgent);
}

export function getSubAgent(id = '') {
  const agent = agents.get(String(id || '').trim());
  return agent ? publicAgent(agent) : null;
}

export async function runSubAgent(id = '', task = {}, context = {}) {
  const agent = agents.get(String(id || '').trim());
  if (!agent) return { ok: false, errors: ['sub_agent_not_registered'] };
  const scope = String(context.scope || task.scope || '').trim();
  if (scope && scope !== agent.scope) return { ok: false, errors: ['sub_agent_scope_mismatch'] };
  const raw = typeof agent.handler === 'function'
    ? await agent.handler(task, context)
    : { summary: agent.defaultSummary || `${agent.name}完成`, detail: {} };
  return normalizeRunResult(agent, raw);
}

export function createSubAgentSummaryCard(result = {}) {
  const title = String(result.userSummary || result.summary || '任务总结').trim();
  const detail = summarizeDetail(result.internalResult || result.detail || {});
  return {
    type: 'sub-agent-summary-card',
    title: title || '任务总结',
    collapsed: true,
    visibleSummary: title || '已经整理好啦',
    detailTitle: '任务总结',
    detail,
    decoration: {
      token: 'var(--ai-companion-decoration, var(--accent-light))',
      resourceVar: '--ai-companion-decoration-image',
      style: 'cozy-system-companion'
    }
  };
}

export function clearSubAgentRegistry() {
  agents.clear();
  seedBuiltinAgents();
}

function normalizeAgent(agent) {
  if (!agent || typeof agent !== 'object' || Array.isArray(agent)) return { ok: false, errors: ['sub_agent_must_be_object'] };
  const id = String(agent.id || '').trim();
  const name = String(agent.name || '').trim();
  const scope = String(agent.scope || '').trim();
  const errors = [];
  if (!id) errors.push('sub_agent_id_required');
  if (!name) errors.push('sub_agent_name_required');
  if (!scope) errors.push('sub_agent_scope_required');
  if (errors.length) return { ok: false, errors };
  return { ok: true, agent: Object.freeze({ id, name, scope, toolPermissionDomains: Object.freeze([...(agent.toolPermissionDomains || [])]), handler: agent.handler, defaultSummary: String(agent.defaultSummary || '') }) };
}

function normalizeRunResult(agent, raw) {
  const result = raw && typeof raw === 'object' ? raw : { summary: String(raw || '') };
  const internalResult = result.internalResult || result.detail || {};
  const userSummary = String(result.userSummary || result.summary || agent.defaultSummary || `${agent.name}完成`).trim();
  return { ok: result.ok !== false, agent: publicAgent(agent), internalResult, userSummary, card: createSubAgentSummaryCard({ userSummary, internalResult }) };
}

function publicAgent(agent) {
  return { id: agent.id, name: agent.name, scope: agent.scope, toolPermissionDomains: [...agent.toolPermissionDomains] };
}

function summarizeDetail(detail) {
  if (typeof detail === 'string') return detail;
  try { return JSON.stringify(detail, null, 2); } catch (_) { return '详细内容已经收好。'; }
}

function seedBuiltinAgents() {
  registerSubAgent({ id: 'theme-agent', name: '主题设计伙伴', scope: SUB_AGENT_SCOPES.THEME, toolPermissionDomains: ['theme-resource-generation'], defaultSummary: '主题设计完成', handler: createBuiltInHandler('主题设计完成', '已接到主题设计入口，会沿用主题 AI 链路整理颜色、图片槽位和装饰参数。', '进入主题设计流程，等待主 AI 继续生成或调整主题。', '只使用 theme-resource-generation 权限域，不触碰开发或审计工具。') });
  registerSubAgent({ id: 'developer-agent', name: '开发伙伴', scope: SUB_AGENT_SCOPES.DEVELOPMENT, toolPermissionDomains: ['development'], defaultSummary: '代码任务完成', handler: createBuiltInHandler('开发准备完成', '已接到开发工具入口，会把仓库相关操作限制在 development 权限域里。', '可以继续打开 GitHub 工具查看仓库、分支、提交和 PR。', '开发能力只匹配 development 权限域，不复用主题资源权限。') });
  registerSubAgent({ id: 'review-agent', name: '审计伙伴', scope: SUB_AGENT_SCOPES.REVIEW, toolPermissionDomains: ['audit'], defaultSummary: '发现优化点', handler: createBuiltInHandler('发现3个优化点', '已从整理上下文入口检查可见影响范围，重点关注聊天连续性、记忆边界和可恢复性。', '建议先确认要清理的上下文范围，再让聊天轻轻变短。', '依据当前入口、scope 和最小影响原则整理，不展示底层推理链。') });
  registerSubAgent({ id: 'design-agent', name: '视觉伙伴', scope: SUB_AGENT_SCOPES.DESIGN, toolPermissionDomains: ['design'], defaultSummary: '视觉整理完成' });
}

seedBuiltinAgents();

function createBuiltInHandler(userSummary, processSummary, resultSummary, decisionSummary) {
  return async () => ({
    ok: true,
    userSummary,
    internalResult: {
      status: 'done',
      processSummary,
      resultSummary,
      decisionSummary
    }
  });
}
