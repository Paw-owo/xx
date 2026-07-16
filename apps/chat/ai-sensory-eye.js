// apps/chat/ai-sensory-eye.js
// 眼睛识图服务：从「sensory_eye」分组取视觉 endpoint，压缩图片后调用视觉模型，
// 把结果整理成「隐形小助理递纸条」格式的中文 hidden note，供聊天上下文使用。
//
// 设计原则：
// - 不写死供应商：默认 fallback 到 Pollinations，但配置项可覆盖；endpointMeta 抽象允许以后替换。
// - 不写死 Key：pk_ 只在运行时从配置项 keys 或 options.apiKey 取，绝不落进任何 .js 文件。
// - 失败不抛错：网络/429/5xx/解析失败一律返回降级纸条，emit 事件，不阻塞调用方。
// - 不编造：提示词约束视觉模型只描述确定内容，不确定标注「不确定」；解析侧保留原文。
// - 不接聊天：本模块只产出 note 字符串，不写聊天记录、不触发 AI 请求、不改渲染。
//
// imports:
//   from '../../core/api.js': getPoolGroups, getApiPoolItems
//   from '../../core/app-bus.js': emit

import { getPoolGroups, getApiPoolItems } from '../../core/api.js';
import { emit } from '../../core/app-bus.js';

// ═══════════════════════════════════════
// 【常量】默认视觉 endpoint（仅作 fallback，可被配置或 options 覆盖）
//   不含 Key；Key 始终在运行时从配置项 keys 或 options.apiKey 取
// ═══════════════════════════════════════

const DEFAULT_VISION_ENDPOINT = {
  // Pollinations OpenAI 兼容入口；用户可在 sensory_eye 分组配自己的 endpoint 覆盖
  baseURL: 'https://gen.pollinations.ai',
  path: '/v1/chat/completions',
  // Pollinations 上中文较好的视觉模型；可被 options.model 或配置项 model 覆盖
  model: 'gemini',
  provider: 'openai'
};

// 单张压缩后体积上限（base64 字符串长度近似），避免请求体过大
const MAX_COMPRESSED_BASE64_LEN = 1024 * 1024; // ≈1MB
const MIN_QUALITY = 0.3;

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
    // 1. 解析眼睛 endpoint 候选列表（配置优先，fallback 默认）
    const endpointMeta = await resolveEyeEndpoint({ groupConfig, model, apiKey: options.apiKey, endpoint: options.endpoint });

    // 2. 没有可用 endpoint（未配置且未传 options.endpoint/apiKey）→ 降级纸条
    if (!endpointMeta) {
      return {
        ok: false,
        note: buildUnconfiguredNote(count)
      };
    }

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
// 【endpoint 解析】配置优先，fallback 默认 Pollinations
//   返回 { url, apiKey, model, provider, name } 或 null
//   - 优先级：options.endpoint/apiKey > groupConfig > sensory_eye 分组配置项 > 默认 endpoint（需 options.apiKey）
//   - 默认 endpoint 无 Key 不可用（Pollinations 现需 pk_），返回 null 走未配置纸条
// ═══════════════════════════════════════

async function resolveEyeEndpoint({ groupConfig, model, apiKey, endpoint }) {
  // 路径 A：调用方直接传了完整 endpoint + apiKey（测试页或未来直连场景）
  if (endpoint && apiKey) {
    return {
      url: buildFullUrl(endpoint),
      apiKey,
      model: model || DEFAULT_VISION_ENDPOINT.model,
      provider: DEFAULT_VISION_ENDPOINT.provider,
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

  const eyeGroup = groups?.sensory_eye;
  // 分组显式关闭时跳过配置项，遵循"分组 disabled → 不参与"约定
  // 若调用方传了 apiKey，仍允许走默认 endpoint，方便测试
  const groupDisabled = !!(eyeGroup && eyeGroup.enabled === false);
  if (groupDisabled && !apiKey) return null;

  // 从 api_pool 取 sensory_eye 的 endpoint 项，按 lastSuccessAt 排序（最近成功优先）
  // 分组关闭时跳过配置项，直接走默认 fallback
  let poolItems = [];
  if (!groupDisabled) {
    try {
      const all = await getApiPoolItems();
      poolItems = all.filter((item) => item.groupType === 'sensory_eye' && item.status !== 'disabled');
    } catch (_) {
      poolItems = [];
    }
  }

  if (poolItems.length) {
    // 按 lastSuccessAt 降序，最近成功的排第一；都没有成功记录则按原顺序
    const sorted = [...poolItems].sort((a, b) => {
      const ta = a.lastSuccessAt ? Date.parse(a.lastSuccessAt) : 0;
      const tb = b.lastSuccessAt ? Date.parse(b.lastSuccessAt) : 0;
      return (tb || 0) - (ta || 0);
    });
    const first = sorted[0];
    const key = (first.keys && first.keys[0]) || apiKey || '';
    if (first.endpoint && key) {
      return {
        url: buildFullUrl(first.endpoint),
        apiKey: key,
        model: model || first.model || DEFAULT_VISION_ENDPOINT.model,
        provider: first.provider || DEFAULT_VISION_ENDPOINT.provider,
        name: first.name || '眼睛接口'
      };
    }
  }

  // 路径 C：fallback 到默认 Pollinations endpoint，但必须有 apiKey（pk_）
  if (apiKey) {
    return {
      url: DEFAULT_VISION_ENDPOINT.baseURL + DEFAULT_VISION_ENDPOINT.path,
      apiKey,
      model: model || DEFAULT_VISION_ENDPOINT.model,
      provider: DEFAULT_VISION_ENDPOINT.provider,
      name: 'Pollinations 眼睛接口'
    };
  }

  // 既无配置项，又无 options.apiKey → 未配置
  return null;
}

// 把用户填的 endpoint（可能带 /v1、可能不带、可能已是完整 /v1/chat/completions）拼成完整请求 URL
// 规则：已含 /chat/completions 直接用；含 /v1 追加 /chat/completions；否则追加 /v1/chat/completions
function buildFullUrl(endpoint) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/v1(\/|$)/i.test(base)) return base + '/chat/completions';
  return base + '/v1/chat/completions';
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
// 【视觉请求】OpenAI 兼容格式
//   callVisionEndpoint：单次请求，传一组 dataURL
//   callVisionWithFallback：多图先一次传，失败降级逐张
// ═══════════════════════════════════════

export async function callVisionEndpoint({ dataURLs, endpointMeta, model, prompt, signal }) {
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

  const headers = { 'Content-Type': 'application/json' };
  if (endpointMeta.apiKey) {
    headers['Authorization'] = `Bearer ${endpointMeta.apiKey}`;
  }

  const res = await fetch(endpointMeta.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
    cache: 'no-store'
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`vision_http_${res.status}`);
    err.status = res.status;
    err.bodyText = text?.slice(0, 300); // 仅留前 300 字便于排查，不含 key
    throw err;
  }

  const data = await res.json().catch(() => null);
  const text = extractVisionText(data);
  if (!text) {
    const err = new Error('vision_empty_response');
    err.raw = data;
    throw err;
  }
  return text;
}

function extractVisionText(data) {
  if (!data) return '';
  // OpenAI 兼容：choices[0].message.content
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const msg = choices[0]?.message || choices[0]?.delta;
  const content = msg?.content;
  if (typeof content === 'string') return content.trim();
  // 部分实现返回数组
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('').trim();
  }
  return '';
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

  // 部分成功：合并逐张结果，关联参考留空（逐张模式无法判断关联）
  return {
    ok: true,
    raw: perImage.map((p, i) => `[第${i + 1}张] ${p.content}`).join('\n'),
    perImage,
    relationSummary: '',
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
    // 最后一项作为关联参考
    perImage = parts.slice(0, expectedCount).map((p) => ({
      content: p.trim(),
      confidence: judgeConfidence(p)
    }));
    relationSummary = parts.slice(expectedCount).join('\n').trim();
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
  if (count <= 1) return '对方发来图片，但小眼睛还没配置，没能看清。';
  return `对方发来 ${count} 张图片，但小眼睛还没配置，没能看清。`;
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
