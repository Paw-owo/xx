// core/theme-agent-protocol.js
// imports:
//   from './theme-capabilities.js': createThemeExecutionPlan, getThemeAgentContext, validateThemeJson
// exports: getThemeAgentProtocolSpec, parseThemeAgentRequest, handleThemeAgentRequest, validateGeneratedThemeResult, normalizeGeneratedThemeResult

import {
  createThemeExecutionPlan,
  getThemeAgentContext,
  validateThemeJson
} from './theme-capabilities.js';

const PROTOCOL_VERSION = 1;

const SUPPORTED_ACTIONS = Object.freeze([
  'readThemeContext',
  'generateTheme',
  'previewTheme',
  'requestAsset',
  'refineCurrentTheme'
]);

const RESPONSE_TYPES = Object.freeze([
  'context',
  'validationResult',
  'previewResult',
  'executionPlan',
  'capabilityDenied'
]);

const GENERATED_THEME_ALLOWED_FIELDS = Object.freeze([
  'schemaVersion',
  'type',
  'themeName',
  'themeVariables',
  'imageSlots',
  'themeConfig',
  'uiDecorationParameters'
]);

const GENERATED_THEME_REQUIRED_FIELDS = Object.freeze([...GENERATED_THEME_ALLOWED_FIELDS]);

const RESERVED_TOOL_CALLS = Object.freeze({
  imageGeneration: reservedTool('imageGeneration'),
  imageResourceImport: reservedTool('imageResourceImport'),
  themePreview: reservedTool('themePreview'),
  themeApply: reservedTool('themeApply')
});

function reservedTool(id) {
  return Object.freeze({
    id,
    enabled: false,
    sideEffects: false,
    network: false,
    writesStorage: false
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getThemeAgentProtocolSpec() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    supportedActions: [...SUPPORTED_ACTIONS],
    requestFormat: {
      requiredFields: ['action'],
      optionalFields: ['requestId', 'payload'],
      actionField: 'action',
      payloadField: 'payload'
    },
    responseFormat: {
      responseTypes: [...RESPONSE_TYPES],
      commonFields: ['ok', 'responseType', 'requestId', 'errors']
    },
    generatedThemeFormat: {
      requiredFields: [...GENERATED_THEME_REQUIRED_FIELDS],
      allowedFields: [...GENERATED_THEME_ALLOWED_FIELDS]
    },
    reservedToolCalls: clone(RESERVED_TOOL_CALLS)
  };
}

export function parseThemeAgentRequest(request) {
  const errors = [];
  const data = request && typeof request === 'object' && !Array.isArray(request) ? request : null;

  if (!data) {
    return { valid: false, action: '', payload: null, errors: ['AI 请求必须是对象'] };
  }

  const action = String(data.action || '').trim();
  if (!action) errors.push('AI 请求必须声明 action');
  else if (!SUPPORTED_ACTIONS.includes(action)) errors.push(`未知 action：${action}`);

  return {
    valid: errors.length === 0,
    action,
    payload: data.payload && typeof data.payload === 'object' && !Array.isArray(data.payload) ? data.payload : {},
    requestId: data.requestId || '',
    errors
  };
}

export function validateGeneratedThemeResult(generatedTheme) {
  const errors = [];
  const data = generatedTheme && typeof generatedTheme === 'object' && !Array.isArray(generatedTheme) ? generatedTheme : null;
  if (!data) {
    return { valid: false, errors: ['AI 生成主题必须是对象'], normalizedThemeJson: null };
  }

  const allowedFields = new Set(GENERATED_THEME_ALLOWED_FIELDS);
  Object.keys(data).forEach((field) => {
    if (!allowedFields.has(field)) errors.push(`AI 生成主题包含非法字段：${field}`);
  });
  GENERATED_THEME_REQUIRED_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(data, field)) errors.push(`AI 生成主题缺少字段：${field}`);
  });

  const normalizedThemeJson = normalizeGeneratedThemeResult(data);
  const themeValidation = validateThemeJson(normalizedThemeJson);
  if (!themeValidation.valid) errors.push(...themeValidation.errors);

  return {
    valid: errors.length === 0,
    errors,
    normalizedThemeJson,
    themeValidation
  };
}

export function normalizeGeneratedThemeResult(generatedTheme) {
  const config = generatedTheme?.themeConfig && typeof generatedTheme.themeConfig === 'object' && !Array.isArray(generatedTheme.themeConfig)
    ? generatedTheme.themeConfig
    : {};

  return {
    schemaVersion: generatedTheme?.schemaVersion,
    type: generatedTheme?.type,
    name: generatedTheme?.themeName || '',
    variables: generatedTheme?.themeVariables || {},
    customVariables: generatedTheme?.themeVariables || {},
    imageResources: normalizeGeneratedImageSlots(generatedTheme?.imageSlots),
    decorations: generatedTheme?.uiDecorationParameters || {},
    preset: config.preset,
    mode: config.mode
  };
}

export async function handleThemeAgentRequest(request) {
  const parsed = parseThemeAgentRequest(request);
  if (!parsed.valid) return capabilityDenied(parsed, parsed.errors);

  if (parsed.action === 'readThemeContext') {
    return {
      ok: true,
      responseType: 'context',
      requestId: parsed.requestId,
      errors: [],
      context: getThemeAgentContext()
    };
  }

  if (parsed.action === 'previewTheme') {
    return handlePreviewRequest(parsed);
  }

  if (parsed.action === 'requestAsset') {
    return capabilityDenied(parsed, ['requestAsset 预留能力当前关闭，不调用网络、不写存储']);
  }

  return capabilityDenied(parsed, [`${parsed.action} 需要真实 AI 生成能力，当前未启用`]);
}

async function handlePreviewRequest(parsed) {
  const generatedTheme = parsed.payload.generatedTheme || parsed.payload.theme;
  const validationResult = parsed.payload.generatedTheme
    ? validateGeneratedThemeResult(generatedTheme)
    : validateThemeJson(generatedTheme);
  const normalizedThemeJson = parsed.payload.generatedTheme
    ? validationResult.normalizedThemeJson
    : generatedTheme;

  if (!validationResult.valid) {
    return {
      ok: false,
      responseType: 'validationResult',
      requestId: parsed.requestId,
      errors: validationResult.errors,
      validationResult
    };
  }

  const executionPlan = await createThemeExecutionPlan(normalizedThemeJson);
  if (!executionPlan.valid) {
    return {
      ok: false,
      responseType: 'executionPlan',
      requestId: parsed.requestId,
      errors: executionPlan.errors,
      executionPlan
    };
  }

  return {
    ok: true,
    responseType: 'previewResult',
    requestId: parsed.requestId,
    errors: [],
    validationResult,
    previewResult: executionPlan.preview,
    executionPlan
  };
}

function capabilityDenied(parsed, errors) {
  return {
    ok: false,
    responseType: 'capabilityDenied',
    requestId: parsed?.requestId || '',
    action: parsed?.action || '',
    errors: Array.isArray(errors) ? errors : [String(errors || '能力不可用')]
  };
}

function normalizeGeneratedImageSlots(imageSlots) {
  if (!Array.isArray(imageSlots)) return [];
  return imageSlots.map((slot) => ({
    slotKey: slot?.slotKey || slot?.key || '',
    sourceType: slot?.sourceType || '',
    value: slot?.value || '',
    valueRef: slot?.valueRef || ''
  }));
}
