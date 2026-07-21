// core/chat-event-bridge.js
// 常驻监听 shop:gift / wallet:transfer，按外部来源落库到 messages store
// 不依赖 chat.js 是否挂载，启动时由 index.html 调用 initChatEventBridge() 初始化一次
// 来自角色的外部私聊才写 chat_unread_counts；用户主动送出/转出不增加聊天角标
// 角色隔离：无 characterId 不落库，不乱塞默认角色

import { getData, setData, generateId, getNow, setDB, deleteDB } from './storage.js';
import { on, emit, emitUnreadChanged } from './app-bus.js';

let initialized = false;

function isDBWriteOk(result) {
  return result !== null && result !== false && result !== undefined;
}
const recentEventIds = new Set();
const pendingEventIds = new Set();
const RECENT_ID_LIMIT = 64;

// 去重：事件有 id 用 id，否则基于 type+characterId+direction+amount/itemId+timestamp 组合
function buildSourceEventId(type, data) {
  if (data?.id) return String(data.id);
  return [
    type,
    String(data?.characterId || ''),
    String(data?.direction || ''),
    String(data?.amount || data?.itemPrice || ''),
    String(data?.itemId || ''),
    String(data?.timestamp || data?.createdAt || '')
  ].join('|');
}

function isDuplicate(eventId) {
  if (!eventId) return false;
  return recentEventIds.has(eventId) || pendingEventIds.has(eventId);
}

function emitExternalMessageFailed(payload = {}, error) {
  const sourceEventId = String(payload.sourceEventId || payload.eventId || '').trim();
  const errorMessage = error?.message || String(error || '外部消息还没写好');
  try {
    emit('chat:external-message-failed', {
      eventId: sourceEventId,
      sourceEventId,
      sourceApp: String(payload.sourceApp || ''),
      sourceType: String(payload.sourceType || payload.type || ''),
      characterId: String(payload.characterId || ''),
      error: errorMessage
    });
  } catch (_) {}
}


function sumUnreadMap(map) {
  if (!map || typeof map !== 'object') return 0;
  return Object.values(map).reduce((total, value) => total + Math.max(0, Number(value) || 0), 0);
}

function emitChatUnreadChanged({ characterId, unreadMap, payload, nextCount }) {
  try {
    const emitted = emitUnreadChanged({
      appId: 'chat',
      source: String(payload.sourceApp || 'chat-event-bridge'),
      type: 'external-message',
      count: sumUnreadMap(unreadMap),
      characterId,
      threadId: characterId,
      sourceType: String(payload.sourceType || payload.type || ''),
      unread: Math.max(0, Number(nextCount) || 0)
    });
    if (!emitted && typeof window !== 'undefined' && typeof window.refreshDesktopBadges === 'function') {
      window.refreshDesktopBadges();
    }
  } catch (error) {
    console.warn('[chat-event-bridge] unread changed event failed', error);
    try {
      if (typeof window !== 'undefined' && typeof window.refreshDesktopBadges === 'function') window.refreshDesktopBadges();
    } catch (refreshError) {
      console.warn('[chat-event-bridge] refreshDesktopBadges failed', refreshError);
    }
  }
}

function markEventHandled(eventId) {
  if (!eventId) return;
  recentEventIds.add(eventId);
  if (recentEventIds.size > RECENT_ID_LIMIT) {
    const first = recentEventIds.values().next().value;
    recentEventIds.delete(first);
  }
}

export function initChatEventBridge() {
  if (initialized) return;
  initialized = true;

  on('shop:gift', (data) => { handleShopGift(data); });
  on('wallet:transfer', (data) => { handleWalletTransfer(data); });
}

async function handleShopGift(data) {
  const characterId = String(data?.characterId || '').trim();
  if (!characterId) {
    console.warn('[chat-event-bridge] shop:gift 缺少 characterId，跳过落库');
    emitExternalMessageFailed({
      ...data,
      sourceEventId: buildSourceEventId('shop:gift', data),
      sourceApp: 'shop',
      sourceType: 'shop_gift'
    }, new Error('缺少角色信息，消息还没找到要去的小窝'));
    return;
  }

  const eventId = buildSourceEventId('shop:gift', data);
  if (isDuplicate(eventId)) return;
  pendingEventIds.add(eventId);

  const itemName = data?.itemName || data?.title || '礼物';
  const name = data?.characterName || data?.characterId || 'TA';
  const dir = data?.direction;

  try {
    const message = await appendExternalChatMessage({
      sourceEventId: eventId,
      characterId,
      characterName: name,
      role: dir === 'ai_to_user' ? 'assistant' : 'user',
      type: 'gift',
      content: dir === 'ai_to_user'
        ? `收到 ${name} 的礼物：${itemName}${data?.note ? `，${data.note}` : ''}`
        : `已送 ${name} 礼物：${itemName}${data?.note ? `，${data.note}` : ''}`,
      note: String(data?.note || ''),
      direction: dir || '',
      title: dir === 'ai_to_user' ? `${name}送给我一件小物` : `送给${name}的小礼物`,
      itemId: String(data?.itemId || ''),
      itemName,
      itemDesc: String(data?.itemDesc || data?.itemDescription || ''),
      itemPrice: Number(data?.itemPrice || data?.price || 0),
      itemImage: String(data?.itemImage || data?.image || ''),
      card: data?.card || null,
      item: data?.item || null,
      shopItem: data?.shopItem || null,
      incrementUnread: dir === 'ai_to_user',
      sourceApp: 'shop',
      sourceType: 'shop_gift'
    });
    if (!message) throw new Error('消息落库失败');
    markEventHandled(eventId);
  } catch (error) {
    console.error('[chat-event-bridge] handleShopGift 落库失败', error);
  } finally {
    pendingEventIds.delete(eventId);
  }
}

async function handleWalletTransfer(data) {
  const characterId = String(data?.characterId || '').trim();
  if (!characterId) {
    console.warn('[chat-event-bridge] wallet:transfer 缺少 characterId，跳过落库');
    emitExternalMessageFailed({
      ...data,
      sourceEventId: buildSourceEventId('wallet:transfer', data),
      sourceApp: 'wallet',
      sourceType: 'wallet_transfer'
    }, new Error('缺少角色信息，消息还没找到要去的小窝'));
    return;
  }

  const eventId = buildSourceEventId('wallet:transfer', data);
  if (isDuplicate(eventId)) return;
  pendingEventIds.add(eventId);

  const amount = Number(data?.amount || 0);
  const name = data?.characterName || data?.characterId || 'TA';
  const dir = data?.direction;

  try {
    const message = await appendExternalChatMessage({
      sourceEventId: eventId,
      characterId,
      characterName: name,
      role: dir === 'ai_to_user' ? 'assistant' : 'user',
      type: 'transfer',
      content: dir === 'ai_to_user'
        ? `收到 ${name} 转来的 ¥${amount}${data?.note ? `，${data.note}` : ''}`
        : `已转给 ${name} ¥${amount}${data?.note ? `，${data.note}` : ''}`,
      amount,
      transferAmount: amount,
      note: String(data?.note || ''),
      direction: dir || '',
      title: dir === 'ai_to_user' ? `${name}转给我` : `转给${name}`,
      incrementUnread: dir === 'ai_to_user',
      sourceApp: 'wallet',
      sourceType: 'wallet_transfer'
    });
    if (!message) throw new Error('消息落库失败');
    markEventHandled(eventId);
  } catch (error) {
    console.error('[chat-event-bridge] handleWalletTransfer 落库失败', error);
  } finally {
    pendingEventIds.delete(eventId);
  }
}

// 把外部事件写入私聊消息库 + 写未读
// 字段格式对齐 thread-actions.js 的 buildBaseMessage，保证渲染层正常显示
// 导出供 anniversary-bridge 等常驻模块复用，不新建第二套消息系统
export async function appendExternalChatMessage(payload = {}) {
  const characterId = String(payload.characterId || '').trim();
  if (!characterId) {
    emitExternalMessageFailed(payload, new Error('缺少角色信息，消息还没找到要去的小窝'));
    return null;
  }

  const now = getNow();
  const role = payload.role === 'assistant' ? 'assistant' : 'user';
  const rawType = String(payload.type || 'text').trim().toLowerCase();
  const type = rawType === 'shop-item' ? 'shop_item'
    : ['text', 'voice', 'sticker', 'image', 'transfer', 'gift', 'shop_item', 'purchase', 'item', 'dice', 'rps'].includes(rawType)
      ? rawType
      : 'text';

  const message = {
    id: generateId('msg'),
    role,
    content: String(payload.content || '').trim(),
    type,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    quoteMessageId: '',
    quoteText: '',
    imageBase64: '',
    stickerId: '',
    stickerImageBase64: '',
    stickerDescription: '',
    transferAmount: Number(payload.transferAmount || payload.amount || 0),
    amount: Number(payload.amount || payload.transferAmount || payload.price || payload.itemPrice || 0),
    price: Number(payload.price || payload.itemPrice || payload.amount || 0),
    note: String(payload.note || ''),
    title: String(payload.title || ''),
    description: String(payload.description || payload.desc || ''),
    desc: String(payload.desc || payload.description || ''),
    direction: String(payload.direction || ''),
    itemId: String(payload.itemId || ''),
    itemName: String(payload.itemName || ''),
    itemDesc: String(payload.itemDesc || payload.itemDescription || ''),
    itemDescription: String(payload.itemDescription || payload.itemDesc || ''),
    itemEffect: String(payload.itemEffect || ''),
    itemPrice: Number(payload.itemPrice || payload.price || 0),
    itemImage: String(payload.itemImage || payload.image || ''),
    image: String(payload.image || payload.itemImage || ''),
    cardType: String(payload.cardType || type),
    card: payload.card || null,
    item: payload.item || null,
    shopItem: payload.shopItem || null,
    sourceApp: String(payload.sourceApp || ''),
    sourceType: String(payload.sourceType || payload.type || ''),
    isExternalMessage: true,
    sourceEventId: String(payload.sourceEventId || ''),
    characterId,
    characterName: String(payload.characterName || ''),
    characterAvatar: String(payload.characterAvatar || ''),
    groupId: '',
    versionGroupId: '',
    versionStatus: 'active'
  };

  try {
    const saved = await setDB('messages', message);
    if (!isDBWriteOk(saved)) throw new Error('消息还没能存进聊天里');
  } catch (error) {
    console.error('[chat-event-bridge] appendExternalChatMessage setDB failed', error);
    emitExternalMessageFailed(payload, error);
    return null;
  }

  // 写未读：私聊用 chat_unread_counts，群聊不动 chat_group_unread_counts
  // 若用户当前正在该私聊会话，不递增未读（chat.js 会 renderRoute 刷新显示）
  // __chatActiveThread 为跨模块全局变量，做最小防御避免读取异常打崩整条链路
  let isActivePrivate = false;
  try {
    const activeThread = window.__chatActiveThread;
    isActivePrivate = Boolean(activeThread && activeThread.mode === 'private' &&
      String(activeThread.characterId || '') === String(characterId || ''));
  } catch (_) {}

  const shouldIncrementUnread = payload.incrementUnread !== false;
  if (shouldIncrementUnread && !isActivePrivate) {
    try {
      const unreadMap = getData('chat_unread_counts') || {};
      const next = Math.max(0, Number(unreadMap[characterId] || 0) + 1);
      const nextUnreadMap = { ...unreadMap, [characterId]: next };
      const unreadSaved = setData('chat_unread_counts', nextUnreadMap);
      if (!isDBWriteOk(unreadSaved)) throw new Error('聊天未读还没能保存');
      emitChatUnreadChanged({ characterId, unreadMap: nextUnreadMap, payload, nextCount: next });
    } catch (error) {
      try { await deleteDB('messages', message.id); } catch (_) {}
      emitExternalMessageFailed(payload, error);
      return null;
    }
  }

  // 通知 chat.js 刷新 UI（chat.js 可选监听，不强制）
  try {
    emit('chat:external-message', {
      threadId: characterId,
      characterId,
      sourceApp: message.sourceApp,
      sourceType: message.sourceType,
      isExternalMessage: true,
      content: message.content,
      messageId: message.id,
      eventId: message.sourceEventId,
      type,
      message
    });
  } catch (_) {}

  return message;
}
