// apps/chat/ai-sensory-eye.js
// 眼睛识图服务：从「sensory_eye」分组取视觉 endpoint，压缩图片后调用视觉模型，
// 把结果整理成「隐形小助理递纸条」格式的中文 hidden note，供聊天上下文使用。
//
// 设计原则：
// - 不写死供应商：不内置任何 baseURL/model/key/默认格式，完全由眼睛分组配置驱动。
// - 不写死 Key：apiKey 只在运行时从配置项 keys 或 options.apiKey 取，绝不落进任何 .js 文件。
// - 失败不抛错：网络/429/5xx/解析失败一律返回降级纸条，emit 事件，不阻塞调用方。
// - 不编造：提示词约束视觉模型只描述确定内容，不确定标注「不确定」；解析侧保留原文。
// - 不接聊天：本模块只产出 note 字符串，不写聊天记录、不触发 AI 请求、不改渲染。
//
// imports:
//   from '../../core/api.js': getPoolGroups, getApiPoolItems, normalizeEndpointUrl, smartChatUrl, buildHeaders
//   from '../../core/app-bus.js': emit

import { getPoolGroups, getApiPoolItems, normalizeEndpointUrl, smartChatUrl, buildHeaders } from '../../core/api.js';
import { emit } from '../../core/app-bus.js';

// ═══════════════════════════════════════
// 【常量】本模块中立：不写死任何供应商、baseURL、model、Key、默认请求格式。
//   眼睛分组完全由用户在设置-API配置-感官-眼睛里配置驱动；
//   空配置或无可用 endpoint 时返回降级纸条，不发起任何请求。
// ═══════════════════════════════════════

// 眼睛分组默认空结构（仅占位，不含任何 endpoint/model/key）
// getPoolGroups 已自动补默认空结构，这里只作文案兜底用
const DEFAULT_EMPTY_EYE_GROUP = { id: 'sensory_eye', name: '感官-眼睛', type: 'sensory', enabled: false };

// 单张压缩后体积上限（base64 字符串长度近似），避免请求体过大
const MAX_COMPRESSED_BASE64_LEN = 1024 * 1024; // ≈1MB
const MIN_QUALITY = 0.3;

// ═══════════════════════════════════════
// 【受控脱敏诊断】仅当 window.__sensoryEyeDebug === true 时输出，默认关闭
//   浏览器控制台手动开启：window.__sensoryEyeDebug = true
//   关闭：window.__sensoryEyeDebug = false 或 delete window.__sensoryEyeDebug
//   严禁打印：完整 Key、完整 base64、原始图片内容、完整私人响应体
//   只打印：脱敏 URL（query key 已替换为 <masked>）、HTTP 状态码、content-type、
//           脱敏错误码与 message 片段、model、requestFormat、图片张数与每张 bytes+MIME
// ═══════════════════════════════════════

function sensoryEyeDebug(label, payload) {
  try {
    if (typeof window === 'undefined' || window.__sensoryEyeDebug !== true) return;
    // 始终只打印脱敏后的对象，不打印原始请求/响应
    console.log(`[sensory-eye] ${label}`, payload);
  } catch (_) {
    // 诊断自身不能影响主流程
  }
}

// 脱敏 URL：去掉 query 中的 key（保留 path 和其他 query）
function maskUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''));
    if (u.searchParams.has('key')) u.searchParams.set('key', '<masked>');
    return u.toString();
  } catch {
    return String(rawUrl || '').replace(/([?&])key=[^&]*/gi, '$1key=<masked>');
  }
}

// 脱敏错误：保留 status 和 message 片段（不含 key）
function maskError(err) {
  if (!err) return null;
  return {
    name: err.name || '',
    status: err.status || 0,
    message: String(err.message || '').slice(0, 200),
    bodyText: String(err.bodyText || '').slice(0, 200)
  };
}

// 脱敏图片信息：每张图返回 { mime, bytes }（不含 base64）
function describeImages(dataURLs) {
  return (dataURLs || []).map((url) => {
    const s = String(url || '');
    const match = s.match(/^data:([^;]+);base64,(.*)$/);
    return {
      mime: match ? match[1] : 'image/jpeg',
      bytes: match ? match[2].length : 0
    };
  });
}

// 脱敏响应结构：只打印形状和关键字段，不打印正文（避免泄漏私人识图内容）
function summarizeResponse(data) {
  if (data === null || data === undefined) return { type: 'null' };
  if (typeof data !== 'object') return { type: typeof data, len: String(data).length };
  if (data.error && typeof data.error === 'object') {
    return {
      type: 'error',
      error: {
        message: String(data.error.message || '').slice(0, 200),
        code: data.error.code || data.error.type || ''
      }
    };
  }
  const choices = Array.isArray(data.choices) ? data.choices : [];
  if (!choices.length) {
    return { type: 'no_choices', topKeys: Object.keys(data).slice(0, 10) };
  }
  const msg = choices[0]?.message || choices[0]?.delta || {};
  const content = msg.content;
  let contentShape = 'missing';
  if (typeof content === 'string') contentShape = `string(${content.length})`;
  else if (Array.isArray(content)) contentShape = `array(${content.length})`;
  return {
    type: 'ok',
    choicesCount: choices.length,
    hasReasoningContent: Boolean(msg.reasoning_content),
    contentShape,
    finishReason: choices[0]?.finish_reason || ''
  };
}

// ═══════════════════════════════════════
// 【主入口】analyzeImages
//   入参：{ images: [base64|dataURL,...], groupConfig?, model?, maxSize?, quality?, timeout?, apiKey?, endpoint? }
//   出参：{ ok, note, raw?, perImage?, relationSummary?, confidence?, errors? }
//   - ok=true：识别成功（可能部分图失败，note 里会标注）
//   - ok=false：未配置/全挂/无可识别内容，note 为降级纸条
//   - 永不抛异常；任何内部异常都被捕获并转成 ok=false 的降级纸条
// ═══════════════════════════════════════

export async function analyzeImages(options = {}) {
  const {
    images = [],
    groupConfig = null,
    model = '',
    maxSize = 1280,
    quality = 0.8,
    timeout = 30000
  } = options;

  const count = Array.isArray(images) ? images.length : 0;

  // 入参兜底：没有图片直接返回空纸条，不算失败也不算成功
  if (count === 0) {
    return {
      ok: false,
      note: '对方没有发图片，小眼睛没什么要看。'
    };
  }

  try {
    // 1. 解析眼睛 endpoint（完全配置驱动，无内置 fallback）
    const endpointMeta = await resolveEyeEndpoint({ groupConfig, model, apiKey: options.apiKey, endpoint: options.endpoint });

    // 2. 没有可用 endpoint（未配置且未传 options.endpoint/apiKey）→ 降级纸条
    if (!endpointMeta) {
      sensoryEyeDebug('resolve_endpoint_failed', {
        reason: 'no_endpoint_or_group_disabled',
        hasExplicitEndpoint: Boolean(options.endpoint),
        hasExplicitApiKey: Boolean(options.apiKey)
      });
      return {
        ok: false,
        note: buildUnconfiguredNote(count)
      };
    }

    // 诊断：记录实际加载的脱敏 endpoint 元数据（不含 apiKey 原文，只记存在+长度）
    sensoryEyeDebug('resolve_endpoint_ok', {
      url: maskUrl(endpointMeta.url),
      model: endpointMeta.model || '(empty)',
      provider: endpointMeta.provider || 'openai',
      requestFormat: endpointMeta.format || 'openai',
      hasApiKey: Boolean(endpointMeta.apiKey),
      apiKeyLen: endpointMeta.apiKey ? endpointMeta.apiKey.length : 0,
      name: endpointMeta.name || ''
    });

    // 3. 压缩所有图片（失败的单张标记跳过，不阻塞其他张）
    const compressed = await compressAll(images, maxSize, quality);

    // 4. 全部压缩失败 → 降级纸条
    const valid = compressed.filter((c) => c.ok);
    if (!valid.length) {
      // 注意：不把 endpointMeta 传进 emitFailure，避免 apiKey 落进事件日志
      emitFailure({ reason: 'all_compress_failed', count });
      return {
        ok: false,
        note: buildAllFailedNote(count),
        errors: compressed.map((c) => c.error)
      };
    }

    // 5. 调用视觉模型：多图先尝试一次传，失败降级逐张
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const result = await callVisionWithFallback({
        images: valid,
        endpointMeta,
        model: endpointMeta.model,
        signal: controller.signal,
        count
      });

      // 6. 整理纸条
      const note = buildHiddenNote({
        perImage: result.perImage,
        relationSummary: result.relationSummary,
        confidence: result.confidence,
        errors: result.errors,
        count
      });

      return {
        ok: result.ok,
        note,
        raw: result.raw,
        perImage: result.perImage,
        relationSummary: result.relationSummary,
        confidence: result.confidence,
        errors: result.errors
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // 兜底：任何未预期异常都转成降级纸条，绝不抛给调用方
    emitFailure({ reason: 'unexpected', count, error: err });
    return {
      ok: false,
      note: buildAllFailedNote(count),
      errors: [String(err?.message || err || 'unknown')]
    };
  }
}

// ═══════════════════════════════════════
// 【endpoint 解析】完全配置驱动，不内置任何 fallback endpoint
//   返回 { url, apiKey, model, format, name } 或 null
//   - 优先级：options.endpoint/apiKey（测试/直连）> groupConfig > sensory_eye 分组配置项
//   - 眼睛分组不存在/disabled/无 enabled endpoint → null（走降级纸条）
//   - 有 endpoint 但无 apiKey → 尝试匿名请求（兼容公益无 Key 接口）
//   - 格式判断：endpoint.requestFormat 优先，否则 baseURL 自动检测
// ═══════════════════════════════════════

async function resolveEyeEndpoint({ groupConfig, model, apiKey, endpoint }) {
  // 路径 A：调用方直接传了完整 endpoint（测试页或未来直连场景）
  // apiKey 可选：有则带认证，无则匿名请求
  if (endpoint) {
    const meta = buildOpenAIRequestUrl(endpoint);
    if (!meta.url) return null;
    return {
      url: meta.url,
      apiKey: apiKey || '',
      model: model || '',
      provider: 'openai',
      format: resolveFormat({ url: meta.url }),
      name: '自定义眼睛接口'
    };
  }

  // 路径 B：从配置取 sensory_eye 分组
  let groups = null;
  if (groupConfig && typeof groupConfig === 'object') {
    groups = { sensory_eye: groupConfig };
  } else {
    try {
      groups = getPoolGroups();
    } catch (_) {
      groups = null;
    }
  }

  const eyeGroup = groups?.sensory_eye || DEFAULT_EMPTY_EYE_GROUP;
  // 分组显式关闭 → 不参与
  if (eyeGroup.enabled === false) return null;

  // 从 api_pool 取 sensory_eye 的 endpoint 项，按 lastSuccessAt 排序（最近成功优先）
  let poolItems = [];
  try {
    const all = await getApiPoolItems();
    poolItems = all.filter((item) => item.groupType === 'sensory_eye' && item.status !== 'disabled');
  } catch (_) {
    poolItems = [];
  }

  if (!poolItems.length) return null; // 无可用 endpoint → 降级纸条

  // 按 lastSuccessAt 降序，最近成功的排第一；都没有成功记录则按原顺序
  const sorted = [...poolItems].sort((a, b) => {
    const ta = a.lastSuccessAt ? Date.parse(a.lastSuccessAt) : 0;
    const tb = b.lastSuccessAt ? Date.parse(b.lastSuccessAt) : 0;
    return (tb || 0) - (ta || 0);
  });
  const first = sorted[0];
  if (!first.endpoint) return null;

  const meta = buildOpenAIRequestUrl(first.endpoint);
  if (!meta.url) return null;
  // apiKey 可选：配置项 keys[0] 优先，否则匿名（兼容公益无 Key 接口）
  const key = (first.keys && first.keys[0]) || '';
  return {
    url: meta.url,
    apiKey: key,
    model: model || first.model || '',
    provider: first.provider || 'openai',
    format: resolveFormat({ url: meta.url, requestFormat: first.requestFormat }),
    name: first.name || '眼睛接口'
  };
}

// 用 api.js 的统一 URL 规范化构造 OpenAI-compatible 请求 URL
// 复用 smartChatUrl + normalizeEndpointUrl，与"测试接口"走完全相同的 URL 逻辑，
// 避免之前独立 buildFullUrl 与测试接口 URL 不一致（如 /v1/v1 去重、边界判断）
function buildOpenAIRequestUrl(rawEndpoint) {
  const base = normalizeEndpointUrl(rawEndpoint);
  if (!base) return { url: '' };
  return { url: smartChatUrl(base, 'openai') };
}

// 格式判断优先级：
//   1. endpoint.requestFormat 字段（用户显式指定 'openai' | 'gemini'）
//   2. baseURL 自动检测：含 generativelanguage.googleapis.com → 'gemini'
//   3. 其余 → 'openai'（OpenAI-compatible，含 Pollinations / 中转站 / OpenAI 官方）
//   注意：模型名（gemini/grok/claude）不决定协议，中转站即使转发这些模型也通常仍是 OpenAI-compatible
function resolveFormat({ url, requestFormat }) {
  const explicit = String(requestFormat || '').trim().toLowerCase();
  if (explicit === 'gemini' || explicit === 'openai') return explicit;
  return /generativelanguage\.googleapis\.com/i.test(String(url || '')) ? 'gemini' : 'openai';
}

// ═══════════════════════════════════════
// 【图片压缩】canvas 等比缩放 + jpeg 转码
//   入参：base64 或 dataURL
//   出参：{ ok, dataURL } 或 { ok:false, error }
//   - 宽边超过 maxSize 时等比缩放
//   - 单张压缩后仍 > 1MB 时，循环降低 quality 直到 < 1MB 或 quality < 0.3
// ═══════════════════════════════════════

export async function compressImageForVision(input, maxSize = 1280, quality = 0.8) {
  try {
    const dataURL = normalizeToDataURL(input);
    if (!dataURL) return { ok: false, error: 'invalid_image_input' };

    const img = await loadImage(dataURL);
    let { width, height } = img;

    // 等比缩放，宽边不超过 maxSize
    if (width > maxSize || height > maxSize) {
      const scale = maxSize / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // jpeg 不支持透明，铺白底避免黑底
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // 循环降质量直到体积达标或触底
    let q = Math.min(Math.max(Number(quality) || 0.8, 0.1), 0.95);
    let out = canvas.toDataURL('image/jpeg', q);
    while (out.length > MAX_COMPRESSED_BASE64_LEN && q > MIN_QUALITY) {
      q = Math.max(MIN_QUALITY, q - 0.15);
      out = canvas.toDataURL('image/jpeg', q);
    }

    return { ok: true, dataURL: out };
  } catch (err) {
    return { ok: false, error: String(err?.message || err || 'compress_failed') };
  }
}

function normalizeToDataURL(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  if (s.startsWith('data:')) return s;
  // 纯 base64：默认按 jpeg 解析（压缩后都是 jpeg；原图若是 png 也能解码，浏览器对 dataURL 类型宽容）
  return `data:image/jpeg;base64,${s}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = src;
  });
}

async function compressAll(images, maxSize, quality) {
  const out = [];
  for (const img of images) {
    out.push(await compressImageForVision(img, maxSize, quality));
  }
  return out;
}

// ═══════════════════════════════════════
// 【视觉请求】支持两种格式
//   - openai（OpenAI-compatible，含 Pollinations / 中转站 / OpenAI 官方）
//   - gemini（Google AI Studio native）
//   callVisionEndpoint：单次请求，传一组 dataURL，按 endpointMeta.format 分发
//   callVisionWithFallback：多图先一次传，失败降级逐张
// ═══════════════════════════════════════

export async function callVisionEndpoint({ dataURLs, endpointMeta, model, prompt, signal }) {
  const format = endpointMeta.format || resolveFormat({ url: endpointMeta.url });
  if (format === 'gemini') {
    return callGeminiVision({ dataURLs, endpointMeta, model, prompt, signal });
  }
  return callOpenAIVision({ dataURLs, endpointMeta, model, prompt, signal });
}

// OpenAI-compatible 请求：POST {url}，body {model, messages:[{role:'user', content:[{text},{image_url}]}]}
//   headers 复用 api.js 的 buildHeaders，与"测试接口"走完全相同的鉴权构造，
//   避免之前只支持 Bearer 导致 anthropic 风格中转站鉴权失败
async function callOpenAIVision({ dataURLs, endpointMeta, model, prompt, signal }) {
  const content = [
    { type: 'text', text: prompt },
    ...dataURLs.map((url) => ({ type: 'image_url', image_url: { url } }))
  ];

  const body = {
    model: model || endpointMeta.model,
    messages: [{ role: 'user', content }],
    max_tokens: 600,
    temperature: 0.2 // 低温度，减少视觉模型发散编造
  };

  // 复用 api.js 的 buildHeaders：openai→Bearer，anthropic→x-api-key，ollama→无鉴权
  const provider = endpointMeta.provider || 'openai';
  const headers = buildHeaders(endpointMeta.apiKey, provider);

  sensoryEyeDebug('openai_request', {
    url: maskUrl(endpointMeta.url),
    model: body.model,
    provider,
    requestFormat: endpointMeta.format || 'openai',
    promptLen: String(prompt || '').length,
    imageCount: dataURLs.length,
    images: describeImages(dataURLs),
    hasAuth: Boolean(endpointMeta.apiKey)
  });

  let res;
  try {
    res = await fetch(endpointMeta.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
      cache: 'no-store'
    });
  } catch (networkErr) {
    sensoryEyeDebug('openai_network_error', { error: maskError(networkErr) });
    // AbortError（超时）原样上抛，保留 describeError 的 timeout 识别和重试逻辑
    if (networkErr?.name === 'AbortError') throw networkErr;
    const err = new Error(`vision_network:${networkErr?.name || 'fetch_failed'}`);
    err.cause = networkErr;
    throw err;
  }

  sensoryEyeDebug('openai_response_status', {
    status: res.status,
    contentType: res.headers.get('content-type') || ''
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`vision_http_${res.status}`);
    err.status = res.status;
    err.bodyText = text?.slice(0, 300); // 仅留前 300 字便于排查，不含 key
    sensoryEyeDebug('openai_http_error', {
      status: res.status,
      bodyText: err.bodyText,
      contentType: res.headers.get('content-type') || ''
    });
    throw err;
  }

  const rawText = await res.text().catch(() => '');
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch (parseErr) {
    // 非 JSON 响应：保留明确原因，不能静默吞掉成 empty_response
    sensoryEyeDebug('openai_non_json', {
      rawLen: rawText.length,
      rawHead: rawText.slice(0, 200)
    });
    const err = new Error('vision_non_json_response');
    err.bodyText = rawText.slice(0, 300);
    throw err;
  }

  sensoryEyeDebug('openai_response_shape', { shape: summarizeResponse(data) });

  const text = extractOpenAIText(data);
  if (!text) {
    const err = new Error('vision_empty_response');
    err.shape = summarizeResponse(data);
    sensoryEyeDebug('openai_empty_text', { shape: err.shape });
    throw err;
  }
  return text;
}

// Gemini native 请求：POST {baseURL}/v1beta/models/{model}:generateContent?key={apiKey}
//   body {contents:[{role:'user',parts:[{text:prompt}, {inlineData:{mimeType, data:base64WithoutPrefix}}]}]}
//   解析：candidates[0].content.parts[0].text
async function callGeminiVision({ dataURLs, endpointMeta, model, prompt, signal }) {
  const usedModel = model || endpointMeta.model;
  // Gemini URL：base + /v1beta/models/{model}:generateContent + ?key=
  // endpointMeta.url 是用户填的 baseURL 或含 /v1beta 的地址，统一规整
  const url = buildGeminiUrl(endpointMeta.url, usedModel, endpointMeta.apiKey);

  const parts = [
    { text: prompt },
    ...dataURLs.map((dataURL) => {
      const { mimeType, base64 } = parseDataURL(dataURL);
      return { inlineData: { mimeType, data: base64 } };
    })
  ];

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 600 }
  };

  const headers = { 'Content-Type': 'application/json' };

  sensoryEyeDebug('gemini_request', {
    url: maskUrl(url),
    model: usedModel,
    provider: endpointMeta.provider || 'gemini',
    requestFormat: 'gemini',
    promptLen: String(prompt || '').length,
    imageCount: dataURLs.length,
    images: describeImages(dataURLs),
    hasAuth: Boolean(endpointMeta.apiKey)
  });

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
      cache: 'no-store'
    });
  } catch (networkErr) {
    sensoryEyeDebug('gemini_network_error', { error: maskError(networkErr) });
    // AbortError（超时）原样上抛，保留 describeError 的 timeout 识别和重试逻辑
    if (networkErr?.name === 'AbortError') throw networkErr;
    const err = new Error(`vision_network:${networkErr?.name || 'fetch_failed'}`);
    err.cause = networkErr;
    throw err;
  }

  sensoryEyeDebug('gemini_response_status', {
    status: res.status,
    contentType: res.headers.get('content-type') || ''
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`vision_http_${res.status}`);
    err.status = res.status;
    err.bodyText = text?.slice(0, 300);
    sensoryEyeDebug('gemini_http_error', {
      status: res.status,
      bodyText: err.bodyText,
      contentType: res.headers.get('content-type') || ''
    });
    throw err;
  }

  const rawText = await res.text().catch(() => '');
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch (parseErr) {
    sensoryEyeDebug('gemini_non_json', {
      rawLen: rawText.length,
      rawHead: rawText.slice(0, 200)
    });
    const err = new Error('vision_non_json_response');
    err.bodyText = rawText.slice(0, 300);
    throw err;
  }

  sensoryEyeDebug('gemini_response_shape', { shape: summarizeResponse(data) });

  const text = extractGeminiText(data);
  if (!text) {
    const err = new Error('vision_empty_response');
    err.shape = summarizeResponse(data);
    sensoryEyeDebug('gemini_empty_text', { shape: err.shape });
    throw err;
  }
  return text;
}

// 规整 Gemini 请求 URL：
//   输入可能是 https://generativelanguage.googleapis.com 或 .../v1beta 或 .../v1beta/models
//   输出固定 https://.../v1beta/models/{model}:generateContent?key={apiKey}
function buildGeminiUrl(rawUrl, model, apiKey) {
  let base = String(rawUrl || '').trim().replace(/\/+$/, '');
  // 去掉已有的 /models/xxx:generateContent 之类后缀，回到 baseURL
  base = base.replace(/\/v1beta\/models\/.*$/i, '').replace(/\/v1beta\/?$/i, '');
  const cleanModel = encodeURIComponent(String(model || '').trim());
  const url = `${base}/v1beta/models/${cleanModel}:generateContent`;
  if (apiKey) {
    // Gemini 用 query param 传 key，不用 Authorization 头
    return `${url}?key=${encodeURIComponent(apiKey)}`;
  }
  return url;
}

// 把 data:image/jpeg;base64,xxxx 拆成 { mimeType, base64 }
function parseDataURL(dataURL) {
  const s = String(dataURL || '');
  const match = s.match(/^data:([^;]+);base64,(.*)$/);
  if (match) {
    return { mimeType: match[1] || 'image/jpeg', base64: match[2] || '' };
  }
  // 纯 base64 兜底按 jpeg
  return { mimeType: 'image/jpeg', base64: s };
}

function extractOpenAIText(data) {
  if (!data) return '';
  // 显式 error 响应：不当作"empty"，让上层 message 区分；这里仍返回空，由调用方 shape 报错
  if (data.error && typeof data.error === 'object') return '';

  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = choices[0] || null;
  const msg = first?.message || first?.delta || {};

  // 1. content 字符串（OpenAI 标准）
  const content = msg.content;
  if (typeof content === 'string' && content.trim()) return content.trim();

  // 2. content 数组：拼 text + image_url 之外的 text 字段
  if (Array.isArray(content)) {
    const joined = content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (!c || typeof c !== 'object') return '';
        // 中转站可能用 {type:'text', text} 或 {type:'output_text', output_text} 或直接 {text}
        return c.text || c.output_text || c.content || '';
      })
      .join('')
      .trim();
    if (joined) return joined;
  }

  // 3. reasoning_content：DeepSeek-R1 / 部分中转站把"思考过程"放这里，content 留空
  //    作为 fallback 取用，总比给空纸条强（上层 prompt 已约束客观描述）
  const reasoning = msg.reasoning_content;
  if (typeof reasoning === 'string' && reasoning.trim()) return reasoning.trim();
  if (Array.isArray(reasoning)) {
    const joined = reasoning
      .map((c) => (typeof c === 'string' ? c : (c && typeof c === 'object' ? (c.text || c.content || '') : '')))
      .join('')
      .trim();
    if (joined) return joined;
  }

  // 4. 旧版 completions API：choices[0].text
  if (typeof first?.text === 'string' && first.text.trim()) return first.text.trim();

  // 5. 非标准包装：data.output.text / data.message.content
  const outText = data?.output?.text;
  if (typeof outText === 'string' && outText.trim()) return outText.trim();
  const msgContent = data?.message?.content;
  if (typeof msgContent === 'string' && msgContent.trim()) return msgContent.trim();

  return '';
}

// Gemini native 响应解析：candidates[0].content.parts[*].text 拼接
function extractGeminiText(data) {
  if (!data) return '';
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('').trim();
}

async function callVisionWithFallback({ images, endpointMeta, model, signal, count }) {
  const prompt = buildVisionPrompt(count);
  const errors = [];

  // 多图：先尝试一次传所有图
  if (images.length > 1) {
    try {
      const text = await callVisionEndpoint({
        dataURLs: images.map((i) => i.dataURL),
        endpointMeta,
        model,
        prompt,
        signal
      });
      const parsed = parseVisionResponse(text, count);
      return {
        ok: true,
        raw: text,
        perImage: parsed.perImage,
        relationSummary: parsed.relationSummary,
        confidence: parsed.confidence,
        errors: []
      };
    } catch (err) {
      errors.push(`multi: ${describeError(err)}`);
      // 降级逐张
    }
  }

  // 逐张请求，每张最多重试 1 次
  const perImage = [];
  let anySuccess = false;
  for (let i = 0; i < images.length; i++) {
    const singlePrompt = buildVisionPrompt(1, i + 1, count);
    let text = '';
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        text = await callVisionEndpoint({
          dataURLs: [images[i].dataURL],
          endpointMeta,
          model,
          prompt: singlePrompt,
          signal
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        // 429/5xx 重试一次；4xx（除 429）不重试
        if (err?.status && err.status !== 429 && err.status < 500) break;
      }
    }
    if (text) {
      const parsed = parseVisionResponse(text, 1);
      perImage.push(parsed.perImage[0] || { content: text, confidence: 'low' });
      anySuccess = true;
    } else {
      perImage.push({ content: '', confidence: 'low', failed: true });
      errors.push(`img${i + 1}: ${describeError(lastErr)}`);
    }
  }

  // 全部失败
  if (!anySuccess) {
    emitFailure({ reason: 'all_vision_failed', count, errors });
    return {
      ok: false,
      raw: '',
      perImage: [],
      relationSummary: '',
      confidence: 'low',
      errors
    };
  }

  // 部分成功：合并逐张结果
  // 关联参考明确标注"未做关联分析"，避免与"分析后无明显关联"混淆（诚实性）
  return {
    ok: true,
    raw: perImage.map((p, i) => `[第${i + 1}张] ${p.content}`).join('\n'),
    perImage,
    relationSummary: '本次逐张识别，未做关联分析。',
    confidence: perImage.every((p) => p.confidence === 'high') ? 'high' : 'low',
    errors
  };
}

function describeError(err) {
  if (!err) return 'unknown';
  if (err.name === 'AbortError') return 'timeout';
  if (err.status) return `http_${err.status}`;
  return String(err.message || err).slice(0, 80);
}

// ═══════════════════════════════════════
// 【提示词】约束视觉模型客观描述、不编造、不确定标注
//   单张模式会带"这是第 N 张，共 M 张"
// ═══════════════════════════════════════

export function buildVisionPrompt(imageCount, index = 0, total = 0) {
  const positionHint = index > 0 ? `这是第 ${index} 张（共 ${total} 张）。` : '';
  const multiHint = imageCount > 1
    ? '这次收到了多张图片，请先逐张描述，最后用一句话说明图片之间可能的关系（如果没有关系就说"无明显关联"）。'
    : '';

  return [
    positionHint,
    multiHint,
    '请用中文客观描述这张图片的内容。',
    '要求：',
    '1. 只描述你确定看到的内容，包括场景、物体、人物动作、文字、颜色、氛围等。',
    '2. 不确定或看不清的地方，明确标注"不确定"或"看不清"，不要编造细节。',
    '3. 如果图片里有文字，把文字内容尽量准确转录出来。',
    '4. 不要加入主观评价、不要猜测图片之外的背景。',
    '5. 描述控制在 200 字以内。',
    '输出格式：直接给描述，不要加"图片内容是"这类前缀。'
  ].filter(Boolean).join('\n');
}

// ═══════════════════════════════════════
// 【响应解析】把视觉模型文本切成结构化
//   perImage: [{ content, confidence }]
//   relationSummary: string
//   confidence: 'high' | 'low'
//   规则保守：含"不确定""看不清""可能"等字眼 → confidence=low
// ═══════════════════════════════════════

const LOW_CONFIDENCE_KEYWORDS = ['不确定', '看不清', '可能', '似乎', '大概', '也许', '模糊', '好像', '不太', '疑似', '应该'];

export function parseVisionResponse(text, expectedCount = 0) {
  const raw = String(text || '').trim();
  if (!raw) {
    return { perImage: [], relationSummary: '', confidence: 'low' };
  }

  // 尝试按"第 N 张""[第N张]"等标记切分
  const parts = splitByImageMarkers(raw);
  let perImage = [];
  let relationSummary = '';

  if (parts.length >= expectedCount && expectedCount > 1) {
    perImage = parts.slice(0, expectedCount).map((p) => ({
      content: p.trim(),
      confidence: judgeConfidence(p)
    }));
    relationSummary = parts.slice(expectedCount).join('\n').trim();

    // 视觉模型常把"关联：..."段跟在最后一张后面（没有第N张标记），
    // 把它从最后一张内容里抽出来，避免污染最后一张描述
    const last = perImage[perImage.length - 1];
    const relationMatch = last.content.match(/[\s\n]*(关联|图片间关联|关系|关联参考)[::]?/);
    if (relationMatch) {
      const extracted = last.content.slice(relationMatch.index).trim();
      last.content = last.content.slice(0, relationMatch.index).trim();
      relationSummary = (relationSummary ? relationSummary + '\n' : '') + extracted;
    }
  } else if (expectedCount <= 1) {
    perImage = [{ content: raw, confidence: judgeConfidence(raw) }];
  } else {
    // 切分失败：把整段作为第一张，其余留空
    perImage = [{ content: raw, confidence: judgeConfidence(raw) }];
    while (perImage.length < expectedCount) {
      perImage.push({ content: '', confidence: 'low' });
    }
  }

  const confidence = perImage.every((p) => p.confidence === 'high') ? 'high' : 'low';
  return { perImage, relationSummary, confidence };
}

function splitByImageMarkers(text) {
  // 支持 "第1张""第 1 张""[第1张]""图片1" 等常见标记
  const regex = /(?:\[?\s*第\s*\d+\s*张\s*\]?|图片\s*\d+)\s*[:：]?/g;
  const matches = [...text.matchAll(regex)];
  if (matches.length === 0) return [text];

  const parts = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    parts.push(text.slice(start, end));
  }
  return parts.filter((p) => p.trim());
}

function judgeConfidence(text) {
  const s = String(text || '');
  return LOW_CONFIDENCE_KEYWORDS.some((kw) => s.includes(kw)) ? 'low' : 'high';
}

// ═══════════════════════════════════════
// 【纸条生成】固定中文格式，第三人称客观描述，用"参考"留余地
//   单张/多张/全挂/未配置 四种模板
// ═══════════════════════════════════════

export function buildHiddenNote({ perImage = [], relationSummary = '', confidence = 'low', errors = [], count = 0 }) {
  const total = count || perImage.length;
  const head = `对方发来 ${total} 张图片。`;

  // 全挂
  if (!perImage.length || perImage.every((p) => !p.content && p.failed)) {
    return buildAllFailedNote(total);
  }

  const lines = [head];
  perImage.forEach((p, i) => {
    const content = p.content?.trim();
    if (content) {
      lines.push(`第 ${i + 1} 张参考内容：${content}`);
    } else {
      lines.push(`第 ${i + 1} 张参考内容：没看清。`);
    }
  });

  if (total > 1) {
    lines.push(`图片间关联参考：${relationSummary?.trim() || '无明显关联。'}`);
  }

  const tag = confidence === 'high' ? '高' : '低';
  lines.push(`识别可信度：${tag}。没看清的地方我会直接问你。`);

  return lines.join('\n');
}

function buildAllFailedNote(count) {
  if (count <= 1) return '对方发来 1 张图片，但小眼睛暂时没看清，稍后再试试。';
  return `对方发来 ${count} 张图片，但小眼睛暂时没看清，稍后再试试。`;
}

function buildUnconfiguredNote(count) {
  const hint = '你可以先去设置-API配置-感官-眼睛里加一个识图接口哦。';
  if (count <= 1) return `对方发来图片，但小眼睛现在没配置好，没能看清。${hint}`;
  return `对方发来 ${count} 张图片，但小眼睛现在没配置好，没能看清。${hint}`;
}

// ═══════════════════════════════════════
// 【失败事件】emit 到事件中心，不阻塞调用方
//   事件名：ai:sensory-eye:failed
//   payload 只含 reason/count/错误摘要，不含 key、不含 base64
// ═══════════════════════════════════════

function emitFailure({ reason = 'unknown', count = 0, errors = [], error = null }) {
  try {
    emit('ai:sensory-eye:failed', {
      reason,
      count,
      errors: errors.slice(0, 5),
      error: error ? String(error?.message || error).slice(0, 120) : ''
    });
  } catch (_) {
    // 事件中心挂了也不影响主流程
  }
}
