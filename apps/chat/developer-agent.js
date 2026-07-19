// apps/chat/developer-agent.js
// developer-agent 与现有 GitHub 工具的桥接层：只使用 development 权限域。

import { registerSubAgent, SUB_AGENT_SCOPES } from '../../core/sub-agent-system.js';
import { canUseAITool, AI_TOOL_SCOPES } from '../../core/ai-tool-registry.js';
import { runGithubDeveloperTask, getGithubDeveloperConfigSummary } from './github-tool.js';

let registered = false;

export function ensureDeveloperAgentRegistered() {
  if (registered) return true;
  registerSubAgent({
    id: 'developer-agent',
    name: '开发伙伴',
    scope: SUB_AGENT_SCOPES.DEVELOPMENT,
    toolPermissionDomains: [AI_TOOL_SCOPES.DEVELOPMENT],
    defaultSummary: '开发任务完成',
    handler: runDeveloperAgentTask
  });
  registered = true;
  return true;
}

export async function runDeveloperAgentTask(task = {}, context = {}) {
  const writeRequested = task.allowWrite === true || context.allowWrite === true || hasExplicitChanges(task);
  const permission = canUseAITool('github-developer-tool', {
    permissionDomain: AI_TOOL_SCOPES.DEVELOPMENT,
    usageScope: AI_TOOL_SCOPES.DEVELOPMENT,
    write: writeRequested
  });
  if (!permission.ok) {
    return {
      ok: false,
      userSummary: '开发权限还没接好',
      internalResult: {
        kind: 'developer',
        task: String(task.prompt || '开发协作'),
        status: 'failed',
        processSummary: 'developer-agent 申请 GitHub 开发工具权限时被拦下。',
        resultSummary: '没有读取、修改或提交任何代码。',
        decisionSummary: '权限域必须是 development，不能借用主题资源或其他能力域。',
        risks: permission.errors || []
      }
    };
  }

  const config = getGithubDeveloperConfigSummary();
  const result = await runGithubDeveloperTask(task, {
    signal: context.signal,
    allowWrite: writeRequested && (task.allowWrite === true || context.allowWrite === true)
  });
  return {
    ...result,
    internalResult: {
      ...(result.internalResult || {}),
      repository: config.configured ? `${config.owner}/${config.repo}#${config.branch}` : '',
      permissionDomain: AI_TOOL_SCOPES.DEVELOPMENT
    }
  };
}

function hasExplicitChanges(task = {}) {
  return Array.isArray(task.changes) && task.changes.length > 0;
}

ensureDeveloperAgentRegistered();
