// core/anniversary-bridge.js
// 常驻检查到期纪念日提醒，不依赖 anniversary APP mount
// 启动时由 index.html 调用 initAnniversaryBridge() 初始化一次
// 复用 anniversary.js 的 checkTodayAnniversaries 和 chat-event-bridge.js 的 appendExternalChatMessage
// 主链路为 anniversary:reminder + 私聊消息落库；不额外写角色记忆或直接 toast
// 去重沿用 app_anniversary_greeted 键，成功提醒后每天每个纪念日只记录一次

import { getData, setData } from './storage.js';
import { emit } from './app-bus.js';
import { checkTodayAnniversaries } from '../apps/anniversary.js';
import { appendExternalChatMessage } from './chat-event-bridge.js';

let initialized = false;
let reminderTimer = null;
let visibilityHandler = null;
const CHECK_INTERVAL = 60 * 60 * 1000; // 每小时检查一次

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getGreetedKeys() {
  const raw = getData('app_anniversary_greeted');
  return new Set(Array.isArray(raw) ? raw : []);
}

function saveGreetedKeys(keys) {
  try {
    setData('app_anniversary_greeted', [...keys]);
  } catch (_) {}
}

export function initAnniversaryBridge() {
  if (initialized) return;
  initialized = true;

  // 启动后稍等再检查（让 DB 初始化完成）
  window.setTimeout(() => {
    checkAnniversaryReminders().catch(() => {});
  }, 3000);

  reminderTimer = window.setInterval(() => {
    checkAnniversaryReminders().catch(() => {});
  }, CHECK_INTERVAL);

  // 页面重新可见时也检查一次（跨天场景）
  visibilityHandler = () => {
    if (!document.hidden) {
      checkAnniversaryReminders().catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);
  window.addEventListener('pagehide', destroyAnniversaryBridge, { once: true });
}

export function destroyAnniversaryBridge() {
  if (reminderTimer !== null) {
    window.clearInterval(reminderTimer);
    reminderTimer = null;
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
  initialized = false;
}

async function checkAnniversaryReminders() {
  const today = getTodayString();
  const todayItems = await checkTodayAnniversaries();
  if (!todayItems || !todayItems.length) return;

  const greetedKeys = getGreetedKeys();

  for (const item of todayItems) {
    const greetKey = `${item.id}_${today}`;
    if (greetedKeys.has(greetKey)) continue;
    // 计算天数（当天 = 0）
    const days = 0;

    // 发事件，沿用项目命名风格
    const reminderData = {
      anniversaryId: item.id,
      title: item.name,
      date: item.date,
      characterId: item.characterId || '',
      days,
      note: item.note || '',
      source: item.source || 'user',
      createdBy: item.createdBy || ''
    };

    try {
      emit('anniversary:reminder', reminderData);
    } catch (_) {}

    // 有绑定角色时写入对应私聊 messages store；toast 由 chat:external-message 监听器统一负责。
    // 不再额外 recordExternalInteraction，避免同一纪念日同时进入记忆和聊天上下文。
    if (item.characterId) {
      const message = await appendExternalChatMessage({
        characterId: String(item.characterId),
        characterName: '',
        role: 'assistant',
        type: 'text',
        content: `今天是${item.name || '纪念日'}${item.note ? `，${item.note}` : ''}。要不要去聊聊？`,
        title: item.name,
        note: item.note || '',
        direction: 'ai_to_user',
        sourceEventId: `anniversary_${item.id}_${today}`,
        incrementUnread: true,
        sourceApp: 'anniversary',
        sourceType: 'anniversary_reminder'
      });

      if (!message) {
        console.warn('[anniversary-bridge] 纪念日提醒还没能写进聊天，保留下一次检查机会');
        continue;
      }
    }

    greetedKeys.add(greetKey);
    saveGreetedKeys(greetedKeys);

  }
}
