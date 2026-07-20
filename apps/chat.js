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
import { mountChatVisualSystem, unmountChatVisualSystem } from './chat/visual-system.js';

import {
  getData,
  setData
} from '../core/storage.js';

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

  mountChatVisualSystem();
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

        // 否则统一 toast 提示（落库已由常驻层完成，来源文案来自外部消息本身）
        const text = data?.message?.content || '';
        if (text) window.showToast?.(text);
      } catch (error) {
        console.warn('[chat] chat:external-message handle failed:', error?.message || error);
      }
    });

    // 纪念日提醒：anniversary-bridge 已直接落库（appendExternalChatMessage → chat:external-message），
    // chat:external-message 监听器统一负责 toast；这里只做对应会话刷新/列表刷新，避免双 toast
    unsubscribeAnniversaryReminder = window.AppBus.on('anniversary:reminder', async (data) => {
      try {
        const characterId = data?.characterId;
        const isInThread = currentRoute.name === 'thread' && currentRoute.params?.characterId === characterId;

        if (isInThread) {
          // 正在该角色会话里：刷新 thread 展示新消息
          await renderRoute();
          return;
        }

        // 不在该会话：只刷新列表（toast 由 chat:external-message 监听器负责）
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
  unmountChatVisualSystem();
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


// 改了什么：只修 renderRoute 挂载顺序，并补 navigateToList 兼容旧返回调用。
// 会不会影响其他文件：不会；反而避免 list/thread/memory 的全局 state 被误清空。
// 更新记忆里该文件的导出函数：mount(containerEl, options)、unmount()、recordExternalInteraction(input, legacyInteraction)
// 依赖：./chat/list.js(mountChatList,unmountChatList)；./chat/memory.js(mountChatMemory,unmountChatMemory)；./chat/thread.js(mountChatThread,unmountChatThread)；../core/storage.js(getData,setData,generateId,getNow,getDB,setDB,getByIndexDB)；../core/api.js(silentRequest)
