// apps/chat/review-agent.js
// review-agent 只读审查桥接层：使用 audit 权限域，不修改代码、不写资源。

import { registerSubAgent, SUB_AGENT_SCOPES } from '../../core/sub-agent-system.js';
import { canUseAITool, AI_TOOL_SCOPES } from '../../core/ai-tool-registry.js';

let registered = false;

export function ensureReviewAgentRegistered() {
  if (registered) return true;
  registerSubAgent({
    id: 'review-agent',
    name: '审查伙伴',
    scope: SUB_AGENT_SCOPES.REVIEW,
    toolPermissionDomains: [AI_TOOL_SCOPES.AUDIT],
    defaultSummary: '发现风险点',
    handler: runReviewAgentTask
  });
  registered = true;
  return true;
}

export async function runReviewAgentTask(task = {}, context = {}) {
  const permission = canUseAITool('review-analysis-tool', {
    permissionDomain: AI_TOOL_SCOPES.AUDIT,
    usageScope: AI_TOOL_SCOPES.AUDIT,
    write: false
  });
  if (!permission.ok) return buildReviewResult({ ok: false, task, risks: ['审查权限还没接好。'], suggestions: ['请检查 review 权限域配置。'] });
  const prompt = String(task.prompt || task.query || '审查任务').trim();
  const files = normalizeFiles(task.files || context.files || []);
  const contextText = stringifyContext(task.context || context.context || {});
  const risks = collectRisks(prompt, contextText, files);
  const impact = collectImpact(prompt, files, risks);
  const suggestions = collectSuggestions(risks);
  return buildReviewResult({ ok: true, prompt, risks, impact, suggestions, files });
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.map((item) => {
    if (typeof item === 'string') return { path: item, content: '' };
    return { path: String(item?.path || item?.name || ''), content: String(item?.content || item?.text || '') };
  }).filter((item) => item.path || item.content).slice(0, 12);
}

function stringifyContext(context) {
  if (!context) return '';
  if (typeof context === 'string') return context;
  try { return JSON.stringify(context); } catch (_) { return ''; }
}

function collectRisks(prompt, contextText, files) {
  const source = [prompt, contextText, ...files.map((file) => `${file.path}\n${file.content}`)].join('\n').toLowerCase();
  const risks = [];
  if (/delete|remove|清空|删除|迁移|db_version|store|localstorage|indexeddb/.test(source)) risks.push('数据写入或迁移相关，需要确认不会影响已有本地数据。');
  if (/token|secret|apikey|api_key|authorization|github_pat|ghp_/.test(source)) risks.push('涉及敏感凭据，需要确认只进请求头或独立存储。');
  if (/prompt|system|thinking|reasoning|思维链|提示词/.test(source)) risks.push('涉及提示词或推理内容，需要避免泄露内部协议。');
  if (/wallet|balance|扣款|余额|inventory|shop/.test(source)) risks.push('涉及虚拟经济或库存，需要走既有数据函数。');
  if (/theme|image|blob|data:image|资源|预览/.test(source)) risks.push('涉及主题或图片资源，需要保持可迁移和可回滚。');
  if (!risks.length) risks.push('暂未发现高风险点，但仍建议用最小范围变更和相关测试收尾。');
  return risks.slice(0, 6);
}

function collectImpact(prompt, files, risks) {
  const paths = files.map((file) => file.path).filter(Boolean);
  const impact = [];
  if (paths.length) impact.push(`涉及文件：${paths.join('、')}`);
  if (/聊天|chat|message|thread/i.test(prompt + paths.join(' '))) impact.push('影响消息 App 的展示、发送或 AI 回复链路。');
  if (/theme|主题/i.test(prompt + paths.join(' '))) impact.push('影响主题生成、预览或资源分享链路。');
  if (/github|repo|仓库/i.test(prompt + paths.join(' '))) impact.push('影响 GitHub 工具读取、提交或 PR 流程。');
  if (!impact.length) impact.push('影响范围需要结合具体调用方继续确认。');
  if (risks.length) impact.push(`风险数量：${risks.length}`);
  return impact.slice(0, 6);
}

function collectSuggestions(risks) {
  return risks.map((risk) => {
    if (/敏感凭据/.test(risk)) return '保持 token 独立存储，日志和卡片里不要展示密钥。';
    if (/本地数据/.test(risk)) return '变更前确认 store、索引和迁移，保留回滚路径。';
    if (/推理内容|提示词/.test(risk)) return '只展示过程摘要、结果和依据摘要，不展示思维链原文。';
    if (/虚拟经济/.test(risk)) return '使用钱包、库存和商店既有函数，不做纯 UI 假变更。';
    if (/主题/.test(risk)) return '走主题资源管理器，确保预览可取消、分享可迁移。';
    return '保持小步修改并补对应回归测试。';
  }).slice(0, 6);
}

function buildReviewResult({ ok, prompt = '审查任务', task = {}, risks = [], impact = [], suggestions = [], files = [] }) {
  const count = risks.length;
  return {
    ok: ok !== false,
    userSummary: count ? `发现${count}个风险点` : '审查完成',
    internalResult: {
      kind: 'review',
      task: prompt || String(task.prompt || '审查任务'),
      status: ok === false ? 'failed' : 'completed',
      processSummary: `已读取任务上下文${files.length ? `和 ${files.length} 个文件摘要` : ''}，只做分析不写入。`,
      resultSummary: risks.join('\n'),
      decisionSummary: 'review-agent 使用 audit 权限域，只读分析并输出建议，不修改代码或资源。',
      risks,
      impact,
      suggestions
    }
  };
}

ensureReviewAgentRegistered();
