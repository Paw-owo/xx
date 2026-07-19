// core/theme-capabilities.js
// imports:
//   from './storage.js': getDB
//   from './theme.js': applyTheme, getBaseThemeVariables, getCurrentTheme, saveTheme
// exports: getThemeCapabilityRegistry, getThemeAgentContext, getThemeJsonSchema, getThemeApiContracts, validateThemeJson, previewTheme, createThemeExecutionPlan, applyThemeFromAgent

import { getDB } from './storage.js';
import { applyTheme, getBaseThemeVariables, getCurrentTheme, saveTheme } from './theme.js';

const REGISTRY_VERSION = 1;
const THEME_JSON_SCHEMA_VERSION = 1;
const THEME_AGENT_PROTOCOL_VERSION = 1;

const THEME_AGENT_SUPPORTED_ACTIONS = Object.freeze([
  'readThemeContext',
  'generateTheme',
  'previewTheme',
  'requestAsset',
  'refineCurrentTheme'
]);

const ALLOWED_MUTATION_SCOPE = Object.freeze([
  'themeVariables',
  'imageSlots',
  'themeConfig',
  'uiDecorationParameters'
]);

const FORBIDDEN_MUTATION_SCOPE = Object.freeze([
  'appBusinessLogic',
  'eventSystem',
  'dataStructures',
  'coreFeatureCode',
  'userData'
]);

const FORBIDDEN_JSON_FIELDS = Object.freeze([
  'appBusinessLogic',
  'eventSystem',
  'events',
  'dataStructures',
  'coreFeatureCode',
  'userData',
  'storage',
  'api',
  'apiKeys',
  'tokens',
  'secrets',
  'callbacks',
  'scripts',
  'html',
  'css'
]);

const VARIABLE_CAPABILITY_DEFINITIONS = Object.freeze({
  'bg-main': variable('bg-main', 'color', '主背景兼旧版背景变量', 'background'),
  'bg-light': variable('bg-light', 'color', '浅背景兼旧版背景变量', 'background'),
  'bg-card': variable('bg-card', 'color', '卡片背景兼旧版卡片变量', 'surface'),
  'color-accent': variable('color-accent', 'color', '旧版强调色兼容变量', 'accent'),
  'color-text': variable('color-text', 'color', '旧版文字色兼容变量', 'text'),
  'color-success': variable('color-success', 'color', '成功状态色', 'state'),
  'color-danger': variable('color-danger', 'color', '危险状态色', 'state'),
  'bg-primary': variable('bg-primary', 'color', '全局主背景', 'background'),
  'bg-secondary': variable('bg-secondary', 'color', '全局次级背景', 'background'),
  'bg-overlay': variable('bg-overlay', 'cssColorExpression', '遮罩背景', 'background'),
  surface: variable('surface', 'color', '通用表面背景', 'surface'),
  'surface-muted': variable('surface-muted', 'cssColorExpression', '弱化表面背景', 'surface'),
  accent: variable('accent', 'color', '全局强调色', 'accent'),
  'accent-light': variable('accent-light', 'color', '浅强调色', 'accent'),
  'accent-dark': variable('accent-dark', 'color', '深强调色', 'accent'),
  'text-primary': variable('text-primary', 'color', '主要文字颜色', 'text'),
  'text-secondary': variable('text-secondary', 'color', '次要文字颜色', 'text'),
  'text-hint': variable('text-hint', 'color', '提示文字颜色', 'text'),
  'border-soft': variable('border-soft', 'color', '柔和边框颜色', 'border'),
  'icon-color': variable('icon-color', 'color', '图标主色', 'accent'),
  'decor-blue': variable('decor-blue', 'color', '蓝色装饰色', 'decoration'),
  'decor-yellow': variable('decor-yellow', 'color', '黄色装饰色', 'decoration'),
  'decor-pink': variable('decor-pink', 'cssColorExpression', '粉色装饰色', 'decoration'),
  'decor-cream': variable('decor-cream', 'cssColorExpression', '奶油装饰色', 'decoration'),
  'media-ink': variable('media-ink', 'cssColorExpression', '媒体插画墨色', 'decoration'),
  'media-ink-deep': variable('media-ink-deep', 'cssColorExpression', '媒体插画深墨色', 'decoration'),
  'media-on-dark': variable('media-on-dark', 'cssColorExpression', '深色媒体前景色', 'decoration'),
  'media-highlight': variable('media-highlight', 'cssColorExpression', '媒体高亮色', 'decoration'),
  'media-overlay-soft': variable('media-overlay-soft', 'cssColorExpression', '媒体柔和遮罩', 'decoration'),
  'media-overlay': variable('media-overlay', 'cssColorExpression', '媒体遮罩', 'decoration'),
  'bubble-user-bg': variable('bubble-user-bg', 'color', '用户聊天气泡背景', 'chatBubble'),
  'bubble-user-text': variable('bubble-user-text', 'color', '用户聊天气泡文字', 'chatBubble'),
  'bubble-ai-bg': variable('bubble-ai-bg', 'color', 'AI 聊天气泡背景', 'chatBubble'),
  'bubble-ai-text': variable('bubble-ai-text', 'color', 'AI 聊天气泡文字', 'chatBubble'),
  'bubble-radius': variable('bubble-radius', 'cssLength', '聊天气泡圆角', 'radius'),
  'bubble-radius-tail': variable('bubble-radius-tail', 'cssLength', '聊天气泡尾部圆角', 'radius'),
  'font-main': variable('font-main', 'fontFamily', '全局字体栈', 'typography', false),
  'font-size-base': variable('font-size-base', 'cssLength', '基础字号', 'typography', false),
  'font-size-small': variable('font-size-small', 'cssLength', '小字号', 'typography', false),
  'font-size-title': variable('font-size-title', 'cssLength', '标题字号', 'typography', false),
  'spacing-xs': variable('spacing-xs', 'cssLength', '极小间距', 'spacing'),
  'spacing-sm': variable('spacing-sm', 'cssLength', '小间距', 'spacing'),
  'spacing-md': variable('spacing-md', 'cssLength', '中间距', 'spacing'),
  'spacing-lg': variable('spacing-lg', 'cssLength', '大间距', 'spacing'),
  'radius-sm': variable('radius-sm', 'cssLength', '小圆角', 'radius'),
  'radius-md': variable('radius-md', 'cssLength', '中圆角', 'radius'),
  'radius-lg': variable('radius-lg', 'cssLength', '大圆角', 'radius'),
  'shadow-sm': variable('shadow-sm', 'cssShadow', '小阴影', 'decoration'),
  'shadow-md': variable('shadow-md', 'cssShadow', '中阴影', 'decoration'),
  'shadow-lg': variable('shadow-lg', 'cssShadow', '大阴影', 'decoration'),
  'shadow-card': variable('shadow-card', 'cssShadow', '卡片阴影', 'decoration'),
  'shadow-float': variable('shadow-float', 'cssShadow', '浮层阴影', 'decoration'),
  'shadow-neu-out': variable('shadow-neu-out', 'cssShadow', '外凸拟物阴影', 'decoration'),
  'shadow-neu-in': variable('shadow-neu-in', 'cssShadow', '内凹拟物阴影', 'decoration'),
  motion: variable('motion', 'cssTransition', '通用动效', 'motion'),
  'press-scale': variable('press-scale', 'numberString', '按压缩放比例', 'motion'),
  'radius-xl': variable('radius-xl', 'cssLength', '超大圆角', 'radius'),
  'radius-full': variable('radius-full', 'cssLength', '胶囊圆角', 'radius')
});

const IMAGE_SLOTS = Object.freeze([
  imageSlot('app_wallpaper', '桌面壁纸', 'desktop', 'app_wallpaper_opacity'),
  imageSlot('app_game_hero_image', '游戏入口主图', 'games'),
  imageSlot('app_bg_settings', '设置页背景', 'settings'),
  imageSlot('app_bg_characters', '角色页背景', 'characters'),
  imageSlot('app_bg_chat', '默认聊天背景', 'chat'),
  imageSlot('app_bg_chat_memory', '聊天记忆页背景', 'chatMemory'),
  imageSlot('app_bg_moments', '朋友圈背景', 'moments'),
  imageSlot('app_bg_worldbook', '世界书背景', 'worldbook'),
  imageSlot('app_bg_wallet', '钱包背景', 'wallet'),
  imageSlot('app_bg_shop', '商店背景', 'shop'),
  imageSlot('app_bg_memo', '备忘录背景', 'memo'),
  imageSlot('app_bg_anniversary', '纪念日背景', 'anniversary'),
  imageSlot('app_bg_games', '游戏中心背景', 'games'),
  imageSlot('app_bg_dream', '梦境背景', 'dream'),
  imageSlot('app_bg_truth_game', '真心话游戏背景', 'truthGame'),
  imageSlot('app_bg_draw_guess', '你画我猜背景', 'drawGuess'),
  imageSlot('app_bg_liars_tavern', '骗子酒馆背景', 'liarsTavern')
]);

const UI_AREAS = Object.freeze([
  {
    id: 'global-shell',
    name: '全局小手机外壳',
    mutable: true,
    allowed: ['themeVariables', 'uiDecorationParameters'],
    forbidden: ['appBusinessLogic', 'eventSystem', 'dataStructures']
  },
  {
    id: 'chat-visual',
    name: '聊天视觉层',
    mutable: true,
    allowed: ['themeVariables', 'imageSlots', 'uiDecorationParameters'],
    forbidden: ['messages', 'chatLogic', 'eventSystem', 'modelCalling', 'userData']
  },
  {
    id: 'app-backgrounds',
    name: '应用背景图层',
    mutable: true,
    allowed: ['imageSlots'],
    forbidden: ['appBusinessLogic', 'routing', 'eventSystem', 'userData']
  },
  {
    id: 'theme-config',
    name: '主题配置',
    mutable: true,
    allowed: ['themeConfig'],
    forbidden: ['storageStructure', 'apiConfig', 'coreFeatureCode']
  }
]);

const THEME_API_CONTRACTS = Object.freeze({
  imageGeneration: contract('theme.image.generate', '预留生图请求接口，本轮不调用网络'),
  imageResourceManager: contract('theme.image.resource', '预留图片资源保存接口，本轮不写入存储'),
  themePreview: contract('theme.preview', '预留主题预览接口，本轮不应用主题'),
  themeApply: contract('theme.apply', '预留外部主题应用接口，本轮不开放外部调用')
});

const THEME_EXECUTION_CAPABILITIES = Object.freeze({
  previewTheme: {
    enabled: true,
    sideEffects: false,
    requiresValidation: true,
    description: '生成主题变量与图片资源变化预览，不修改真实主题'
  },
  applyThemeFromAgent: {
    enabled: true,
    sideEffects: true,
    requiresValidation: true,
    requiresUserConfirmation: true,
    autoApply: false,
    description: '用户确认后复用现有 applyTheme/saveTheme 流程应用已校验主题变量'
  }
});

const THEME_JSON_SCHEMA = Object.freeze({
  schemaVersion: THEME_JSON_SCHEMA_VERSION,
  type: 'ai-phone-theme',
  allowedTopLevelFields: [
    'schemaVersion',
    'type',
    'id',
    'name',
    'description',
    'version',
    'parentThemeId',
    'createdAt',
    'updatedAt',
    'base',
    'preset',
    'mode',
    'variables',
    'customVariables',
    'imageResources',
    'decorations',
    'metadata'
  ],
  requiredForGeneratedTheme: ['schemaVersion', 'type'],
  futureUse: ['aiGeneratedTheme', 'saveThemeVersion', 'deleteThemeVersion', 'continueOptimizingFromCurrentTheme']
});

function variable(key, type, usage, group, mutable = true) {
  return Object.freeze({ key, type, usage, group, mutable });
}

function imageSlot(key, name, area, opacityKey = '') {
  return Object.freeze({
    key,
    name,
    area,
    mutable: true,
    storage: { kind: 'indexedDB', store: 'blobs', keyField: 'key', valueField: 'value' },
    supportedSources: ['localImage', 'urlImage', 'futureGeneratedImage'],
    ...(opacityKey ? { opacityKey } : {})
  });
}

function contract(id, description) {
  return Object.freeze({
    id,
    description,
    reserved: true,
    enabled: false,
    sideEffects: false
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildVariableCapabilities() {
  const baseVariables = getBaseThemeVariables();
  return Object.keys(baseVariables).map((key) => ({
    ...(VARIABLE_CAPABILITY_DEFINITIONS[key] || variable(key, 'cssValue', '当前主题变量', 'other', false)),
    cssName: `--${key}`,
    currentDefaultValue: baseVariables[key]
  }));
}

export function getThemeCapabilityRegistry() {
  return {
    version: REGISTRY_VERSION,
    name: 'ai-phone-theme-capability-registry',
    allowedMutationScope: [...ALLOWED_MUTATION_SCOPE],
    forbiddenMutationScope: [...FORBIDDEN_MUTATION_SCOPE],
    variables: buildVariableCapabilities(),
    imageSlots: clone(IMAGE_SLOTS),
    uiAreas: clone(UI_AREAS),
    executionCapabilities: clone(THEME_EXECUTION_CAPABILITIES),
    resourceTypes: ['themeJson', 'localImage', 'urlImage', 'futureGeneratedImage'],
    safetyRules: [
      '只能修改 registry 标记为 mutable 的主题变量',
      '只能引用 registry 登记的图片资源位',
      '不得修改 APP 业务逻辑、事件系统、数据结构、核心功能代码和用户数据',
      '预览主题不得产生真实修改',
      '应用主题必须先通过 validateThemeJson 且需要用户确认',
      '本基础层不接入 AI、不调用 API、不生成图片、不修改 UI'
    ]
  };
}

export function getThemeAgentContext() {
  const registry = getThemeCapabilityRegistry();
  return {
    version: REGISTRY_VERSION,
    protocolVersion: THEME_AGENT_PROTOCOL_VERSION,
    supportedActions: [...THEME_AGENT_SUPPORTED_ACTIONS],
    requestFormat: {
      requiredFields: ['action'],
      optionalFields: ['requestId', 'payload'],
      actionField: 'action',
      payloadField: 'payload'
    },
    responseFormat: {
      responseTypes: ['context', 'validationResult', 'previewResult', 'executionPlan', 'capabilityDenied'],
      commonFields: ['ok', 'responseType', 'requestId', 'errors']
    },
    uiStructure: {
      globalShell: '全局小手机外壳',
      appScreen: 'APP 全屏容器',
      navigation: '顶部导航栏',
      contentArea: '内容区',
      chatVisualLayer: '聊天背景与气泡视觉层',
      appBackgroundLayer: '统一图片资源位背景层'
    },
    allowedMutationScope: registry.allowedMutationScope,
    forbiddenMutationScope: registry.forbiddenMutationScope,
    callableCapabilities: {
      readCapabilityRegistry: true,
      readCurrentTheme: true,
      validateThemeJson: true,
      previewTheme: true,
      applyThemeFromAgent: {
        enabled: true,
        requiresUserConfirmation: true,
        autoApply: false
      },
      requestImageGeneration: false,
      requestImageResourceSave: false,
      requestThemePreview: false,
      requestThemeApply: false
    },
    currentTheme: getCurrentTheme(),
    registry
  };
}

export function getThemeJsonSchema() {
  return clone(THEME_JSON_SCHEMA);
}

export function getThemeApiContracts() {
  return clone(THEME_API_CONTRACTS);
}

export function validateThemeJson(themeJson) {
  const errors = [];
  const data = themeJson && typeof themeJson === 'object' && !Array.isArray(themeJson) ? themeJson : null;
  if (!data) {
    return { valid: false, errors: ['主题配置必须是对象'] };
  }

  const schema = getThemeJsonSchema();
  const allowedTopLevel = new Set(schema.allowedTopLevelFields);
  Object.keys(data).forEach((field) => {
    if (!allowedTopLevel.has(field)) errors.push(`包含非法字段：${field}`);
  });

  const forbiddenFields = new Set(FORBIDDEN_JSON_FIELDS);
  collectFieldPaths(data).forEach((path) => {
    const field = path.split('.').pop();
    if (forbiddenFields.has(field)) errors.push(`包含禁止修改区域字段：${path}`);
  });

  if (data.schemaVersion != null && Number(data.schemaVersion) !== THEME_JSON_SCHEMA_VERSION) {
    errors.push(`不支持的 schemaVersion：${data.schemaVersion}`);
  }

  if (data.type != null && data.type !== 'ai-phone-theme') {
    errors.push(`不支持的主题类型：${data.type}`);
  }

  validateVariablesObject(data.variables, 'variables', errors);
  validateVariablesObject(data.customVariables, 'customVariables', errors);
  validateImageResources(data.imageResources, errors);

  return { valid: errors.length === 0, errors };
}

export async function previewTheme(themeJson) {
  const plan = await createThemeExecutionPlan(themeJson);
  return plan.valid ? plan.preview : plan;
}

export async function createThemeExecutionPlan(themeJson) {
  const validation = validateThemeJson(themeJson);
  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
      preview: null
    };
  }

  return {
    valid: true,
    errors: [],
    preview: await buildThemePreview(themeJson),
    normalizedVariables: collectThemeVariables(themeJson)
  };
}

export async function applyThemeFromAgent(themeJson, options = {}) {
  const plan = await createThemeExecutionPlan(themeJson);
  if (!plan.valid) {
    return {
      applied: false,
      errors: plan.errors,
      preview: null,
      theme: null
    };
  }

  if (options?.confirmed !== true) {
    return {
      applied: false,
      errors: ['应用主题前必须由用户确认'],
      preview: plan.preview,
      theme: null
    };
  }

  const nextTheme = applyTheme(plan.normalizedVariables);
  saveTheme();

  return {
    applied: true,
    errors: [],
    preview: plan.preview,
    theme: nextTheme
  };
}

function validateVariablesObject(variables, fieldName, errors) {
  if (variables == null) return;
  if (typeof variables !== 'object' || Array.isArray(variables)) {
    errors.push(`${fieldName} 必须是对象`);
    return;
  }

  const allowedVariables = new Map(buildVariableCapabilities().map((item) => [item.key, item]));
  Object.keys(variables).forEach((rawKey) => {
    const key = String(rawKey).replace(/^--/, '');
    const capability = allowedVariables.get(key);
    if (!capability) {
      errors.push(`未知主题变量：${rawKey}`);
      return;
    }
    if (!capability.mutable) errors.push(`变量不允许由 AI 修改：${rawKey}`);
  });
}

function validateImageResources(imageResources, errors) {
  if (imageResources == null) return;
  if (!Array.isArray(imageResources)) {
    errors.push('imageResources 必须是数组');
    return;
  }

  const slotKeys = new Set(IMAGE_SLOTS.map((slot) => slot.key));
  imageResources.forEach((resource, index) => {
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
      errors.push(`imageResources[${index}] 必须是对象`);
      return;
    }
    if (!slotKeys.has(resource.slotKey)) errors.push(`未知图片资源位：imageResources[${index}].slotKey`);
    if (resource.sourceType && !['localImage', 'urlImage', 'futureGeneratedImage'].includes(resource.sourceType)) {
      errors.push(`不支持的图片来源：imageResources[${index}].sourceType`);
    }
  });
}

async function buildThemePreview(themeJson) {
  const currentTheme = getCurrentTheme();
  const targetVariables = collectThemeVariables(themeJson);
  const imageResources = Array.isArray(themeJson?.imageResources) ? themeJson.imageResources : [];
  const imageResourceChanges = await Promise.all(imageResources.map(createImageResourcePreview));

  return {
    variables: Object.entries(targetVariables).map(([key, targetValue]) => ({
      key,
      currentValue: currentTheme.variables?.[key] ?? '',
      targetValue,
      willChange: String(currentTheme.variables?.[key] ?? '') !== String(targetValue)
    })),
    imageResources: imageResourceChanges,
    themeConfig: {
      preset: compareConfigValue(currentTheme.preset, themeJson?.preset ?? themeJson?.base?.preset),
      mode: compareConfigValue(currentTheme.mode, themeJson?.mode ?? themeJson?.base?.mode)
    }
  };
}

async function createImageResourcePreview(resource) {
  const currentRecord = await getDB('blobs', resource.slotKey).catch(() => null);
  const currentValue = currentRecord?.value || currentRecord?.url || '';
  const targetValue = resource.value || resource.valueRef || '';
  return {
    slotKey: resource.slotKey,
    sourceType: resource.sourceType || '',
    currentValue,
    targetValue,
    willChange: String(currentValue) !== String(targetValue)
  };
}

function compareConfigValue(currentValue, targetValue) {
  return {
    currentValue: currentValue ?? '',
    targetValue: targetValue ?? '',
    willChange: targetValue != null && String(currentValue ?? '') !== String(targetValue)
  };
}

function collectThemeVariables(themeJson) {
  return {
    ...normalizeThemeVariablesForExecution(themeJson?.variables),
    ...normalizeThemeVariablesForExecution(themeJson?.customVariables)
  };
}

function normalizeThemeVariablesForExecution(variables) {
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) return {};
  return Object.fromEntries(
    Object.entries(variables)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [String(key).replace(/^--/, ''), String(value)])
  );
}

function collectFieldPaths(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...collectFieldPaths(child, path)];
  });
}
