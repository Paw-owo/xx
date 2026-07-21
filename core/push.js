// core/push.js
// 生活流 push：在朋友圈发布 / 梦境生成 / AI 回复完成时，向 MCP 服务端推送摘要
// 复用云同步配置 (app_cloud_server) 的 enabled / endpoint / apiKey
// 推送失败只 console.warn，不影响任何业务流程
// 启动时由 index.html 调用 initPushBridge() 初始化一次

import { getData, setData } from './storage.js';
import { on } from './app-bus.js';

const CLOUD_KEY = 'app_cloud_server';
const DEFAULT_ENDPOINT = 'https://kiss.eoty.cn';
const PUSH_TIMEOUT = 8000;

let initialized = false;

// ═══════════════════════════════════════
// 【配置读取】从云同步配置里取 enabled / endpoint / apiKey
// ═══════════════════════════════════════

function readCloudConfig() {
  const cloud = getData(CLOUD_KEY) || {};
  const enabled = cloud.enabled === true;
  let endpoint = String(cloud.endpoint || '').trim();
  // endpoint 为空时使用默认建议地址，但不写死 token
  if (!endpoint) endpoint = DEFAULT_ENDPOINT;
  // 去掉末尾 /
  endpoint = endpoint.replace(/\/+$/, '');
  const apiKey = String(cloud.apiKey || '').trim();
  return { enabled, endpoint, apiKey };
}

function truncate(text, max) {
  const str = String(text || '').trim();
  if (!str) return '';
  return str.length > max ? str.slice(0, max) : str;
}

// ═══════════════════════════════════════
// 【底层发送】统一 fetch，失败明确返回状态，不影响业务流程
// ═══════════════════════════════════════

async function sendPush(path, payload) {
  const { enabled, endpoint, apiKey } = readCloudConfig();
  // 云同步未开启时不推送，也不发任何请求
  if (!enabled) return false;
  if (!endpoint) return false;

  const url = `${endpoint}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  // token 走请求头，与 storage-manager.js 的 cloudFetch 统一用 x-api-key，不写死到代码，也不打印
  if (apiKey) headers['x-api-key'] = apiKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      console.warn('[push]', path, 'status', response.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[push]', path, err?.message || err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════
// 【三个推送时机】只推摘要，不推大段全文
// ═══════════════════════════════════════

export async function pushMoment(post) {
  if (!post) return;
  // 兼容 { post } 包装或直接传 post
  const data = post.post || post;
  const payload = {
    id: data.id || '',
    summary: truncate(data.content, 160),
    author_id: data.authorId || data.characterId || 'user',
    author_name: data.authorName || data.author_name || data.authorId || '',
    timestamp: data.timestamp || data.createdAt || Date.now()
  };
  await sendPush('/push/moment', payload);
}

export async function pushDream(dreamOrEvent) {
  if (!dreamOrEvent) return;
  const data = dreamOrEvent.dream || dreamOrEvent;
  const payload = {
    id: data.id || data.dreamId || '',
    summary: truncate(data.summary || data.content, 200),
    character_id: data.characterId || data.character_id || '',
    mood: data.mood || '',
    timestamp: data.createdAt || data.timestamp || Date.now()
  };
  await sendPush('/push/dream', payload);
}

export async function pushCharacterState(stateOrEvent) {
  if (!stateOrEvent) return;
  const data = stateOrEvent.state || stateOrEvent;
  const lastMessage = truncate(data.lastMessage || data.last_message || data.content, 160);
  // 没有独立状态摘要时，用最近一条回复作为状态摘要
  const summary = truncate(data.summary || lastMessage, 240);
  const payload = {
    character_id: data.characterId || data.character_id || '',
    character_name: data.characterName || data.character_name || '',
    last_message: lastMessage,
    summary,
    updated_at: new Date().toISOString()
  };
  await sendPush('/push/character-state', payload);
}

// ═══════════════════════════════════════
// 【聊天记录批量推送】会话切出时把 watermark 之后的新消息批量推上去
// ═══════════════════════════════════════

const WATERMARK_PREFIX = 'push_msg_watermark_';

// per-characterId 的 in-flight 锁：同一角色同一时刻只允许一个 pushMessages 在跑。
// 并发第二次调用直接跳过，避免读到同一 watermark 后 POST 相同批次造成重复推送。
// 不同角色互不影响（不同 key），可以并行。
const inflightPushMessages = new Set();

function readWatermark(characterId) {
  const key = WATERMARK_PREFIX + String(characterId || '');
  const raw = getData(key);
  // 存的是 timestamp 字符串/数字，统一转 number
  const ts = Number(raw);
  return Number.isFinite(ts) ? ts : 0;
}

function writeWatermark(characterId, timestamp) {
  const key = WATERMARK_PREFIX + String(characterId || '');
  setData(key, timestamp);
}

export async function pushMessages(characterId, characterName, messages) {
  if (!characterId) return;
  if (!Array.isArray(messages) || messages.length === 0) return;

  // 同一角色已有 pushMessages 在跑：直接跳过，不重复 POST 同一批消息。
  // 跳过的调用方拿不到结果，但 pushMessages 本就是 fire-and-forget，
  // 下次切出会话/触发推送时会读到推进后的 watermark，补不上的消息会留在下次批次里。
  if (inflightPushMessages.has(characterId)) return;
  inflightPushMessages.add(characterId);

  try {
    // 只推 watermark 之后的新消息，避免重复推
    const watermark = readWatermark(characterId);
    const newMessages = messages
      .filter((msg) => {
        const ts = new Date(msg.timestamp || 0).getTime();
        return Number.isFinite(ts) && ts > watermark;
      })
      .map((msg) => ({
        id: String(msg.id || ''),
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: truncate(msg.content, 2000),
        timestamp: msg.timestamp || ''
      }));

    if (newMessages.length === 0) return;

    const payload = {
      characterId: String(characterId),
      characterName: String(characterName || ''),
      messages: newMessages
    };

    const pushed = await sendPush('/push/messages', payload);
    if (!pushed) return;

    // 推送成功后更新 watermark 到最后一条消息的 timestamp
    // 保留「只有成功才推进 watermark」的逻辑：失败/跳过都不推进，下次会重试这批
    const lastTs = new Date(newMessages[newMessages.length - 1].timestamp || 0).getTime();
    if (Number.isFinite(lastTs)) {
      writeWatermark(characterId, lastTs);
    }
  } finally {
    inflightPushMessages.delete(characterId);
  }
}

// ═══════════════════════════════════════
// 【事件桥接】订阅 AppBus 事件，fire-and-forget
// ═══════════════════════════════════════

export function initPushBridge() {
  if (initialized) return;
  initialized = true;

  on('moments:published', (eventData) => {
    pushMoment(eventData).catch(() => {});
  });

  on('dream:created', (eventData) => {
    pushDream(eventData).catch(() => {});
  });

  on('chat:ai-reply-finished', (eventData) => {
    pushCharacterState(eventData).catch(() => {});
  });
}

// depends: core/storage.js -> getData, setData; core/app-bus.js -> on
