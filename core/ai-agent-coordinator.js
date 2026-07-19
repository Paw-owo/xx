// core/ai-agent-coordinator.js
// 多子智能体协调层：主 AI 委派多个专用智能体，统一汇总为一张任务总结卡。

import { runSubAgent, SUB_AGENT_SCOPES } from './sub-agent-system.js';

export const TEAM_TASK_STATUS = Object.freeze({
  PLANNING: 'planning',
  DELEGATING: 'delegating',
  RUNNING: 'running',
  SUMMARIZING: 'summarizing',
  COMPLETED: 'completed',
  FAILED: 'failed'
});

const AGENT_SCOPE = Object.freeze({
  'theme-agent': SUB_AGENT_SCOPES.THEME,
  'developer-agent': SUB_AGENT_SCOPES.DEVELOPMENT,
  'review-agent': SUB_AGENT_SCOPES.REVIEW
});

const EXPLICIT_TASK_RE = /(帮我|请|麻烦|需要|想让你).{0,8}(改|修复|检查|审查|分析|设计|优化|看看|处理|实现|排查|生成)|^(改|修复|检查|审查|分析|设计|优化|排查|实现|生成)\b|哪里有问题|有什么风险|做一个|做一套|创建|提交|pull request|PR/i;
const CASUAL_RE = /^(你好|早安|晚安|在吗|谢谢|哈哈|想你|抱抱|陪我|github是什么|什么是github|解释一下|介绍一下|怎么理解|是什么)[\s\S]{0,80}$/i;
const SIMPLE_QUESTION_RE = /^(什么是|介绍一下|解释一下|为什么|怎么用|如何理解).{0,60}$/i;

export function planSubAgentTeamTask(task = {}) {
  const decision = assessSubAgentNeed(task);
  if (!decision.needSubAgent) return [];
  const prompt = String(task.prompt || task.query || '').trim();
  const requested = Array.isArray(task.agents) ? task.agents.map(String) : [];
  const agents = requested.length ? requested : inferAgents(prompt);
  return [...new Set(agents)].filter((id) => AGENT_SCOPE[id]).map((agent) => ({
    agent,
    task: {
      ...(task.agentTasks?.[agent] || {}),
      prompt,
      scope: AGENT_SCOPE[agent],
      files: task.files || task.agentTasks?.[agent]?.files || [],
      context: task.context || task.agentTasks?.[agent]?.context || {}
    }
  }));
}

export function assessSubAgentNeed(task = {}) {
  const prompt = String(task.prompt || task.query || '').trim();
  const requested = Array.isArray(task.agents) ? task.agents.map(String).filter(Boolean) : [];
  const files = Array.isArray(task.files) ? task.files : [];
  const context = task.context && typeof task.context === 'object' ? task.context : {};
  const text = prompt.toLowerCase();
  const explicit = EXPLICIT_TASK_RE.test(prompt);
  const hasArtifacts = files.length > 0 || Object.keys(context).length > 0 || Array.isArray(task.changes);
  const domainIntent = {
    development: /(改代码|修复|bug|仓库哪里有问题|提交|github操作|pull request|pr|实现.{0,12}功能|排查.{0,12}代码|检查.{0,12}功能)/i.test(prompt),
    review: /(审查|风险|影响范围|安全|检查.{0,12}风险|哪里有问题|代码评审|review)/i.test(prompt),
    theme: /(设计.{0,8}主题|做.{0,8}主题|猫猫主题|主题设计|生成.{0,8}主题|换.{0,8}风格)/i.test(prompt)
  };
  const multiStep = /(并且|同时|顺便|然后|再|拆解|多步骤|完整|一套|流程|方案).{0,80}/i.test(prompt) || requested.length > 1;
  const complexity = [
    explicit,
    hasArtifacts,
    multiStep,
    domainIntent.development,
    domainIntent.review,
    domainIntent.theme,
    prompt.length > 36
  ].filter(Boolean).length;
  const casual = CASUAL_RE.test(prompt) || SIMPLE_QUESTION_RE.test(prompt);
  const keywordOnly = /(github|主题|代码|bug|风险|ui)/i.test(text) && !explicit && !hasArtifacts && complexity < 2;
  const needSubAgent = !casual && !keywordOnly && explicit && complexity >= 2;
  const reasons = [];
  if (explicit) reasons.push('用户明确提出任务');
  if (hasArtifacts) reasons.push('提供了文件、上下文或修改项');
  if (multiStep) reasons.push('任务包含多步骤或协作信号');
  Object.entries(domainIntent).forEach(([key, value]) => { if (value) reasons.push(`命中 ${key} 专用领域`); });
  return {
    needSubAgent,
    complexity,
    calledCount: needSubAgent ? Math.max(1, requested.length || inferAgents(prompt).length) : 0,
    reasons: needSubAgent ? reasons : ['普通聊天、简单问答或关键词不足，主 AI 直接回复更省心'],
    skippedReason: needSubAgent ? '' : (casual ? 'casual_or_simple_question' : keywordOnly ? 'keyword_without_task' : 'below_threshold')
  };
}

export async function runSubAgentTeam(task = {}, context = {}) {
  const timeline = [{ status: TEAM_TASK_STATUS.PLANNING, label: '正在分析', at: now() }];
  const decision = assessSubAgentNeed(task);
  if (!decision.needSubAgent) {
    return buildTeamResult({ ok: false, task, timeline, members: [], summary: '这个请求先由主 AI 直接回答更合适。', decision });
  }
  const plan = planSubAgentTeamTask(task);
  if (!plan.length) {
    return buildTeamResult({ ok: false, task, timeline, members: [], summary: '还没找到合适的小伙伴。' });
  }
  timeline.push({ status: TEAM_TASK_STATUS.DELEGATING, label: `分给 ${plan.length} 个小伙伴`, at: now() });
  const members = [];
  for (const item of plan) {
    timeline.push({ status: TEAM_TASK_STATUS.RUNNING, label: `${item.agent} 正在整理`, at: now() });
    const result = await runSubAgent(item.agent, item.task, { ...context, scope: item.task.scope });
    members.push({ agent: item.agent, ok: result.ok, userSummary: result.userSummary, internalResult: result.internalResult || {}, card: result.card || null });
  }
  timeline.push({ status: TEAM_TASK_STATUS.SUMMARIZING, label: '正在汇总', at: now() });
  const ok = members.every((item) => item.ok !== false);
  timeline.push({ status: ok ? TEAM_TASK_STATUS.COMPLETED : TEAM_TASK_STATUS.FAILED, label: ok ? '已完成' : '有小伙伴没跑顺', at: now() });
  return buildTeamResult({ ok, task, timeline, members, decision: { ...decision, calledCount: members.length } });
}

function inferAgents(prompt) {
  const text = String(prompt || '').toLowerCase();
  const agents = [];
  if (/代码|bug|修复|仓库|github|开发|功能|app|优化/.test(text)) agents.push('developer-agent');
  if (/风险|审查|检查|安全|问题|影响|优化/.test(text)) agents.push('review-agent');
  if (/ui|视觉|主题|颜色|界面|样式|可爱|猫|设计/.test(text)) agents.push('theme-agent');
  if (!agents.length) agents.push('review-agent');
  return agents;
}

function buildTeamResult({ ok, task, timeline, members, summary = '', decision = null }) {
  const prompt = String(task.prompt || task.query || '团队协作任务').trim();
  const risks = members.flatMap((item) => item.internalResult?.risks || []).slice(0, 8);
  const modifiedFiles = members.flatMap((item) => item.internalResult?.modifiedFiles || []).slice(0, 12);
  const themeStyles = members.map((item) => item.internalResult?.themeStyle).filter(Boolean);
  const memberLines = members.map((item) => `${item.agent}：${item.userSummary || '已完成'}`);
  const visible = ok === false ? '小团队还没整理顺' : '已完成';
  return {
    ok: ok !== false,
    userSummary: visible,
    internalResult: {
      kind: 'team',
      task: prompt,
      status: ok === false ? TEAM_TASK_STATUS.FAILED : TEAM_TASK_STATUS.COMPLETED,
      processSummary: `已协调 ${members.length} 个子智能体：${members.map((item) => item.agent).join('、') || '暂无'}。`,
      resultSummary: summary || memberLines.join('\n'),
      decisionSummary: '协调层只按各子智能体自身 scope 调用，不合并或扩大权限。',
      members,
      risks,
      modifiedFiles,
      themeStyles,
      statusTimeline: timeline,
      decision
    }
  };
}

function now() {
  try { return new Date().toISOString(); } catch (_) { return ''; }
}
