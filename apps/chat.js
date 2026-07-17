// apps/chat.js
// imports:
//   from './chat/list.js': mountChatList, unmountChatList
//   from './chat/memory.js': mountChatMemory, unmountChatMemory
//   from './chat/thread.js': mountChatThread, unmountChatThread
//   from '../core/storage.js': getData, setData, generateId, getNow, getDB, setDB, getByIndexDB
//   from '../core/api.js': silentRequest

import { mountChatList, unmountChatList } from './chat/list.js';
import { mountChatMemory, unmountChatMemory } from './chat/memory.js';
import { mountChatThread, unmountChatThread } from './chat/thread.js';

import {
  getData,
  setData
} from '../core/storage.js';

const CHAT_APP_STYLE_ID = 'chat-app-style';
const CHAT_ROUTE_KEY = 'chat_last_route';
const CHAT_HIDDEN_PRIVATE_KEY = 'chat_hidden_private_threads';

let rootEl = null;
let mounted = false;
let activeView = '';
let activeStage = null; // 实际已挂载到 rootEl 的 stage 元素
let renderRequestVersion = 0;
let renderPromise = null;
let unsubscribeCharsUpdated = null;
let unsubscribeChatExternalMessage = null;
let unsubscribeAnniversaryReminder = null;
let currentRoute = {
  name: 'list',
  params: {
    tab: 'private',
    search: ''
  }
};

export async function mount(containerEl, options = {}) {
  rootEl = containerEl;
  mounted = true;
  activeView = '';

  injectChatAppStyle();
  currentRoute = resolveInitialRoute(options);

  await renderRoute();

  // 监听全局事件
  if (window.AppBus) {
    unsubscribeCharsUpdated = window.AppBus.on('characters:updated', async () => {
      if (currentRoute.name !== 'list') return;
      try {
        await renderRoute();
      } catch (error) {
        console.warn('[chat] characters:updated renderRoute failed:', error?.message || error);
      }
    });

    // shop:gift / wallet:transfer 的落库 + 未读已由常驻层 core/chat-event-bridge.js 处理
    // chat.js 只监听 chat:external-message 做 UI 刷新和 toast，避免重复落库
    unsubscribeChatExternalMessage = window.AppBus.on('chat:external-message', async (data) => {
      try {
        const characterId = data?.characterId;
        const isInThread = currentRoute.name === 'thread' && currentRoute.params?.characterId === characterId;

        // 当前会话就是该角色时，刷新 thread 不 toast
        if (isInThread) {
          await renderRoute();
          return;
        }

        // 否则 toast 提示（落库已由常驻层完成）
        const text = data?.message?.content || '';
        if (text) window.showToast?.(text);
      } catch (error) {
        console.warn('[chat] chat:external-message handle failed:', error?.message || error);
      }
    });

    // 纪念日提醒：anniversary-bridge 已直接落库（appendExternalChatMessage → chat:external-message），
    // chat:external-message 监听器已负责 toast + 列表刷新，这里只做「正在该会话时刷新 thread」，
    // 不再重复 toast，避免双 toast（anniversary-bridge 自身的 showToast + 这里的 toast + external-message 的 toast）
    unsubscribeAnniversaryReminder = window.AppBus.on('anniversary:reminder', async (data) => {
      try {
        const characterId = data?.characterId;
        const isInThread = currentRoute.name === 'thread' && currentRoute.params?.characterId === characterId;

        if (isInThread) {
          // 正在该角色会话里：刷新 thread 展示新消息
          await renderRoute();
          return;
        }

        // 不在该会话：只刷新列表（toast 由 chat:external-message 监听器和 anniversary-bridge 自身负责）
        if (currentRoute.name === 'list') {
          await renderRoute();
        }
      } catch (error) {
        console.warn('[chat] anniversary:reminder handle failed:', error?.message || error);
      }
    });
  }
}

export function unmount() {
  mounted = false;
  // 使尚未完成的异步路由挂载失效；完成后只清理自己的临时舞台。
  renderRequestVersion += 1;

  unmountActiveView();

  if (unsubscribeCharsUpdated) {
    try { unsubscribeCharsUpdated(); } catch (_) {}
    unsubscribeCharsUpdated = null;
  }
  if (unsubscribeChatExternalMessage) {
    try { unsubscribeChatExternalMessage(); } catch (_) {}
    unsubscribeChatExternalMessage = null;
  }
  if (unsubscribeAnniversaryReminder) {
    try { unsubscribeAnniversaryReminder(); } catch (_) {}
    unsubscribeAnniversaryReminder = null;
  }

  if (rootEl) {
    rootEl.replaceChildren();
  }

  rootEl = null;
  activeView = '';
  activeStage = null;
}

// 对外暴露 chat 能力，供其他 APP 通过 appBus.getAPI('chat') 调用
export function getAppApi() {
  return {
    appState,

    async openPrivateThread(characterId) {
      return appState.openPrivateThread(characterId);
    },

    async openGroupThread(groupId) {
      return appState.openGroupThread(groupId);
    },

    async openMemory(characterId, options = {}) {
      return appState.openMemory(characterId, options);
    },

    async sendMessage(characterId, text, extra = {}) {
      const id = String(characterId || '').trim();
      const content = String(text || '').trim();
      if (!id || !content) return null;
      await appState.openPrivateThread(id);
      // 通过 recordExternalInteraction 把外部消息写入记忆；UI 层的消息渲染由 thread 自身处理
      return recordExternalInteraction({
        characterId: id,
        role: 'user',
        content,
        source: extra.source || '外部 APP',
        importance: extra.importance,
        mood: extra.mood || ''
      });
    },

    async refreshList() {
      if (currentRoute.name === 'list') {
        await renderRoute();
      }
    },

    async refreshCurrentThread() {
      if (currentRoute.name === 'thread') {
        await renderRoute();
      }
    },

    async recordExternalInteraction(payload) {
      return recordExternalInteraction(payload);
    },

    async navigateToRoute(route) {
      if (!route || !route.name) return;
      await navigateTo(route);
    }
  };
}

export async function recordExternalInteraction(input = {}, legacyInteraction = {}) {
  // 统一走 core/memory.js（通过 appBus 转发），保留 source/keywords/importance/mood
  const payload = normalizeExternalInteraction(input, legacyInteraction);
  if (!payload?.characterId || !payload?.content) return null;
  try {
    return await window.AppBus.recordExternalInteraction(payload);
  } catch (_) {
    return null;
  }
}

export const appState = {
  getRoute() {
    return currentRoute;
  },

  async goList(options = {}) {
    await navigateTo({
      name: 'list',
      params: {
        tab: options.tab === 'group' ? 'group' : 'private',
        search: options.search || ''
      }
    });
  },

  async navigateToList(options = {}) {
    await this.goList(options);
  },

  async openPrivateThread(characterId) {
    const id = String(characterId || '').trim();
    if (!id) return;

    unhidePrivateThread(id);

    await navigateTo({
      name: 'thread',
      params: {
        mode: 'private',
        characterId: id,
        groupId: ''
      }
    });
  },

  async openGroupThread(groupId) {
    const id = String(groupId || '').trim();
    if (!id) return;

    await navigateTo({
      name: 'thread',
      params: {
        mode: 'group',
        characterId: '',
        groupId: id
      }
    });
  },

  async openMemory(characterId, options = {}) {
    const id = String(characterId || '').trim();
    if (!id) return;

    await navigateTo({
      name: 'memory',
      params: {
        characterId: id,
        fromRoute: options.fromRoute || currentRoute
      }
    });
  },

  async backFromMemory(fallbackRoute = null) {
    const route = fallbackRoute || currentRoute.params?.fromRoute || {
      name: 'list',
      params: { tab: 'private', search: '' }
    };

    await navigateTo(route);
  },

  hidePrivateThread(characterId) {
    hidePrivateThread(characterId);
  },

  isPrivateThreadHidden(characterId) {
    return isPrivateThreadHidden(characterId);
  },

  async recordExternalInteraction(input = {}, legacyInteraction = {}) {
    return recordExternalInteraction(input, legacyInteraction);
  },

  closeApp() {
    closeChatApp();
  }
};

async function navigateTo(route) {
  currentRoute = normalizeRoute(route);
  saveRoute();
  await renderRoute();
}

async function renderRoute() {
  if (!rootEl || !mounted) return;

  renderRequestVersion += 1;
  if (renderPromise) return renderPromise;

  renderPromise = drainRouteRenders();
  try {
    await renderPromise;
  } finally {
    renderPromise = null;
  }
}

async function drainRouteRenders() {
  let handledVersion = 0;
  while (rootEl && mounted && handledVersion !== renderRequestVersion) {
    handledVersion = renderRequestVersion;
    await performRouteRender(handledVersion);
  }
}

async function performRouteRender(renderVersion) {
  if (!rootEl || !mounted) return;

  const route = normalizeRoute(currentRoute);
  const targetRoot = rootEl;
  const stage = document.createElement('div');
  stage.className = 'chat-route-stage';

  // 先卸载旧视图的 JS 资源（不动 rootEl，旧 stage 仍可见，避免闪烁）
  const previousView = activeView;
  unmountViewByName(previousView);

  // 提前标记目标视图，挂载失败时也能据此清理目标视图已注册的资源
  activeView = route.name;

  try {
    if (route.name === 'thread') {
      await mountChatThread(stage, {
        appState,
        mode: route.params.mode,
        characterId: route.params.characterId,
        groupId: route.params.groupId
      });
    } else if (route.name === 'memory') {
      await mountChatMemory(stage, {
        appState,
        characterId: route.params.characterId,
        fromRoute: route.params.fromRoute
      });
    } else {
      await mountChatList(stage, {
        appState,
        tab: route.params.tab,
        search: route.params.search
      });
    }
  } catch (error) {
    // 挂载失败：清理目标视图可能已注册的资源，并清空舞台，
    // 避免留下半创建的 stage / 旧 rootEl / 错误 activeView
    try { unmountViewByName(route.name); } catch (_) {}
    if (renderVersion === renderRequestVersion && rootEl === targetRoot && mounted) {
      targetRoot.replaceChildren();
      activeStage = null;
      activeView = '';
    }
    throw error;
  }

  // 挂载期间被卸载或被更新的路由取代：不把过期舞台提交到页面。
  if (!rootEl || !mounted || rootEl !== targetRoot || renderVersion !== renderRequestVersion) {
    try { unmountViewByName(route.name); } catch (_) {}
    if (activeView === route.name) activeView = '';
    return;
  }

  targetRoot.replaceChildren(stage);
  activeStage = stage;
}

function unmountViewByName(name) {
  if (name === 'thread') {
    try { unmountChatThread(); } catch (_) {}
  } else if (name === 'memory') {
    try { unmountChatMemory(); } catch (_) {}
  } else if (name === 'list') {
    try { unmountChatList(); } catch (_) {}
  }
}

function unmountActiveView() {
  // 不只依赖 activeView 字符串：先按名卸载 JS 资源，再防御性清理实际挂载的 stage DOM
  unmountViewByName(activeView);
  activeView = '';

  if (activeStage && rootEl && rootEl.contains(activeStage)) {
    rootEl.replaceChildren();
  }
  activeStage = null;
}

function resolveInitialRoute(options = {}) {
  if (options.route) return normalizeRoute(options.route);

  const saved = getData(CHAT_ROUTE_KEY);
  if (saved?.name) return normalizeRoute(saved);

  return normalizeRoute({
    name: 'list',
    params: {
      tab: options.tab === 'group' ? 'group' : 'private',
      search: ''
    }
  });
}

function saveRoute() {
  setData(CHAT_ROUTE_KEY, currentRoute);
}

function normalizeRoute(route) {
  if (!route || typeof route !== 'object') {
    return {
      name: 'list',
      params: {
        tab: 'private',
        search: ''
      }
    };
  }

  if (route.name === 'thread') {
    const mode = route.params?.mode === 'group' ? 'group' : 'private';

    return {
      name: 'thread',
      params: {
        mode,
        characterId: mode === 'private' ? String(route.params?.characterId || '') : '',
        groupId: mode === 'group' ? String(route.params?.groupId || '') : ''
      }
    };
  }

  if (route.name === 'memory') {
    return {
      name: 'memory',
      params: {
        characterId: String(route.params?.characterId || ''),
        fromRoute: route.params?.fromRoute ? normalizeRoute(route.params.fromRoute) : null
      }
    };
  }

  return {
    name: 'list',
    params: {
      tab: route.params?.tab === 'group' ? 'group' : 'private',
      search: String(route.params?.search || '')
    }
  };
}

function normalizeExternalInteraction(input, legacyInteraction) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return {
      characterId: input.characterId,
      role: input.role || 'assistant',
      content: input.content || input.text || input.note || '',
      source: input.source || '外部互动',
      importance: input.importance,
      mood: input.mood || '',
      character: input.character || null,
      userProfile: input.userProfile || {}
    };
  }

  return {
    characterId: input,
    role: legacyInteraction?.role || 'assistant',
    content: legacyInteraction?.content || legacyInteraction?.text || legacyInteraction?.note || '',
    source: legacyInteraction?.source || '外部互动'
  };
}

function getHiddenPrivateThreads() {
  const saved = getData(CHAT_HIDDEN_PRIVATE_KEY);
  return Array.isArray(saved) ? saved : [];
}

function hidePrivateThread(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const ids = new Set(getHiddenPrivateThreads());
  ids.add(id);
  setData(CHAT_HIDDEN_PRIVATE_KEY, [...ids]);
}

function unhidePrivateThread(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const next = getHiddenPrivateThreads().filter((item) => item !== id);
  setData(CHAT_HIDDEN_PRIVATE_KEY, next);
}

function isPrivateThreadHidden(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return false;
  return getHiddenPrivateThreads().includes(id);
}

function closeChatApp() {
  if (typeof window.closeCurrentApp === 'function') {
    window.closeCurrentApp();
    return;
  }

  if (typeof window.closeApp === 'function') {
    window.closeApp('chat');
    return;
  }

  if (typeof window.navigateHome === 'function') {
    window.navigateHome();
  }
}

function injectChatAppStyle() {
  if (document.getElementById(CHAT_APP_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = CHAT_APP_STYLE_ID;
  style.textContent = `
    .chat-route-stage {
      --chat-kawaii-surface: color-mix(in srgb, var(--bg-card) 92%, var(--accent-light));
      --chat-kawaii-surface-soft: color-mix(in srgb, var(--bg-card) 76%, var(--accent-light));
      --chat-kawaii-accent: color-mix(in srgb, var(--accent) 78%, var(--bg-card));
      --chat-kawaii-line: color-mix(in srgb, var(--text-primary) 48%, var(--accent-dark));
      --chat-kawaii-line-soft: color-mix(in srgb, var(--chat-kawaii-line) 36%, transparent);
      --chat-kawaii-text: color-mix(in srgb, var(--text-primary) 88%, var(--accent-dark));
      --chat-kawaii-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 12%, transparent);
      --chat-icon-line: var(--chat-kawaii-line);
      --chat-icon-fill: color-mix(in srgb, var(--accent-light) 72%, var(--bg-card));
      --chat-icon-paper: color-mix(in srgb, var(--bg-card) 74%, var(--accent-light));
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .chat-page {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: var(--font-size-base);
      line-height: 1.6;
    }

    .chat-icon-btn,
    .chat-primary-btn,
    .chat-ghost-btn {
      border: 0;
      font: inherit;
      transition: all 200ms ease;
    }

    .chat-icon-btn:active,
    .chat-primary-btn:active,
    .chat-ghost-btn:active {
      transform: scale(0.96);
    }

    .chat-icon-btn {
      width: 38px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .chat-primary-btn,
    .chat-ghost-btn {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 16px;
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
    }

    .chat-primary-btn {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-ghost-btn {
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .chat-input-card {
      width: 100%;
      min-height: 42px;
      border: 0;
      outline: 0;
      border-radius: var(--radius-md);
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      padding: 10px 13px;
      font: inherit;
      font-size: 16px;
      line-height: 1.6;
      appearance: none;
    }

    .chat-input-card::placeholder {
      color: var(--text-hint);
    }

    .chat-empty {
      min-height: 190px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 30px 20px;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      text-align: center;
    }

    .chat-empty-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-empty-desc {
      max-width: 270px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .chat-page .chat-icon-btn,
    .chat-page .chat-thread-send,
    .chat-page .chat-primary-btn,
    .chat-page .chat-ghost-btn,
    .chat-page .chat-mini-btn,
    .chat-page .chat-load-more-btn,
    .chat-page .chat-thread-tool-page-btn {
      border: 0;
      box-shadow: var(--chat-kawaii-shadow);
    }

    .chat-page .chat-icon-btn,
    .chat-page .chat-ghost-btn,
    .chat-page .chat-mini-btn,
    .chat-page .chat-load-more-btn,
    .chat-page .chat-thread-tool-page-btn {
      background: var(--chat-kawaii-surface);
      color: var(--chat-kawaii-text);
    }

    .chat-page .chat-primary-btn,
    .chat-page .chat-mini-btn.primary,
    .chat-page .chat-thread-send,
    .chat-page .chat-list-tab.active {
      background: var(--chat-kawaii-accent);
      color: var(--chat-kawaii-text);
    }

    .chat-page .chat-input-card,
    .chat-page .chat-thread-input,
    .chat-page .chat-thread-search-input,
    .chat-page .chat-list-search-input {
      border: 0;
      background: var(--chat-kawaii-surface);
      color: var(--chat-kawaii-text);
      box-shadow: var(--chat-kawaii-shadow);
    }

    .chat-page .chat-thread-tool-card,
    .chat-page .chat-list-action,
    .chat-page .chat-list-picker-row,
    .chat-page .chat-thread-row,
    .chat-page .chat-empty,
    .chat-page .chat-pending-image {
      border: 0;
      background: var(--chat-kawaii-surface);
      box-shadow: var(--chat-kawaii-shadow);
    }

    .chat-page .chat-thread-tool-icon,
    .chat-page .chat-list-action-icon,
    .chat-page .chat-token-pill,
    .chat-page .chat-thread-lock-badge {
      border: 0;
      background: var(--chat-kawaii-surface-soft);
      color: var(--chat-kawaii-text);
      box-shadow: none;
    }

    .chat-page .chat-icon-btn,
    .chat-page .chat-thread-mic,
    .chat-page .chat-thread-send {
      width: 42px;
      height: 42px;
      min-width: 42px;
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 0;
      border-radius: 15px;
      background: var(--chat-kawaii-surface-soft);
      color: var(--chat-kawaii-text);
      box-shadow: var(--chat-kawaii-shadow);
    }

    .chat-page .chat-thread-send {
      border-radius: 16px;
      background: var(--chat-kawaii-accent);
    }

    .chat-page .chat-thread-mic.is-recording {
      background: var(--chat-kawaii-accent);
      color: var(--chat-kawaii-text);
    }

    .chat-page .chat-icon-btn:disabled,
    .chat-page .chat-thread-mic:disabled,
    .chat-page .chat-thread-send:disabled {
      opacity: 0.48;
      box-shadow: none;
    }

    .chat-page .chat-icon-btn:focus-visible,
    .chat-page .chat-thread-mic:focus-visible,
    .chat-page .chat-thread-send:focus-visible,
    .chat-page .chat-mini-btn:focus-visible,
    .chat-page .chat-load-more-btn:focus-visible,
    .chat-page .chat-thread-tool-page-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .chat-page .chat-thread-tool-card {
      background: var(--chat-kawaii-surface-soft);
      box-shadow: none;
    }

    .chat-page .chat-thread-tool-icon,
    .chat-page .chat-list-action-icon {
      background: transparent;
      box-shadow: none;
    }

    .chat-page .chat-message-action-btn,
    .chat-page .tc-pill {
      border: 0;
      background: var(--chat-kawaii-surface-soft);
      color: var(--chat-kawaii-text);
      box-shadow: var(--chat-kawaii-shadow);
    }

    /* Chat containers share one quiet cat-toy language without covering content. */
    .chat-page .chat-thread-row,
    .chat-page .chat-message-bubble,
    .chat-page .chat-time-pill,
    .chat-page .chat-message-quote,
    .chat-page .chat-quote-preview,
    .chat-page .chat-pending-card,
    .chat-page .chat-pending-image,
    .chat-page .chat-thread-tool-card,
    .chat-page .chat-thread-input-bar {
      position: relative;
    }

    .chat-page .chat-thread-row {
      border-radius: 22px 22px 22px 16px;
    }

    .chat-page .chat-thread-row::before {
      content: '';
      position: absolute;
      top: -4px;
      left: 18px;
      width: 10px;
      height: 10px;
      border-radius: 3px 8px 3px 8px;
      background: var(--chat-kawaii-surface);
      transform: rotate(35deg);
      pointer-events: none;
    }

    .chat-page .chat-message-bubble:not(.sticker-bubble):not(.image-bubble) {
      overflow: visible;
      box-shadow: var(--chat-kawaii-shadow);
    }

    .chat-page .chat-message-bubble.role-user:not(.sticker-bubble):not(.image-bubble) {
      border-radius: 21px 21px 8px 21px;
    }

    .chat-page .chat-message-bubble.role-user:not(.sticker-bubble):not(.image-bubble)::after {
      content: '';
      position: absolute;
      right: -5px;
      bottom: 3px;
      width: 11px;
      height: 15px;
      border-right: 5px solid var(--bubble-user-bg);
      border-bottom: 3px solid var(--bubble-user-bg);
      border-radius: 0 0 12px 0;
      transform: rotate(12deg);
      pointer-events: none;
    }

    .chat-page .chat-message-bubble.role-ai:not(.sticker-bubble):not(.image-bubble) {
      border-radius: 21px 21px 21px 9px;
    }

    .chat-page .chat-message-bubble.role-ai:not(.sticker-bubble):not(.image-bubble)::before {
      content: '';
      position: absolute;
      left: 13px;
      top: -5px;
      width: 9px;
      height: 9px;
      border-radius: 2px 7px 2px 7px;
      background: var(--bubble-ai-bg);
      transform: rotate(45deg);
      pointer-events: none;
    }

    .chat-page .chat-message-row.mode-dialog .chat-message-bubble:not(.sticker-bubble):not(.image-bubble) {
      padding: 10px 12px;
      background: var(--chat-kawaii-surface-soft);
      border-radius: 20px;
      box-shadow: var(--chat-kawaii-shadow);
    }

    .chat-page .chat-time-pill {
      border-radius: 999px 999px 999px 13px;
      background: var(--chat-kawaii-surface-soft);
      box-shadow: none;
    }

    .chat-page .chat-time-pill::before {
      content: '';
      position: absolute;
      top: -4px;
      left: 11px;
      width: 8px;
      height: 8px;
      border-radius: 2px 7px 2px 7px;
      background: var(--chat-kawaii-surface-soft);
      transform: rotate(45deg);
    }

    .chat-page .tc-pill {
      position: relative;
      border-radius: 999px 999px 999px 14px;
    }

    .chat-page .tc-pill::before {
      content: '';
      position: absolute;
      top: -4px;
      left: 12px;
      width: 8px;
      height: 8px;
      border-radius: 2px 7px 2px 7px;
      background: var(--chat-kawaii-surface-soft);
      transform: rotate(45deg);
    }

    .chat-page .chat-message-quote,
    .chat-page .chat-quote-preview {
      border: 0;
      border-radius: 18px 18px 18px 10px;
      background: var(--chat-kawaii-surface-soft);
      box-shadow: none;
    }

    .chat-page .chat-message-quote::before,
    .chat-page .chat-quote-preview::before {
      content: '';
      position: absolute;
      top: 50%;
      left: -5px;
      width: 9px;
      height: 13px;
      border: 2px solid var(--accent);
      border-radius: 8px 3px 8px 3px;
      transform: translateY(-50%) rotate(38deg);
      opacity: 0.5;
      pointer-events: none;
    }

    .chat-page .chat-message-action-btn {
      min-width: 28px;
      min-height: 28px;
      border-radius: 14px 14px 14px 9px;
      box-shadow: none;
    }

    .chat-page .chat-pending-card {
      padding: 7px 10px;
      border-radius: 16px 16px 16px 8px;
      background: var(--chat-kawaii-surface-soft);
    }

    .chat-page .chat-pending-dot {
      width: 7px;
      height: 7px;
      background: var(--accent);
    }

    .chat-page .chat-pending-image {
      border-radius: 18px 18px 18px 10px;
    }

    .chat-page .chat-pending-image::before {
      content: '';
      position: absolute;
      z-index: 1;
      top: -3px;
      left: 10px;
      width: 9px;
      height: 9px;
      border-radius: 2px 7px 2px 7px;
      background: var(--chat-kawaii-surface-soft);
      transform: rotate(45deg);
      pointer-events: none;
    }

    .chat-page .chat-thread-tool-head {
      align-items: center;
    }

    .chat-page .chat-thread-tool-title {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .chat-page .chat-thread-tool-title::before {
      content: '';
      width: 11px;
      height: 11px;
      border: 2px solid var(--accent);
      border-radius: 7px 7px 9px 9px;
      opacity: 0.55;
    }

    .chat-page .chat-thread-tool-card {
      border-radius: 22px 22px 22px 14px;
    }

    .chat-page .chat-thread-input-bar {
      margin: 0 10px calc(8px + env(safe-area-inset-bottom));
      padding: 10px 10px 10px;
      border-radius: 26px 26px 20px 20px;
      background: color-mix(in srgb, var(--chat-kawaii-surface) 88%, transparent);
      box-shadow: var(--chat-kawaii-shadow);
    }

    .chat-page .chat-thread-input-bar::before {
      content: '';
      position: absolute;
      top: -7px;
      right: 28px;
      width: 16px;
      height: 11px;
      border: 2px solid var(--accent);
      border-radius: 10px 4px 10px 4px;
      background: var(--chat-kawaii-surface);
      transform: rotate(12deg);
      opacity: 0.42;
      pointer-events: none;
    }

    .chat-page .chat-thread-input {
      border-radius: 18px 18px 18px 12px;
      box-shadow: none;
    }

    .chat-page .chat-icon-btn,
    .chat-page .chat-thread-mic {
      border-radius: 16px 16px 16px 11px;
    }

    .chat-kawaii-icon .fill {
      fill: var(--chat-icon-fill);
      stroke: var(--chat-icon-line);
    }

    .chat-kawaii-icon .paper {
      fill: var(--chat-icon-paper);
      stroke: var(--chat-icon-line);
    }

    .chat-kawaii-icon .dot {
      fill: var(--chat-icon-line);
      stroke: none;
    }

    .chat-empty-icon {
      width: 58px;
      height: 50px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 2px;
      border: 0;
      border-radius: 46% 54% 48% 52%;
      background: var(--chat-kawaii-surface-soft);
      color: var(--chat-kawaii-text);
      box-shadow: var(--chat-kawaii-shadow);
    }

    body:has(.chat-route-stage) {
      --chat-kawaii-surface: color-mix(in srgb, var(--bg-card) 92%, var(--accent-light));
      --chat-kawaii-surface-soft: color-mix(in srgb, var(--bg-card) 76%, var(--accent-light));
      --chat-kawaii-accent: color-mix(in srgb, var(--accent) 78%, var(--bg-card));
      --chat-kawaii-text: color-mix(in srgb, var(--text-primary) 88%, var(--accent-dark));
      --chat-kawaii-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 12%, transparent);
    }

    /* Option rows: one clipped-soft corner reads as a cat-tail notch. */
    body:has(.chat-route-stage) :is(
      .chat-list-tab,
      .chat-list-action,
      .chat-list-picker-row,
      .chat-action-sheet-item,
      .settings-nav-item,
      .settings-switch-row,
      .settings-label-block,
      .api-choice-card,
      .api-section-entry,
      .api-detail-segment,
      .mcp-server-row,
      .mcp-tool-row,
      .thread-chip-card,
      .editable-card,
      .tools-option-btn,
      .tools-stat-row,
      .tools-chip,
      .tools-empty,
      .gh-item,
      .ask-user-option,
      .tc-step-row,
      .ss-tab-btn
    ) {
      border: 0;
      border-radius: 19px 19px 19px 11px;
      background: var(--chat-kawaii-surface-soft);
      box-shadow: none;
    }

    body:has(.chat-route-stage) :is(
      .settings-nav-item,
      .settings-switch-row,
      .settings-label-block,
      .api-choice-card,
      .api-section-entry,
      .api-detail-segment,
      .mcp-server-row,
      .mcp-tool-row,
      .thread-chip-card,
      .editable-card,
      .tools-option-btn,
      .tools-stat-row,
      .tools-chip,
      .tools-empty,
      .gh-item,
      .ask-user-option,
      .tc-step-row
    ) {
      position: relative;
      overflow: visible;
    }

    /* Panels stay readable and use a single toy-tag corner rather than a plain card. */
    body:has(.chat-route-stage) :is(
      .settings-card,
      .settings-confirm-card,
      .api-detail-card,
      .thread-sheet-card,
      .thread-sheet-empty,
      .chat-memory-card,
      .chat-memory-add-panel,
      .chat-memory-hero-block,
      .chat-lock-card,
      .chat-input-dialog-card,
      .ask-user-card,
      .ask-user-sheet,
      .ss-confirm-card,
      .gh-field,
      .gh-commit-field,
      .chat-game-card,
      .chat-dice-card,
      .chat-rps-card,
      .chat-mini-message-card,
      .chat-voice-card,
      .chat-message-code,
      .tc-detail-section
    ) {
      border: 0;
      border-radius: 22px 22px 22px 13px;
      background-color: var(--chat-kawaii-surface);
      box-shadow: var(--chat-kawaii-shadow);
    }

    /* Section labels carry one tiny bell; text and wrapping remain untouched. */
    body:has(.chat-route-stage) :is(
      .settings-card-title,
      .api-sheet-heading,
      .thread-sheet-title,
      .tools-section-label,
      .tools-detail-title,
      .tools-section-title,
      .chat-settings-sheet-title,
      .chat-thread-tools-title,
      .chat-action-sheet-title,
      .tc-sheet-title,
      .tc-detail-section-label
    ) {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    body:has(.chat-route-stage) :is(
      .settings-card-title,
      .api-sheet-heading,
      .thread-sheet-title,
      .tools-section-label,
      .tools-detail-title,
      .tools-section-title,
      .chat-settings-sheet-title,
      .chat-thread-tools-title,
      .chat-action-sheet-title,
      .tc-sheet-title,
      .tc-detail-section-label
    )::before {
      content: '';
      width: 10px;
      height: 10px;
      flex: 0 0 auto;
      border: 2px solid var(--accent);
      border-radius: 7px 7px 9px 9px;
      opacity: 0.5;
    }

    /* Toggles and selection marks become quiet paw/bell shapes. */
    body:has(.chat-route-stage) .settings-switch-dot::after,
    body:has(.chat-route-stage) .mcp-toggle-dot {
      border-radius: 55% 55% 46% 46%;
      background: var(--chat-kawaii-surface);
      box-shadow: var(--chat-kawaii-shadow);
    }

    body:has(.chat-route-stage) :is(.tools-dot, .tc-step-dot) {
      border-radius: 55% 55% 42% 42%;
    }

    body:has(.chat-route-stage) :is(.api-choice-check, .mcp-tool-status, .mcp-server-capsule, .api-detail-pill) {
      border: 0;
      border-radius: 999px 999px 999px 10px;
      background: var(--chat-kawaii-surface-soft);
      box-shadow: none;
    }

    body:has(.chat-route-stage) .api-choice-card.selected .api-choice-check {
      border-radius: 55% 55% 42% 42%;
      background: var(--accent);
    }

    body:has(.chat-route-stage) .ask-user-option.selected {
      position: relative;
      padding-right: 34px;
    }

    body:has(.chat-route-stage) .ask-user-option.selected::after {
      content: '';
      position: absolute;
      top: 50%;
      right: 13px;
      width: 10px;
      height: 10px;
      border-radius: 55% 55% 42% 42%;
      background: currentColor;
      opacity: 0.62;
      transform: translateY(-50%);
    }

    body:has(.chat-route-stage) .tools-dot.active {
      width: 10px;
      height: 8px;
      border-radius: 55% 55% 42% 42%;
    }

    /* Drawer/menu actions look like light toy tags; semantic danger colors remain owned by their state classes. */
    body:has(.chat-route-stage) :is(
      .settings-action-btn,
      .settings-confirm-btn,
      .thread-sheet-btn,
      .editable-toolbar-btn,
      .chat-mini-btn,
      .chat-edit-btn,
      .chat-input-dialog-btn,
      .ask-user-btn-primary,
      .ask-user-btn-secondary,
      .gh-btn,
      .ss-delete-btn,
      .chat-version-pager-btn,
      .chat-thread-tool-page-btn
    ) {
      border: 0;
      border-radius: 16px 16px 16px 10px;
      box-shadow: none;
    }

    body:has(.chat-route-stage) :is(
      .settings-action-btn,
      .thread-sheet-btn,
      .editable-toolbar-btn,
      .chat-edit-btn,
      .chat-input-dialog-btn,
      .ask-user-btn-secondary,
      .gh-btn-secondary,
      .chat-version-pager-btn,
      .chat-thread-tool-page-btn
    ):not(.primary):not(.danger) {
      background: var(--chat-kawaii-surface-soft);
      color: var(--chat-kawaii-text);
    }

    body:has(.chat-route-stage) .editable-card-del {
      background: color-mix(in srgb, var(--color-danger) 12%, transparent);
      color: var(--color-danger);
    }

    body:has(.chat-route-stage) .bottom-sheet {
      --chat-kawaii-surface: color-mix(in srgb, var(--bg-card) 92%, var(--accent-light));
      --chat-kawaii-surface-soft: color-mix(in srgb, var(--bg-card) 76%, var(--accent-light));
      --chat-kawaii-line: color-mix(in srgb, var(--text-primary) 48%, var(--accent-dark));
      --chat-kawaii-line-soft: color-mix(in srgb, var(--chat-kawaii-line) 36%, transparent);
      --chat-kawaii-text: color-mix(in srgb, var(--text-primary) 88%, var(--accent-dark));
      --chat-kawaii-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 12%, transparent);
      --chat-icon-line: var(--chat-kawaii-line);
      --chat-icon-fill: color-mix(in srgb, var(--accent-light) 72%, var(--bg-card));
      --chat-icon-paper: color-mix(in srgb, var(--bg-card) 74%, var(--accent-light));
      border: 0;
      background: var(--chat-kawaii-surface);
      color: var(--chat-kawaii-text);
      box-shadow: var(--chat-kawaii-shadow);
    }

    body:has(.chat-route-stage) .sheet-handle {
      width: 42px;
      height: 8px;
      border: 2px solid var(--accent-light);
      border-top: 0;
      border-radius: 0 0 999px 999px;
      background: transparent;
      transform: rotate(-4deg);
    }

    body:has(.chat-route-stage) .bottom-sheet .chat-list-action,
    body:has(.chat-route-stage) .bottom-sheet .chat-list-picker-row,
    body:has(.chat-route-stage) .bottom-sheet .chat-thread-sheet-item {
      border: 0;
      border-radius: 20px 20px 20px 13px;
      background: var(--chat-kawaii-surface-soft, var(--surface-muted));
      box-shadow: none;
    }

    body:has(.chat-route-stage) .bottom-sheet .chat-list-action-icon,
    body:has(.chat-route-stage) .bottom-sheet .chat-thread-tool-icon {
      border: 0;
      background: transparent;
      box-shadow: none;
    }

    body:has(.chat-route-stage) .tc-sheet {
      border-radius: 30px 30px 0 0;
      background: var(--chat-kawaii-surface, var(--bg-card));
      box-shadow: 0 -5px 18px color-mix(in srgb, var(--accent) 12%, transparent);
    }

    body:has(.chat-route-stage) .tc-sheet-handle {
      width: 42px;
      height: 8px;
      border: 2px solid var(--accent-light);
      border-top: 0;
      border-radius: 0 0 999px 999px;
      background: transparent;
      transform: rotate(-4deg);
    }

    @media (max-width: 430px) {
      .chat-page .chat-icon-btn,
      .chat-page .chat-thread-send {
        min-width: 42px;
        min-height: 42px;
      }

      .chat-page .chat-thread-tool-grid {
        gap: 7px;
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：只修 renderRoute 挂载顺序，并补 navigateToList 兼容旧返回调用。
// 会不会影响其他文件：不会；反而避免 list/thread/memory 的全局 state 被误清空。
// 更新记忆里该文件的导出函数：mount(containerEl, options)、unmount()、recordExternalInteraction(input, legacyInteraction)
// 依赖：./chat/list.js(mountChatList,unmountChatList)；./chat/memory.js(mountChatMemory,unmountChatMemory)；./chat/thread.js(mountChatThread,unmountChatThread)；../core/storage.js(getData,setData,generateId,getNow,getDB,setDB,getByIndexDB)；../core/api.js(silentRequest)
