// core/api.js
// imports: getData, setData, getAllDB, setDB, deleteDB, getNow, generateId from './storage.js'
// exports: streamMessage, silentRequest, fetchModels, smartModelsUrl, buildHeaders, parseErrorResponse, getFallbackSources, callAPI, getMergedPoolModels, testPoolEndpoint, testAllPoolEndpoints, addPoolEndpoint, updatePoolEndpoint, deletePoolEndpoint, getApiPoolItems, getApiEndpointMetas, getPoolGroups, setPoolGroups

import { getData, setData, getAllDB, setDB, deleteDB, getNow, generateId } from './storage.js';

const DEFAULT_TIMEOUT = 60000;
const PAID_TIMEOUT = 10000;
const FREE_TIMEOUT = 60000;
const FREE_HINT_THRESHOLD = 60000;
const ANTHROPIC_VERSION = '2023-06-01';
const API_POOL_MIGRATED_KEY = 'app_api_pool_migrated';
const API_POOL_LAST_SUCCESS_KEY = 'app_api_pool_last_success';
const API_POOL_GROUPS_KEY = 'app_api_pool_groups';

const DEFAULT_GROUPS = {
  paid: { id: 'paid', name: '付费组', type: 'paid', enabled: true },
  free: { id: 'free', name: '免费组', type: 'free', enabled: true },
  // 感官分组底座：眼睛可配 endpoint（默认关，避免误调用），耳朵仅占位（禁止配 endpoint）
  // endpoints/models 仍存 IndexedDB api_pool（按 groupType 关联），分组对象只存元数据，不另建双份数据源
  sensory_eye: { id: 'sensory_eye', name: '感官-眼睛', type: 'sensory', enabled: false },
  sensory_ear: { id: 'sensory_ear', name: '感官-耳朵', type: 'sensory', enabled: false }
};

// 合法 groupType 白名单：normalizePoolItem 据此保留感官分组，不再强制归 paid/free
const VALID_GROUP_TYPES = ['paid', 'free', 'sensory_eye', 'sensory_ear'];

const MODEL_ALIAS_RULES = [
  { label: 'gpt-4o', keywords: ['gpt-4o', 'gpt4o'] },
  { label: 'gpt-4o-mini', keywords: ['gpt-4o-mini', 'gpt4o-mini'] },
  { label: 'gpt-oss-120b', keywords: ['gpt-oss-120b'] },
  { label: 'gpt-oss-20b', keywords: ['gpt-oss-20b'] },
  { label: 'claude-3.5-haiku', keywords: ['claude-3-5-haiku', 'claude-3.5-haiku'] },
  { label: 'claude-3.5-sonnet', keywords: ['claude-3-5-sonnet', 'claude-3.5-sonnet'] },
  { label: 'claude-3.7-sonnet', keywords: ['claude-3-7-sonnet', 'claude-3.7-sonnet'] },
  { label: 'gemini-2.5-flash', keywords: ['gemini-2.5-flash'] },
  { label: 'gemini-2.5-flash-lite', keywords: ['gemini-2.5-flash-lite'] },
  { label: 'gemini-2.5-pro', keywords: ['gemini-2.5-pro'] },
  { label: 'deepseek-v3', keywords: ['deepseek-v3', 'deepseek/chat', 'deepseek-chat'] },
  { label: 'deepseek-r1', keywords: ['deepseek-r1'] },
  { label: 'qwen3-32b', keywords: ['qwen3-32b', 'qwen/qwen3-32b'] },
  { label: 'qwen3.6-27b', keywords: ['qwen3.6-27b', 'qwen/qwen3.6-27b'] },
  { label: 'qwen3.5-397b', keywords: ['qwen3.5-397b', 'qwen/qwen3.5-397b-a17b'] },
  { label: 'llama-3.3-70b', keywords: ['llama-3.3-70b', 'meta-llama-3.3-70b-instruct', 'meta-llama/llama-3.3-70b-instruct'] },
  { label: 'mistral-small-3.1', keywords: ['mistral-small-3.1-24b', 'mistral-small-3.1-24b-instruct'] }
];

const ANONYMOUS_SOURCES = [
  {
    id: 'anon_llm7',
    name: 'LLM7',
    endpoint: 'https://api.llm7.io/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'deepseek-v3-0324', 'deepseek-r1-0528', 'gemini-2.5-flash-lite', 'qwen2.5-coder-32b', 'mistral-small-3.1-24b'],
    rateLimit: '30次/分钟',
    description: '免Key直连，30+模型'
  },
  {
    id: 'anon_ovhcloud',
    name: 'OVHcloud',
    endpoint: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    model: 'Qwen/Qwen3.5-397B-A17B',
    models: ['Qwen/Qwen3.5-397B-A17B', 'Meta-Llama-3_3-70B-Instruct', 'Qwen/Qwen3.6-27B', 'Qwen/Qwen3-32B', 'Mistral-Small-3.1-24B-Instruct'],
    rateLimit: '2次/分钟',
    description: '免Key直连，欧盟机房'
  }
];

// ═══════════════════════════════════════
// 【Toast 通知】
// ═══════════════════════════════════════

function notifyApiError(message) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('api:error', { detail: message }));
    }
  } catch (error) {
    console.warn(message, error);
  }
}

function notifyRetry(sourceName) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(`这个接口没接上，正在换 ${sourceName} 试试`);
    }
  } catch {}
}

function notifyApiInfo(msg) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(msg);
    }
  } catch {}
}

function notifyPoolHint(msg) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(msg);
    }
  } catch {}
}

// ═══════════════════════════════════════
// 【URL 处理】
// ═══════════════════════════════════════

export function normalizeEndpointUrl(endpoint) {
  // 去末尾斜杠，并去重末尾 /v1（避免 https://x.com/v1/v1 → /v1/v1/chat/completions）
  return String(endpoint || '').trim().replace(/\/+$/, '').replace(/\/v1\/v1$/i, '/v1');
}

function urlHasPathKeyword(url, keyword) {
  try {
    return new URL(url).pathname.toLowerCase().includes(keyword.toLowerCase());
  } catch {
    return url.toLowerCase().includes(keyword.toLowerCase());
  }
}

function urlHasV1(url) {
  // 精确匹配 path 末尾为 /v1 或 /v1/ 后还有段（如 /v1/chat），避免 /myv1path /v1chat 误判
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /(^|\/)v1(\/|$)/.test(path) || /\/v1$/.test(path);
  } catch {
    return /(^|\/)v1(\/|$)/.test(String(url || '').toLowerCase());
  }
}

export function smartChatUrl(base, provider) {
  if (provider === 'anthropic') {
    if (urlHasPathKeyword(base, '/messages')) return base;
    if (urlHasV1(base)) return base + '/messages';
    return base + '/v1/messages';
  }
  if (provider === 'ollama') {
    if (urlHasPathKeyword(base, '/api/chat')) return base;
    return base + '/api/chat';
  }
  if (urlHasPathKeyword(base, '/chat/completions')) return base;
  if (urlHasV1(base)) return base + '/chat/completions';
  return base + '/v1/chat/completions';
}

export function smartModelsUrl(base, provider) {
  if (provider === 'ollama') {
    if (urlHasPathKeyword(base, '/api/tags')) return base;
    return base + '/api/tags';
  }
  if (urlHasPathKeyword(base, '/models')) return base;
  if (urlHasV1(base)) return base + '/models';
  return base + '/v1/models';
}

// ═══════════════════════════════════════
// 【统一拉取模型列表】API 测试台与 API 池编辑器共用
//   用当前表单里的地址 + key + 鉴权方式真实请求模型列表
//   不写死模型/供应商/域名；key 只进请求头，不落地、不回传
//   成功返回去重后的模型名字符串数组；失败抛错（调用方决定提示）
// ═══════════════════════════════════════

export async function fetchModelList({ endpoint, apiKey, provider }) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('请先填接口地址');

  let url;
  if (provider === 'gemini') {
    url = base
      .replace(/\/v1beta\/models\/[^/]+:generateContent$/i, '/v1beta/models')
      .replace(/\/v1beta\/models\/[^/]+:streamGenerateContent$/i, '/v1beta/models')
      .replace(/\/v1beta\/?$/i, '/v1beta/models');
  } else {
    url = smartModelsUrl(base, provider);
  }

  const headers = buildHeaders(apiKey, provider);
  const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
  if (!res.ok) throw new Error(await parseErrorResponse(res));

  const data = await res.json().catch(() => null);
  let models;
  if (provider === 'ollama') {
    models = (data?.models || []).map((m) => m?.name).filter(Boolean);
  } else if (provider === 'gemini') {
    models = (data?.models || [])
      .map((m) => String(m?.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  } else {
    models = (data?.data || [])
      .map((m) => (typeof m === 'string' ? m : m?.id))
      .filter(Boolean);
  }
  return [...new Set(models)];
}

function smartGeminiUrl(base, model, apiKey, stream = false) {
  const cleanModel = String(model || '').trim();
  if (!cleanModel) throw new Error('请先选择模型');
  let origin = base.replace(/\/+$/, '');
  const fullPattern = stream
    ? /\/v1beta\/models\/[^/]+:streamGenerateContent/i
    : /\/v1beta\/models\/[^/]+:generateContent/i;
  if (fullPattern.test(origin)) {
    if (apiKey) {
      const url = new URL(origin);
      url.searchParams.set('key', apiKey);
      if (stream) url.searchParams.set('alt', 'sse');
      return url.toString();
    }
    return origin;
  }
  origin = origin.replace(/\/v1beta\/models\/?$/i, '').replace(/\/v1beta\/?$/i, '').replace(/\/+$/, '');
  const action = stream ? 'streamGenerateContent' : 'generateContent';
  const url = new URL(`${origin}/v1beta/models/${encodeURIComponent(cleanModel)}:${action}`);
  if (apiKey) url.searchParams.set('key', apiKey);
  if (stream) url.searchParams.set('alt', 'sse');
  return url.toString();
}

// ═══════════════════════════════════════
// 【配置读取】
// ═══════════════════════════════════════

function getSettings() {
  const settings = getData('app_settings') || {};
  const apiEndpoints = Array.isArray(settings.apiEndpoints) ? settings.apiEndpoints : [];
  return {
    defaultApiEndpointId: settings.defaultApiEndpointId || '',
    defaultModel: settings.defaultModel || '',
    ttsGlobal: settings.ttsGlobal || { provider: 'openai', apiKey: '', endpoint: '' },
    mcpServers: Array.isArray(settings.mcpServers) ? settings.mcpServers : [],
    bubbleMode: settings.bubbleMode === 'dialog' ? 'dialog' : 'bubble',
    fontSize: Number(settings.fontSize) || 15,
    user: settings.user || { name: '', avatar: '' },
    widgets: settings.widgets || { time: true, weather: true, anniversary: true },
    apiEndpoints
  };
}

function detectProvider(endpoint) {
  const raw = String(endpoint || '').toLowerCase();
  if (raw.includes('anthropic.com')) return 'anthropic';
  if (raw.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (raw.includes('localhost') || raw.includes('127.0.0.1')) return 'ollama';
  return 'openai';
}

function findEndpoint(endpointId = '') {
  const settings = getSettings();
  const targetId = endpointId || settings.defaultApiEndpointId;
  const endpoint = settings.apiEndpoints.find((item) => item.id === targetId) || settings.apiEndpoints[0] || null;
  if (!endpoint || !endpoint.endpoint) throw new Error('请先配置 API 端点');
  const normalizedEndpoint = normalizeEndpointUrl(endpoint.endpoint);
  if (!/^https?:\/\//i.test(normalizedEndpoint)) throw new Error('API 端点必须以 http 或 https 开头');
  const provider = (endpoint.provider || '').trim().toLowerCase() || detectProvider(normalizedEndpoint);
  return {
    id: endpoint.id || '',
    name: endpoint.name || '',
    endpoint: normalizedEndpoint,
    apiKey: endpoint.apiKey || '',
    provider,
    model: endpoint.model || settings.defaultModel || '',
    modelList: Array.isArray(endpoint.modelList) ? endpoint.modelList : [],
    source: endpoint.source || ''
  };
}

// ═══════════════════════════════════════
// 【轮换池底座】
// ═══════════════════════════════════════

export function getPoolGroups() {
  const saved = getData(API_POOL_GROUPS_KEY) || {};
  // 旧数据没有感官分组时自动补默认空结构；已有则保留用户配置
  return {
    paid: { ...DEFAULT_GROUPS.paid, ...(saved.paid || {}) },
    free: { ...DEFAULT_GROUPS.free, ...(saved.free || {}) },
    sensory_eye: { ...DEFAULT_GROUPS.sensory_eye, ...(saved.sensory_eye || {}) },
    sensory_ear: { ...DEFAULT_GROUPS.sensory_ear, ...(saved.sensory_ear || {}) }
  };
}

export function setPoolGroups(groups) {
  const current = getPoolGroups();
  // 保留未传入分组的当前状态，避免 toggle paid/free 时清掉感官配置
  const next = {
    paid: { ...DEFAULT_GROUPS.paid, ...current.paid, ...(groups?.paid || {}) },
    free: { ...DEFAULT_GROUPS.free, ...current.free, ...(groups?.free || {}) },
    sensory_eye: { ...DEFAULT_GROUPS.sensory_eye, ...current.sensory_eye, ...(groups?.sensory_eye || {}) },
    sensory_ear: { ...DEFAULT_GROUPS.sensory_ear, ...current.sensory_ear, ...(groups?.sensory_ear || {}) }
  };
  setData(API_POOL_GROUPS_KEY, next);
}

async function ensureApiPoolMigrated() {
  const migrated = getData(API_POOL_MIGRATED_KEY);
  if (migrated === true) return;
  const all = await getAllDB('api_pool').catch(() => []);
  if (Array.isArray(all) && all.length) {
    setData(API_POOL_MIGRATED_KEY, true);
    return;
  }
  const settings = getSettings();
  const oldEndpoints = Array.isArray(settings.apiEndpoints) ? settings.apiEndpoints : [];
  if (!oldEndpoints.length) {
    setData(API_POOL_MIGRATED_KEY, true);
    return;
  }
  const now = getNow();
  const groups = getPoolGroups();
  for (const item of oldEndpoints) {
    const source = item?.source || '';
    const groupType = source === 'free' || source === 'anonymous' ? 'free' : 'paid';
    const keyText = String(item.apiKey || '').trim();
    const keys = keyText ? [keyText] : [];
    await setDB('api_pool', {
      id: item.id || generateId('pool'),
      groupType,
      groupName: groups[groupType]?.name || (groupType === 'paid' ? '付费组' : '免费组'),
      name: item.name || '未命名接口',
      endpoint: normalizeEndpointUrl(item.endpoint || ''),
      provider: item.provider || detectProvider(item.endpoint || ''),
      keys,
      model: item.model || '',
      models: Array.isArray(item.modelList) ? [...new Set(item.modelList.filter(Boolean))] : [],
      source,
      status: 'active',
      lastSuccessAt: '',
      lastErrorAt: '',
      lastErrorMessage: '',
      lastLatencyMs: 0,
      createdAt: item.createdAt || now,
      updatedAt: now
    });
  }
  setData(API_POOL_MIGRATED_KEY, true);
}

export async function getApiPoolItems() {
  await ensureApiPoolMigrated();
  const list = await getAllDB('api_pool').catch(() => []);
  return Array.isArray(list) ? list.map(normalizePoolItem) : [];
}

// ═══════════════════════════════════════
// 【统一元信息入口】供角色编辑器等选择 UI 使用
//   只返回安全元信息（不含 key、不含 endpoint URL），统一以 api_pool 为唯一来源
//   调用方据此渲染下拉、判断 endpointId 是否仍可用
// ═══════════════════════════════════════

export async function getApiEndpointMetas() {
  const items = await getApiPoolItems();
  const groups = getPoolGroups();
  // 感官分组不暴露给角色编辑器的聊天接口选择，避免眼睛/耳朵 endpoint 混入聊天池选择列表
  return items
    .filter((item) => item.groupType !== 'sensory_eye' && item.groupType !== 'sensory_ear')
    .map((item) => ({
      id: item.id,
      name: item.name,
      groupType: item.groupType,
      groupName: item.groupName,
      provider: item.provider,
      model: item.model,
      models: Array.isArray(item.models) ? item.models : [],
      status: item.status,
      groupEnabled: groups[item.groupType]?.enabled !== false
    }));
}

function getPoolLastSuccess() {
  // 底座对称：为感官分组预留字段，本轮感官不参与请求，不会写入，仅保证结构完整
  const saved = getData(API_POOL_LAST_SUCCESS_KEY);
  return {
    paid: '',
    free: '',
    sensory_eye: '',
    sensory_ear: '',
    ...(saved && typeof saved === 'object' ? saved : {})
  };
}

function setPoolLastSuccess(groupType, id) {
  const current = getPoolLastSuccess();
  setData(API_POOL_LAST_SUCCESS_KEY, { ...current, [groupType]: id || '' });
}

function normalizePoolItem(item) {
  const endpoint = normalizeEndpointUrl(item?.endpoint || '');
  const provider = item?.provider || detectProvider(endpoint);
  const keys = Array.isArray(item?.keys)
    ? item.keys.map((k) => String(k || '').trim()).filter(Boolean)
    : String(item?.apiKey || '').trim() ? [String(item.apiKey).trim()] : [];
  // 保留感官 groupType（sensory_eye/sensory_ear），不再强制归 paid/free
  // 非法/缺失 groupType 回退到 paid（兼容旧数据：旧 normalizePoolItem 把非 free 都归 paid）
  const rawGroupType = String(item?.groupType || '').trim();
  const groupType = VALID_GROUP_TYPES.includes(rawGroupType) ? rawGroupType : 'paid';
  const groupName = String(item?.groupName || '').trim() || DEFAULT_GROUPS[groupType]?.name || '未分组';
  return {
    id: item?.id || generateId('pool'),
    groupType,
    groupName,
    name: String(item?.name || '').trim() || '未命名接口',
    endpoint,
    provider,
    keys,
    model: String(item?.model || '').trim(),
    models: Array.isArray(item?.models) ? [...new Set(item.models.map((m) => String(m || '').trim()).filter(Boolean))] : [],
    source: item?.source || '',
    status: item?.status || 'active',
    // 保留 requestFormat（眼睛分组保存时写入，供 ai-sensory-eye.js 判断请求格式）
    // 之前缺失会导致眼睛 endpoint 读取后丢失该字段，只能靠 baseURL 猜格式
    requestFormat: String(item?.requestFormat || '').trim(),
    lastSuccessAt: item?.lastSuccessAt || '',
    lastErrorAt: item?.lastErrorAt || '',
    lastErrorMessage: item?.lastErrorMessage || '',
    lastLatencyMs: Number(item?.lastLatencyMs || 0),
    createdAt: item?.createdAt || '',
    updatedAt: item?.updatedAt || ''
  };
}

function buildPoolCandidateSources(items, options = {}) {
  const { model = '', groupTypes = [] } = options;
  const lastSuccess = getPoolLastSuccess();
  const preferredId = lastSuccess[groupTypes[0]] || '';

  const sourceItems = normalizeGroupItems(items, groupTypes);

  const normalized = sourceItems
    .map(normalizePoolItem)
    .filter((item) => item.endpoint && item.status !== 'disabled')
    .flatMap((item) => {
      const keyList = item.groupType === 'free' ? [item.keys[0] || ''] : (item.keys.length ? item.keys : ['']);
      return keyList.map((key, index) => ({
        id: `${item.id}__${index}`,
        poolId: item.id,
        groupType: item.groupType,
        groupName: item.groupName,
        name: item.name,
        endpoint: item.endpoint,
        provider: item.provider,
        apiKey: key,
        model: model || item.model || '',
        models: item.models,
        source: item.source || '',
        sortBoost: item.id === preferredId ? 100 : 0,
        isAnonymous: item.source === 'anonymous',
        isUser: item.groupType === 'paid'
      }));
    });

  return normalized.sort((a, b) => b.sortBoost - a.sortBoost);
}

function normalizeGroupItems(items, groupTypes) {
  const list = Array.isArray(items) ? items : [];
  if (!Array.isArray(groupTypes) || !groupTypes.length) return list;

  const groups = getPoolGroups();
  const enabledTypes = ['paid', 'free'].filter((type) => groups[type]?.enabled !== false);

  return list.filter((item) => {
    if (groupTypes.includes(item?.groupType)) return true;
    if (groupTypes.includes('all')) return enabledTypes.includes(item?.groupType);
    return false;
  });
}

function normalizeModelAlias(modelName) {
  const raw = String(modelName || '').trim().toLowerCase();
  if (!raw) return '';
  const hit = MODEL_ALIAS_RULES.find((rule) => rule.keywords.some((keyword) => raw.includes(keyword)));
  return hit ? hit.label : raw;
}

export async function getMergedPoolModels() {
  const items = await getApiPoolItems();
  const map = new Map();
  // 感官分组的模型不混入聊天模型合并列表，避免眼睛/耳朵模型污染聊天模型选择器
  items
    .map(normalizePoolItem)
    .filter((item) => item.groupType === 'paid' || item.groupType === 'free')
    .forEach((item) => {
      const allModels = [...item.models, item.model].filter(Boolean);
      allModels.forEach((modelName) => {
        const key = normalizeModelAlias(modelName) || modelName;
        if (!map.has(key)) {
          map.set(key, { key, name: modelName, aliases: [modelName], sources: [item.id] });
          return;
        }
        const current = map.get(key);
        if (!current.aliases.includes(modelName)) current.aliases.push(modelName);
        if (!current.sources.includes(item.id)) current.sources.push(item.id);
      });
    });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function markPoolSourceSuccess(source, latencyMs) {
  if (!source?.poolId) return;
  const list = await getApiPoolItems();
  const target = list.find((item) => String(item.id) === String(source.poolId));
  if (!target) return;
  const now = getNow();
  await setDB('api_pool', {
    ...target,
    status: 'active',
    lastSuccessAt: now,
    lastErrorAt: target.lastErrorAt || '',
    lastErrorMessage: '',
    lastLatencyMs: Number(latencyMs || 0),
    updatedAt: now
  });
  setPoolLastSuccess(source.groupType || 'paid', source.poolId);
}

async function markPoolSourceError(source, message, latencyMs = 0) {
  if (!source?.poolId) return;
  const list = await getApiPoolItems();
  const target = list.find((item) => String(item.id) === String(source.poolId));
  if (!target) return;
  const now = getNow();
  await setDB('api_pool', {
    ...target,
    status: 'error',
    lastErrorAt: now,
    lastErrorMessage: String(message || '').trim(),
    lastLatencyMs: Number(latencyMs || 0),
    updatedAt: now
  });
}

// ═══════════════════════════════════════
// 【轮换池增删改查】
// ═══════════════════════════════════════

export async function addPoolEndpoint(data) {
  // 去重：同地址同供应商已存在则拒绝静默重复添加（调用方可据此提示用户）
  const existing = await getApiPoolItems();
  const dup = existing.find((item) => {
    if (item.id === data?.id) return false;
    return String(item.endpoint || '').trim().replace(/\/+$/, '')
      === String(data?.endpoint || '').trim().replace(/\/+$/, '')
      && String(item.provider || '') === String(data?.provider || '');
  });
  if (dup) {
    const err = new Error('该接口已在轮换池中');
    err.code = 'DUPLICATE';
    err.existingId = dup.id;
    throw err;
  }

  const normalized = normalizePoolItem({
    ...data,
    id: data?.id || generateId('pool'),
    createdAt: getNow(),
    updatedAt: getNow()
  });
  await setDB('api_pool', normalized);
  return normalized;
}

export async function updatePoolEndpoint(id, data) {
  const items = await getApiPoolItems();
  const target = items.find((item) => String(item.id) === String(id));
  if (!target) return null;
  const updated = normalizePoolItem({ ...target, ...data, id, updatedAt: getNow() });
  await setDB('api_pool', updated);
  return updated;
}

export async function deletePoolEndpoint(id) {
  await deleteDB('api_pool', id);
  return true;
}

// ═══════════════════════════════════════
// 【Fallback 源管理】
// ═══════════════════════════════════════

export function getFallbackSources() {
  const settings = getSettings();
  const freeEndpoints = settings.apiEndpoints.filter((api) => api.source === 'free' && api.apiKey);
  const sources = [];
  freeEndpoints.forEach((ep) => {
    sources.push({
      id: ep.id, name: ep.name || '免费API', endpoint: ep.endpoint, model: ep.model,
      apiKey: ep.apiKey, provider: ep.provider || detectProvider(ep.endpoint),
      isUser: false, isAnonymous: false
    });
  });
  ANONYMOUS_SOURCES.forEach((anon) => {
    sources.push({
      id: anon.id, name: anon.name, endpoint: anon.endpoint, model: anon.model,
      apiKey: '', provider: 'openai', isUser: false, isAnonymous: true
    });
  });
  return sources;
}

function getAvailableSources(endpointId = '') {
  const sources = [];
  try {
    const ep = findEndpoint(endpointId);
    sources.push({
      id: ep.id, name: ep.name || '我的API', endpoint: ep.endpoint,
      apiKey: ep.apiKey, model: ep.model, provider: ep.provider,
      isUser: true, isAnonymous: false
    });
  } catch {}
  const settings = getSettings();
  const usedIds = new Set(sources.map((s) => s.id));
  settings.apiEndpoints
    .filter((api) => api.source === 'free' && api.apiKey && !usedIds.has(api.id))
    .forEach((ep) => {
      usedIds.add(ep.id);
      sources.push({
        id: ep.id, name: ep.name || '免费API', endpoint: ep.endpoint,
        apiKey: ep.apiKey, model: ep.model, provider: ep.provider || detectProvider(ep.endpoint),
        isUser: false, isAnonymous: false
      });
    });
  ANONYMOUS_SOURCES
    .filter((anon) => !usedIds.has(anon.id))
    .forEach((anon) => {
      sources.push({
        id: anon.id, name: anon.name, endpoint: anon.endpoint,
        apiKey: '', model: anon.model, provider: 'openai',
        isUser: false, isAnonymous: true
      });
    });
  return sources;
}

// ═══════════════════════════════════════
// 【统一数据源解析】silentRequest / streamMessage 与 callAPI 共用同一入口
//   优先走新轮换池（IndexedDB api_pool + app_api_pool_groups）
//   池空时回退旧 app_settings.apiEndpoints（保留兼容，不删旧逻辑）
// ═══════════════════════════════════════

async function resolveApiSources({ endpointId = '', model = '', groupTypes = ['paid', 'free'] } = {}) {
  await ensureApiPoolMigrated();
  const poolItems = await getApiPoolItems();
  // effectiveModel：失效回退到全局时清空，让全局各 source 用自己的默认模型，不串用原模型
  let effectiveModel = model;

  // 1. 若指定 endpointId，先在 pool 里精确命中（角色级 endpointId / dream / memory 场景）
  //    失效语义与 callAPI 一致：endpoint 删除/停用、模式3固定模型已不属于该 endpoint → 回退全局
  if (endpointId) {
    const matched = poolItems.find((item) => String(item.id) === String(endpointId));
    if (matched) {
      // 直接保留 matched.groupType：旧数据只有 paid/free 行为不变，未来感官 endpointId 也能正确命中
      const matchedGroupType = matched.groupType;
      const hasModelList = Array.isArray(matched.models) && matched.models.length > 0;
      const modelInvalid = effectiveModel
        && hasModelList
        && !matched.models.includes(effectiveModel)
        && matched.model !== effectiveModel;
      if (!modelInvalid) {
        const sources = buildPoolCandidateSources([matched], { model: effectiveModel, groupTypes: [matchedGroupType] });
        if (sources.length) return { sources, fromPool: true };
      }
      // 模型失效或 endpoint 无可用 source：回退全局，清空原模型
      effectiveModel = '';
    } else {
      // endpoint 未命中池（被删除）：回退全局，清空原模型
      effectiveModel = '';
    }
  }

  // 2. 否则按 groupTypes 走池（默认 paid+free，行为与 callAPI 一致）
  //    精确匹配 groupType，避免感官 endpoint（sensory_eye/sensory_ear）混入聊天 paid 池
  const groups = getPoolGroups();
  const paidEnabled = groups.paid?.enabled !== false;
  const freeEnabled = groups.free?.enabled !== false;
  const paidWanted = groupTypes.includes('paid') || groupTypes.includes('all');
  const freeWanted = groupTypes.includes('free') || groupTypes.includes('all');

  const paidItems = paidWanted && paidEnabled ? poolItems.filter((item) => item.groupType === 'paid') : [];
  const freeItems = freeWanted && freeEnabled ? poolItems.filter((item) => item.groupType === 'free') : [];

  const paidSources = buildPoolCandidateSources(paidItems, { model: effectiveModel, groupTypes: ['paid'] });
  const freeSources = buildPoolCandidateSources(freeItems, { model: effectiveModel, groupTypes: ['free'] });

  const poolSources = [...paidSources, ...freeSources];
  if (poolSources.length) return { sources: poolSources, fromPool: true };

  // 3. 池空 → 回退旧 apiEndpoints（保留兼容）
  return { sources: getAvailableSources(endpointId), fromPool: false };
}

// ═══════════════════════════════════════
// 【错误分类】
// ═══════════════════════════════════════

function getStatusFromError(error) {
  if (typeof error?.status === 'number') return error.status;
  const message = String(error?.message || '');
  const statusMatch = message.match(/HTTP\s*(\d+)/i);
  if (statusMatch) return Number(statusMatch[1]);
  if (error?.name === 'AbortError') return 408;
  if (error?.isNetworkError) return 0;
  return 0;
}

function isBrowserBlockedError(error) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return error.name === 'TypeError'
    || message.includes('failed to fetch')
    || message.includes('load failed')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('cors');
}

function createNetworkError(error, source) {
  const message = source?.isUser
    ? '这个中转站被浏览器拦住啦，可能没开放跨域访问（CORS）。换支持网页直连的中转站会更稳。'
    : '网络没牵上小手，连接失败啦';
  const next = new Error(message);
  next.name = error?.name || 'NetworkError';
  next.cause = error;
  next.status = 0;
  next.isNetworkError = true;
  next.sourceName = source?.name || '';
  return next;
}

function shouldStopOnUserError(status, source) {
  if (!source?.isUser) return false;
  if (status === 0) return true;
  if (status === 400) return true;
  if (status === 401) return true;
  if (status === 403) return true;
  if (status === 404) return true;
  return false;
}

function isRetryableError(status, hasKey, source) {
  if (shouldStopOnUserError(status, source)) return false;
  if (status === 0) return true;
  if (status === 408) return true;
  if (status === 429 || status === 503) return true;
  if (status >= 500) return true;
  if ((status === 401 || status === 403) && !hasKey) return true;
  return false;
}

// ═══════════════════════════════════════
// 【重试引擎】
// ═══════════════════════════════════════

async function tryWithFallback({ sources, buildFn, onSwitch, onReset }) {
  if (!sources.length) throw new Error('没有可用的 API 接口');
  let lastError = null;
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    try {
      return await buildFn(source);
    } catch (error) {
      const normalizedError = isBrowserBlockedError(error) ? createNetworkError(error, source) : error;
      const status = getStatusFromError(normalizedError);
      const hasKey = Boolean(source.apiKey);
      lastError = normalizedError;
      if (i < sources.length - 1 && isRetryableError(status, hasKey, source)) {
        onReset?.();
        const nextSource = sources[i + 1];
        onSwitch?.(nextSource?.name || '备用接口');
        continue;
      }
      throw normalizedError;
    }
  }
  throw lastError || new Error('所有 API 接口都不可用');
}

// ═══════════════════════════════════════
// 【超时控制】
// ═══════════════════════════════════════

function createTimeoutController(timeout = DEFAULT_TIMEOUT, externalSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(timeout) || DEFAULT_TIMEOUT);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  return { controller, timer };
}

// ═══════════════════════════════════════
// 【请求构建】
// ═══════════════════════════════════════

export function buildHeaders(apiKey, provider = 'openai') {
  const headers = { 'Content-Type': 'application/json' };
  if (provider === 'anthropic') {
    if (apiKey) headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = ANTHROPIC_VERSION;
    return headers;
  }
  if (provider !== 'ollama' && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const role = ['system', 'user', 'assistant'].includes(message.role) ? message.role : 'user';
  const content = typeof message.content === 'string' ? message.content : '';
  if (!content.trim()) return null;
  return { role, content };
}

function buildMessages(messages = [], systemPrompt = '') {
  const normalizedMessages = Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [];
  if (!systemPrompt || !String(systemPrompt).trim()) return normalizedMessages;
  return [{ role: 'system', content: String(systemPrompt) }, ...normalizedMessages];
}

function buildOpenAIRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
  const body = { model, messages: buildMessages(messages, systemPrompt), stream };
  if (typeof temperature === 'number' && Number.isFinite(temperature)) body.temperature = temperature;
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = maxTokens;
  return body;
}

function buildAnthropicMessages(messages = [], systemPrompt = '') {
  const normalized = Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [];
  return {
    system: String(systemPrompt || '').trim(),
    messages: normalized
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: [{ type: 'text', text: m.content }] }))
  };
}

function buildAnthropicRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
  const { system, messages: anthropicMessages } = buildAnthropicMessages(messages, systemPrompt);
  const body = { model, messages: anthropicMessages, stream };
  if (system) body.system = system;
  if (typeof temperature === 'number' && Number.isFinite(temperature)) body.temperature = temperature;
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = maxTokens;
  return body;
}

function toGeminiParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return { text: item };
      if (!item || typeof item !== 'object') return null;
      return item.text ? { text: item.text } : null;
    }).filter(Boolean);
  }
  if (content && typeof content === 'object' && content.text) return [{ text: content.text }];
  return [];
}

function buildGeminiContents(messages = [], systemPrompt = '') {
  const normalized = Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [];
  const contents = normalized
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: toGeminiParts(m.content) }))
    .filter((m) => m.parts.length);
  return {
    systemInstruction: systemPrompt ? { parts: [{ text: String(systemPrompt) }] } : undefined,
    contents
  };
}

function buildGeminiRequestBody({ messages, systemPrompt, temperature, maxTokens }) {
  const { systemInstruction, contents } = buildGeminiContents(messages, systemPrompt);
  const body = { contents, generationConfig: {} };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (typeof temperature === 'number' && Number.isFinite(temperature)) body.generationConfig.temperature = temperature;
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) body.generationConfig.maxOutputTokens = maxTokens;
  return body;
}

function buildOllamaRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
  const body = { model, messages: buildMessages(messages, systemPrompt), stream };
  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    body.options = { ...(body.options || {}), temperature };
  }
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    body.options = { ...(body.options || {}), num_predict: maxTokens };
  }
  return body;
}

function buildRequestContext({ endpointConfig, model, systemPrompt, messages, stream, temperature, maxTokens }) {
  const provider = endpointConfig.provider || 'openai';
  const requestModel = model || endpointConfig.model;
  const base = endpointConfig.endpoint;
  if (provider !== 'gemini' && !requestModel) throw new Error('请先选择模型');
  if (provider === 'openai') {
    return { provider, url: smartChatUrl(base, 'openai'), headers: buildHeaders(endpointConfig.apiKey, provider), body: buildOpenAIRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens }) };
  }
  if (provider === 'anthropic') {
    return { provider, url: smartChatUrl(base, 'anthropic'), headers: buildHeaders(endpointConfig.apiKey, provider), body: buildAnthropicRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens }) };
  }
  if (provider === 'gemini') {
    return { provider, url: smartGeminiUrl(base, requestModel, endpointConfig.apiKey, stream), headers: buildHeaders('', provider), body: buildGeminiRequestBody({ messages, systemPrompt, temperature, maxTokens }) };
  }
  if (provider === 'ollama') {
    return { provider, url: smartChatUrl(base, 'ollama'), headers: buildHeaders('', provider), body: buildOllamaRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens }) };
  }
  return { provider: 'openai', url: smartChatUrl(base, 'openai'), headers: buildHeaders(endpointConfig.apiKey, 'openai'), body: buildOpenAIRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens }) };
}

// ═══════════════════════════════════════
// 【错误处理】
// ═══════════════════════════════════════

function getErrorMessage(status) {
  if (status === 400) return '请求格式不对，模型名或消息内容可能不合适';
  if (status === 401) return '密钥不对或过期啦';
  if (status === 402) return '额度不够啦，需要看看账户余额';
  if (status === 403) return '这个密钥没有访问权限';
  if (status === 404) return '接口地址或模型名没找到';
  if (status === 408) return '等太久啦，连接超时了';
  if (status === 429) return '请求太密啦，先歇一小会儿';
  if (status === 500) return '服务器炸咯，晚点再戳它';
  if (status === 502) return '中转站打了个喷嚏，暂时接不上';
  if (status === 503) return '服务正在忙，稍后再试试';
  if (status === 504) return '中转站等太久啦，超时了';
  if (status >= 500) return 'AI 服务暂时不可用';
  if (status >= 400) return '请求失败啦，请检查 API 配置';
  return '网络连接失败';
}

export async function parseErrorResponse(response) {
  try {
    const data = await response.json();
    const detail = data?.error?.message || data?.message || data?.error || '';
    const base = getErrorMessage(response.status);
    return detail ? `HTTP ${response.status}｜${base}：${detail}` : `HTTP ${response.status}｜${base}`;
  } catch {
    return `HTTP ${response.status}｜${getErrorMessage(response.status)}`;
  }
}

async function buildHttpError(response) {
  const message = await parseErrorResponse(response);
  const error = new Error(message);
  error.status = response.status;
  error.statusText = response.statusText || '';
  error.isHttpError = true;
  return error;
}

function cleanApiErrorMessage(message) {
  const raw = String(message || '').trim();
  if (!raw) return '';
  return raw.replace(/^HTTP\s*\d+\s*[｜|]\s*/i, '').replace(/^Error:\s*/i, '').trim();
}

function normalizeApiError(error, fallbackMessage) {
  if (error?.name === 'AbortError') return '等太久啦，连接超时了';
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return '网络断开啦，先检查一下连接';
  if (error?.isNetworkError) return error.message;
  if (isBrowserBlockedError(error)) return '这个中转站被浏览器拦住啦，可能没开放跨域访问（CORS）';
  const message = cleanApiErrorMessage(error?.message);
  return message || fallbackMessage;
}

// ═══════════════════════════════════════
// 【响应解析】
// ═══════════════════════════════════════

function extractThinkingFromText(text) {
  if (!text) return { content: '', thinking: '' };
  let thinking = '';
  // 修复问题 B：thinking 内部连续拼接，不用 \n
  // reasoning_content 是逐 token 流式，每个 token 之间插 \n 会导致抽屉竖排
  const content = String(text).replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (match, innerText) => {
    const clean = String(innerText || '').trim();
    if (clean) thinking += clean;
    return '';
  });
  return { content, thinking };
}

function readContentValue(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return '';
      return item.text || item.content || item.value || '';
    }).filter(Boolean).join('\n');
  }
  if (value && typeof value === 'object') return value.text || value.content || value.value || '';
  return '';
}

function extractContentFromData(data) {
  const choice = data?.choices?.[0] || {};
  const delta = choice.delta || {};
  const message = choice.message || {};
  const output = data?.output?.[0] || {};
  const outputContent = output?.content?.[0] || {};
  const candidate = data?.candidates?.[0] || {};
  const candidateParts = candidate?.content?.parts || [];
  const geminiText = candidateParts.map((p) => p?.text || '').filter(Boolean).join('');
  const text = [
    readContentValue(delta.content), readContentValue(message.content), readContentValue(choice.text),
    readContentValue(data.content), readContentValue(data.message), readContentValue(data.response),
    readContentValue(data.reply), readContentValue(outputContent.text), readContentValue(outputContent.content), geminiText
  ].filter(Boolean).join('');
  const reasoning = [
    delta.reasoning_content, delta.reasoning, delta.thinking,
    message.reasoning_content, message.reasoning, message.thinking,
    choice.reasoning_content, choice.reasoning,
    data.reasoning_content, data.reasoning, data.thinking,
    candidate?.reasoning, candidate?.reasoningContent,
    data?.candidates?.[0]?.content?.thought || ''
  ].filter(Boolean).join('');
  const extracted = extractThinkingFromText(text);
  return {
    done: data === '[DONE]' || Boolean(choice.finish_reason) || Boolean(candidate.finishReason),
    content: extracted.content,
    // 修复问题 B：reasoning 与 extracted.thinking 连续拼接，不用 \n
    thinking: [reasoning, extracted.thinking].filter(Boolean).join(''),
    finishReason: choice.finish_reason || candidate.finishReason || '',
    raw: data
  };
}

function parseStreamPayload(payload) {
  if (!payload || payload === '[DONE]') {
    return { done: payload === '[DONE]', content: '', thinking: '', finishReason: '', raw: null };
  }
  try {
    const parsed = JSON.parse(payload);
    if (parsed?.error) return { done: true, content: '', thinking: '', finishReason: '', raw: parsed };
    return extractContentFromData(parsed);
  } catch {
    return { done: false, content: '', thinking: '', finishReason: '', raw: null };
  }
}

function appendValue(base, value) {
  if (!value) return base;
  return base ? `${base}\n${value}` : value;
}

async function readStream(response, callbacks) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullContent = '';
  let fullThinking = '';
  let completed = false;

  const safeOnChunk = (data) => {
    if (typeof callbacks.onChunk !== 'function') return;
    try {
      callbacks.onChunk(data);
    } catch (error) {
      // onChunk 抛错时不能让读取循环无控继续跑，标记完成并抛出终止循环
      completed = true;
      throw error;
    }
  };

  try {
    while (!completed) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const eventBlocks = buffer.split('\n\n');
      buffer = eventBlocks.pop() || '';
      for (const event of eventBlocks) {
        const dataLines = event.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('data:')).map((l) => l.replace(/^data:\s*/, ''));
        if (!dataLines.length) continue;
        const chunk = parseStreamPayload(dataLines.join('\n'));
        fullContent += chunk.content || '';
        // 修复问题 B：thinking 连续拼接，不用 appendValue（它会在每个 chunk 间插 \n）
        // reasoning_content 逐 token 流式，token 间 \n 会导致抽屉竖排
        // 模型原文自带的换行已在 chunk.thinking 内，直接 += 保留
        if (chunk.thinking) fullThinking += chunk.thinking;
        if (chunk.content || chunk.thinking) safeOnChunk({ content: chunk.content, thinking: chunk.thinking, raw: chunk.raw, done: false });
        if (chunk.done) { completed = true; break; }
      }
    }
    if (buffer.trim()) {
      const dataLines = buffer.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('data:')).map((l) => l.replace(/^data:\s*/, ''));
      if (dataLines.length) {
        const chunk = parseStreamPayload(dataLines.join('\n'));
        fullContent += chunk.content || '';
        if (chunk.thinking) fullThinking += chunk.thinking;
        if (chunk.content || chunk.thinking) safeOnChunk({ content: chunk.content, thinking: chunk.thinking, raw: chunk.raw, done: false });
      }
    }
    if (!fullContent && buffer.trim()) {
      // 流结束但未收到标准 SSE 内容，尝试整体 JSON 解析；解析失败给最小排查日志（不刷屏：仅此一处）
      try {
        const parsed = JSON.parse(buffer.trim());
        const extracted = extractContentFromData(parsed);
        if (extracted.content) { fullContent = extracted.content; if (extracted.thinking) fullThinking += extracted.thinking; }
      } catch (error) {
        console.warn('[api] readStream: buffer 末尾 JSON.parse 失败（可能是半包或非标准响应）', String(buffer).slice(0, 120));
      }
    }
    callbacks.onDone?.({ content: fullContent, thinking: fullThinking });
  } catch (error) {
    // reader.read() 抛错或 onChunk 抛错：cancel reader 释放流，避免悬挂读取状态
    try { await reader.cancel(); } catch (_) {}
    throw error;
  }
}

function parseJsonFromText(text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;
  try { return JSON.parse(cleanText); } catch {}
  const match = cleanText.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function normalizeResponsePayload(data, provider) {
  if (provider === 'gemini') {
    const candidate = (Array.isArray(data?.candidates) ? data.candidates : [])[0] || {};
    const text = (candidate?.content?.parts || []).map((p) => p?.text || '').filter(Boolean).join('');
    return extractThinkingFromText(text);
  }
  if (provider === 'ollama') return extractThinkingFromText(data?.message?.content || data?.response || '');
  if (provider === 'anthropic') {
    const raw = data?.content;
    const text = raw ? (Array.isArray(raw) ? raw.map((i) => i?.text || '').filter(Boolean).join('') : String(raw)) : '';
    return extractThinkingFromText(text);
  }
  const extracted = extractContentFromData(data);
  return { content: extracted.content, thinking: extracted.thinking };
}

async function readJsonResponse(response, provider) {
  return normalizeResponsePayload(await response.json(), provider);
}

async function readTextResponse(response, provider) {
  const text = await response.text();
  const parsed = parseJsonFromText(text);
  if (parsed) return normalizeResponsePayload(parsed, provider);
  if (provider === 'gemini') return normalizeResponsePayload({ candidates: [{ content: { parts: [{ text }] } }] }, provider);
  if (provider === 'ollama') return normalizeResponsePayload({ message: { content: text } }, provider);
  if (provider === 'anthropic') return normalizeResponsePayload({ content: [{ text }] }, provider);
  return normalizeResponsePayload({ content: text }, provider);
}

// ═══════════════════════════════════════
// 【统一调用入口】轮换池 callAPI（支持 groupTypes 过滤）
// ═══════════════════════════════════════

async function requestOnce({ source, messages = [], systemPrompt = '', model = '', stream = false, timeout = DEFAULT_TIMEOUT, temperature, maxTokens, onChunk, signal }) {
  const startedAt = Date.now();
  const { controller, timer } = createTimeoutController(timeout, signal);
  try {
    const provider = source.provider || detectProvider(source.endpoint);
    const requestContext = buildRequestContext({
      endpointConfig: { ...source, provider },
      model: model || source.model, systemPrompt, messages, stream, temperature, maxTokens
    });
    const hasMessages = requestContext.provider === 'gemini'
      ? Array.isArray(requestContext.body.contents) && requestContext.body.contents.length > 0
      : Array.isArray(requestContext.body.messages) && requestContext.body.messages.length > 0;
    if (!hasMessages) throw new Error('请求内容不能为空');
    const response = await fetch(requestContext.url, {
      method: 'POST', headers: requestContext.headers, signal: controller.signal, body: JSON.stringify(requestContext.body)
    });
    if (!response.ok) throw await buildHttpError(response);
    if (stream) {
      if (!response.body) {
        const fallback = await readTextResponse(response, requestContext.provider);
        return { content: fallback.content, thinking: fallback.thinking, latencyMs: Date.now() - startedAt };
      }
      const result = await new Promise((resolve, reject) => {
        readStream(response, {
          onChunk,
          onDone: ({ content, thinking }) => resolve({ content, thinking })
        }).catch(reject);
      });
      return { ...result, latencyMs: Date.now() - startedAt };
    }
    const { content, thinking } = response.body
      ? await readJsonResponse(response, requestContext.provider)
      : await readTextResponse(response, requestContext.provider);
    return { content: String(content || '').trim(), thinking: String(thinking || '').trim(), latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════
// 【测试注入点】仅供本地单测覆盖内部函数，生产环境为 null 不生效
// ═══════════════════════════════════════

export const __testHooks = {
  requestOnce: null,
  getApiPoolItems: null,
  markPoolSourceSuccess: null,
  markPoolSourceError: null
};

export async function callAPI({
  messages = [], systemPrompt = '', model = '', stream = false, timeout,
  temperature, maxTokens, onChunk, onDone, onError, signal,
  groupTypes = [], endpointId = ''
} = {}) {
  const _requestOnce = __testHooks.requestOnce || requestOnce;
  const _getApiPoolItems = __testHooks.getApiPoolItems || getApiPoolItems;
  const _markPoolSourceSuccess = __testHooks.markPoolSourceSuccess || markPoolSourceSuccess;
  const _markPoolSourceError = __testHooks.markPoolSourceError || markPoolSourceError;

  await ensureApiPoolMigrated();
  const poolItems = await _getApiPoolItems();
  const groups = getPoolGroups();

  // effectiveModel：失效回退到全局时清空，让全局各 source 用自己的默认模型，不串用原模型
  let effectiveModel = model;

  // 角色级 endpointId：优先精确命中指定端点（用户明确选择）
  // 重试规则与下方 paidSources 循环一致：多 key 依次尝试，可重试错误才换下一个 key
  // 失效语义（按用户指令）：
  //   - endpoint 被删除（未命中池）→ 回退全局轮换池
  //   - endpoint 被停用（命中但无可用 source）→ 回退全局轮换池
  //   - 模式3固定模型已不属于该 endpoint（models 列表已知且不含该模型）→ 回退全局轮换池
  //   - endpoint 命中且有可用 source，仅运行时请求失败（网络/5xx 等）→ 不回退，只报一次错
  // 回退时清空 effectiveModel，避免把原 endpoint 的模型串用到全局其他接口上
  if (endpointId) {
    const matched = poolItems.find((item) => String(item.id) === String(endpointId));
    if (matched) {
      const matchedGroupType = matched.groupType === 'free' ? 'free' : 'paid';
      // 模式3失效检测：endpoint 已知 models 列表（非空）且不含用户固定的模型，也不是默认模型
      const hasModelList = Array.isArray(matched.models) && matched.models.length > 0;
      const modelInvalid = effectiveModel
        && hasModelList
        && !matched.models.includes(effectiveModel)
        && matched.model !== effectiveModel;
      if (!modelInvalid) {
        const epSources = buildPoolCandidateSources([matched], { model: effectiveModel, groupTypes: [matchedGroupType] });
        if (epSources.length) {
          const epDefaultTimeout = matchedGroupType === 'free' ? FREE_TIMEOUT : PAID_TIMEOUT;
          let epLastError = null;
          for (const source of epSources) {
            if (signal?.aborted) { onError?.({ message: '已取消', status: 408 }); return null; }
            try {
              const result = await _requestOnce({
                source, messages, systemPrompt, model: effectiveModel || source.model, stream,
                timeout: timeout || epDefaultTimeout, temperature, maxTokens, onChunk, signal
              });
              await _markPoolSourceSuccess(source, result.latencyMs || 0);
              onDone?.(result);
              return result;
            } catch (error) {
              if (signal?.aborted) { onError?.({ message: '已取消', status: 408 }); return null; }
              const normalizedError = isBrowserBlockedError(error) ? createNetworkError(error, source) : error;
              const status = getStatusFromError(normalizedError);
              await _markPoolSourceError(source, normalizedError.message || String(error?.message || ''), 0);
              epLastError = normalizedError;
              const hasMore = epSources.indexOf(source) < epSources.length - 1;
              if (hasMore && isRetryableError(status, Boolean(source.apiKey), source)) {
                const nextSource = epSources[epSources.indexOf(source) + 1];
                if (source.isUser) notifyRetry(nextSource?.name || '备用接口');
                continue;
              }
              break;
            }
          }
          // 全部 key 失败或遇到不可重试错误：用户明确选了这个 endpoint，运行时失败不静默回退其他端点
          onError?.(epLastError || { message: '指定接口没接上', status: 0 });
          return null;
        }
        // endpoint 命中但无可用 source（disabled / 无 key）：接口已停用，回退全局
      }
      // 模型失效或 endpoint 无可用 source：回退全局，清空原模型，不串用到其他接口
      effectiveModel = '';
    } else {
      // endpoint 未命中池（被删除）：回退全局，清空原模型
      effectiveModel = '';
    }
  }

  const effectiveGroupTypes = Array.isArray(groupTypes) && groupTypes.length
    ? groupTypes
    : ['paid', 'free'];

  const paidEnabled = groups.paid?.enabled !== false;
  const freeEnabled = groups.free?.enabled !== false;

  const paidWanted = effectiveGroupTypes.includes('paid') || effectiveGroupTypes.includes('all');
  const freeWanted = effectiveGroupTypes.includes('free') || effectiveGroupTypes.includes('all');

  const paidItems = paidWanted && paidEnabled ? poolItems.filter((item) => item.groupType !== 'free') : [];
  const freeItems = freeWanted && freeEnabled ? poolItems.filter((item) => item.groupType === 'free') : [];

  const paidSources = buildPoolCandidateSources(paidItems, { model: effectiveModel, groupTypes: ['paid'] });
  const freeSources = buildPoolCandidateSources(freeItems, { model: effectiveModel, groupTypes: ['free'] });

  if (!paidSources.length && !freeSources.length) {
    return await callLegacyFallback({
      messages, systemPrompt, model: effectiveModel, stream, timeout, temperature, maxTokens, onChunk, onDone, onError, signal
    });
  }

  const callStartedAt = Date.now();

  for (const source of paidSources) {
    if (signal?.aborted) { onError?.({ message: '已取消', status: 408 }); return null; }
    try {
      const result = await _requestOnce({
        source, messages, systemPrompt, model: effectiveModel || source.model, stream,
        timeout: timeout || PAID_TIMEOUT, temperature, maxTokens, onChunk, signal
      });
      await _markPoolSourceSuccess(source, result.latencyMs || 0);
      onDone?.(result);
      return result;
    } catch (error) {
      if (signal?.aborted) { onError?.({ message: '已取消', status: 408 }); return null; }
      const normalizedError = isBrowserBlockedError(error) ? createNetworkError(error, source) : error;
      const status = getStatusFromError(normalizedError);
      await _markPoolSourceError(source, normalizedError.message || String(error?.message || ''), 0);
      const hasMorePaid = paidSources.indexOf(source) < paidSources.length - 1;
      if (hasMorePaid && isRetryableError(status, Boolean(source.apiKey), source)) {
        const nextSource = paidSources[paidSources.indexOf(source) + 1];
        if (source.isUser) notifyRetry(nextSource?.name || '备用接口');
        continue;
      }
      break;
    }
  }

  if (freeSources.length) {
    const source = freeSources[0];
    if (signal?.aborted) { onError?.({ message: '已取消', status: 408 }); return null; }
    try {
      const result = await _requestOnce({
        source, messages, systemPrompt, model: effectiveModel || source.model, stream,
        timeout: timeout || FREE_TIMEOUT, temperature, maxTokens, onChunk, signal
      });
      await _markPoolSourceSuccess(source, result.latencyMs || 0);
      onDone?.(result);
      return result;
    } catch (error) {
      if (signal?.aborted) { onError?.({ message: '已取消', status: 408 }); return null; }
      await _markPoolSourceError(source, String(error?.message || ''), 0);
      const elapsed = Date.now() - callStartedAt;
      if (elapsed >= FREE_HINT_THRESHOLD) notifyPoolHint('免费接口等了好久都没回应，建议换个模型试试');
      onError?.({ message: '免费接口暂时没接上', raw: error, status: getStatusFromError(error) });
      return null;
    }
  }

  const message = '所有接口都没接上，稍后再试试';
  notifyPoolHint(message);
  onError?.({ message, status: 0 });
  return null;
}

async function callLegacyFallback({
  messages, systemPrompt, model, stream, timeout, temperature, maxTokens, onChunk, onDone, onError, signal
}) {
  const sources = getAvailableSources('');
  if (!sources.length) {
    const message = '还没有配置 API 接口，先去设置里加一个吧';
    notifyPoolHint(message);
    onError?.({ message, status: 0 });
    return null;
  }

  try {
    const result = await tryWithFallback({
      sources,
      onSwitch: notifyRetry,
      onReset: null,
      buildFn: async (source) => {
        const provider = source.provider || detectProvider(source.endpoint);
        const requestContext = buildRequestContext({
          endpointConfig: { ...source, provider },
          model: model || source.model, systemPrompt, messages, stream, temperature, maxTokens
        });
        const hasMessages = requestContext.provider === 'gemini'
          ? Array.isArray(requestContext.body.contents) && requestContext.body.contents.length > 0
          : Array.isArray(requestContext.body.messages) && requestContext.body.messages.length > 0;
        if (!hasMessages) throw new Error('请求内容不能为空');
        const { controller, timer } = createTimeoutController(timeout || DEFAULT_TIMEOUT, signal);
        try {
          const response = await fetch(requestContext.url, {
            method: 'POST', headers: requestContext.headers, signal: controller.signal, body: JSON.stringify(requestContext.body)
          });
          if (!response.ok) throw await buildHttpError(response);
          if (stream) {
            if (!response.body) {
              const fallback = await readTextResponse(response, requestContext.provider);
              return { content: fallback.content, thinking: fallback.thinking };
            }
            return await new Promise((resolve, reject) => {
              readStream(response, {
                onChunk,
                onDone: ({ content, thinking }) => resolve({ content, thinking })
              }).catch(reject);
            });
          }
          const { content, thinking } = response.body
            ? await readJsonResponse(response, requestContext.provider)
            : await readTextResponse(response, requestContext.provider);
          return { content: String(content || '').trim(), thinking: String(thinking || '').trim() };
        } finally {
          clearTimeout(timer);
        }
      }
    });
    onDone?.(result);
    return result;
  } catch (error) {
    const message = normalizeApiError(error, 'AI 请求失败啦');
    notifyPoolHint(message);
    onError?.({ message, raw: error, status: getStatusFromError(error) });
    return null;
  }
}

// ═══════════════════════════════════════
// 【导出 API】带 Fallback 的三大接口
// ═══════════════════════════════════════

export async function streamMessage({
  messages = [], systemPrompt = '', endpointId = '', model = '',
  onChunk, onDone, onError, onReset, timeout = DEFAULT_TIMEOUT, temperature, maxTokens, signal
} = {}) {
  const { sources, fromPool } = await resolveApiSources({ endpointId, model });
  let currentTimer = null;
  const hasKeyedSource = sources.some((s) => Boolean(s.apiKey));

  const buildFn = fromPool
    ? async (source) => {
        try {
          const result = await requestOnce({
            source, messages, systemPrompt,
            model: model || source.model, stream: true,
            timeout, temperature, maxTokens, onChunk, signal
          });
          await markPoolSourceSuccess(source, result.latencyMs || 0);
          return result;
        } catch (error) {
          if (source?.poolId) await markPoolSourceError(source, String(error?.message || ''), 0);
          throw error;
        }
      }
    : async (source) => {
        if (currentTimer) { clearTimeout(currentTimer); currentTimer = null; }
        const { controller, timer } = createTimeoutController(timeout, signal);
        currentTimer = timer;
        try {
          const provider = source.provider || detectProvider(source.endpoint);
          const requestContext = buildRequestContext({
            endpointConfig: { ...source, provider }, model: model || source.model,
            systemPrompt, messages, stream: true, temperature, maxTokens
          });
          const hasMessages = requestContext.provider === 'gemini'
            ? Array.isArray(requestContext.body.contents) && requestContext.body.contents.length > 0
            : Array.isArray(requestContext.body.messages) && requestContext.body.messages.length > 0;
          if (!hasMessages) throw new Error('消息内容不能为空');
          const response = await fetch(requestContext.url, {
            method: 'POST', headers: requestContext.headers, signal: controller.signal, body: JSON.stringify(requestContext.body)
          });
          if (!response.ok) throw await buildHttpError(response);
          if (!response.body) {
            const fallback = await readTextResponse(response, requestContext.provider);
            return { content: fallback.content, thinking: fallback.thinking };
          }
          return await new Promise((resolve, reject) => {
            readStream(response, {
              onChunk,
              onDone: ({ content, thinking }) => resolve({ content, thinking })
            }).catch(reject);
          });
        } finally { clearTimeout(timer); currentTimer = null; }
      };

  try {
    const result = await tryWithFallback({ sources, buildFn, onSwitch: notifyRetry, onReset });
    onDone?.(result);
    return true;
  } catch (error) {
    if (signal?.aborted) { onError?.({ message: '已取消', status: 408 }); return false; }
    const message = normalizeApiError(error, 'AI 请求失败啦');
    if (hasKeyedSource || error?.isNetworkError || error?.isHttpError) notifyApiError(message);
    onError?.({ message, raw: error, status: getStatusFromError(error) });
    return false;
  } finally {
    if (currentTimer) { clearTimeout(currentTimer); currentTimer = null; }
  }
}

export async function silentRequest({
  prompt = '', messages = [], systemPrompt = '', endpointId = '', model = '',
  timeout = DEFAULT_TIMEOUT, temperature, maxTokens, json = false, signal
} = {}) {
  const { sources, fromPool } = await resolveApiSources({ endpointId, model });
  let currentTimer = null;
  const hasKeyedSource = sources.some((s) => Boolean(s.apiKey));
  const finalMessages = Array.isArray(messages) && messages.length
    ? messages
    : (prompt ? [{ role: 'user', content: prompt }] : []);

  const buildFn = fromPool
    ? async (source) => {
        try {
          const result = await requestOnce({
            source, messages: finalMessages, systemPrompt,
            model: model || source.model, stream: false,
            timeout, temperature, maxTokens, signal
          });
          await markPoolSourceSuccess(source, result.latencyMs || 0);
          return result;
        } catch (error) {
          if (source?.poolId) await markPoolSourceError(source, String(error?.message || ''), 0);
          throw error;
        }
      }
    : async (source) => {
        if (currentTimer) { clearTimeout(currentTimer); currentTimer = null; }
        const { controller, timer } = createTimeoutController(timeout, signal);
        currentTimer = timer;
        try {
          const provider = source.provider || detectProvider(source.endpoint);
          const requestContext = buildRequestContext({
            endpointConfig: { ...source, provider }, model: model || source.model,
            systemPrompt, messages: finalMessages,
            stream: false, temperature, maxTokens
          });
          const hasMessages = requestContext.provider === 'gemini'
            ? Array.isArray(requestContext.body.contents) && requestContext.body.contents.length > 0
            : Array.isArray(requestContext.body.messages) && requestContext.body.messages.length > 0;
          if (!hasMessages) throw new Error('请求内容不能为空');
          const response = await fetch(requestContext.url, {
            method: 'POST', headers: requestContext.headers, signal: controller.signal, body: JSON.stringify(requestContext.body)
          });
          if (!response.ok) throw await buildHttpError(response);
          const { content, thinking } = response.body
            ? await readJsonResponse(response, requestContext.provider)
            : await readTextResponse(response, requestContext.provider);
          return { content: String(content || '').trim(), thinking: String(thinking || '').trim() };
        } finally { clearTimeout(timer); currentTimer = null; }
      };

  try {
    const result = await tryWithFallback({ sources, buildFn, onSwitch: notifyRetry, onReset: null });
    const finalContent = result?.content || '';
    const finalThinking = result?.thinking || '';
    if (json) return parseJsonFromText(finalContent || finalThinking);
    return finalContent || finalThinking;
  } catch (error) {
    if (signal?.aborted) return json ? null : '';
    const message = normalizeApiError(error, '后台请求失败啦');
    if (hasKeyedSource || error?.isNetworkError || error?.isHttpError) notifyApiError(message);
    return json ? null : '';
  } finally {
    if (currentTimer) { clearTimeout(currentTimer); currentTimer = null; }
  }
}

export async function fetchModels(endpointId, timeout = DEFAULT_TIMEOUT) {
  const settings = getSettings();
  const targetId = endpointId || settings.defaultApiEndpointId;
  const hasUserEndpoint = Boolean(settings.apiEndpoints.find((item) => item.id === targetId)?.endpoint);
  if (hasUserEndpoint) {
    const { controller, timer } = createTimeoutController(timeout);
    try {
      const endpointConfig = findEndpoint(endpointId);
      if (endpointConfig.provider === 'gemini') {
        let base = endpointConfig.endpoint.replace(/\/v1beta\/models\/?$/i, '').replace(/\/v1beta\/?$/i, '').replace(/\/+$/, '');
        const url = new URL(`${base}/v1beta/models`);
        if (endpointConfig.apiKey) url.searchParams.set('key', endpointConfig.apiKey);
        const response = await fetch(url.toString(), { method: 'GET', signal: controller.signal });
        if (!response.ok) throw await buildHttpError(response);
        const data = await response.json();
        return (Array.isArray(data.models) ? data.models : []).map((m) => (m?.name || '').replace(/^models\//, '')).filter(Boolean).sort((a, b) => a.localeCompare(b));
      }
      const url = smartModelsUrl(endpointConfig.endpoint, endpointConfig.provider);
      const response = await fetch(url, { method: 'GET', headers: buildHeaders(endpointConfig.apiKey, endpointConfig.provider), signal: controller.signal });
      if (!response.ok) throw await buildHttpError(response);
      const data = await response.json();
      if (endpointConfig.provider === 'ollama') {
        return (Array.isArray(data.models) ? data.models : []).map((m) => m?.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
      }
      return (Array.isArray(data.data) ? data.data : []).map((m) => m?.id).filter(Boolean).sort((a, b) => a.localeCompare(b));
    } catch (error) {
      const normalizedError = isBrowserBlockedError(error) ? createNetworkError(error, { isUser: true }) : error;
      notifyApiError(normalizeApiError(normalizedError, '拉取模型失败啦'));
    } finally { clearTimeout(timer); }
  }
  for (const anon of ANONYMOUS_SOURCES) {
    const { controller, timer } = createTimeoutController(timeout);
    try {
      const url = smartModelsUrl(anon.endpoint, 'openai');
      const response = await fetch(url, { method: 'GET', headers: buildHeaders('', 'openai'), signal: controller.signal });
      if (!response.ok) continue;
      const data = await response.json();
      const list = (Array.isArray(data.data) ? data.data : []).map((m) => m?.id).filter(Boolean).sort((a, b) => a.localeCompare(b));
      if (list.length) {
        if (!hasUserEndpoint) notifyApiInfo(`从 ${anon.name} 拉到 ${list.length} 个模型`);
        return list;
      }
    } catch { continue; } finally { clearTimeout(timer); }
  }
  return [];
}

// ═══════════════════════════════════════
// 【轮换池测试】
// ═══════════════════════════════════════

export async function testPoolEndpoint(poolId) {
  const items = await getApiPoolItems();
  const target = items.find((item) => String(item.id) === String(poolId));
  if (!target) return { ok: false, message: '找不到这条接口', latencyMs: 0, models: [] };
  const normalized = normalizePoolItem(target);
  const key = normalized.keys[0] || '';
  const model = normalized.model || normalized.models[0] || '';
  if (!normalized.endpoint) return { ok: false, message: '地址没填', latencyMs: 0, models: normalized.models };
  if (!model && normalized.provider !== 'gemini') return { ok: false, message: '模型名没填', latencyMs: 0, models: normalized.models };
  const source = {
    id: normalized.id, poolId: normalized.id, groupType: normalized.groupType,
    name: normalized.name, endpoint: normalized.endpoint, provider: normalized.provider,
    apiKey: key, model, isUser: normalized.groupType === 'paid', isAnonymous: normalized.source === 'anonymous'
  };
  const startedAt = Date.now();
  try {
    const result = await requestOnce({
      source, messages: [{ role: 'user', content: '1+1=?' }], model, stream: false,
      timeout: 15000, temperature: 0.1, maxTokens: 32
    });
    const latencyMs = Date.now() - startedAt;
    await markPoolSourceSuccess(source, latencyMs);
    return { ok: true, message: '连接成功', latencyMs, models: normalized.models, response: result.content };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const normalizedError = isBrowserBlockedError(error) ? createNetworkError(error, source) : error;
    const message = normalizeApiError(normalizedError, '连接失败');
    await markPoolSourceError(source, message, latencyMs);
    return { ok: false, message, latencyMs, models: normalized.models };
  }
}

export async function testAllPoolEndpoints() {
  const items = await getApiPoolItems();
  const results = [];
  for (const item of items) {
    // 耳朵分组只解析保存不参与任何请求：跳过 sensory_ear，避免"全部测试"触发耳朵 endpoint
    if (item.groupType === 'sensory_ear') continue;
    const result = await testPoolEndpoint(item.id);
    results.push({ id: item.id, name: item.name || '未命名', groupType: item.groupType, ...result });
  }
  return results;
}

// 依赖：./storage.js(getData,setData,getAllDB,setDB,deleteDB,getNow,generateId)

