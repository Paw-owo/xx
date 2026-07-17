// apps/settings.js
// imports:
//   from '../core/storage.js': getData, setData, removeData, generateId, getNow, getStorageUsage, getDB, setDB, getAllDB, deleteDB, clearStoreDB
//   from '../core/theme.js': getThemePresets, getCurrentTheme, setPreset, setThemeMode, applyTheme, saveTheme, exportTheme, importTheme
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
//   from '../core/api.js': fetchModels, smartModelsUrl, parseErrorResponse, buildHeaders, addPoolEndpoint, getPoolGroups
//   from '../core/mcp.js': resetSession, getMcpServers, listMcpTools
//   from '../core/storage-manager.js': testCloudConnection

import {
  getData,
  setData,
  removeData,
  generateId,
  getNow,
  getStorageUsage,
  getDB,
  setDB,
  getAllDB,
  deleteDB,
  clearStoreDB,
  compressImage,
  verifyImageDataUrl
} from '../core/storage.js';

import {
  getThemePresets,
  getCurrentTheme,
  setPreset,
  setThemeMode,
  applyTheme,
  saveTheme,
  exportTheme,
  importTheme
} from '../core/theme.js';

import { showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon } from '../core/ui.js';
import { fetchModels, smartModelsUrl, parseErrorResponse, buildHeaders, addPoolEndpoint, getPoolGroups, fetchModelList } from '../core/api.js';
import { resetSession, getMcpServers, listMcpTools, listMcpToolsWithDraft } from '../core/mcp.js';
import { testCloudConnection } from '../core/storage-manager.js';
import { GITHUB_TOOL_STORAGE_KEYS } from './chat/github-tool.js';

// ═══════════════════════════════════════
// 【常量】存储 key 和默认配置
// ═══════════════════════════════════════

const SETTINGS_KEY = 'app_settings';
const CLOUD_KEY = 'app_cloud_server';
const ICONS_KEY = 'app_icons';
const HIDDEN_ICONS_KEY = 'app_hidden_icons';
const WALLPAPER_KEY = 'app_wallpaper';
const WALLPAPER_OPACITY_KEY = 'app_wallpaper_opacity';
const WIDGET_BACKGROUNDS_KEY = 'app_widget_backgrounds';
const DESKTOP_SCALE_KEY = 'desktop_layout_scale';
const CUSTOM_FONT_KEY = 'app_custom_font';
const CUSTOM_FONT_META_KEY = 'app_custom_font_meta';
const CUSTOM_WIDGETS_KEY = 'app_custom_widgets';
const API_POOL_GROUPS_KEY = 'app_api_pool_groups';

const DB_STORES = [
  'characters', 'messages', 'moments', 'memories', 'stickers',
  'worldbook', 'inventory', 'pet', 'groups', 'group_messages',
  'blobs', 'grudges', 'punishments', 'relationship_locks', 'api_pool', 'albums', 'memories_album', 'dreams',
  'songs', 'playlists',
  'ai_phone_diaries', 'ai_phone_visits', 'ai_phone_chat_archives', 'ai_phone_memos',
  'ai_phone_mailbox', 'ai_phone_app_locks', 'ai_phone_action_logs'
];

const CHAT_LOCAL_KEYS = [
  'chat_unread_counts', 'chat_group_unread_counts', 'chat_hidden_private_threads', 'chat_last_route',
  'chat_active_thread', 'chat_draft_map', 'chat_pinned_threads', 'chat_archived_threads'
];

const IMAGE_DRESS_KEYS = [
  WALLPAPER_KEY, WALLPAPER_OPACITY_KEY, WIDGET_BACKGROUNDS_KEY, ICONS_KEY, HIDDEN_ICONS_KEY,
  'app_game_hero_image', 'app_bg_settings', 'app_bg_characters', 'app_bg_chat',
  'app_bg_chat_memory', 'app_bg_moments', 'app_bg_worldbook', 'app_bg_wallet',
  'app_bg_shop', 'app_bg_memo', 'app_bg_anniversary', 'app_bg_games',
  'app_bg_truth_game', 'app_bg_draw_guess', 'app_bg_liars_tavern'
];

const IMAGE_BLOB_KEYS = [
  WALLPAPER_KEY, 'app_game_hero_image', 'app_bg_settings', 'app_bg_characters',
  'app_bg_chat', 'app_bg_chat_memory', 'app_bg_moments', 'app_bg_worldbook',
  'app_bg_wallet', 'app_bg_shop', 'app_bg_memo', 'app_bg_anniversary',
  'app_bg_games', 'app_bg_truth_game', 'app_bg_draw_guess', 'app_bg_liars_tavern'
];

const DEFAULT_SETTINGS = {
  defaultApiEndpointId: '',
  defaultModel: '',
  ttsGlobal: { provider: 'openai', apiKey: '', endpoint: '', voice: 'alloy', model: 'tts-1', modelList: [] },
  mcpServers: [],
  bubbleMode: 'bubble',
  fontSize: 15,
  user: { name: '', avatar: '', avatarSource: '', avatarOpacity: 100 },
  widgets: { time: true, weather: true, anniversary: true, focus: true },
  chatSettings: {
    autoTTS: false,
    showThinking: true,
    showToolCalls: true,
    stickerPanelSize: 'normal',
    proactiveMode1Enabled: false,
    proactiveMode2Enabled: false
  },
  apiEndpoints: []
};

const DEFAULT_CLOUD = { enabled: false, endpoint: '', apiKey: '', status: 'unknown', lastTestAt: '', updatedAt: '' };

const THEME_COLOR_FIELDS = [
  ['bg-primary', '主背景'], ['bg-secondary', '浅背景'], ['bg-card', '卡片背景'],
  ['accent', '强调色'], ['accent-light', '浅强调'], ['accent-dark', '深强调'],
  ['text-primary', '主要文字'], ['text-secondary', '次要文字'], ['text-hint', '提示文字'],
  ['bubble-user-bg', '用户气泡'], ['bubble-user-text', '用户气泡字'],
  ['bubble-ai-bg', 'AI 气泡'], ['bubble-ai-text', 'AI 气泡字']
];

const APP_LIST = [
  ['chat', '消息'], ['moments', '朋友圈'], ['settings', '设置'], ['gallery', '相册'],
  ['characters', '角色'], ['worldbook', '世界书'], ['wallet', '钱包'], ['shop', '商店'],
  ['memo', '备忘录'], ['anniversary', '纪念日'], ['games', '游戏'], ['music', '音乐'], ['dream', '梦境']
];

const WIDGET_BG_LIST = [
  ['app_widget_area_bg', '小组件区域'], ['app_widget_bg_time', '时间小卡片'],
  ['app_widget_bg_weather', '天气小卡片'], ['app_widget_bg_anniversary', '纪念日小卡片'],
  ['app_widget_bg_focus', '焦点小卡片']
];

const DESKTOP_WIDGET_LIST = [
  ['time', '时间小卡片', '显示日期、时间这些桌面信息'],
  ['weather', '天气小卡片', '显示天气和温度'],
  ['anniversary', '纪念日小卡片', '显示最近的重要日子'],
  ['focus', '焦点小卡片', '显示桌面上的小提醒']
];

let rootEl = null;
let route = 'home';
let styleEl = null;
let customFontStyleEl = null;
let cloudTesting = false;
let colorDebounceTimer = null;
let apiPoolModule = null;
let ttsModule = null;

// ═══════════════════════════════════════
// 【生命周期】mount / unmount
// ═══════════════════════════════════════

export async function mount(containerEl) {
  rootEl = containerEl;
  injectStyle();
  await restoreCustomFont();
  applyGlobalFontSize(getSettings().fontSize || 15, false);
  render('home');
}

export function unmount() {
  hideBottomSheet();
  if (apiPoolModule?.unmount) apiPoolModule.unmount();
  if (ttsModule?.unmount) ttsModule.unmount();
  apiPoolModule = null;
  ttsModule = null;
  if (rootEl) {
    rootEl.innerHTML = '';
    rootEl.classList.remove('settings-app-shell');
  }
  rootEl = null;
}

// ═══════════════════════════════════════
// 【路由渲染】
// ═══════════════════════════════════════

async function render(nextRoute = route) {
  route = nextRoute;
  if (!rootEl) return;

  rootEl.innerHTML = '';
  rootEl.classList.add('has-app');
  rootEl.classList.add('settings-app-shell');

  const screen = el('section', 'settings-app app-screen');
  const body = await renderBody();
  screen.append(renderHeader(), body);
  rootEl.append(screen);
}

function renderHeader() {
  const nav = el('div', 'settings-nav nav-bar');
  const back = makeButton('settings-nav-btn', route === 'home' ? '返回桌面' : '返回设置', 'back', () => {
    if (route === 'home') closeDesktop();
    else render('home');
  });

  const text = el('div', 'settings-nav-titlebox');
  text.append(el('div', 'nav-title', getTitle(route)), el('div', 'nav-subtitle', getSubtitle(route)));
  nav.append(back, text);
  return nav;
}

async function renderBody() {
  const body = el('div', 'settings-content content-area');
  const narrow = el('div', 'settings-narrow content-narrow');

  const pages = {
    home: renderHome,
    theme: renderThemePage,
    display: renderDisplayPage,
    apiTest: renderApiTestPage,
    apiPool: renderApiPoolPage,
    tts: renderTtsPage,
    mcp: renderMcpPage,
    cloud: renderCloudPage,
    desktop: renderDesktopPage,
    widgets: renderWidgetsPage,
    icons: renderIconsPage,
    data: renderDataPage
  };

  const pageContent = await (pages[route] || renderHome)();
  narrow.append(pageContent);
  body.append(narrow);
  return body;
}

// ═══════════════════════════════════════
// 【首页】
// ═══════════════════════════════════════

function renderHome() {
  const wrap = page();
  wrap.append(
    hero('设置小窝', '慢慢调成你喜欢的样子 ˶>ᗜ<˶'),
    group('常用小开关', [
      navItem('star', '外观主题', '颜色、夜间、主题文件都在这里', 'theme'),
      navItem('edit', '字体与显示', '字号、字体、聊天样子轻轻调', 'display')
    ]),
    group('模型与服务', [
      navItem('settings', 'API 测试台', '临时测一个接口，通过后再决定怎么用', 'apiTest'),
      navItem('settings', 'API 轮换池', '付费/免费分组、密钥、状态、测试', 'apiPool'),
      navItem('play', 'TTS 声音屋', 'AI 说话的声音住这里', 'tts'),
      navItem('settings', 'MCP 工具箱', '给 AI 接小工具用', 'mcp'),
      navItem('upload', '云服务器', '默认关闭，主动开启才使用', 'cloud')
    ]),
    group('桌面装扮', [
      navItem('image', '壁纸背景', '桌面缩放、壁纸、背景图', 'desktop'),
      navItem('copy', '小组件', '小卡片和自定义组件', 'widgets'),
      navItem('star', '应用图标', '改名、换图、隐藏都可以', 'icons')
    ]),
    group('数据小包', [
      navItem('download', '导出 / 导入', '备份、恢复、清理数据', 'data')
    ])
  );
  return wrap;
}

// ═══════════════════════════════════════
// 【主题页】
// ═══════════════════════════════════════

function renderThemePage() {
  const wrap = page();
  const theme = getCurrentTheme();

  wrap.append(card('当前主题', `${getPresetName(theme.preset)} · ${theme.mode === 'dark' ? '夜间' : '浅色'} ⌯'ᵕ'⌯`));

  const mode = card('颜色模式', '白天晚上都照顾到');
  mode.append(actionRow([
    actionBtn('star', '浅色', () => {
      setThemeMode('light');
      showToast('浅色模式换好啦');
      emitRefresh();
      render('theme');
    }),
    actionBtn('settings', '夜间', () => {
      setThemeMode('dark');
      showToast('夜间模式换好啦');
      emitRefresh();
      render('theme');
    })
  ]));
  wrap.append(mode);

  const presets = card('主题预设', '点一下就换一套小衣服');
  const grid = el('div', 'settings-grid');
  getThemePresets().forEach((preset) => {
    const btn = el('button', `settings-preset ${theme.preset === preset.id ? 'active' : ''}`);
    btn.type = 'button';
    btn.append(el('span', '', preset.name), el('small', '', preset.mode === 'dark' ? '夜间' : '浅色'));
    btn.addEventListener('click', () => {
      setPreset(preset.id);
      showToast('主题穿好啦');
      emitRefresh();
      render('theme');
    });
    grid.append(btn);
  });
  presets.append(grid);
  wrap.append(presets);

  const colors = card('自定义颜色', '背景、文字、气泡都能染色');
  const list = el('div', 'settings-list');
  THEME_COLOR_FIELDS.forEach(([key, name]) => {
    const row = el('label', 'settings-color-row');
    const input = el('input', 'settings-color');
    input.type = 'color';
    input.value = normalizeColor(theme.variables?.[key]);
    input.addEventListener('input', () => {
      clearTimeout(colorDebounceTimer);
      colorDebounceTimer = setTimeout(() => {
        applyTheme({ [key]: input.value });
        saveTheme();
        emitRefresh();
      }, 150);
    });
    input.addEventListener('change', () => {
      clearTimeout(colorDebounceTimer);
      applyTheme({ [key]: input.value });
      saveTheme();
      emitRefresh();
      showToast('颜色存好啦');
    });
    row.append(el('span', '', name), input);
    list.append(row);
  });
  colors.append(list);
  wrap.append(colors);

  const files = card('主题文件', '导入导出 JSON，小主题不迷路');
  files.append(actionRow([
    actionBtn('upload', '导入主题', importThemeFile),
    actionBtn('download', '导出主题', () => {
      downloadJson(`theme-${getNow().slice(0, 10)}.json`, exportTheme());
      showToast('主题打包好啦');
    })
  ]));
  wrap.append(files);

  return wrap;
}

// ═══════════════════════════════════════
// 【显示页】
// ═══════════════════════════════════════

function renderDisplayPage() {
  const wrap = page();
  const settings = getSettings();
  const chat = { ...DEFAULT_SETTINGS.chatSettings, ...(settings.chatSettings || {}) };

  const font = card('全局字号', '拖一下，整个小手机都会一起变大变小');
  font.append(rangeBlock(settings.fontSize || 15, 12, 24, 1, (value, live) => {
    applyGlobalFontSize(value, true);
    if (!live) {
      const next = getSettings();
      next.fontSize = Number(value);
      saveSettings(next);
      saveTheme();
      emitRefresh();
      showToast('字号保存啦，全局都跟着变啦');
    }
  }));
  wrap.append(font);

  const fontFile = card('自定义字体', '上传 ttf、otf、woff、woff2');
  const meta = getData(CUSTOM_FONT_META_KEY);
  fontFile.append(el('p', 'settings-note', meta?.name ? `当前字体：${meta.name}` : '当前是默认字体'));
  fontFile.append(actionRow([
    actionBtn('upload', '上传字体', uploadCustomFont),
    actionBtn('delete', '清除字体', clearCustomFont)
  ]));
  wrap.append(fontFile);

  const bubble = card('聊天样子', '只影响消息 APP');
  const seg = el('div', 'settings-segment');
  seg.append(
    segment('气泡聊天', settings.bubbleMode !== 'dialog', () => saveBubbleMode('bubble')),
    segment('对话卡片', settings.bubbleMode === 'dialog', () => saveBubbleMode('dialog'))
  );
  bubble.append(seg);
  wrap.append(bubble);

  const chatDisplay = card('聊天细节', '语音、思考和表情包面板放这里');
  chatDisplay.append(
    switchRow('AI 回复自动播放语音', chat.autoTTS === true, (value) => saveChatSetting('autoTTS', value)),
    switchRow('显示思考小卡片', chat.showThinking !== false, (value) => saveChatSetting('showThinking', value)),
    switchRow('显示工具调用小卡片', chat.showToolCalls !== false, (value) => saveChatSetting('showToolCalls', value)),
    selectSettingBlock('表情包面板大小', chat.stickerPanelSize || 'normal', [
      ['compact', '小一点'], ['normal', '正常'], ['large', '大一点']
    ], (value) => saveChatSetting('stickerPanelSize', value))
  );
  wrap.append(chatDisplay);

  const proactive = card('主动消息', '只在网页打开时工作，不会后台偷偷运行');
  proactive.append(
    switchRow('离开太久后，TA 可以主动发一句', chat.proactiveMode1Enabled === true, (value) => saveChatSetting('proactiveMode1Enabled', value)),
    switchRow('停在聊天里太久，TA 可以轻轻搭话', chat.proactiveMode2Enabled === true, (value) => saveChatSetting('proactiveMode2Enabled', value))
  );
  wrap.append(proactive);

  return wrap;
}

// ═══════════════════════════════════════
// 【API 测试台】
// ═══════════════════════════════════════

function renderApiTestPage() {
  const wrap = page();

  const top = card('API 测试台', '临时测一个接口，通过后再决定怎么用');
  top.append(el('p', 'settings-free-note', '测试通过后会问你：固定自用，还是丢进轮换池。测试本身不会保存任何数据。'));
  wrap.append(top);

  const form = card('接口信息', '把地址、密钥、模型填好就行');
  const name = inputRow('名字', '', '比如：我的主力接口');
  const endpoint = inputRow('接口地址', '', 'https://api.xxx.com/v1');
  const provider = selectRow('接口类型', 'openai', [
    ['openai', '通用中转 / OpenAI 格式'],
    ['anthropic', 'Claude / Anthropic 格式'],
    ['gemini', 'Gemini 格式'],
    ['ollama', '本地 Ollama']
  ]);
  const apiKey = inputRow('API Key', '', 'sk-...');
  const model = inputRow('当前模型', '', '例如 gpt-4o-mini / deepseek-chat');

  form.append(name.wrap, endpoint.wrap, provider.wrap, apiKey.wrap, model.wrap);

  let draftModels = [];
  let testing = false;

  const modelArea = el('div', 'settings-editor-model-area');

  function renderModels() {
    modelArea.innerHTML = '';
    modelArea.append(modelPicker({
      models: draftModels,
      current: model.input.value.trim(),
      emptyText: '还没拉到模型，可以手填模型名',
      onSelect: (value) => {
        model.input.value = value;
        renderModels();
        showToast(`已选择：${value}`);
      }
    }));
  }

  renderModels();
  form.append(modelArea);

  form.append(actionRow([
    actionBtn('refresh', '拉取模型', async () => {
      const endpointValue = endpoint.input.value.trim();
      const providerValue = provider.input.value || detectProviderFromUrl(endpointValue);
      const key = apiKey.input.value.trim();

      if (!endpointValue) {
        showToast('先填接口地址哦');
        return;
      }

      showToast('正在拉取模型...');
      try {
        const models = await fetchModelList({ endpoint: endpointValue, apiKey: key, provider: providerValue });
        if (!models.length) {
          showToast('没找到模型，可以手填模型名保存');
          return;
        }
        draftModels = models;
        renderModels();
        showToast(`拉到 ${draftModels.length} 个模型啦`);
      } catch (err) {
        showToast(formatApiEditorError(err, '模型拉取失败，可以手填模型名继续使用'));
      }
    }),

    actionBtn('check', '测试接口', async () => {
      if (testing) return;

      const endpointValue = endpoint.input.value.trim();
      const providerValue = provider.input.value || detectProviderFromUrl(endpointValue);
      const modelValue = model.input.value.trim();
      const key = apiKey.input.value.trim();

      if (!endpointValue) {
        showToast('先填接口地址哦');
        return;
      }

      if (providerValue !== 'gemini' && !modelValue) {
        showToast('先填模型名哦');
        return;
      }

      testing = true;
      showToast('正在发一条小测试...');

      try {
        await testApiByChat({
          endpoint: endpointValue,
          apiKey: key,
          provider: providerValue,
          model: modelValue
        });

        showToast('连接成功啦');
        askAfterTest({
          name: name.input.value.trim() || '未命名接口',
          endpoint: endpointValue,
          provider: providerValue,
          apiKey: key,
          model: modelValue,
          modelList: draftModels
        });
      } catch (err) {
        showToast(formatApiEditorError(err, '测试失败啦'));
      } finally {
        testing = false;
      }
    })
  ]));

  wrap.append(form);
  return wrap;
}

function askAfterTest(apiData) {
  const groups = getPoolGroups();
  const initialGroup = apiData.apiKey ? 'paid' : 'free';
  let selectedGroup = initialGroup;

  const sheet = sheetBox('测试通过啦，存到轮换池');
  const name = inputRow('接口名称', apiData.name, '未命名接口');
  const model = inputRow('主模型', apiData.model, '例如 gpt-4o-mini');
  const modelArea = el('div', 'settings-editor-model-area');

  modelArea.append(modelPicker({
    models: apiData.modelList || [],
    current: apiData.model,
    emptyText: '没有拉到模型，可以手填',
    onSelect: (value) => {
      model.input.value = value;
      showToast(`已选择：${value}`);
    }
  }));

  const groupSelector = el('div', 'api-pool-quick-group');
  const paidBtn = el('button', `settings-preset ${selectedGroup === 'paid' ? 'active' : ''}`);
  paidBtn.type = 'button';
  paidBtn.textContent = groups.paid?.name || '付费组';
  const freeBtn = el('button', `settings-preset ${selectedGroup === 'free' ? 'active' : ''}`);
  freeBtn.type = 'button';
  freeBtn.textContent = groups.free?.name || '免费组';

  paidBtn.addEventListener('click', () => {
    selectedGroup = 'paid';
    paidBtn.classList.add('active');
    freeBtn.classList.remove('active');
  });

  freeBtn.addEventListener('click', () => {
    selectedGroup = 'free';
    freeBtn.classList.add('active');
    paidBtn.classList.remove('active');
  });

  groupSelector.append(paidBtn, freeBtn);

  sheet.body.append(
    el('p', 'settings-free-note', '点一下分组就能保存。有 Key 的建议放付费组，失败会自动切；没 Key 的放免费组。'),
    name.wrap,
    model.wrap,
    modelArea,
    el('div', 'settings-label', '放到哪个分组'),
    groupSelector
  );

  sheet.actions.append(
    actionBtn('check', '保存到轮换池', async () => {
      const finalName = name.input.value.trim() || apiData.name || '未命名接口';
      const finalModel = model.input.value.trim() || apiData.model || '';

      if (selectedGroup !== 'free' && !finalModel) {
        showToast('先填主模型哦');
        return;
      }

      const groupsNow = getPoolGroups();
      try {
        await addPoolEndpoint({
          id: generateId('pool'),
          groupType: selectedGroup,
          groupName: selectedGroup === 'free' ? (groupsNow.free?.name || '免费组') : (groupsNow.paid?.name || '付费组'),
          name: finalName,
          endpoint: apiData.endpoint,
          provider: apiData.provider,
          keys: apiData.apiKey ? [apiData.apiKey] : [],
          model: finalModel,
          models: apiData.modelList || [],
          source: '',
          status: 'active'
        });

        hideBottomSheet();
        showToast('接口已加入轮换池');
        // 提供去轮换池看看的入口
        const go = await showConfirm('加入成功，去轮换池看看吗？');
        if (go) render('apiPool');
      } catch (err) {
        if (err?.code === 'DUPLICATE') {
          showToast('它已经在轮换池里啦，去轮换池编辑或换一个吧');
          return;
        }
        showToast(formatApiEditorError(err, '加入轮换池失败'));
      }
    }),

    actionBtn('star', '设为全局默认', () => {
      const settings = getSettings();
      const newApi = {
        id: generateId(),
        name: name.input.value.trim() || apiData.name || '未命名接口',
        endpoint: apiData.endpoint,
        apiKey: apiData.apiKey,
        provider: apiData.provider,
        model: model.input.value.trim() || apiData.model,
        modelList: apiData.modelList
      };
      settings.apiEndpoints = [...settings.apiEndpoints.filter((item) => item.endpoint !== apiData.endpoint), newApi];
      settings.defaultApiEndpointId = newApi.id;
      settings.defaultModel = newApi.model;
      saveSettings(settings);
      hideBottomSheet();
      showToast('已设为全局默认接口');
      render('apiTest');
    })
  );

  showBottomSheet(sheet.root);
}

// ═══════════════════════════════════════
// 【API 轮换池页】
// ═══════════════════════════════════════

async function renderApiPoolPage() {
  if (apiPoolModule) apiPoolModule.unmount();

  const module = await import('./settings/api-pool-settings.js');
  apiPoolModule = module;

  const wrap = page();
  let pageEl;

  if (typeof module.mount === 'function') {
    pageEl = el('div', 'api-pool-host settings-page');
    apiPoolModule.mount(pageEl, { onBack: () => render('home'), onRefresh: () => render('apiPool') });
  } else if (typeof module.renderApiPoolSettings === 'function') {
    pageEl = await module.renderApiPoolSettings({
      onBack: () => render('home'),
      onRefresh: () => render('apiPool')
    });
  } else {
    pageEl = empty('轮换池模块加载失败');
  }

  wrap.append(pageEl);
  return wrap;
}

// ═══════════════════════════════════════
// 【TTS 页】
// ═══════════════════════════════════════

async function renderTtsPage() {
  if (ttsModule) ttsModule.unmount();

  const module = await import('./settings/tts-settings.js');
  ttsModule = module;

  const wrap = page();
  let pageEl;

  if (typeof module.mount === 'function') {
    pageEl = el('div', 'tts-host settings-page');
    await module.mount(pageEl, { onBack: () => render('home') });
  } else if (typeof module.renderTtsSettings === 'function') {
    pageEl = await module.renderTtsSettings({
      onBack: () => render('home')
    });
  } else {
    pageEl = empty('TTS 模块加载失败');
  }

  wrap.append(pageEl);
  return wrap;
}

// ═══════════════════════════════════════
// 【MCP 推荐模板】集中定义，单一数据源
// 模板只是生成新 server 的草稿，不自动写入 mcpServers
// ═══════════════════════════════════════

// 调研来源（2026-07-14 联网核实 + curl 端点验证）：
// - Context7: https://mcp.context7.com/mcp，Streamable HTTP，免 key，CORS 开放（已验证 initialize + tools/list）
// - DeepWiki: https://mcp.deepwiki.com/mcp，Streamable HTTP，免 key，CORS 未开放（浏览器可能连不上）
// - GitMCP: https://gitmcp.io/docs，Streamable HTTP，免 key，CORS 开放（已验证 initialize + tools/list）
// - Microsoft Learn: https://learn.microsoft.com/api/mcp，Streamable HTTP，免认证，CORS 未开放（浏览器可能连不上）
const MCP_RECOMMENDED_TEMPLATES = [
  {
    id: 'sense',
    name: '我的感知服务器',
    description: '读取朋友圈、梦境、角色状态、今日简报、聊天记录',
    url: '',
    apiKeyPlaceholder: '如果服务器需要认证就填这里',
    tags: ['感知'],
    category: 'custom',
    authType: 'apiKey',
    notes: '自己部署的小手机感知服务器，添加时会尝试预填云服务器地址',
    requiresManualUrl: true,
    defaultEnabled: false,
    hint: '把你的服务器地址填进来就能用啦'
  },
  {
    id: 'context7',
    name: 'Context7',
    description: '查最新开发文档、框架用法、版本差异，少幻觉',
    url: 'https://mcp.context7.com/mcp',
    apiKeyPlaceholder: '可选，配 API key 能提高免费额度',
    tags: ['文档', '搜索'],
    category: 'docs',
    authType: 'none',
    notes: 'Streamable HTTP，免 key，CORS 开放，已验证可用',
    requiresManualUrl: false,
    defaultEnabled: false,
    hint: '免 key 直接用，配 key 可提高限额'
  },
  {
    id: 'deepwiki',
    name: 'DeepWiki',
    description: '把任意 GitHub 仓库自动生成 wiki，更快看懂项目',
    url: 'https://mcp.deepwiki.com/mcp',
    apiKeyPlaceholder: '不需要 key',
    tags: ['GitHub', '文档'],
    category: 'repo',
    authType: 'none',
    notes: 'Streamable HTTP，免 key，但 CORS 未开放，浏览器直连可能失败',
    requiresManualUrl: false,
    defaultEnabled: false,
    hint: '免 key，但当前版本可能因 CORS 限制连不上'
  },
  {
    id: 'gitmcp',
    name: 'GitMCP',
    description: '读 GitHub 仓库的 README 和文档，AI 调用时指定仓库',
    url: 'https://gitmcp.io/docs',
    apiKeyPlaceholder: '不需要 key',
    tags: ['GitHub', '文档'],
    category: 'repo',
    authType: 'none',
    notes: '通用动态端点，免 key，CORS 开放，已验证可用',
    requiresManualUrl: false,
    defaultEnabled: false,
    hint: '免 key 直接用，AI 调用时会指定仓库'
  },
  {
    id: 'microsoft-learn',
    name: 'Microsoft Learn',
    description: '微软官方文档检索：Windows / Azure / .NET / M365',
    url: 'https://learn.microsoft.com/api/mcp',
    apiKeyPlaceholder: '不需要 key',
    tags: ['文档', '微软'],
    category: 'docs',
    authType: 'none',
    notes: 'Streamable HTTP，免认证，但 CORS 未开放，浏览器直连可能失败',
    requiresManualUrl: false,
    defaultEnabled: false,
    hint: '免 key，但当前版本可能因 CORS 限制连不上'
  }
];

// 从模板生成 server 草稿，打开编辑弹层
// 不自动保存、不自动启用、不自动测试
function addServerFromTemplate(template) {
  // 感知服务器模板：尝试从云服务器配置读 endpoint 作为 url 建议，读不到就留空
  let prefillUrl = template.url || '';
  if (template.id === 'sense') {
    try {
      const cloud = getData(CLOUD_KEY) || {};
      if (cloud.endpoint) prefillUrl = cloud.endpoint;
    } catch (_) { /* 读不到就留空 */ }
  }

  const draft = {
    id: generateId('mcp'),
    name: template.name || '',
    url: prefillUrl,
    apiKey: '',
    apiKeyHeader: '',
    sseEndpoint: '/sse',
    messageEndpoint: '/message',
    enabled: false,
    toolSettings: {},
    tools: [],
    updatedAt: getNow()
  };

  // 打开编辑弹层，让用户确认/补全后自行保存
  openMcpEditor(draft);
}

// 渲染推荐模板区域
function renderMcpRecommendedSection() {
  const section = card('推荐添加', '点一下填好草稿，免 key 的能直接用，需要 key 的会标出来');
  const list = el('div', 'settings-mcp-recommended-list');

  MCP_RECOMMENDED_TEMPLATES.forEach((template) => {
    const item = el('div', 'settings-mcp-recommended-card');

    // 顶部：图标 + 名称 + 添加按钮
    const head = el('div', 'settings-mcp-recommended-head');
    const iconWrap = el('div', 'settings-mcp-recommended-icon');
    // 图标名取自 core/ui.js 的 ICON_PATHS 里真实存在的项，避免回退成三点
    const iconMap = {
      sense: 'eye',
      context7: 'search',
      deepwiki: 'mcp',
      gitmcp: 'mcp',
      'microsoft-learn': 'memory'
    };
    iconWrap.append(safeIcon(iconMap[template.id] || 'star', 18));
    const nameBox = el('div', 'settings-mcp-recommended-namebox');
    nameBox.append(el('div', 'settings-mcp-recommended-name', template.name));

    // 标签 + 免 key / 需要 key 徽章
    const tagsRow = el('div', 'settings-mcp-recommended-tags');
    (template.tags || []).forEach((tag) => {
      tagsRow.append(el('span', 'settings-mcp-recommended-tag', tag));
    });
    const isFree = template.authType === 'none';
    const authBadge = el(
      'span',
      `settings-mcp-recommended-auth ${isFree ? 'is-free' : 'is-key'}`,
      isFree ? '免 key' : '需要 key'
    );
    tagsRow.append(authBadge);
    nameBox.append(tagsRow);
    head.append(iconWrap, nameBox);

    const addBtn = makeButton('settings-mcp-recommended-add', '添加', 'add', () => addServerFromTemplate(template));
    head.append(addBtn);
    item.append(head);

    // 说明
    item.append(el('p', 'settings-mcp-recommended-desc', template.description));

    // 需要手动填地址的提示，或已有 URL 时的补充说明
    if (template.requiresManualUrl) {
      item.append(el('p', 'settings-mcp-recommended-hint', template.hint || '需要自己填地址'));
    } else if (template.hint) {
      item.append(el('p', 'settings-mcp-recommended-hint', template.hint));
    }

    list.append(item);
  });

  section.append(list);
  return section;
}

// ═══════════════════════════════════════
// 【MCP 页】
// ═══════════════════════════════════════

function renderMcpPage() {
  const wrap = page();
  const settings = getSettings();

  const top = card('MCP 工具箱', '给 AI 接一些小工具用');
  top.append(actionBtn('add', '新增服务器', () => openMcpEditor(null)));
  wrap.append(top);

  if (!settings.mcpServers.length) wrap.append(empty('工具箱还空空的 OvO'));

  settings.mcpServers.forEach((server) => {
    const item = card(server.name || '未命名服务器', `${server.url || '未填写地址'}\n状态：${server.enabled ? '已启用' : '已停用'}${server.apiKey ? ' · 已设密钥' : ''}`);
    item.append(actionRow([
      actionBtn(server.enabled ? 'delete' : 'play', server.enabled ? '停用' : '启用', () => toggleMcp(server.id)),
      actionBtn('check', '测试', async (e) => {
        const btn = e?.currentTarget;
        if (!btn || btn.dataset.loading === '1') return;
        btn.dataset.loading = '1';
        const span = btn.querySelector('span');
        const orig = span?.textContent;
        if (span) span.textContent = '测试中...';
        try {
          await testMcpServer(server.id);
        } finally {
          if (btn) btn.dataset.loading = '0';
          if (span) span.textContent = orig;
        }
      }),
      actionBtn('edit', '编辑', () => openMcpEditor(server)),
      actionBtn('delete', '删除', () => deleteMcp(server.id))
    ]));
    wrap.append(item);
  });

  // 推荐模板区域：点一下生成草稿进编辑弹层，不自动保存/启用
  wrap.append(renderMcpRecommendedSection());

  return wrap;
}

// ═══════════════════════════════════════
// 【MCP 操作】
// ═══════════════════════════════════════

async function testMcpServer(id) {
  const settings = getSettings();
  const server = settings.mcpServers.find((item) => item.id === id);
  if (!server) {
    showToast('没找到这个服务器');
    return;
  }

  showToast('正在连接 MCP 服务器...');
  try {
    await resetSession(server.id);
    const tools = await listMcpTools(server.id);
    if (Array.isArray(tools)) {
      showToast(`连上啦，找到 ${tools.length} 个工具`);
    } else {
      showToast('连上啦，但没有读到工具列表');
    }
  } catch (error) {
    showToast(formatApiEditorError(error, 'MCP 连接失败'));
  }
}

function toggleMcp(id) {
  const settings = getSettings();
  const servers = settings.mcpServers.map((item) => {
    if (item.id !== id) return item;
    return { ...item, enabled: !item.enabled, updatedAt: getNow() };
  });

  saveSettings({ ...settings, mcpServers: servers });
  showToast('状态换好啦');
  render('mcp');
}

async function deleteMcp(id) {
  const ok = await showConfirm('要删除这个 MCP 服务器吗？');
  if (!ok) return;

  const settings = getSettings();
  saveSettings({ ...settings, mcpServers: settings.mcpServers.filter((item) => item.id !== id) });
  showToast('删除好啦');
  render('mcp');
}

function openMcpEditor(server) {
  // editing 必须基于 server 是否真的在 mcpServers 中，而不是只看有没有 id
  // 模板创建的 draft 有 id 但不在 mcpServers，应走新增路径
  const editing = server?.id ? getSettings().mcpServers.some(s => s.id === server.id) : false;
  const current = {
    id: server?.id || generateId('mcp'),
    name: server?.name || '',
    url: server?.url || '',
    apiKey: server?.apiKey || '',
    apiKeyHeader: server?.apiKeyHeader || '',
    sseEndpoint: server?.sseEndpoint || '/sse',
    messageEndpoint: server?.messageEndpoint || '/message',
    enabled: server?.enabled !== false,
    // 按 server.id 隔离的工具开关配置；已保存的不会被刷新覆盖
    toolSettings: { ...(server?.toolSettings || {}) },
    // 工具元数据持久化：拉取成功后存这里，保存时写入 mcpServers
    // 重新打开编辑器时从这里恢复，不依赖临时变量
    tools: Array.isArray(server?.tools) ? server.tools.map((t) => ({
      name: t?.name || '',
      description: t?.description || '',
      inputSchema: t?.inputSchema || {}
    })) : [],
    updatedAt: getNow()
  };

  const sheet = sheetBox(editing ? '编辑 MCP 服务器' : '新增 MCP 服务器');
  // 加专属 class，让 MCP 编辑弹层用 flex 布局，工具 tab 高度与基础设置一致
  sheet.root.classList.add('settings-mcp-editor-sheet');

  // 分段 tab：基础设置 / 工具
  const seg = el('div', 'settings-segment');
  let activeTab = 'basic';
  const basicTabBtn = segment('基础设置', true, () => switchTab('basic'));
  const toolsTabBtn = segment('工具', false, () => switchTab('tools'));
  seg.append(basicTabBtn, toolsTabBtn);

  // 基础设置面板
  const basicPanel = el('div', 'settings-mcp-panel settings-mcp-panel-basic');
  const name = inputRow('名字', current.name || '', '比如：我的世界百科');
  const url = inputRow('服务器地址', current.url || '', 'https://example.com/mcp');
  const sse = inputRow('SSE 地址', current.sseEndpoint || '/sse', '/sse');
  const message = inputRow('消息地址', current.messageEndpoint || '/message', '/message');
  const apiKey = inputRow('API Key', current.apiKey || '', '可选');
  const apiKeyHeader = inputRow('Key 字段名', current.apiKeyHeader || '', '例如 Authorization');

  // SSE 地址 / 消息地址 折叠区：仅自建 SSE 型服务器需要，streamable HTTP 型远程 MCP 留空即可
  // 默认收起，避免对远程 MCP 用户造成"必须填"的误导
  const sseAdvanced = el('div', 'settings-mcp-advanced');
  const sseAdvancedHeader = el('button', 'settings-mcp-advanced-header');
  sseAdvancedHeader.type = 'button';
  const sseAdvancedTitle = el('span', 'settings-mcp-advanced-title', '高级 · 仅 SSE 模式需要');
  const sseAdvancedHint = el('span', 'settings-mcp-advanced-hint', '点击展开');
  const sseAdvancedArrow = el('span', 'settings-mcp-advanced-arrow');
  sseAdvancedArrow.append(safeIcon('settings', 16));
  sseAdvancedHeader.append(sseAdvancedTitle, sseAdvancedHint, sseAdvancedArrow);

  const sseAdvancedBody = el('div', 'settings-mcp-advanced-body');
  const sseAdvancedNote = el('p', 'settings-mcp-advanced-note',
    '只有自建 SSE 型服务器（如小手机感知服务器）才需要填这两项。Context7 / DeepWiki / GitMCP / Microsoft Learn 这类远程 streamable HTTP 型 MCP 只填上面的服务器地址即可，这里留空。'
  );
  sseAdvancedBody.append(sseAdvancedNote, sse.wrap, message.wrap);

  sseAdvancedHeader.addEventListener('click', () => {
    const expanded = sseAdvanced.classList.toggle('expanded');
    sseAdvancedHint.textContent = expanded ? '点击收起' : '点击展开';
  });

  sseAdvanced.append(sseAdvancedHeader, sseAdvancedBody);

  basicPanel.append(name.wrap, url.wrap, apiKey.wrap, apiKeyHeader.wrap, sseAdvanced);

  // 工具面板（抽屉式折叠）
  const toolsPanel = el('div', 'settings-mcp-panel hidden');
  // 初始化 toolsCache 为已保存的工具元数据，让重新打开编辑器时直接显示
  let toolsCache = current.tools.slice();
  let toolsLoading = false;
  // 有已保存工具时标记为已加载，UI 直接显示工具列表而不是"点按钮拉取"
  let toolsLoaded = current.tools.length > 0;
  let toolsError = '';

  function switchTab(tab) {
    activeTab = tab;
    basicTabBtn.classList.toggle('active', tab === 'basic');
    toolsTabBtn.classList.toggle('active', tab === 'tools');
    basicPanel.classList.toggle('hidden', tab !== 'basic');
    toolsPanel.classList.toggle('hidden', tab !== 'tools');
    // 不再自动拉取工具：已保存工具从 server.tools 恢复，用户主动点击才联网
    // 切到工具 tab 时，从持久化数据恢复工具显示（本地读取，不联网）
    if (tab === 'tools' && !toolsLoaded && !toolsLoading) {
      restoreSavedTools();
    }
  }

  // 从持久化 server.tools 恢复工具列表（纯本地读取，不联网）
  // 与 refreshToolsFromServer 区分：前者读本地，后者联网拉取
  function restoreSavedTools() {
    if (current.tools.length > 0) {
      toolsCache = current.tools.slice();
      toolsLoaded = true;
      toolsError = '';
      renderToolsPanel();
    }
  }

  function renderToolsPanel() {
    toolsPanel.innerHTML = '';
    const drawer = el('div', 'settings-mcp-tools-drawer expanded');

    const header = el('button', 'settings-mcp-drawer-header');
    header.type = 'button';
    const titleEl = el('span', 'settings-mcp-drawer-title', `工具 (${toolsCache.length})`);
    const hint = el('span', 'settings-mcp-drawer-hint', toolsLoading ? '加载中…' : '点击收起');
    const arrow = el('span', 'settings-mcp-drawer-arrow');
    arrow.append(safeIcon('settings', 16));
    header.append(titleEl, hint, arrow);

    const body = el('div', 'settings-mcp-drawer-body');

    if (toolsLoading) {
      body.append(el('p', 'settings-note', '正在拉取工具列表…'));
    } else if (toolsError) {
      // 失败状态：显示具体可读错误 + 重试按钮
      body.append(el('p', 'settings-mcp-tools-error', toolsError));
      body.append(actionBtn('check', '重新拉取工具', refreshToolsFromServer));
    } else if (!toolsLoaded) {
      // 初始状态：还没拉取过
      body.append(el('p', 'settings-note', '点下面按钮拉取一下工具列表'));
      body.append(actionBtn('check', '拉取工具', refreshToolsFromServer));
    } else if (!toolsCache.length) {
      // 拉取成功但真的没工具
      body.append(el('p', 'settings-note', '连上了，但这个服务器没有暴露工具'));
      body.append(actionBtn('check', '重新拉取工具', refreshToolsFromServer));
    } else {
      toolsCache.forEach((tool) => {
        body.append(renderMcpToolCard(tool, current.toolSettings));
      });
    }

    header.addEventListener('click', () => {
      drawer.classList.toggle('expanded');
      hint.textContent = drawer.classList.contains('expanded')
        ? (toolsLoading ? '加载中…' : '点击收起')
        : '点击展开';
    });

    drawer.append(header, body);
    toolsPanel.append(drawer);

    // 顶部刷新按钮（拉取成功后显示）
    if (toolsLoaded && !toolsLoading && !toolsError && toolsCache.length) {
      const refreshRow = el('div', 'settings-mcp-tools-refresh');
      refreshRow.append(actionBtn('check', '重新拉取工具', refreshToolsFromServer));
      toolsPanel.append(refreshRow);
    }
  }

  // 从当前编辑表单组装草稿 server 对象，用于未保存时也能拉工具
  function buildDraftServer() {
    return {
      id: current.id,
      name: name.input.value.trim() || '未命名服务器',
      url: url.input.value.trim(),
      apiKey: apiKey.input.value.trim(),
      apiKeyHeader: apiKeyHeader.input.value.trim(),
      sseEndpoint: sse.input.value.trim() || '/sse',
      messageEndpoint: message.input.value.trim() || '/message',
      enabled: current.enabled,
      toolSettings: current.toolSettings,
      tools: current.tools
    };
  }

  async function refreshToolsFromServer() {
    if (toolsLoading) return;
    toolsLoading = true;
    toolsError = '';
    renderToolsPanel();
    try {
      const draft = buildDraftServer();
      // URL 为空时直接给可读错误，不发请求
      if (!draft.url) {
        throw new Error('先填一下服务器地址再拉工具呀');
      }
      // 用 draft 路径：无论新建还是已保存，都走 listMcpToolsWithDraft
      // 这样表单里改的 URL/apiKey 能立即生效，不需要先保存
      await resetSession(current.id);
      const tools = await listMcpToolsWithDraft(draft);
      const freshTools = Array.isArray(tools) ? tools : [];
      // 持久化工具元数据到 current.tools（保存时会写入 mcpServers）
      // 只存 name/description/inputSchema，不存 enabled/requireApproval（那些走 toolSettings）
      current.tools = freshTools.map((t) => ({
        name: t?.name || '',
        description: t?.description || '',
        inputSchema: t?.inputSchema || {}
      }));
      toolsCache = freshTools;
      // 合并 toolSettings：新发现的工具填默认值，已保存的不覆盖
      // 服务端删除工具时不删 toolSettings，避免用户配置丢失
      toolsCache.forEach((tool) => {
        const toolName = tool?.name;
        if (!toolName) return;
        if (!current.toolSettings[toolName]) {
          current.toolSettings[toolName] = { enabled: true, requireApproval: false };
        }
      });
      toolsLoaded = true;
      toolsError = '';
      showToast(`找到 ${toolsCache.length} 个工具`);
    } catch (error) {
      toolsError = String(error?.message || '没拉到工具，检查一下地址或连接方式呀');
      // 拉取失败不清空已保存的工具元数据和 toolsCache，保留旧列表
      // toolsCache 保持当前值（可能是已保存的旧工具或空数组）
      showToast(toolsError);
    } finally {
      toolsLoading = false;
      renderToolsPanel();
    }
  }

  renderToolsPanel();

  sheet.body.append(seg, basicPanel, toolsPanel);

  sheet.actions.append(
    actionBtn('check', editing ? '保存' : '添加', () => {
      const settings = getSettings();
      const nextServer = {
        id: current.id,
        name: name.input.value.trim() || '未命名服务器',
        url: url.input.value.trim(),
        apiKey: apiKey.input.value.trim(),
        apiKeyHeader: apiKeyHeader.input.value.trim(),
        sseEndpoint: sse.input.value.trim() || '/sse',
        messageEndpoint: message.input.value.trim() || '/message',
        enabled: current.enabled,
        toolSettings: current.toolSettings,
        // 工具元数据持久化：保存到 mcpServers，重新打开编辑器时恢复
        tools: current.tools,
        updatedAt: getNow()
      };

      // 统一 upsert：检查 server 是否已在 mcpServers 中，不在则新增
      const exists = settings.mcpServers.some((item) => item.id === nextServer.id);
      const servers = exists
        ? settings.mcpServers.map((item) => item.id === nextServer.id ? nextServer : item)
        : [...settings.mcpServers, { ...nextServer, createdAt: getNow() }];

      saveSettings({ ...settings, mcpServers: servers });

      hideBottomSheet();
      showToast(exists ? '保存好啦' : '加好啦');
      render('mcp');
    })
  );

  showBottomSheet(sheet.root);
  // 给 bottom-sheet 一个确定高度，让 flex:1 子元素能正确撑满
  // 与 core/ui.js 中 bottom-sheet 的 max-height 保持一致
  if (sheet.root.parentElement?.classList.contains('bottom-sheet')) {
    sheet.root.parentElement.style.height = 'min(74vh, 680px)';
  }
}

// 单个 MCP 工具卡片：名字 + 描述 + 参数标签 + 主开关 + 需要审批开关
// 初始状态优先用 toolSettings（单一真实数据源），tool 对象字段作为 fallback
// 这样从 current.tools（只有元数据）恢复时，开关状态也能正确从 toolSettings 读
function renderMcpToolCard(tool, toolSettings) {
  const toolName = tool?.name || '未命名工具';
  const saved = toolSettings?.[toolName] || {};
  // 优先用 toolSettings 里的状态，fallback 到 tool 对象注入的字段，再 fallback 默认值
  const initialEnabled = saved.enabled !== undefined
    ? saved.enabled !== false
    : (tool?.enabled !== false);
  const initialApproval = saved.requireApproval !== undefined
    ? saved.requireApproval === true
    : (tool?.requireApproval === true);

  const cardEl = el('div', `settings-mcp-tool-card ${initialEnabled ? '' : 'disabled'}`);

  // 顶部：工具名 + 主开关
  const top = el('div', 'settings-mcp-tool-top');
  const nameWrap = el('div', 'settings-mcp-tool-name-wrap');
  nameWrap.append(el('strong', 'settings-mcp-tool-name', toolName));
  top.append(nameWrap);

  const enableSwitch = switchRow('', initialEnabled, (next) => {
    toolSettings[toolName] = { ...toolSettings[toolName], enabled: next };
    cardEl.classList.toggle('disabled', !next);
  });
  enableSwitch.classList.add('settings-mcp-tool-switch');
  top.append(enableSwitch);

  // 描述
  const desc = el('p', 'settings-mcp-tool-desc', tool?.description || '暂无描述');

  cardEl.append(top, desc);

  // 参数小标签
  const paramNames = getToolParamNames(tool);
  if (paramNames.length) {
    const paramRow = el('div', 'settings-mcp-tool-params');
    paramNames.forEach((p) => {
      paramRow.append(el('span', 'settings-mcp-param-chip', p));
    });
    cardEl.append(paramRow);
  }

  // 需要审批开关 + blockedByApproval 提示
  const approvalRow = el('div', 'settings-mcp-tool-approval');
  const approvalLabel = el('div', 'settings-mcp-tool-approval-text');
  approvalLabel.append(
    el('span', 'settings-mcp-tool-approval-label', '需要审批'),
    el('span', 'settings-mcp-tool-approval-hint',
      initialApproval ? '已阻止自动调用' : '调用前问我一句')
  );
  const approvalSwitch = switchRow('', initialApproval, (next) => {
    toolSettings[toolName] = { ...toolSettings[toolName], requireApproval: next };
    // 同步提示文案
    const hintEl = approvalLabel.querySelector('.settings-mcp-tool-approval-hint');
    if (hintEl) hintEl.textContent = next ? '已阻止自动调用' : '调用前问我一句';
  });
  approvalSwitch.classList.add('settings-mcp-tool-switch');
  approvalRow.append(approvalLabel, approvalSwitch);
  cardEl.append(approvalRow);

  return cardEl;
}

// 从工具 inputSchema 提取参数名（最多 8 个，避免卡片过长）
function getToolParamNames(tool) {
  const props = tool?.inputSchema?.properties || {};
  return Object.keys(props).slice(0, 8);
}

// ═══════════════════════════════════════
// 【云服务页】
// ═══════════════════════════════════════

function renderCloudPage() {
  const wrap = page();
  const cloud = getCloud();

  const info = card('云服务器', '默认关闭。只有你主动填写并开启，数据才会往云朵仓库跑');
  const infoText = el('p', 'settings-note', `当前：${cloud.enabled ? '已开启' : '关闭中'} · ${cloud.status === 'ok' ? '连接正常' : cloud.status === 'error' ? '连接失败' : '未测试'}`);
  info.append(infoText);
  wrap.append(info);

  const form = card('连接配置', '先填地址和密钥，再点保存并测试');
  const endpoint = inputRow('服务器地址', cloud.endpoint || '', 'https://xxx.xxx.xxx.xxx:3000');
  const apiKey = inputRow('API 密钥', cloud.apiKey || '', '只存在本地，不会导出');

  const enabled = switchRow('启用云服务', cloud.enabled, (value, row) => {
    const next = getCloud();
    const endpointValue = endpoint.input.value.trim();
    const apiKeyValue = apiKey.input.value.trim();

    if (value && (!endpointValue || !apiKeyValue)) {
      row.dataset.value = 'false';
      row.classList.remove('on');
      showToast('先填服务器地址和密钥哦');
      return;
    }

    next.endpoint = endpointValue;
    next.apiKey = apiKeyValue;
    next.enabled = value;
    next.updatedAt = getNow();
    setData(CLOUD_KEY, next);
    infoText.textContent = `当前：${value ? '已开启' : '关闭中'} · ${next.status === 'ok' ? '连接正常' : next.status === 'error' ? '连接失败' : '未测试'}`;
    showToast(value ? '云服务开启啦' : '云服务关好啦');
  });

  form.append(endpoint.wrap, apiKey.wrap, enabled);
  form.append(actionRow([
    actionBtn('check', '保存并测试', async () => {
      if (cloudTesting) {
        showToast('正在测试中，等一下哦');
        return;
      }

      const next = getCloud();
      next.endpoint = endpoint.input.value.trim();
      next.apiKey = apiKey.input.value.trim();

      if (!next.endpoint || !next.apiKey) {
        showToast('地址和密钥都要填哦');
        return;
      }

      cloudTesting = true;
      next.updatedAt = getNow();
      setData(CLOUD_KEY, next);

      showToast('正在连接云朵...');

      try {
        const result = await testCloudConnection(next);
        const latest = getCloud();
        latest.endpoint = next.endpoint;
        latest.apiKey = next.apiKey;
        latest.status = result.ok ? 'ok' : 'error';
        latest.lastTestAt = getNow();
        latest.updatedAt = getNow();
        setData(CLOUD_KEY, latest);
        infoText.textContent = `当前：${latest.enabled ? '已开启' : '关闭中'} · ${latest.status === 'ok' ? '连接正常' : latest.status === 'error' ? '连接失败' : '未测试'}`;
        showToast(result.ok ? '连上啦，云朵小仓库在线' : result.message || '没连上，但不会替你关掉开关');
      } catch {
        const latest = getCloud();
        latest.status = 'error';
        latest.lastTestAt = getNow();
        latest.updatedAt = getNow();
        setData(CLOUD_KEY, latest);
        infoText.textContent = `当前：${latest.enabled ? '已开启' : '关闭中'} · 连接失败`;
        showToast('连接失败，再试一次吧');
      } finally {
        cloudTesting = false;
      }

      render('cloud');
    })
  ]));
  wrap.append(form);

  return wrap;
}

// ═══════════════════════════════════════
// 【桌面页】
// ═══════════════════════════════════════

function renderDesktopPage() {
  const wrap = page();
  const scale = getData(DESKTOP_SCALE_KEY) || { iconScale: 1, widgetScale: 1, dockScale: 1 };
  const wallpaperOpacity = Number(getData(WALLPAPER_OPACITY_KEY) ?? 100);

  const size = card('桌面大小', '图标、小卡片、底栏都能缩放');
  size.append(
    labelBlock('图标大小', rangeBlock(scale.iconScale || 1, 0.62, 1.28, 0.01, (value, live) => saveScale('iconScale', value, live))),
    labelBlock('小卡片大小', rangeBlock(scale.widgetScale || 1, 0.62, 1.28, 0.01, (value, live) => saveScale('widgetScale', value, live))),
    labelBlock('底栏大小', rangeBlock(scale.dockScale || 1, 0.62, 1.28, 0.01, (value, live) => saveScale('dockScale', value, live)))
  );
  wrap.append(size);

  const wallpaper = card('桌面壁纸', '上传后桌面会直接显示');
  const preview = imagePreview('', '当前壁纸', 'image');
  preview.dataset.previewKey = WALLPAPER_KEY;
  wallpaper.append(preview);
  fillBlobPreview(preview, WALLPAPER_KEY);
  wallpaper.append(labelBlock('壁纸透明度', rangeBlock(wallpaperOpacity, 15, 100, 1, (value, live) => saveWallpaperOpacity(value, live))));
  wallpaper.append(actionRow([
    actionBtn('upload', '上传壁纸', () => uploadBlobImage(WALLPAPER_KEY, WALLPAPER_OPACITY_KEY, '壁纸换好啦')),
    actionBtn('delete', '清除壁纸', () => clearBlobImage(WALLPAPER_KEY, WALLPAPER_OPACITY_KEY))
  ]));
  wrap.append(wallpaper);

  return wrap;
}

// ═══════════════════════════════════════
// 【小组件页】
// ═══════════════════════════════════════

async function renderWidgetsPage() {
  const wrap = page();
  const settings = getSettings();

  const desktopWidgets = card('桌面小组件', '不想看到哪张小卡片，就先把它移走');
  DESKTOP_WIDGET_LIST.forEach(([key, name, desc]) => {
    const enabled = settings.widgets?.[key] !== false;
    desktopWidgets.append(listAction(enabled ? 'copy' : 'delete', name, enabled ? desc : '已经从桌面移除', [
      actionBtn(enabled ? 'delete' : 'add', enabled ? '移除' : '恢复', () => toggleDesktopWidget(key, !enabled))
    ]));
  });
  wrap.append(desktopWidgets);

  const bg = card('小卡片背景', '每张小卡片都能换背景');
  for (const [key, name] of WIDGET_BG_LIST) {
    const localBg = getData(WIDGET_BACKGROUNDS_KEY)?.[key] || {};
    const dbRecord = await getDB('blobs', key);
    const record = dbRecord || localBg;
    const image = record.value || record.image || record.data || '';
    const opacity = Number(record.opacity ?? localBg.opacity ?? 100);
    const hasImage = Boolean(image);
    const box = el('div', 'settings-widget-bg-block');

    const previewEl = imagePreview(image || '', name, 'image');
    previewEl.dataset.previewKey = key;

    box.append(listAction('image', name, hasImage ? '已换背景' : '还没换背景', [
      actionBtn('upload', '上传', () => uploadWidgetBg(key)),
      actionBtn('delete', '清除', () => clearWidgetBg(key))
    ], previewEl));

    box.append(labelBlock('透明度', rangeBlock(opacity, 15, 100, 1, (value, live) => saveWidgetBgOpacity(key, value, live))));
    bg.append(box);
  }
  wrap.append(bg);

  const custom = card('自定义小组件', '文字、形状、图片都能改');
  custom.append(actionBtn('add', '新建小组件', () => openWidgetEditor(null)));

  const widgets = getData(CUSTOM_WIDGETS_KEY) || [];
  if (!widgets.length) custom.append(el('p', 'settings-note', '还没有自定义小组件 ๑ᵒᯅᵒ๑'));

  for (const widget of widgets) {
    const dbImage = await getDB('blobs', `custom_widget_${widget.id}`);
    const image = dbImage?.value || dbImage?.image || widget.image || '';
    const opacity = Number(widget.opacity ?? 100);
    const box = el('div', 'settings-widget-bg-block');

    const previewEl = imagePreview(image || '', widget.name || '小组件', 'copy');

    box.append(listAction('copy', widget.name || '未命名小组件', `${widget.shape || 'square'} · ${widget.text || '无文字'}`, [
      actionBtn('edit', '编辑', () => openWidgetEditor(widget)),
      actionBtn('delete', '删除', () => deleteWidget(widget.id))
    ], previewEl));

    box.append(labelBlock('透明度', rangeBlock(opacity, 15, 100, 1, (value, live) => saveCustomWidgetOpacity(widget.id, value, live))));
    custom.append(box);
  }

  wrap.append(custom);
  return wrap;
}

// ═══════════════════════════════════════
// 【图标页】
// ═══════════════════════════════════════

async function renderIconsPage() {
  const wrap = page();
  const icons = getData(ICONS_KEY) || {};
  const hidden = new Set(getData(HIDDEN_ICONS_KEY) || []);

  const list = card('应用图标', '改名、换图、隐藏，都能用');
  for (const [id, name] of APP_LIST) {
    const custom = icons[id] || {};
    const dbRecord = await getDB('blobs', `app_icon_${id}`);
    const image = dbRecord?.value || dbRecord?.image || custom.image || custom.iconImage || custom.backgroundImage || '';
    const opacity = Number(custom.opacity ?? 100);
    const isHidden = hidden.has(id);
    const box = el('div', 'settings-widget-bg-block');

    const previewEl = imagePreview(image || '', custom.name || name, isHidden ? 'settings' : 'star');

    box.append(listAction(isHidden ? 'settings' : 'star', custom.name || name, isHidden ? '已隐藏' : image ? '已换图' : '默认图标', [
      actionBtn('edit', '改名', () => renameIcon(id, name)),
      actionBtn('upload', '换图', () => uploadIcon(id)),
      actionBtn(isHidden ? 'settings' : 'delete', isHidden ? '恢复' : '隐藏', () => toggleIconHidden(id))
    ], previewEl));

    box.append(labelBlock('透明度', rangeBlock(opacity, 15, 100, 1, (value, live) => saveIconOpacity(id, value, live))));
    list.append(box);
  }

  wrap.append(list);
  return wrap;
}

// ═══════════════════════════════════════
// 【数据页】
// ═══════════════════════════════════════

function renderDataPage() {
  const wrap = page();

  const usage = card('存储用量', '看看小仓库有多满');
  const text = el('p', 'settings-note', '读取中...');
  usage.append(text);
  getStorageUsage().then((info) => {
    text.textContent = `${formatBytes(info.used)} / ${formatBytes(info.quota)} · ${info.percent || 0}%`;
  }).catch(() => {
    text.textContent = '存储用量读取失败，请稍后重试';
  });
  wrap.append(usage);

  const pack = card('数据小包', '导入导出完整备份');
  pack.append(actionRow([
    actionBtn('download', '导出全部', exportAll),
    actionBtn('upload', '导入全部', importAll)
  ]));
  wrap.append(pack);

  const clean = card('轻轻清理', '危险按钮放这里，按前会问你');
  clean.append(actionRow([
    actionBtn('delete', '清私聊', () => clearStoreWithConfirm('messages', '要清空私聊记录吗？', '私聊清好啦')),
    actionBtn('delete', '清群聊', () => clearStoreWithConfirm('group_messages', '要清空群聊记录吗？', '群聊清好啦')),
    actionBtn('delete', '清记忆', () => clearStoreWithConfirm('memories', '要清空 AI 记忆吗？', '记忆清好啦')),
    actionBtn('delete', '清表情包', () => clearStoreWithConfirm('stickers', '要清空表情包吗？', '表情包清好啦')),
    actionBtn('delete', '清图片装扮', clearImageDressData),
    actionBtn('delete', '清游戏关系', clearGameRelationData),
    actionBtn('delete', '清聊天全部', clearChatData),
    actionBtn('delete', '清空全部', clearAllData)
  ]));
  wrap.append(clean);

  return wrap;
}

// ═══════════════════════════════════════
// 【设置读写】
// ═══════════════════════════════════════

function getSettings() {
  const saved = getData(SETTINGS_KEY) || {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    ttsGlobal: { ...DEFAULT_SETTINGS.ttsGlobal, ...(saved.ttsGlobal || {}) },
    user: { ...DEFAULT_SETTINGS.user, ...(saved.user || {}) },
    widgets: { ...DEFAULT_SETTINGS.widgets, ...(saved.widgets || {}) },
    chatSettings: { ...DEFAULT_SETTINGS.chatSettings, ...(saved.chatSettings || {}) },
    mcpServers: Array.isArray(saved.mcpServers) ? saved.mcpServers : [],
    apiEndpoints: Array.isArray(saved.apiEndpoints) ? saved.apiEndpoints : []
  };
}

function saveSettings(settings) {
  setData(SETTINGS_KEY, settings);
  window.dispatchEvent(new CustomEvent('app-settings-updated'));
}

// ═══════════════════════════════════════
// 【桌面小组件操作】
// ═══════════════════════════════════════

function toggleDesktopWidget(key, enabled) {
  const settings = getSettings();
  settings.widgets = { ...DEFAULT_SETTINGS.widgets, ...(settings.widgets || {}), [key]: enabled };
  saveSettings(settings);
  emitRefresh();
  showToast(enabled ? '小组件回到桌面啦' : '小组件已经从桌面移走啦');
  render('widgets');
}

function saveChatSetting(key, value) {
  const settings = getSettings();
  settings.chatSettings = { ...DEFAULT_SETTINGS.chatSettings, ...(settings.chatSettings || {}), [key]: value };
  saveSettings(settings);
  emitRefresh();
  showToast('聊天设置收好啦');
}

function applyGlobalFontSize(value, save = true) {
  const base = Math.max(12, Math.min(24, Number(value) || 15));
  const small = Math.max(10, Math.round(base * 0.86));
  const title = Math.max(15, Math.round(base * 1.14));

  applyTheme({
    'font-size-base': `${base}px`,
    'font-size-small': `${small}px`,
    'font-size-title': `${title}px`
  });

  document.documentElement.style.setProperty('--font-size-base', `${base}px`);
  document.documentElement.style.setProperty('--font-size-small', `${small}px`);
  document.documentElement.style.setProperty('--font-size-title', `${title}px`);

  if (save) saveTheme();
}

function getCloud() {
  return { ...DEFAULT_CLOUD, ...(getData(CLOUD_KEY) || {}) };
}

// ═══════════════════════════════════════
// 【气泡模式】
// ═══════════════════════════════════════

function saveBubbleMode(mode) {
  const settings = getSettings();
  settings.bubbleMode = mode;
  saveSettings(settings);
  showToast('聊天样子换好啦');
  render('display');
}

// ═══════════════════════════════════════
// 【桌面缩放/壁纸】
// ═══════════════════════════════════════

function saveScale(key, value, live) {
  const scale = getData(DESKTOP_SCALE_KEY) || {};
  scale[key] = Number(value);
  setData(DESKTOP_SCALE_KEY, scale);
  emitRefresh();
  if (!live) showToast('桌面大小存好啦');
}

async function saveWallpaperOpacity(value, live) {
  const opacity = Number(value);
  setData(WALLPAPER_OPACITY_KEY, opacity);

  const record = await getDB('blobs', WALLPAPER_KEY);
  if (record) {
    await setDB('blobs', WALLPAPER_KEY, { ...record, opacity, updatedAt: getNow() });
  }

  emitRefresh();
  if (!live) showToast('壁纸透明度存好啦');
}

async function saveWidgetBgOpacity(key, value, live) {
  const all = getData(WIDGET_BACKGROUNDS_KEY) || {};
  const current = all[key] || { key, value: '', source: '', updatedAt: getNow() };
  all[key] = { ...current, opacity: Number(value), updatedAt: getNow() };
  setData(WIDGET_BACKGROUNDS_KEY, all);

  // 先 await blobs 写入完成，再触发刷新，避免 applyAllImages 读到旧 opacity
  const record = await getDB('blobs', key).catch(() => null);
  if (record) {
    await setDB('blobs', key, { ...record, opacity: Number(value), updatedAt: getNow() }).catch(() => {});
  }

  emitRefresh();
  if (!live) showToast('小卡片透明度存好啦');
}

function saveCustomWidgetOpacity(id, value, live) {
  const list = getData(CUSTOM_WIDGETS_KEY) || [];
  const next = list.map((item) => item.id === id ? { ...item, opacity: Number(value), updatedAt: getNow() } : item);
  setData(CUSTOM_WIDGETS_KEY, next);
  emitRefresh();
  if (!live) showToast('小组件透明度存好啦');
}

async function saveIconOpacity(id, value, live) {
  const icons = getData(ICONS_KEY) || {};
  const current = icons[id] || {};
  const opacity = Number(value);
  icons[id] = { ...current, opacity, updatedAt: getNow() };
  setData(ICONS_KEY, icons);

  const record = await getDB('blobs', `app_icon_${id}`);
  if (record) {
    await setDB('blobs', `app_icon_${id}`, { ...record, opacity, updatedAt: getNow() });
  }

  emitRefresh();
  if (!live) showToast('图标透明度存好啦');
}

// ═══════════════════════════════════════
// 【图片上传/清除】
// ═══════════════════════════════════════

async function uploadBlobImage(key, opacityKey, msg) {
  const file = await pickFile('image/*');
  if (!file) return;

  let dataUrl;
  try { dataUrl = await readFileAsDataUrl(file); }
  catch (_) { showToast('图片读取失败，可能格式损坏或不支持'); return; }
  if (!dataUrl) { showToast('图片读取失败，换一张试试'); return; }
  // 验证生成的 base64 可被浏览器解码显示，避免"写入成功但无法显示"的假成功
  const valid = await verifyImageDataUrl(dataUrl);
  if (!valid) { showToast('图片格式不支持或已损坏，换一张试试'); return; }

  const opacity = Number(getData(opacityKey) ?? 100);
  const saved = await setDB('blobs', key, { key, value: dataUrl, source: file.name, opacity, updatedAt: getNow() });
  if (!saved) { showToast('图片保存失败，可能图片太大或存储已满'); return; }

  if (opacityKey && getData(opacityKey) == null) setData(opacityKey, opacity);
  showToast(msg || '图片上传好啦');
  emitRefresh();
  render(route);
}

async function clearBlobImage(key, opacityKey) {
  const ok = await showConfirm('要清掉这张图吗？');
  if (!ok) return;

  await deleteDB('blobs', key);
  removeData(key);
  if (opacityKey) removeData(opacityKey);

  showToast('图片清掉啦');
  emitRefresh();
  render(route);
}

async function uploadWidgetBg(key) {
  const file = await pickFile('image/*');
  if (!file) return;

  let dataUrl;
  try { dataUrl = await readFileAsDataUrl(file); }
  catch (_) { showToast('图片读取失败，可能格式损坏或不支持'); return; }
  if (!dataUrl) { showToast('图片读取失败，换一张试试'); return; }
  const valid = await verifyImageDataUrl(dataUrl);
  if (!valid) { showToast('图片格式不支持或已损坏，换一张试试'); return; }

  const all = getData(WIDGET_BACKGROUNDS_KEY) || {};
  const old = all[key] || {};
  const record = { key, value: dataUrl, source: file.name, opacity: Number(old.opacity ?? 100), updatedAt: getNow() };

  all[key] = record;
  setData(WIDGET_BACKGROUNDS_KEY, all);
  const saved = await setDB('blobs', key, record);
  if (!saved) { showToast('图片保存失败，可能图片太大或存储已满'); return; }

  showToast('小卡片背景换好啦');
  emitRefresh();
  render('widgets');
}

async function clearWidgetBg(key) {
  const ok = await showConfirm('要清掉这个小卡片背景吗？');
  if (!ok) return;

  const all = getData(WIDGET_BACKGROUNDS_KEY) || {};
  delete all[key];
  setData(WIDGET_BACKGROUNDS_KEY, all);

  await deleteDB('blobs', key).catch(() => {});

  showToast('背景清掉啦');
  emitRefresh();
  render('widgets');
}

// ═══════════════════════════════════════
// 【小组件编辑器】
// ═══════════════════════════════════════

async function openWidgetEditor(widget) {
  const current = widget || { id: generateId(), name: '', shape: 'square', image: '', text: '', opacity: 100, createdAt: getNow() };

  let image = current.image || '';
  if (widget?.id) {
    try {
      const dbRecord = await getDB('blobs', `custom_widget_${widget.id}`);
      if (dbRecord?.value || dbRecord?.image) {
        image = dbRecord.value || dbRecord.image;
      }
    } catch {}
  }

  const sheet = sheetBox(widget ? '编辑小组件' : '新建小组件');
  const name = inputRow('名字', current.name, '小卡片');
  const text = inputRow('文字', current.text, '写点什么');
  const shape = selectRow('形状', current.shape || 'square', [
    ['square', '方形'], ['rectangle', '长方形'], ['wide', '宽卡片'], ['circle', '圆形']
  ]);

  sheet.body.append(name.wrap, text.wrap, shape.wrap);
  sheet.actions.append(
    actionBtn('upload', '上传图', async () => {
      const file = await pickFile('image/*');
      if (!file) return;
      image = await readFileAsDataUrl(file);
      await setDB('blobs', `custom_widget_${current.id}`, { key: `custom_widget_${current.id}`, value: image, source: file.name, opacity: Number(current.opacity ?? 100), updatedAt: getNow() });
      showToast('小组件图上传啦');
    }),
    actionBtn('check', '保存', () => {
      const list = getData(CUSTOM_WIDGETS_KEY) || [];
      const old = list.find((item) => item.id === current.id);
      const next = {
        id: current.id,
        name: name.input.value.trim(),
        shape: shape.input.value,
        image,
        imageSource: image ? 'upload' : '',
        text: text.input.value.trim(),
        opacity: Number(old?.opacity ?? current.opacity ?? 100),
        createdAt: current.createdAt || getNow(),
        updatedAt: getNow()
      };

      setData(CUSTOM_WIDGETS_KEY, [...list.filter((item) => item.id !== current.id), next]);
      hideBottomSheet();
      showToast('小组件保存啦');
      emitRefresh();
      render('widgets');
    })
  );

  showBottomSheet(sheet.root);
}

async function deleteWidget(id) {
  const ok = await showConfirm('要删除这个小组件吗？');
  if (!ok) return;

  setData(CUSTOM_WIDGETS_KEY, (getData(CUSTOM_WIDGETS_KEY) || []).filter((item) => item.id !== id));
  await deleteDB('blobs', `custom_widget_${id}`);

  showToast('小组件删除啦');
  emitRefresh();
  render('widgets');
}

// ═══════════════════════════════════════
// 【图标操作】
// ═══════════════════════════════════════

function renameIcon(id, fallbackName) {
  const icons = getData(ICONS_KEY) || {};
  const current = icons[id] || {};
  const sheet = sheetBox('改图标名字');
  const name = inputRow('显示名字', current.name || fallbackName, fallbackName);

  sheet.body.append(name.wrap);
  sheet.actions.append(actionBtn('check', '保存', () => {
    icons[id] = { ...current, name: name.input.value.trim() || fallbackName, updatedAt: getNow() };
    setData(ICONS_KEY, icons);
    hideBottomSheet();
    showToast('名字改好啦');
    emitRefresh();
    render('icons');
  }));

  showBottomSheet(sheet.root);
}

async function uploadIcon(id) {
  const file = await pickFile('image/*');
  if (!file) return;

  let dataUrl;
  try { dataUrl = await readFileAsDataUrl(file); }
  catch (_) { showToast('图片读取失败，可能格式损坏或不支持'); return; }
  if (!dataUrl) { showToast('图片读取失败，换一张试试'); return; }
  const valid = await verifyImageDataUrl(dataUrl);
  if (!valid) { showToast('图片格式不支持或已损坏，换一张试试'); return; }

  const icons = getData(ICONS_KEY) || {};
  const current = icons[id] || {};
  const blobKey = `app_icon_${id}`;
  const opacity = Number(current.opacity ?? 100);

  const blobRecord = { key: blobKey, value: dataUrl, source: file.name, opacity, updatedAt: getNow() };
  const saved = await setDB('blobs', blobKey, blobRecord);
  if (!saved) { showToast('图标保存失败，可能图片太大或存储已满'); return; }

  icons[id] = {
    ...current,
    image: dataUrl,
    iconImage: dataUrl,
    backgroundImage: dataUrl,
    imageBase64: dataUrl,
    blobKey,
    opacity,
    updatedAt: getNow()
  };

  setData(ICONS_KEY, icons);
  showToast('图标换好啦');
  emitRefresh();
  render('icons');
}

function toggleIconHidden(id) {
  const hidden = new Set(getData(HIDDEN_ICONS_KEY) || []);

  if (hidden.has(id)) {
    hidden.delete(id);
    showToast('图标回来啦');
  } else {
    hidden.add(id);
    showToast('图标藏好啦');
  }

  setData(HIDDEN_ICONS_KEY, [...hidden]);
  emitRefresh();
  render('icons');
}

// ═══════════════════════════════════════
// 【数据导出导入】
// ═══════════════════════════════════════

async function exportAll() {
  const data = { localStorage: {}, indexedDB: {} };

  [
    SETTINGS_KEY, CLOUD_KEY, ICONS_KEY, HIDDEN_ICONS_KEY, WALLPAPER_OPACITY_KEY,
    WIDGET_BACKGROUNDS_KEY, DESKTOP_SCALE_KEY, CUSTOM_FONT_META_KEY, CUSTOM_WIDGETS_KEY,
    'app_theme', 'app_theme_preset', 'app_theme_mode', ...CHAT_LOCAL_KEYS, API_POOL_GROUPS_KEY,
    'moments_unread_count', 'games_unread_count'
  ].forEach((key) => {
    data.localStorage[key] = getData(key);
  });

  for (const store of DB_STORES) {
    try {
      data.indexedDB[store] = await getAllDB(store);
    } catch {
      data.indexedDB[store] = [];
    }
  }

  downloadJson(`ai-phone-backup-${getNow().slice(0, 10)}.json`, data);
  showToast('数据打包好啦');
}

async function importAll() {
  const file = await pickFile('application/json');
  if (!file) return;

  const ok = await showConfirm('导入会覆盖同名数据，要继续吗？');
  if (!ok) return;

  try {
    const data = JSON.parse(await readFileAsText(file));
    Object.entries(data.localStorage || {}).forEach(([key, value]) => setData(key, value));

    for (const store of DB_STORES) {
      if (!Array.isArray(data.indexedDB?.[store])) continue;
      try {
        await clearStoreDB(store);
        for (const item of data.indexedDB[store]) {
          const record = item.key ? item : { ...item, key: item.id };
          await setDB(store, record);
        }
      } catch {}
    }

    showToast('导入完成啦');
    emitRefresh();
    render('data');
  } catch {
    showToast('导入失败了');
  }
}

// ═══════════════════════════════════════
// 【数据清理】
// ═══════════════════════════════════════

async function clearStoreWithConfirm(store, message, successText) {
  const ok = await showConfirm(message);
  if (!ok) return;

  await clearStoreDB(store);
  if (store === 'messages' || store === 'group_messages') {
    removeData('chat_unread_counts');
    removeData('chat_group_unread_counts');
  }

  showToast(successText);
  emitRefresh();
  render('data');
}

async function clearChatData() {
  const ok = await showConfirm('这会清空私聊、群聊、所有记忆（包括其他应用写入的）和聊天角标，要继续吗？');
  if (!ok) return;

  await clearStoreDB('messages');
  await clearStoreDB('group_messages');
  await clearStoreDB('memories');

  CHAT_LOCAL_KEYS.forEach(removeData);

  showToast('聊天全部清好啦');
  emitRefresh();
  render('data');
}

async function clearImageDressData() {
  const ok = await showConfirm('要清掉壁纸、图标、小组件背景这些装扮吗？自定义小组件会保留。');
  if (!ok) return;

  const iconRecords = getData(ICONS_KEY) || {};

  IMAGE_DRESS_KEYS.forEach(removeData);

  for (const key of IMAGE_BLOB_KEYS) {
    try { await deleteDB('blobs', key); } catch {}
  }

  for (const iconId of Object.keys(iconRecords)) {
    try { await deleteDB('blobs', `app_icon_${iconId}`); } catch {}
  }

  showToast('图片装扮清好啦');
  emitRefresh();
  render('data');
}

async function clearGameRelationData() {
  const ok = await showConfirm('要清掉记仇、惩罚、关系锁这些游戏关系吗？');
  if (!ok) return;

  for (const store of ['grudges', 'punishments', 'relationship_locks']) {
    try { await clearStoreDB(store); } catch {}
  }

  showToast('游戏关系清好啦');
  emitRefresh();
  render('data');
}

async function clearAllData() {
  const ok = await showConfirm('这会清空所有数据，真的继续吗？');
  if (!ok) return;

  [
    SETTINGS_KEY, CLOUD_KEY, ICONS_KEY, HIDDEN_ICONS_KEY, WALLPAPER_KEY,
    WALLPAPER_OPACITY_KEY, WIDGET_BACKGROUNDS_KEY, DESKTOP_SCALE_KEY,
    CUSTOM_FONT_META_KEY, CUSTOM_WIDGETS_KEY, API_POOL_GROUPS_KEY,
    'app_theme', 'app_theme_preset', 'app_theme_mode', ...CHAT_LOCAL_KEYS,
    'moments_unread_count', 'games_unread_count',
    // GitHub 工具配置和 Token：清空全部时一并清理，避免敏感凭据残留
    ...GITHUB_TOOL_STORAGE_KEYS
  ].forEach(removeData);

  for (const store of DB_STORES) {
    try { await clearStoreDB(store); } catch {}
  }

  await deleteDB('blobs', CUSTOM_FONT_KEY).catch(() => {});

  if (customFontStyleEl) {
    customFontStyleEl.remove();
    customFontStyleEl = null;
  }

  showToast('都清空啦');
  emitRefresh();
  render('data');
}

// ═══════════════════════════════════════
// 【自定义字体】
// ═══════════════════════════════════════

async function uploadCustomFont() {
  const file = await pickFile('.ttf,.otf,.woff,.woff2');
  if (!file) return;

  const ext = file.name.split('.').pop()?.toLowerCase() || 'woff2';
  const dataUrl = await readFileAsDataUrl(file);

  await setDB('blobs', CUSTOM_FONT_KEY, { key: CUSTOM_FONT_KEY, value: dataUrl, name: file.name, type: ext, updatedAt: getNow() });
  setData(CUSTOM_FONT_META_KEY, { name: file.name, type: ext, format: ext, updatedAt: getNow() });

  injectCustomFont(dataUrl, ext);
  applyTheme({ 'font-main': '"AppCustomFont", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' });
  saveTheme();

  showToast('字体换好啦');
  emitRefresh();
  render('display');
}

async function clearCustomFont() {
  const ok = await showConfirm('要恢复默认字体吗？');
  if (!ok) return;

  await deleteDB('blobs', CUSTOM_FONT_KEY);
  removeData(CUSTOM_FONT_META_KEY);

  if (customFontStyleEl) customFontStyleEl.remove();
  customFontStyleEl = null;

  applyTheme({ 'font-main': "'PingFang SC', 'Microsoft YaHei', sans-serif" });
  saveTheme();

  showToast('字体恢复啦');
  emitRefresh();
  render('display');
}

async function restoreCustomFont() {
  const meta = getData(CUSTOM_FONT_META_KEY);
  const record = await getDB('blobs', CUSTOM_FONT_KEY);
  if (!meta || !record?.value) return;
  injectCustomFont(record.value, meta.format || 'woff2');
}

function injectCustomFont(dataUrl, format) {
  if (customFontStyleEl) customFontStyleEl.remove();

  customFontStyleEl = document.createElement('style');
  customFontStyleEl.textContent = `
    @font-face {
      font-family: "AppCustomFont";
      src: url("${dataUrl}") format("${format}");
      font-display: swap;
    }
  `;

  document.head.appendChild(customFontStyleEl);
}

// ═══════════════════════════════════════
// 【主题文件】导入导出
// ═══════════════════════════════════════

async function importThemeFile() {
  const file = await pickFile('application/json');
  if (!file) return;

  try {
    importTheme(await readFileAsText(file));
    showToast('主题导入啦');
    emitRefresh();
    render('theme');
  } catch {
    showToast('主题导入失败');
  }
}

// ═══════════════════════════════════════
// 【API 测试台辅助】
// ═══════════════════════════════════════

function buildChatUrlForSettings(endpoint, provider) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '');
  if (provider === 'anthropic') {
    if (/\/messages$/i.test(base)) return base;
    if (/\/v1$/i.test(base)) return `${base}/messages`;
    return `${base}/v1/messages`;
  }
  if (provider === 'ollama') {
    if (/\/api\/chat$/i.test(base)) return base;
    return `${base}/api/chat`;
  }
  if (provider === 'gemini') {
    return base;
  }
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function buildModelsUrlForSettings(endpoint, provider) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '');
  if (provider === 'gemini') {
    return base
      .replace(/\/v1beta\/models\/[^/]+:generateContent$/i, '/v1beta/models')
      .replace(/\/v1beta\/models\/[^/]+:streamGenerateContent$/i, '/v1beta/models')
      .replace(/\/v1beta\/?$/i, '/v1beta/models');
  }
  return smartModelsUrl(base, provider);
}

function extractModelList(data, provider) {
  if (provider === 'ollama') {
    return (data?.models || []).map((m) => m?.name).filter(Boolean);
  }
  if (provider === 'gemini') {
    return (data?.models || [])
      .map((m) => String(m?.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  }
  return (data?.data || [])
    .map((m) => typeof m === 'string' ? m : m?.id)
    .filter(Boolean);
}

function buildTestBody(provider, model) {
  if (provider === 'anthropic') {
    return {
      model: model || 'claude-3-haiku-20240307',
      max_tokens: 32,
      messages: [{ role: 'user', content: [{ type: 'text', text: '请回复：连接成功' }] }]
    };
  }
  if (provider === 'gemini') {
    return {
      contents: [{ role: 'user', parts: [{ text: '请回复：连接成功' }] }]
    };
  }
  if (provider === 'ollama') {
    return {
      model: model || 'llama3',
      stream: false,
      messages: [{ role: 'user', content: '请回复：连接成功' }]
    };
  }
  return {
    model,
    stream: false,
    messages: [{ role: 'user', content: '请回复：连接成功' }]
  };
}

async function testApiByChat({ endpoint, apiKey, provider, model }) {
  const endpointValue = String(endpoint || '').trim();
  const providerValue = provider || detectProviderFromUrl(endpointValue);
  if (!endpointValue) throw new Error('Endpoint 还没填哦');
  let url = buildChatUrlForSettings(endpointValue, providerValue);
  const headers = buildHeaders(apiKey, providerValue);
  const body = buildTestBody(providerValue, model);
  if (providerValue === 'gemini') {
    const cleanModel = model || 'gemini-1.5-flash';
    let base = endpointValue
      .replace(/\/v1beta\/models\/[^/]+:generateContent$/i, '')
      .replace(/\/v1beta\/models\/[^/]+:streamGenerateContent$/i, '')
      .replace(/\/v1beta\/models\/?$/i, '')
      .replace(/\/v1beta\/?$/i, '')
      .replace(/\/+$/, '');
    const geminiUrl = new URL(`${base}/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent`);
    if (apiKey) geminiUrl.searchParams.set('key', apiKey);
    url = geminiUrl.toString();
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    cache: 'no-store',
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await parseErrorResponse(res));
  return true;
}

function formatApiEditorError(error, fallback) {
  const message = String(error?.message || '').trim();
  if (!message) return fallback;
  if (/failed to fetch|load failed|networkerror|cors/i.test(message)) {
    return '这个中转站被浏览器拦住啦，可能没开放网页直连。可以手填模型名继续使用～';
  }
  return message
    .replace(/^HTTP\s*\d+\s*[｜|]\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim() || fallback;
}

// ═══════════════════════════════════════
// 【辅助工具】
// ═══════════════════════════════════════

function closeDesktop() {
  if (typeof window.closeCurrentApp === 'function') window.closeCurrentApp();
  else window.dispatchEvent(new CustomEvent('app-close'));
}

function getTitle(name) {
  return {
    home: '设置小窝', theme: '外观主题', display: '字体与显示',
    apiTest: 'API 测试台', apiPool: 'API 轮换池', tts: 'TTS 声音屋',
    mcp: 'MCP 工具箱', cloud: '云服务器', desktop: '桌面装扮',
    widgets: '小组件', icons: '应用图标', data: '数据小包'
  }[name] || '设置';
}

function getSubtitle(name) {
  return {
    home: '慢慢调，不着急 OvO', theme: '给小手机换件衣服',
    display: '字体和聊天样子', apiTest: '临时测接口，通过再决定',
    apiPool: '分组轮换和测试都在这儿', tts: '让 AI 开口说话',
    mcp: '工具小助手集合', cloud: '默认关闭，主动开启才使用',
    desktop: '壁纸和大小', widgets: '小卡片小窝',
    icons: '桌面图标换装', data: '备份和清理'
  }[name] || '';
}

function page() { return el('div', 'settings-page'); }

function hero(title, desc) {
  const node = el('div', 'settings-hero');
  node.append(el('h2', '', title), el('p', '', desc));
  return node;
}

function group(title, items) {
  const node = el('div', 'settings-group');
  node.append(el('div', 'settings-group-title', title), ...items);
  return node;
}

function navItem(icon, title, desc, nextRoute) {
  const item = el('button', 'settings-nav-item');
  item.type = 'button';

  const mark = el('span', 'settings-row-icon');
  mark.append(safeIcon(icon, 20));

  const text = el('span', 'settings-row-text');
  text.append(el('strong', '', title), el('small', '', desc));

  const arrow = el('span', 'settings-arrow');
  arrow.append(safeIcon('settings', 18));

  item.append(mark, text, arrow);
  item.addEventListener('click', () => render(nextRoute));
  return item;
}

function card(title, desc) {
  const node = el('div', 'settings-card');
  node.append(el('div', 'settings-card-title', title));
  if (desc) node.append(el('p', 'settings-card-desc', desc));
  return node;
}

function empty(text) {
  const node = el('div', 'settings-empty');
  node.textContent = text;
  return node;
}

function actionRow(buttons) {
  const row = el('div', 'settings-actions');
  buttons.forEach((btn) => row.append(btn));
  return row;
}

function actionBtn(icon, text, onClick) {
  return makeButton('settings-action-btn', text, icon, onClick);
}

function makeButton(className, text, icon, onClick) {
  const btn = el('button', className);
  btn.type = 'button';
  if (icon) btn.append(safeIcon(icon, 17));
  btn.append(el('span', '', text));

  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event);
  });

  return btn;
}

function segment(text, active, onClick) {
  const btn = el('button', active ? 'active' : '');
  btn.type = 'button';
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function listAction(icon, title, desc, buttons, preview = null) {
  const item = el('div', 'settings-list-action');

  const mark = preview || el('span', 'settings-row-icon');
  if (!preview) mark.append(safeIcon(icon, 18));

  const text = el('span', 'settings-row-text');
  text.append(el('strong', '', title), el('small', '', desc));

  const row = actionRow(buttons);
  item.append(mark, text, row);
  return item;
}

function labelBlock(label, content) {
  const box = el('div', 'settings-label-block');
  box.append(el('div', 'settings-label', label), content);
  return box;
}

function rangeBlock(value, min, max, step, onChange) {
  const row = el('div', 'settings-range-row');
  const input = el('input', 'settings-range');
  const num = el('span', 'settings-range-value', String(value));

  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  input.addEventListener('input', () => {
    num.textContent = step < 1 ? Number(input.value).toFixed(2) : String(input.value);
    onChange?.(input.value, true);
  });

  input.addEventListener('change', () => onChange?.(input.value, false));
  row.append(input, num);
  return row;
}

function modelPicker({ models = [], current = '', onSelect, emptyText = '还没有模型，先点拉取模型吧' }) {
  const box = el('div', 'settings-model-picker');
  const title = el('div', 'settings-model-title', '模型小篮子');
  box.append(title);

  if (!models.length) {
    box.append(el('p', 'settings-note', emptyText));
    return box;
  }

  const list = el('div', 'settings-model-list');
  models.forEach((model) => {
    const btn = el('button', `settings-model-chip ${model === current ? 'active' : ''}`);
    btn.type = 'button';

    const name = el('span', 'settings-model-name', model);
    const tag = el('small', '', model === current ? '正在用' : '点我选');
    btn.append(name, tag);

    btn.addEventListener('click', () => onSelect?.(model));
    list.append(btn);
  });

  box.append(list);
  return box;
}

function inputRow(label, value, placeholder) {
  const wrap = el('label', 'settings-field');
  const input = el('input', 'settings-input');
  input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder || '';
  wrap.append(el('span', '', label), input);
  return { wrap, input };
}

function selectRow(label, value, options) {
  const wrap = el('label', 'settings-field');
  const input = el('select', 'settings-input settings-select');

  options.forEach(([val, text]) => {
    const option = document.createElement('option');
    option.value = val;
    option.textContent = text;
    input.append(option);
  });

  input.value = value || options[0]?.[0] || '';
  wrap.append(el('span', '', label), input);
  return { wrap, input };
}

function selectSettingBlock(label, value, options, onChange) {
  const row = selectRow(label, value, options);
  row.input.addEventListener('change', () => onChange?.(row.input.value));
  return row.wrap;
}

function switchRow(label, initial, onChange) {
  const row = el('button', `settings-switch-row ${initial ? 'on' : ''}`);
  row.type = 'button';
  row.dataset.value = initial ? 'true' : 'false';
  row.append(el('span', '', label), el('i', 'settings-switch-dot'));

  row.addEventListener('click', () => {
    const next = row.dataset.value !== 'true';
    row.dataset.value = next ? 'true' : 'false';
    row.classList.toggle('on', next);
    onChange?.(next, row);
  });

  return row;
}

function sheetBox(title) {
  const root = el('div', 'settings-sheet');
  const body = el('div', 'settings-sheet-body');
  const actions = el('div', 'settings-actions');
  root.append(el('div', 'settings-sheet-title', title), body, actions);
  return { root, body, actions };
}

function imagePreview(src, label = '图片预览', fallbackIcon = 'image') {
  const box = el('span', 'settings-image-preview');
  box.setAttribute('aria-label', label);

  if (src) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = src;
    img.addEventListener('error', () => {
      box.innerHTML = '';
      box.append(safeIcon(fallbackIcon, 20));
      box.classList.remove('has-preview');
    });
    box.append(img);
    box.classList.add('has-preview');
  } else {
    box.append(safeIcon(fallbackIcon, 20));
  }

  return box;
}

async function fillBlobPreview(previewEl, key) {
  const record = await getDB('blobs', key);
  const image = getRecordImage(record);

  previewEl.innerHTML = '';
  if (image) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = image;
    previewEl.append(img);
    previewEl.classList.add('has-preview');
  } else {
    previewEl.append(safeIcon('image', 20));
    previewEl.classList.remove('has-preview');
  }
}

function getRecordImage(record) {
  if (!record) return '';
  if (typeof record === 'string') return record;
  return record.value || record.image || record.iconImage || record.backgroundImage || record.imageBase64 || record.data || record.source || '';
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function readFileAsDataUrl(file) {
  // 图片文件走压缩（GIF/SVG 会在 compressImage 内部原样保留）
  // 压缩失败（图片损坏/格式不支持解码）直接抛错，不回退原始读取——
  // 回退会绕过图片有效性验证，导致"读出 base64 但无法显示"的假成功
  if (file && file.type && file.type.startsWith('image/')) {
    return await compressImage(file, 1800, 0.9);
  }
  // 非图片（如字体）走原始 FileReader
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeColor(value) {
  const text = String(value || '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(text)) return text;
  return '#ffffff';
}

function getPresetName(id) {
  return getThemePresets().find((preset) => preset.id === id)?.name || id || '默认主题';
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function emitRefresh() {
  window.AppEvents?.emit?.('desktop:refresh');
  window.dispatchEvent(new CustomEvent('app-settings-updated'));
}

// ═══════════════════════════════════════
// 【服务商检测、紧凑卡片、图标按钮】
// ═══════════════════════════════════════

function detectProviderFromUrl(endpoint) {
  const raw = String(endpoint || '').toLowerCase();
  if (raw.includes('anthropic.com')) return 'anthropic';
  if (raw.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (raw.includes('localhost') || raw.includes('127.0.0.1')) return 'ollama';
  return 'openai';
}

function safeIcon(name, size = 18) {
  try {
    const icon = createIcon(name, size);
    if (icon) return icon;
  } catch {}

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '4.5');
  svg.append(circle);

  return svg;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式注入】
// ═══════════════════════════════════════

function injectStyle() {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }

  styleEl = document.createElement('style');
  styleEl.textContent = `
    .settings-app-shell {
      position: fixed;
      inset: 0;
      z-index: 31;
      pointer-events: auto;
      overflow: hidden;
      background: var(--bg-primary);
    }

    .settings-app {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .settings-nav {
      background: var(--surface-glass);
    }

    .settings-nav-titlebox {
      flex: 1;
      min-width: 0;
      text-align: left;
    }

    .settings-nav-btn {
      min-width: 92px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 12px;
      border-radius: 16px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      transition: var(--motion);
    }

    .settings-content {
      height: calc(100% - 58px - env(safe-area-inset-top));
      overflow-y: auto;
      overflow-x: hidden;
      padding: 78px 20px calc(34px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .settings-narrow,
    .settings-page {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .settings-narrow {
      width: min(100%, 460px);
      margin: 0 auto;
    }

    .settings-hero,
    .settings-card,
    .settings-group,
    .settings-empty {
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .settings-hero,
    .settings-card {
      padding: 16px;
    }

    .settings-hero h2 {
      margin: 0;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.3;
    }

    .settings-hero p,
    .settings-card-desc,
    .settings-note,
    .settings-row-text small,
    .settings-empty {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
      white-space: pre-line;
    }

    .settings-hero p,
    .settings-card-desc,
    .settings-note,
    .settings-free-note {
      margin: 6px 0 0;
    }

    .settings-free-note {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
      padding: 8px 10px;
      border-radius: 12px;
      background: var(--surface-muted);
    }

    .settings-group {
      padding: 8px;
    }

    .settings-group-title {
      padding: 8px 10px 6px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .settings-nav-item,
    .settings-list-action {
      width: 100%;
      min-height: 62px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      border-radius: 18px;
      background: transparent;
      color: var(--text-primary);
      text-align: left;
      transition: var(--motion);
    }

    .settings-nav-item:active,
    .settings-action-btn:active,
    .settings-preset:active,
    .settings-model-chip:active,
    .settings-switch-row:active,
    .settings-nav-btn:active,
    .settings-api-top-btn:active,
    .settings-compact-action:active {
      transform: scale(var(--press-scale));
    }

    .settings-row-icon,
    .settings-image-preview {
      width: 36px;
      height: 36px;
      flex: 0 0 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 14px;
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .settings-image-preview.has-preview {
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .settings-image-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: inherit;
      display: block;
    }

    .settings-card > .settings-image-preview {
      width: 100%;
      height: 132px;
      margin-top: 12px;
      border-radius: 22px;
      flex: none;
    }

    .settings-row-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .settings-row-text strong,
    .settings-card-title {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
    }

    .settings-card-title {
      font-size: var(--font-size-title);
    }

    .settings-arrow {
      flex: 0 0 auto;
      color: var(--text-hint);
    }

    .settings-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .settings-action-btn,
    .settings-preset,
    .settings-color-row,
    .settings-label-block,
    .settings-field,
    .settings-switch-row,
    .settings-model-picker,
    .settings-model-chip {
      border-radius: 16px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .settings-action-btn {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      font-size: var(--font-size-small);
      transition: var(--motion);
    }

    .settings-action-btn.active-selected {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .settings-preset {
      min-height: 56px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 3px;
      padding: 10px 12px;
      text-align: left;
      transition: var(--motion);
    }

    .settings-preset.active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .settings-preset small {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .settings-model-picker {
      margin-top: 12px;
      padding: 12px;
    }

    .settings-model-title {
      margin-bottom: 10px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .settings-model-list {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 2px 2px 8px;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .settings-model-list::-webkit-scrollbar {
      display: none;
    }

    .settings-model-chip {
      min-width: 148px;
      max-width: 220px;
      min-height: 58px;
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 3px;
      padding: 10px 12px;
      text-align: left;
      transition: var(--motion);
    }

    .settings-model-chip.active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .settings-model-name {
      width: 100%;
      overflow: hidden;
      color: var(--text-primary);
      font-size: var(--font-size-small);
      font-weight: 600;
      line-height: 1.3;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .settings-model-chip small {
      color: var(--text-secondary);
      font-size: calc(var(--font-size-small) * 0.86);
      line-height: 1.2;
    }

    .settings-model-chip.active small,
    .settings-model-chip.active .settings-model-name {
      color: var(--accent-dark);
    }

    .settings-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }

    .settings-color-row,
    .settings-label-block,
    .settings-field,
    .settings-switch-row {
      width: 100%;
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
    }

    .settings-color {
      width: 40px;
      height: 32px;
      padding: 0;
      border-radius: 12px;
      background: transparent;
      overflow: hidden;
    }

    .settings-range-row {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .settings-range {
      flex: 1;
      min-width: 0;
      accent-color: var(--accent);
    }

    .settings-range-value {
      min-width: 42px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      text-align: right;
    }

    .settings-label-block,
    .settings-field {
      align-items: stretch;
      flex-direction: column;
      margin-top: 10px;
    }

    .settings-label,
    .settings-field span {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .settings-input {
      width: 100%;
      min-height: 44px;
      padding: 10px 12px;
      border-radius: 15px;
      background: var(--bg-card);
      color: var(--text-primary);
      font-size: max(var(--font-size-base), 16px);
    }

    .settings-select {
      appearance: none;
      -webkit-appearance: none;
      cursor: pointer;
      padding-right: 36px;
      background-repeat: no-repeat;
      background-position: right 10px center;
      background-size: 18px;
    }

    .settings-segment {
      display: flex;
      gap: 6px;
      margin-top: 12px;
      padding: 5px;
      border-radius: 16px;
      background: var(--surface-muted);
    }

    .settings-segment button {
      flex: 1;
      min-height: 36px;
      border-radius: 12px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      transition: var(--motion);
    }

    .settings-segment button.active {
      color: var(--accent-dark);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .settings-switch-row {
      flex-direction: row;
      font-size: var(--font-size-base);
      transition: var(--motion);
    }

    .settings-switch-dot {
      position: relative;
      width: 44px;
      height: 26px;
      flex: 0 0 44px;
      border-radius: 999px;
      background: var(--bg-secondary);
      transition: var(--motion);
    }

    .settings-switch-dot::after {
      content: "";
      position: absolute;
      top: 4px;
      left: 4px;
      width: 18px;
      height: 18px;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .settings-switch-row.on .settings-switch-dot {
      background: var(--accent);
    }

    .settings-switch-row.on .settings-switch-dot::after {
      transform: translateX(18px);
    }

    .settings-list-action {
      align-items: flex-start;
      background: var(--surface-muted);
      margin-top: 10px;
    }

    .settings-list-action .settings-actions {
      flex: 0 0 auto;
      justify-content: flex-end;
      margin-top: 0;
    }

    .settings-widget-bg-block {
      margin-top: 10px;
      padding: 2px 0 0;
      border-radius: 18px;
    }

    .settings-empty {
      padding: 24px;
      text-align: center;
    }

    .settings-sheet {
      width: min(100%, 460px);
      margin: 0 auto;
      color: var(--text-primary);
    }

    .settings-sheet-title {
      margin-bottom: 12px;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .settings-sheet-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .api-pool-quick-group {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .api-pool-quick-group .settings-preset {
      flex: 1;
    }

    .settings-api-top-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .settings-api-top-btn {
      border: none;
      outline: none;
      flex: 1;
      min-height: 52px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 10px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-primary);
      text-align: center;
      transition: var(--motion);
    }

    .settings-api-anon-btn {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .settings-api-top-btn strong {
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.2;
    }

    .settings-api-top-btn small {
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1.2;
    }

    .settings-api-anon-btn small {
      color: var(--accent);
    }

    .settings-api-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .settings-api-group-title {
      padding: 6px 0 2px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .settings-api-compact {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      min-height: 48px;
      border-radius: var(--radius-md);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .settings-api-compact-icon {
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .settings-api-compact-info {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
    }

    .settings-api-compact-info strong {
      font-size: var(--font-size-base);
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .settings-api-compact-info small {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 120px;
      flex-shrink: 1;
    }

    .settings-api-compact-badge {
      flex: 0 0 auto;
      padding: 1px 8px;
      border-radius: 999px;
      background: var(--accent-light);
      color: var(--accent-dark);
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }

    .settings-api-compact-actions {
      display: flex;
      gap: 2px;
      flex: 0 0 auto;
    }

    .settings-compact-action {
      border: none;
      outline: none;
      width: 30px;
      height: 30px;
      flex: 0 0 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: transparent;
      color: var(--text-secondary);
      transition: var(--motion);
    }

    .settings-free-preset {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
    }

    .settings-free-preset + .settings-free-preset {
      margin-top: 8px;
    }

    .settings-free-preset-info {
      flex: 1;
      min-width: 0;
    }

    .settings-free-preset-info strong {
      display: block;
      font-size: var(--font-size-base);
      font-weight: 600;
      margin-bottom: 2px;
    }

    .settings-free-preset-info small {
      display: block;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    @media (max-width: 600px) {
      .settings-list-action {
        flex-wrap: wrap;
      }

      .settings-list-action .settings-actions {
        width: 100%;
        padding-left: 48px;
      }

      .settings-api-compact-info small {
        display: none;
      }

      .settings-api-top-btn small {
        display: none;
      }

      .settings-api-top-buttons > .settings-api-top-btn {
        flex: 1 1 calc(50% - 4px);
        min-width: 0;
      }

      .settings-api-top-buttons > .settings-api-top-btn:last-child {
        flex: 1 1 100%;
      }
    }

    /* ═══ MCP 推荐模板卡片 ═══ */
    .settings-mcp-recommended-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 12px;
    }
    .settings-mcp-recommended-card {
      padding: 14px 16px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .settings-mcp-recommended-head {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .settings-mcp-recommended-icon {
      width: 36px;
      height: 36px;
      flex: 0 0 36px;
      border-radius: 12px;
      background: var(--accent-light);
      color: var(--accent-dark);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .settings-mcp-recommended-namebox {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .settings-mcp-recommended-name {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.3;
      word-break: break-word;
    }
    .settings-mcp-recommended-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .settings-mcp-recommended-tag {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--accent-light);
      color: var(--accent-dark);
      font-size: 11px;
      font-weight: 500;
      line-height: 1.4;
    }
    .settings-mcp-recommended-auth {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.4;
    }
    .settings-mcp-recommended-auth.is-free {
      background: var(--accent-light);
      color: var(--accent-dark);
    }
    .settings-mcp-recommended-auth.is-key {
      background: var(--bg-card);
      color: var(--text-secondary);
    }
    .settings-mcp-recommended-add {
      flex: 0 0 auto;
    }
    .settings-mcp-recommended-desc {
      margin: 0;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.5;
      word-break: break-word;
    }
    .settings-mcp-recommended-hint {
      margin: 0;
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.4;
    }

    /* ═══ MCP 工具抽屉 + 工具卡片 ═══ */
    .settings-mcp-panel.hidden { display: none; }

    /* MCP 编辑弹层专属布局：让 body 撑满剩余高度，actions 固定底部 */
    /* 覆盖 .bottom-sheet > :not(.sheet-handle) 的 overflow:auto，改用 flex 内部滚动 */
    .settings-mcp-editor-sheet {
      display: flex;
      flex-direction: column;
      /* 撑满父级 .bottom-sheet（flex column），不依赖 height:100% */
      flex: 1;
      min-height: 0;
      max-height: min(80vh, 720px);
      overflow: hidden;
    }

    .settings-mcp-editor-sheet .settings-sheet-title {
      flex: 0 0 auto;
    }

    .settings-mcp-editor-sheet .settings-sheet-body {
      flex: 1 1 0;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .settings-mcp-editor-sheet .settings-actions {
      flex: 0 0 auto;
    }

    /* tab 切换栏固定，不随内容滚动 */
    .settings-mcp-editor-sheet .settings-segment {
      flex: 0 0 auto;
    }

    /* 工具 tab 与基础设置 tab 共用的高度规则，保证两 tab 视觉高度一致 */
    .settings-mcp-panel {
      flex: 1 1 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    /* 基础设置 tab：内容多时 panel 内部滚动，tab header 和 actions 固定 */
    .settings-mcp-panel-basic:not(.hidden) {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding-right: 2px;
    }

    /* 工具 tab：panel 不滚，让 drawer-body 内部滚动 */
    .settings-mcp-panel:not(.settings-mcp-panel-basic):not(.hidden) {
      overflow: hidden;
    }

    /* 工具抽屉内部列表可滚动，弹层整体不被无限撑长 */
    .settings-mcp-tools-drawer {
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }

    .settings-mcp-tools-error {
      margin: 0 0 8px 0;
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      background: var(--bg-card);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.5;
      word-break: break-word;
    }

    .settings-mcp-drawer-header {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 16px;
      border: none;
      outline: none;
      background: transparent;
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      cursor: pointer;
      transition: var(--motion);
    }

    .settings-mcp-drawer-header:active { transform: scale(0.99); }

    .settings-mcp-drawer-title {
      flex: 0 0 auto;
      text-align: left;
      word-break: break-all;
    }

    .settings-mcp-drawer-hint {
      flex: 1;
      color: var(--text-hint);
      font-size: var(--font-size-small);
      font-weight: 400;
      text-align: right;
    }

    .settings-mcp-drawer-arrow {
      flex: 0 0 auto;
      color: var(--text-hint);
      transition: transform 0.25s ease;
      display: inline-flex;
    }

    .settings-mcp-tools-drawer.expanded .settings-mcp-drawer-arrow {
      transform: rotate(90deg);
    }

    .settings-mcp-drawer-body {
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 0 12px;
      transition: max-height 0.3s ease, opacity 0.2s ease, padding 0.2s ease;
    }

    .settings-mcp-tools-drawer.expanded .settings-mcp-drawer-body {
      max-height: none;
      flex: 1 1 auto;
      min-height: 0;
      opacity: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 16px;
    }

    .settings-mcp-tools-refresh {
      display: flex;
      justify-content: center;
      margin-top: 8px;
    }

    .settings-mcp-advanced {
      margin-top: 4px;
      border-top: 1px dashed var(--border-subtle, color-mix(in srgb, var(--text-primary) 10%, transparent));
      padding-top: 4px;
    }

    .settings-mcp-advanced-header {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 4px;
      border: none;
      outline: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
      cursor: pointer;
      transition: var(--motion);
    }

    .settings-mcp-advanced-header:active { transform: scale(0.99); }

    .settings-mcp-advanced-title {
      flex: 0 0 auto;
      text-align: left;
    }

    .settings-mcp-advanced-hint {
      flex: 1;
      color: var(--text-hint);
      font-size: var(--font-size-small);
      font-weight: 400;
      text-align: right;
    }

    .settings-mcp-advanced-arrow {
      flex: 0 0 auto;
      color: var(--text-hint);
      transition: transform 0.25s ease;
      display: inline-flex;
    }

    .settings-mcp-advanced.expanded .settings-mcp-advanced-arrow {
      transform: rotate(90deg);
    }

    .settings-mcp-advanced-body {
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 0 4px;
      transition: max-height 0.3s ease, opacity 0.2s ease, padding 0.2s ease;
    }

    .settings-mcp-advanced.expanded .settings-mcp-advanced-body {
      max-height: 800px;
      opacity: 1;
      padding-bottom: 10px;
    }

    .settings-mcp-advanced-note {
      margin: 0 0 4px 0;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background: var(--bg-card);
      color: var(--text-hint);
      font-size: var(--font-size-small);
      line-height: 1.5;
    }

    .settings-mcp-tool-card {
      padding: 14px;
      border-radius: var(--radius-md);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: var(--motion);
    }

    .settings-mcp-tool-card.disabled {
      opacity: 0.55;
    }

    .settings-mcp-tool-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .settings-mcp-tool-name-wrap {
      flex: 1;
      min-width: 0;
    }

    .settings-mcp-tool-name {
      display: block;
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
      /* 长英文工具名横向换行，禁止竖排 */
      word-break: normal;
      overflow-wrap: anywhere;
    }

    .settings-mcp-tool-desc {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.5;
      word-break: break-word;
    }

    .settings-mcp-tool-params {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .settings-mcp-param-chip {
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      line-height: 1.4;
      word-break: break-all;
    }

    .settings-mcp-tool-approval {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-top: 10px;
      border-top: 1px solid color-mix(in srgb, var(--text-hint) 12%, transparent);
    }

    .settings-mcp-tool-approval-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .settings-mcp-tool-approval-label {
      color: var(--text-primary);
      font-size: var(--font-size-small);
      font-weight: 500;
    }

    .settings-mcp-tool-approval-hint {
      color: var(--text-hint);
      font-size: 12px;
    }

    /* 工具卡片内的开关只显示圆点，隐藏空 label span */
    .settings-mcp-tool-switch {
      flex: 0 0 auto;
      /* 覆盖 .settings-switch-row 的 width:100%，否则开关会撑满整行
         把左侧工具名/审批文案容器压成 0 宽，导致文字竖排 */
      width: auto;
      padding: 0;
      min-height: auto;
      background: transparent;
    }

    .settings-mcp-tool-switch > span:empty {
      display: none;
    }
  `;
  document.head.appendChild(styleEl);
}

// depends: ../core/storage.js(getData,setData,removeData,generateId,getNow,getStorageUsage,getDB,setDB,getAllDB,deleteDB,clearStoreDB)；../core/theme.js(getThemePresets,getCurrentTheme,setPreset,setThemeMode,applyTheme,saveTheme,exportTheme,importTheme)；../core/ui.js(showToast,showBottomSheet,hideBottomSheet,showConfirm,createIcon)；../core/api.js(fetchModels,smartModelsUrl,parseErrorResponse,buildHeaders,addPoolEndpoint,getPoolGroups)；../core/mcp.js(resetSession,getMcpServers,listMcpTools)；../core/storage-manager.js(testCloudConnection)；./settings/api-pool-settings.js；./settings/tts-settings.js

