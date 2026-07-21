// apps/chat/sensory-ear.js
// 耳朵语音输入服务：在聊天输入栏录音 → 调「sensory_ear」分组的 STT 接口转文字 →
// 把文字填回输入框（用户自行编辑后发送）。
//
// 设计原则：
// - 语音输入法模式：只做"录音→转文字→填入输入框"，不做 hidden 注入、不自动发给 AI、
//   不做电话模式/TTS/连续对话/实时流式。
// - 不写死供应商：不内置任何 baseURL/model/key，完全由耳朵分组配置驱动。
// - 不写死 Key：apiKey 只在运行时从配置项 keys 取，绝不落进任何 .js 文件。
// - 失败不抛错：权限拒绝/网络/4xx/5xx/解析失败一律返回明确原因，调用方 toast 提示。
// - 不持久化音频：录音 Blob 只在内存中处理，不写 IndexedDB/localStorage，用完即释放。
// - 复用 api.js 的 URL 规范化与鉴权构造，与眼睛接口、"测试接口"走同源逻辑。
//
// imports:
//   from '../../core/api.js': getPoolGroups, getApiPoolItems, normalizeEndpointUrl, buildHeaders
//   from '../../core/ui.js': showToast

import { getPoolGroups, getApiPoolItems, normalizeEndpointUrl, buildHeaders } from '../../core/api.js';

// ═══════════════════════════════════════
// 【常量】本模块中立：不写死任何供应商、baseURL、model、Key。
//   耳朵分组完全由用户在设置-API配置-感官-耳朵里配置驱动；
//   空配置或无可用 endpoint 时返回明确提示，不发起任何请求。
// ═══════════════════════════════════════

// 录音最长 60 秒，到点自动停止并触发 STT
const MAX_RECORD_MS = 60 * 1000;
// Whisper 单次上传 25MB 上限，超了提示分段
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// STT 请求超时
const STT_TIMEOUT_MS = 30 * 1000;
// 受控脱敏诊断：仅 window.__sensoryEarDebug === true 时输出，默认关闭
//   开启：window.__sensoryEarDebug = true；关闭：delete window.__sensoryEarDebug

// ═══════════════════════════════════════
// 【录音控制】单例状态机：idle → recording → transcribing → idle
//   同一时刻只允许一个录音会话，避免重复 startRecording 产生孤儿流
//   startRecording() → { ok, onStop } 或 { ok:false, reason }
//   stopRecording() → { ok, blob } 或 { ok:false, reason }（取消也走这里，blob 为 null）
// ═══════════════════════════════════════

let recorderState = 'idle'; // 'idle' | 'recording' | 'transcribing'
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let recordTimer = null;
let recordStopFallbackTimer = null;
let recordStartedAt = 0;
let autoStopHandler = null; // 60s 自动停止回调（由上层走完整停止+STT 流程）

function earDebug(label, payload) {
  try {
    if (typeof window === 'undefined' || window.__sensoryEarDebug !== true) return;
    console.log(`[sensory-ear] ${label}`, payload);
  } catch (_) {
    // 诊断自身不能影响主流程
  }
}

// 脱敏 URL：去掉 query 中的 key
function maskUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''));
    if (u.searchParams.has('key')) u.searchParams.set('key', '<masked>');
    return u.toString();
  } catch {
    return String(rawUrl || '').replace(/([?&])key=[^&]*/gi, '$1key=<masked>');
  }
}

// 选择 MediaRecorder 支持的 mime 类型：webm/opus 优先，Safari 兜底 mp4
function pickSupportedMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4', // Safari 兜底
    'audio/ogg;codecs=opus'
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch (_) {
      // 部分旧实现 isTypeSupported 抛错，跳过继续
    }
  }
  return '';
}

// 从 mime 推断文件扩展名（FormData 文件名要用）
function mimeToExt(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('ogg')) return 'ogg';
  return 'webm';
}

/**
 * 开始录音
 * @param {object} opts - { onAutoStop?: ()=>void, onTick?: (ms)=>void }
 * @returns {Promise<{ok:true}|{ok:false,reason:string}>}
 *   reason: 'not_supported' | 'permission_denied' | 'busy' | 'unknown'
 */
export async function startRecording(opts = {}) {
  const { onAutoStop = null, onTick = null } = opts;

  if (recorderState !== 'idle') {
    return { ok: false, reason: 'busy' };
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
    return { ok: false, reason: 'not_supported' };
  }

  // 请求麦克风权限
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (permErr) {
    earDebug('permission_denied', { name: permErr?.name || 'NotAllowedError' });
    // NotAllowedError = 用户拒绝；NotFoundError = 无麦克风设备
    if (permErr?.name === 'NotAllowedError' || permErr?.name === 'SecurityError') {
      return { ok: false, reason: 'permission_denied' };
    }
    if (permErr?.name === 'NotFoundError' || permErr?.name === 'OverconstrainedError') {
      return { ok: false, reason: 'no_device' };
    }
    return { ok: false, reason: 'unknown' };
  }

  const mime = pickSupportedMime();
  let recorder;
  try {
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch (recErr) {
    // 创建失败：关闭已申请的 stream，避免轨道泄漏
    stream.getTracks().forEach((t) => t.stop());
    earDebug('recorder_create_failed', { error: String(recErr?.message || recErr) });
    return { ok: false, reason: 'not_supported' };
  }

  audioStream = stream;
  audioChunks = [];
  mediaRecorder = recorder;
  autoStopHandler = onAutoStop || null;
  recordStartedAt = Date.now();

  recorder.ondataavailable = (e) => {
    if (e?.data && e.data.size > 0) audioChunks.push(e.data);
  };

  recorder.start();
  recorderState = 'recording';

  // 计时器：每 200ms 回调 onTick，并在到 60s 时触发自动停止
  recordTimer = setInterval(() => {
    const elapsed = Date.now() - recordStartedAt;
    if (typeof onTick === 'function') {
      try { onTick(elapsed); } catch (_) {}
    }
    if (elapsed >= MAX_RECORD_MS) {
      // 到 60s：优先调 onAutoStop 回调（由上层走完整停止+STT 流程），
      // 无回调时自行 stopRecording（仅停止不转 STT，保底防呆）
      if (typeof autoStopHandler === 'function') {
        if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
        try { autoStopHandler(); } catch (_) {}
      } else {
        stopRecording({ auto: true });
      }
    }
  }, 200);

  earDebug('recording_started', { mime: mime || '(default)' });
  return { ok: true };
}

/**
 * 停止录音
 * @param {object} opts - { auto?: boolean, cancel?: boolean }
 *   auto=true：60s 自动停止（仍触发 STT）
 *   cancel=true：用户取消（不触发 STT，blob 丢弃）
 * @returns {Promise<{ok:true,blob:Blob}|{ok:true,cancelled:true}|{ok:false,reason:string}>}
 */
export function stopRecording(opts = {}) {
  const { auto = false, cancel = false } = opts;

  if (recorderState === 'idle' || !mediaRecorder) {
    // 已停止或未开始：清残余状态
    cleanupRecorder();
    return Promise.resolve({ ok: false, reason: 'not_recording' });
  }

  // 清计时器，避免重复触发
  if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }

  return new Promise((resolve) => {
    const recorder = mediaRecorder;
    const mime = recorder?.mimeType || 'audio/webm';
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;

      const wasCancelled = cancel;
      const wasAuto = auto;
      const chunks = audioChunks.slice();
      cleanupRecorder();

      if (wasCancelled) {
        earDebug('recording_cancelled', {});
        resolve({ ok: true, cancelled: true });
        return;
      }

      const blob = new Blob(chunks, { type: mime });

      if (blob.size === 0) {
        earDebug('recording_empty_blob', {});
        resolve({ ok: false, reason: 'empty' });
        return;
      }

      earDebug('recording_stopped', {
        auto: wasAuto,
        bytes: blob.size,
        mime: blob.type
      });
      resolve({ ok: true, blob });
    };

    // onstop 在 recorder.stop() 后触发；设超时兜底，避免某些实现不回调
    recorder.onstop = finish;
    recorder.onerror = finish;
    try {
      recorder.stop();
    } catch (stopErr) {
      earDebug('recorder_stop_error', { error: String(stopErr?.message || stopErr) });
      finish();
    }

    // 兜底：2s 内没触发 onstop 就强制 finish
    recordStopFallbackTimer = setTimeout(() => {
      if (!settled) finish();
    }, 2000);
  });
}

// 清理录音资源：停 track、清引用、复位状态
function cleanupRecorder() {
  if (recordStopFallbackTimer) { clearTimeout(recordStopFallbackTimer); recordStopFallbackTimer = null; }
  if (recordTimer) { clearInterval(recordTimer); recordTimer = null; }
  if (mediaRecorder) {
    try {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
      mediaRecorder.onerror = null;
    } catch (_) {}
  }
  if (audioStream) {
    try { audioStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    audioStream = null;
  }
  mediaRecorder = null;
  audioChunks = [];
  autoStopHandler = null;
  recorderState = 'idle';
}

export function getRecorderState() {
  return recorderState;
}

/**
 * 取消录音（快捷方法）：不触发 STT，丢弃音频
 */
export function cancelRecording() {
  return stopRecording({ cancel: true });
}

// ═══════════════════════════════════════
// 【endpoint 解析】完全配置驱动，不内置任何 fallback
//   返回 { url, apiKey, model, name } 或 null
//   - 眼睛/耳朵分组结构一致：baseURL / model / apiKey(keys) / enabled
//   - 耳朵分组不存在/disabled/无 enabled endpoint → null
//   - Whisper-compatible：统一走 /v1/audio/transcriptions，不写死供应商
// ═══════════════════════════════════════

async function resolveEarEndpoint() {
  let groups = null;
  try {
    groups = getPoolGroups();
  } catch (_) {
    groups = null;
  }

  const earGroup = groups?.sensory_ear;
  if (!earGroup) return null;
  // 分组显式关闭 → 不参与
  if (earGroup.enabled === false) return null;

  let poolItems = [];
  try {
    const all = await getApiPoolItems();
    poolItems = all.filter((item) => item.groupType === 'sensory_ear' && item.status !== 'disabled');
  } catch (_) {
    poolItems = [];
  }

  if (!poolItems.length) return null;

  // 按 lastSuccessAt 降序，最近成功的排第一
  const sorted = [...poolItems].sort((a, b) => {
    const ta = a.lastSuccessAt ? Date.parse(a.lastSuccessAt) : 0;
    const tb = b.lastSuccessAt ? Date.parse(b.lastSuccessAt) : 0;
    return (tb || 0) - (ta || 0);
  });
  const first = sorted[0];
  if (!first.endpoint) return null;

  const transcriptionsUrl = buildWhisperUrl(first.endpoint);
  const key = (first.keys && first.keys[0]) || '';
  return {
    url: transcriptionsUrl,
    apiKey: key,
    model: first.model || first.models?.[0] || '',
    name: first.name || '耳朵接口'
  };
}

// 构造 Whisper-compatible 请求 URL：base + /audio/transcriptions
//   复用 normalizeEndpointUrl 规整用户填的 baseURL（去末尾斜杠、去 /v1/v1 重）
//   规则：已含 /audio/transcriptions 直接用；已含 /v1 追加 /audio/transcriptions；否则追加 /v1/audio/transcriptions
//   与 api.js smartChatUrl 同源思路，但 STT 路径是 /audio/transcriptions 不是 /chat/completions
function buildWhisperUrl(rawEndpoint) {
  const base = normalizeEndpointUrl(rawEndpoint);
  if (!base) return '';
  const lower = base.toLowerCase();
  if (lower.endsWith('/audio/transcriptions')) return base;
  // 已含 /v1（路径末尾是 /v1 或 /v1/后还有段）
  if (/(^|\/)v1(\/|$)/.test(tryPathname(lower))) return base + '/audio/transcriptions';
  return base + '/v1/audio/transcriptions';
}

function tryPathname(url) {
  try { return new URL(url).pathname.toLowerCase(); }
  catch { return String(url || '').toLowerCase(); }
}

// ═══════════════════════════════════════
// 【STT 请求】OpenAI Whisper-compatible
//   POST {url}，FormData：file(音频) + model + language=zh
//   headers：复用 api.js buildHeaders（openai→Bearer），但不带 Content-Type（FormData 自动设 boundary）
//   成功返回文字字符串；失败抛带 status 的 Error
// ═══════════════════════════════════════

/**
 * 把音频 Blob 转成文字
 * @param {Blob} audioBlob
 * @param {object} opts - { signal?: AbortSignal }
 * @returns {Promise<{ok:true,text:string}|{ok:false,reason:string,message:string}>}
 *   reason: 'no_endpoint' | 'no_model' | 'too_large' | 'http_error' | 'network' | 'empty' | 'unknown'
 */
export async function transcribeAudio(audioBlob, opts = {}) {
  const { signal } = opts;

  // 大小检查
  if (audioBlob && audioBlob.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'too_large', message: '录音太长了，请分段发送' };
  }

  // 解析 endpoint
  let endpointMeta;
  try {
    endpointMeta = await resolveEarEndpoint();
  } catch (err) {
    earDebug('resolve_endpoint_error', { error: String(err?.message || err).slice(0, 120) });
    return { ok: false, reason: 'no_endpoint', message: '耳朵还没配置好，去设置中心的 API 轮换池里，给感官-耳朵加一个语音转文字接口' };
  }
  if (!endpointMeta) {
    earDebug('resolve_endpoint_failed', { reason: 'no_endpoint_or_group_disabled' });
    return { ok: false, reason: 'no_endpoint', message: '耳朵还没配置好，去设置中心的 API 轮换池里，给感官-耳朵加一个语音转文字接口' };
  }
  if (!endpointMeta.model) {
    earDebug('resolve_endpoint_no_model', {});
    return { ok: false, reason: 'no_model', message: '耳朵接口还没填模型名，去设置中心的感官-耳朵里补一下' };
  }

  earDebug('resolve_endpoint_ok', {
    url: maskUrl(endpointMeta.url),
    model: endpointMeta.model,
    hasApiKey: Boolean(endpointMeta.apiKey),
    apiKeyLen: endpointMeta.apiKey ? endpointMeta.apiKey.length : 0
  });

  // 构造 FormData：file + model + language=zh
  const ext = mimeToExt(audioBlob.type);
  const file = new File([audioBlob], `recording.${ext}`, { type: audioBlob.type || 'audio/webm' });
  const form = new FormData();
  form.append('file', file);
  form.append('model', endpointMeta.model);
  form.append('language', 'zh');
  // response_format 默认 json，多数 Whisper-compatible 实现支持；不强制设以免个别中转站报错

  // headers：复用 buildHeaders 拿到 Authorization，但移除 Content-Type（FormData 需自动 boundary）
  const baseHeaders = buildHeaders(endpointMeta.apiKey, 'openai');
  const headers = { ...baseHeaders };
  delete headers['Content-Type'];
  delete headers['content-type'];

  const controller = new AbortController();
  let timedOut = false;
  let externalAborted = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort('timeout');
  }, STT_TIMEOUT_MS);
  let abortHandler = null;
  // 外部 signal 联动
  if (signal) {
    abortHandler = () => {
      externalAborted = true;
      controller.abort('external');
    };
    if (signal.aborted) abortHandler();
    else signal.addEventListener('abort', abortHandler, { once: true });
  }

  earDebug('stt_request', {
    url: maskUrl(endpointMeta.url),
    model: endpointMeta.model,
    bytes: audioBlob.size,
    mime: audioBlob.type,
    hasAuth: Boolean(endpointMeta.apiKey)
  });

  let res;
  try {
    res = await fetch(endpointMeta.url, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
      cache: 'no-store'
    });
  } catch (networkErr) {
    if (networkErr?.name === 'AbortError') {
      if (externalAborted && !timedOut) {
        earDebug('stt_cancelled', {});
        return { ok: false, reason: 'cancelled', message: '这次录音已取消' };
      }
      earDebug('stt_timeout', {});
      return { ok: false, reason: 'network', message: '转换超时了，再试一次' };
    }
    earDebug('stt_network_error', { error: String(networkErr?.name || networkErr).slice(0, 120) });
    return { ok: false, reason: 'network', message: '没听清，再试一次' };
  } finally {
    clearTimeout(timer);
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
  }

  earDebug('stt_response_status', {
    status: res.status,
    contentType: res.headers.get('content-type') || ''
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const bodyHead = String(text || '').slice(0, 200);
    earDebug('stt_http_error', { status: res.status, bodyHead });
    // 401/403 鉴权问题给更明确提示
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'http_error', message: 'Key 不对或没权限，检查耳朵接口配置' };
    }
    if (res.status === 404) {
      return { ok: false, reason: 'http_error', message: '接口地址不对，确认是 Whisper 语音转文字接口' };
    }
    return { ok: false, reason: 'http_error', message: '没听清，再试一次' };
  }

  // 解析响应：Whisper 标准返回 { text: "..." }；个别中转站可能返回 { text: "", ... } 或纯文本
  const rawText = await res.text().catch(() => '');
  let text = '';
  try {
    const data = rawText ? JSON.parse(rawText) : null;
    text = String(data?.text || '').trim();
    // 兼容个别实现返回 { result: "..." } 或 { transcript: "..." }
    if (!text) text = String(data?.result || data?.transcript || '').trim();
  } catch (_) {
    // 非 JSON：当作纯文本
    text = String(rawText || '').trim();
  }

  earDebug('stt_response_text', { len: text.length, head: text.slice(0, 60) });

  if (!text) {
    return { ok: false, reason: 'empty', message: '没听清，再试一次' };
  }

  return { ok: true, text };
}

// ═══════════════════════════════════════
// 【耳朵接口测试】发一段静音音频验证连通，只测连通不测识别质量
//   生成 0.5s 静音 webm，POST 到 STT 接口，HTTP 2xx 即连通成功
//   返回 { ok, message, latencyMs } 供设置页 toast
// ═══════════════════════════════════════

/**
 * 测试耳朵接口连通性
 * @param {string} poolId - api_pool 中的 endpoint id
 * @returns {Promise<{ok:boolean,message:string,latencyMs:number}>}
 */
export async function testEarEndpoint(poolId) {
  const startedAt = Date.now();
  const items = await getApiPoolItems();
  const target = items.find((item) => String(item.id) === String(poolId));
  if (!target) return { ok: false, message: '找不到这条接口', latencyMs: 0 };
  if (!target.endpoint) return { ok: false, message: '地址没填', latencyMs: 0 };

  const model = target.model || target.models?.[0] || '';
  if (!model) return { ok: false, message: '模型名没填', latencyMs: 0 };

  const url = buildWhisperUrl(target.endpoint);
  const key = (target.keys && target.keys[0]) || '';

  // 生成 0.5s 静音音频 Blob（webm/opus，足够小，能被 Whisper 接口接受）
  const silenceBlob = await generateSilenceBlob(0.5);
  if (!silenceBlob) {
    return { ok: false, message: '浏览器不支持生成测试音频', latencyMs: Date.now() - startedAt };
  }

  const ext = mimeToExt(silenceBlob.type);
  const file = new File([silenceBlob], `silence.${ext}`, { type: silenceBlob.type });
  const form = new FormData();
  form.append('file', file);
  form.append('model', model);
  form.append('language', 'zh');

  const baseHeaders = buildHeaders(key, 'openai');
  const headers = { ...baseHeaders };
  delete headers['Content-Type'];
  delete headers['content-type'];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  earDebug('test_request', { url: maskUrl(url), model, bytes: silenceBlob.size });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
      cache: 'no-store'
    });
    const latencyMs = Date.now() - startedAt;

    if (res.ok) {
      earDebug('test_ok', { latencyMs });
      return { ok: true, message: '连接正常', latencyMs };
    }
    const text = await res.text().catch(() => '');
    earDebug('test_http_error', { status: res.status, bodyHead: String(text || '').slice(0, 120) });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Key 不对或没权限', latencyMs };
    }
    if (res.status === 404) {
      return { ok: false, message: '地址不对，确认是语音转文字接口', latencyMs };
    }
    return { ok: false, message: `接口返回 ${res.status}`, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    if (err?.name === 'AbortError') {
      return { ok: false, message: '测试超时', latencyMs };
    }
    earDebug('test_network_error', { error: String(err?.name || err).slice(0, 120) });
    return { ok: false, message: '连不上接口地址，检查地址或网络', latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

// 生成静音音频 Blob：优先用 MediaRecorder 录 0.5s 静音轨道
//   浏览器不支持时返回 null（调用方提示）
async function generateSilenceBlob(seconds = 0.5) {
  if (typeof MediaRecorder === 'undefined' || typeof AudioContext === 'undefined') return null;
  try {
    // 方案A：用 AudioContext + MediaStreamDestination 生成静音流，MediaRecorder 录制
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0; // 静音
    osc.connect(gain);
    gain.connect(dest);
    osc.start();

    const mime = pickSupportedMime();
    const recorder = mime ? new MediaRecorder(dest.stream, { mimeType: mime }) : new MediaRecorder(dest.stream);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e?.data && e.data.size > 0) chunks.push(e.data); };

    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const finish = (blob = null) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try { osc.stop(); } catch (_) {}
        try { dest.stream.getTracks().forEach((track) => track.stop()); } catch (_) {}
        try { ctx.close(); } catch (_) {}
        resolve(blob);
      };
      recorder.onstop = () => {
        if (!chunks.length) { finish(null); return; }
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        finish(blob);
      };
      recorder.onerror = () => finish(null);
      recorder.start();
      timer = setTimeout(() => {
        try { recorder.stop(); } catch (_) { finish(null); }
      }, seconds * 1000);
    });
  } catch (_) {
    return null;
  }
}

// ═══════════════════════════════════════
// 【诊断入口】受控脱敏诊断开关（供开发者控制台用）
//   window.__sensoryEarDebug = true  开启
//   delete window.__sensoryEarDebug  关闭
//   严禁打印完整 Key、完整音频 base64、完整私人响应
// ═══════════════════════════════════════

export { MAX_RECORD_MS, MAX_UPLOAD_BYTES };
