// apps/chat/thread-panels.js
// imports:
//   from '../../core/ui.js': showBottomSheet, hideBottomSheet, showToast, createIcon
//   from './thread-tools.js': createThreadToolsGrid
//   from './thread-settings.js': mountThreadSettings, unmountThreadSettings
//   from './thread-call.js': mountThreadCall, unmountThreadCall
//   from './thread-actions.js': sendThreadMessage

import {
  showBottomSheet,
  hideBottomSheet,
  showToast
} from '../../core/ui.js';
import { createChatIcon } from './icons.js';

import { createThreadToolsGrid } from './thread-tools.js';
import { mountThreadSettings, unmountThreadSettings } from './thread-settings.js';
import { mountThreadCall, unmountThreadCall } from './thread-call.js';
import { sendThreadMessage } from './thread-actions.js';

var STYLE_ID = 'chat-thread-panels-style';

var panelState = {
  toolsSheetEl: null,
  settingsSheetEl: null,
  callMounted: false,
  callMounting: false,
  lastState: null
};

// ═══════════════════════════════════════
// 【工具面板】打开工具宫格和关闭工具面板
// ═══════════════════════════════════════

export function openThreadToolsPanel(state, options) {
  if (!options) options = {};
  injectStyle();
  panelState.lastState = state || null;

  closeThreadSettingsPanel();
  closeThreadCallPanel();
  closeThreadToolsPanel();

  showToolsSheet(state, options);
}

function showToolsSheet(state, options) {
  var sheet = document.createElement('div');
  sheet.className = 'chat-thread-tools-sheet';

  var head = document.createElement('div');
  head.className = 'chat-thread-tools-head';
  head.appendChild(document.createElement('div'));
  head.lastChild.className = 'chat-thread-tools-title';
  head.lastChild.textContent = '小工具箱';

  var toolOptions = {
    ...options,
    onPick: async function(item, nextState) {
      if (typeof options.onPick === 'function') {
        var handled = await options.onPick(item, nextState);
        if (handled) return true;
      }

      if (item?.id === 'call' || item?.id === 'phone') {
        closeThreadToolsPanel();
        await openThreadCallPanel(nextState || state, options);
        return true;
      }

      return false;
    },
    onCloseCall: function() { closeThreadCallPanel(); },
    onRejectCall: function() { closeThreadCallPanel(); },
    onSend: async function(text) {
      await sendThreadMessage(state, text);
    },
    onTransfer: async function(payload) {
      var text = payload.note ? '转了 ' + payload.amount + '，' + payload.note : '转了 ' + payload.amount;
      await sendThreadMessage(state, text);
    },
    onClose: function() {
      closeThreadToolsPanel();
    },
    onBackToTools: function() {
      // 只关闭当前 tools sheet 本身，不无参调 hideBottomSheet 误关别的 sheet
      // 若 toolsSheetEl 已脱离 DOM（被 ui 层关闭），则只清引用
      if (panelState.toolsSheetEl && panelState.toolsSheetEl.isConnected) {
        hideBottomSheet();
      }
      panelState.toolsSheetEl = null;
    }
  };

  var grid = createThreadToolsGrid(state, toolOptions);

  sheet.appendChild(head);
  sheet.appendChild(grid);

  panelState.toolsSheetEl = sheet;
  showBottomSheet(sheet);
}

export function closeThreadToolsPanel() {
  if (panelState.toolsSheetEl) {
    // 仅当 tools sheet 仍连接在 DOM 时才调 hideBottomSheet，避免误关别的 sheet
    if (panelState.toolsSheetEl.isConnected) {
      hideBottomSheet();
    }
    panelState.toolsSheetEl = null;
  }
}

// ═══════════════════════════════════════
// 【设置面板】打开聊天设置和关闭设置面板
// ═══════════════════════════════════════

export function openThreadSettingsPanel(state, options) {
  if (!options) options = {};
  injectStyle();
  panelState.lastState = state || null;

  if (state?.mode === 'group') {
    showToast('群聊设置晚点再接');
    return;
  }

  if (!state?.characterId) {
    showToast('这个聊天还没有角色');
    return;
  }

  closeThreadToolsPanel();
  closeThreadCallPanel();
  closeThreadSettingsPanel();

  var sheet = document.createElement('div');
  sheet.className = 'chat-settings-sheet';
  var top = document.createElement('div');
  top.className = 'chat-settings-sheet-top';

  var close = buttonIcon('close', '关闭设置');
  close.addEventListener('click', function() { closeThreadSettingsPanel(); });

  var title = document.createElement('div');
  title.className = 'chat-settings-sheet-title';
  title.textContent = '聊天设置';

  var spacer = document.createElement('div');
  spacer.className = 'chat-settings-sheet-spacer';

  top.append(close, title, spacer);

  var host = document.createElement('div');
  host.className = 'chat-settings-host';
  sheet.append(top, host);

  panelState.settingsSheetEl = sheet;
  showBottomSheet(sheet);

  mountThreadSettings(host, {
    characterId: state.characterId,
    appState: state.appState,
    ...options.settings
  });
}

export function closeThreadSettingsPanel() {
  if (panelState.settingsSheetEl) {
    unmountThreadSettings();
    // 仅当 settings sheet 仍连接在 DOM 时才调 hideBottomSheet，避免误关别的 sheet
    if (panelState.settingsSheetEl.isConnected) {
      hideBottomSheet();
    }
    panelState.settingsSheetEl = null;
  }
}

// ═══════════════════════════════════════
// 【电话面板】打开电话和关闭电话面板
// ═══════════════════════════════════════

export async function openThreadCallPanel(state, options) {
  if (!options) options = {};
  injectStyle();
  panelState.lastState = state || null;

  if (state?.mode === 'group') {
    showToast('群聊电话先不接');
    return;
  }

  if (!state?.characterId) {
    showToast('这个聊天还没有角色');
    return;
  }

  // 防重复挂载：await mountThreadCall 期间若再次调用，直接返回
  if (panelState.callMounted || panelState.callMounting) return;

  closeThreadToolsPanel();
  closeThreadSettingsPanel();
  closeThreadCallPanel();

  panelState.callMounting = true;

  var target = options.containerEl || document.body;

  try {
    await mountThreadCall(target, {
      state: state,
      character: state?.character || null,
      characterId: state?.characterId || '',
      incoming: Boolean(options.incoming),
      close: function() { closeThreadCallPanel(); },
      onReject: function() { closeThreadCallPanel(); }
    });

    panelState.callMounted = true;
  } catch (error) {
    panelState.callMounted = false;
    console.error('[chat-thread-panels] call mount failed', error);
    showToast('电话没接起来');
  } finally {
    panelState.callMounting = false;
  }
}

export function closeThreadCallPanel() {
  if (panelState.callMounted) {
    unmountThreadCall();
    panelState.callMounted = false;
  }
}

// ═══════════════════════════════════════
// 【统一关闭】把当前打开的面板一口气关掉
// ═══════════════════════════════════════

export function closeThreadPanels() {
  closeThreadCallPanel();
  closeThreadSettingsPanel();
  closeThreadToolsPanel();
  // 卸载时清理 lastState 引用，避免模块级单例残留旧 state
  panelState.lastState = null;
}

// ═══════════════════════════════════════
// 【通用组件】图标按钮和 DOM
// ═══════════════════════════════════════

function buttonIcon(iconName, label) {
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'chat-panel-icon-btn';
  button.setAttribute('aria-label', label || iconName);
  button.appendChild(createChatIcon(iconName, 18));
  return button;
}

// ═══════════════════════════════════════
// 【样式】工具、设置、电话面板壳
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .chat-thread-tools-sheet,
    .chat-settings-sheet{
      position:relative;
      overflow:hidden;
      padding:8px 18px 16px;
      color:var(--text-primary);
    }

    .chat-thread-tools-sheet::before{
      content:'';
      position:absolute;
      inset:0 0 auto 0;
      height:86px;
      pointer-events:none;
      background:radial-gradient(circle at 16% 32%,color-mix(in srgb,var(--decor-yellow) 48%,transparent),transparent 16%),radial-gradient(circle at 86% 26%,color-mix(in srgb,var(--decor-blue) 42%,transparent),transparent 18%),linear-gradient(180deg,color-mix(in srgb,var(--accent-light) 34%,transparent),transparent);
      opacity:.82;
    }

    .chat-thread-tools-sheet > *,
    .chat-settings-sheet > *{position:relative;z-index:1}

    .chat-thread-tools-head,
    .chat-settings-sheet-top{
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
      margin-bottom:14px;
    }

    .chat-thread-tools-title,
    .chat-settings-sheet-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
    }

    .chat-settings-sheet-spacer{
      width:44px;
      height:44px;
    }

    .chat-settings-host{
      min-height:min(72vh,640px);
      border-radius:24px;
      overflow:hidden;
      background:var(--bg-card);
    }

    .chat-panel-icon-btn{
      width:44px;
      height:44px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      transition:all 200ms ease;
    }

    .chat-panel-icon-btn:active{
      transform:scale(.96);
    }

    @media(max-width:430px){
      .chat-thread-tools-sheet,
      .chat-settings-sheet{
        padding-left:20px;
        padding-right:20px;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .chat-panel-icon-btn{
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}
