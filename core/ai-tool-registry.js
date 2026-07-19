// core/ai-tool-registry.js
// AI 工具注册中心：只登记能力边界，不承载具体业务实现。

export const AI_TOOL_SCOPES = Object.freeze({
  THEME_RESOURCE_GENERATION: 'theme-resource-generation',
  DEVELOPMENT: 'development',
  AUDIT: 'audit',
  DESIGN: 'design'
});

const registry = new Map();

export function registerAITool(tool = {}) {
  const normalized = normalizeTool(tool);
  if (!normalized.ok) return normalized;
  registry.set(normalized.tool.id, normalized.tool);
  return { ok: true, tool: clone(normalized.tool) };
}

export function unregisterAITool(id = '') {
  return registry.delete(String(id || '').trim());
}

export function listAITools(filter = {}) {
  const permissionDomain = String(filter.permissionDomain || '').trim();
  const usageScope = String(filter.usageScope || '').trim();
  return [...registry.values()]
    .filter((tool) => !permissionDomain || tool.permissionDomain === permissionDomain)
    .filter((tool) => !usageScope || tool.usageScopes.includes(usageScope))
    .map(clone);
}

export function getAITool(id = '') {
  const tool = registry.get(String(id || '').trim());
  return tool ? clone(tool) : null;
}

export function canUseAITool(id = '', context = {}) {
  const tool = registry.get(String(id || '').trim());
  if (!tool) return { ok: false, errors: ['ai_tool_not_registered'] };
  const domain = String(context.permissionDomain || '').trim();
  if (domain && domain !== tool.permissionDomain) return { ok: false, errors: ['ai_tool_permission_domain_mismatch'] };
  const scope = String(context.usageScope || '').trim();
  if (scope && !tool.usageScopes.includes(scope)) return { ok: false, errors: ['ai_tool_usage_scope_not_allowed'] };
  if (context.write === true && !tool.allowWrite) return { ok: false, errors: ['ai_tool_write_not_allowed'] };
  return { ok: true, tool: clone(tool) };
}

export function clearAIToolRegistry() {
  registry.clear();
  seedBuiltinTools();
}

function normalizeTool(tool) {
  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return { ok: false, errors: ['ai_tool_must_be_object'] };
  const id = String(tool.id || '').trim();
  const name = String(tool.name || '').trim();
  const permissionDomain = String(tool.permissionDomain || '').trim();
  const usageScopes = Array.isArray(tool.usageScopes) ? tool.usageScopes.map((item) => String(item || '').trim()).filter(Boolean) : [];
  const errors = [];
  if (!id) errors.push('ai_tool_id_required');
  if (!name) errors.push('ai_tool_name_required');
  if (!permissionDomain) errors.push('ai_tool_permission_domain_required');
  if (!usageScopes.length) errors.push('ai_tool_usage_scope_required');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    tool: Object.freeze({
      id,
      name,
      permissionDomain,
      inputSchema: sanitizeSchema(tool.inputSchema),
      outputSchema: sanitizeSchema(tool.outputSchema),
      allowWrite: tool.allowWrite === true,
      usageScopes: Object.freeze([...new Set(usageScopes)]),
      description: String(tool.description || '')
    })
  };
}

function sanitizeSchema(schema) {
  return schema && typeof schema === 'object' && !Array.isArray(schema) ? clone(schema) : { type: 'object', properties: {} };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function seedBuiltinTools() {
  registerAITool({
    id: 'theme-image-generator',
    name: '主题图片生成器',
    permissionDomain: AI_TOOL_SCOPES.THEME_RESOURCE_GENERATION,
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, slot: { type: 'string' } }, required: ['prompt', 'slot'] },
    outputSchema: { type: 'object', properties: { resource: { type: 'object' }, summary: { type: 'string' } } },
    allowWrite: true,
    usageScopes: [AI_TOOL_SCOPES.THEME_RESOURCE_GENERATION],
    description: '为主题图片槽位准备可迁移资源。'
  });
  registerAITool({
    id: 'github-developer-tool',
    name: 'GitHub 开发工具',
    permissionDomain: AI_TOOL_SCOPES.DEVELOPMENT,
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, files: { type: 'array' }, changes: { type: 'array' }, allowWrite: { type: 'boolean' } }, required: ['prompt'] },
    outputSchema: { type: 'object', properties: { status: { type: 'string' }, filesRead: { type: 'array' }, modifiedFiles: { type: 'array' }, tests: { type: 'array' }, summary: { type: 'string' } } },
    allowWrite: true,
    usageScopes: [AI_TOOL_SCOPES.DEVELOPMENT],
    description: '通过现有 GitHub 工具读取仓库、分析文件，并在明确授权时提交修改和 PR。'
  });
  registerAITool({
    id: 'review-analysis-tool',
    name: '审查分析工具',
    permissionDomain: AI_TOOL_SCOPES.AUDIT,
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, context: { type: 'object' }, files: { type: 'array' } }, required: ['prompt'] },
    outputSchema: { type: 'object', properties: { risks: { type: 'array' }, impact: { type: 'array' }, suggestions: { type: 'array' }, summary: { type: 'string' } } },
    allowWrite: false,
    usageScopes: [AI_TOOL_SCOPES.AUDIT],
    description: '只读审查任务上下文、代码或设计，输出风险和建议，不修改任何资源。'
  });
}

seedBuiltinTools();
