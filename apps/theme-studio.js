// apps/theme-studio.js
// imports:
//   from '../core/theme-ai-agent.js': theme AI protocol functions
//   from '../core/ui.js': createIcon, showToast, showConfirm
//   from '../core/api.js': silentRequest
//   from '../core/storage.js': compressImage

import {
  getThemeAIContext,
  validateAIThemeResult,
  previewThemeAsync,
  confirmThemePreviewAsync,
  cancelThemePreview,
  cancelThemePreviewAsync,
  saveThemeVersionAsync,
  deleteThemeVersionAsync,
  copyThemeVersion,
  listThemeVersions,
  exportThemePackage,
  exportThemePackageAsync,
  importThemePackageAsync,
  getActiveThemeVersion,
  recordThemeOptimization,
  listThemeOptimizationLog,
  getThemePreviewState
} from '../core/theme-ai-agent.js';
import { createIcon, showToast, showConfirm } from '../core/ui.js';
import { silentRequest } from '../core/api.js';
import { compressImage } from '../core/storage.js';

const SLOT_LABELS = {
  app_wallpaper: '壁纸',
  app_widget_area_bg: '装饰图',
  app_lock_background: '锁屏背景',
  app_lock_avatar: '锁屏头像',
  app_bg_chat: '聊天背景',
  app_bg_dream: '梦境背景',
  app_bg_settings: '设置背景',
  app_icon: '图标',
  decoration: '装饰图'
};

let rootEl = null;
let appContext = {};
let state = null;
let styleEl = null;


const STARTER_THEME_TOKENS = Object.freeze({
  pink: Object.freeze({
    accent: '#EFA6C1',
    'accent-light': '#F8D9E5',
    'accent-dark': '#C97898',
    light: Object.freeze({
      'bg-primary': '#FFF1F6',
      'bg-secondary': '#FBE1EB',
      'bg-card': '#FFF9FB',
      'text-primary': '#674D58',
      'text-secondary': '#987383',
      'bubble-ai-bg': '#FFF7FA'
    }),
    dark: Object.freeze({
      'bg-primary': '#30242A',
      'bg-secondary': '#3B2B33',
      'bg-card': '#44333B',
      'text-primary': '#F7E8EF',
      'text-secondary': '#D7B8C6',
      'bubble-ai-bg': '#493640'
    }),
    'bubble-user-bg': '#F4BED2'
  }),
  mint: Object.freeze({
    accent: '#89AAA9',
    'accent-light': '#D7E8E5',
    'accent-dark': '#668B8A',
    'bg-primary': '#F2F6F3',
    'bg-secondary': '#E2EEE9',
    'bg-card': '#FCFAF5',
    'text-primary': '#536360'
  })
});

// 这里的 hex 是 AI 主题草案 token 预设，只用于生成/预览主题 JSON，不作为页面运行样式散写。
const THEME_JSON_EXAMPLE = '{\n  "themeVariables": { "accent": "#F3A7C4" },\n  "themeConfig": { "themeName": "粉色猫窝" }\n}';


export async function mount(containerEl, context = {}) {
  rootEl = containerEl;
  appContext = context || {};
  state = createInitialState();
  hydrateInitialEditingTheme(context);
  injectStyle();
  render();
}

export function unmount() {
  if (getThemePreviewState()) cancelThemePreview();
  if (rootEl) rootEl.replaceChildren();
  rootEl = null;
  appContext = {};
  state = null;
}


function hydrateInitialEditingTheme(context = {}) {
  const incoming = context.editingTheme || context.options?.editingTheme || null;
  if (incoming && typeof incoming === 'object') {
    state.selectedThemeId = incoming.themeConfig?.themeId || '';
    state.generatedTheme = incoming;
    state.editorText = JSON.stringify(incoming, null, 2);
    state.optimizationBaseTheme = incoming;
    state.validation = validateAIThemeResult(incoming);
  }
  const prompt = context.themePrompt || context.options?.themePrompt || '';
  if (prompt) state.prompt = String(prompt);
}

function createInitialState() {
  return {
    prompt: '做一个粉色猫窝风格',
    editorText: JSON.stringify(createStarterTheme('做一个粉色猫窝风格'), null, 2),
    generatedTheme: null,
    validation: null,
    previewResult: null,
    skippedAssetSlots: new Set(),
    generatingAssetSlots: new Set(),
    optimizationBaseTheme: null,
    pendingImportLog: [],
    statusText: '输入主题需求后，将调用现有 AI 请求入口生成主题 JSON；也可以直接编辑下方配置再预览。',
    selectedThemeId: '',
    isGenerating: false,
    isResourceBusy: false,
    activityLog: [{ role: 'ai', text: '欢迎来到 AI 设计工作台，请描述想要的主题。' }]
  };
}

function render() {
  if (!rootEl || !state) return;
  rootEl.classList.add('theme-studio-root');
  rootEl.replaceChildren();

  const screen = el('section', 'theme-studio app-screen');
  screen.dataset.imageKey = 'app_bg_settings';
  screen.append(renderHeader(), renderMain());
  rootEl.append(screen);
}

function renderHeader() {
  const nav = el('div', 'theme-studio-nav nav-bar');
  const back = button('theme-studio-nav-btn', '返回桌面', 'back', () => appContext.closeApp?.());
  const title = el('div', 'theme-studio-titlebox');
  title.append(el('div', 'nav-title', 'AI 主题工作室'), el('div', 'nav-subtitle', '通过主题协议创建、预览和管理主题'));
  nav.append(back, title);
  return nav;
}

function renderMain() {
  const content = el('div', 'theme-studio-content content-area');
  const narrow = el('div', 'theme-studio-workbench content-narrow');
  narrow.append(
    renderWorkbenchTopbar(),
    renderWorkbenchCanvas(),
    renderActionDock(),
    renderThemeList()
  );
  content.append(narrow);
  return content;
}

function renderWorkbenchTopbar() {
  const active = getActiveThemeVersion();
  const cfg = active?.themeConfig || state.generatedTheme?.themeConfig || {};
  const bar = el('section', 'theme-studio-topbar');
  const title = el('div', 'theme-studio-current');
  title.append(
    el('small', '', '当前主题'),
    el('strong', '', cfg.themeName || '未命名主题'),
    el('span', '', `版本 ${cfg.version || 1} · ${getThemePreviewState() ? '预览中' : active ? '已保存' : '草稿'}`)
  );
  const meta = el('div', 'theme-studio-current-meta');
  meta.append(
    keyValue('父主题', cfg.parentThemeId || '无'),
    keyValue('状态', state.isGenerating ? 'AI 生成中' : state.validation?.ok ? '校验通过' : state.validation ? '需要调整' : '待生成')
  );
  bar.append(title, meta);
  return bar;
}

function renderWorkbenchCanvas() {
  const grid = el('div', 'theme-studio-canvas');
  grid.append(renderConversationPanel(), renderPreviewPanel(), renderSidePanel());
  return grid;
}

function renderConversationPanel() {
  const panelNode = panel('AI 对话', '围绕当前主题持续修改，AI 会读取当前版本和资源上下文。');
  const messages = el('div', 'theme-studio-chatlog');
  const promptText = String(state.prompt || '').trim();
  if (promptText) messages.append(chatBubble('user', promptText));
  state.activityLog.slice(-6).forEach((item) => messages.append(chatBubble(item.role, item.text)));
  if (state.validation?.missingAssets?.length) {
    messages.append(chatBubble('ai', `需要素材：${normalizeMissingAssets(state.validation.missingAssets).map((item) => item.label).join('、')}`));
  }

  const prompt = el('textarea', 'theme-studio-textarea');
  prompt.value = state.prompt;
  prompt.placeholder = '例如：保留猫元素但是更简洁，减少装饰，换成夜晚风格。';
  prompt.addEventListener('input', () => { state.prompt = prompt.value; });

  const editor = el('textarea', 'theme-studio-code');
  editor.value = state.editorText;
  editor.placeholder = THEME_JSON_EXAMPLE;
  editor.addEventListener('input', () => { state.editorText = editor.value; });

  const importInput = el('input', 'theme-studio-import-file');
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';
  importInput.addEventListener('change', () => handleImportFile(importInput.files?.[0] || null));

  panelNode.append(messages, prompt, editor, importInput);
  return panelNode;
}

function renderPreviewPanel() {
  const panelNode = panel('主题预览', '查看颜色、图片资源和装饰参数变化，确认前不会覆盖正式主题。');
  const theme = state.generatedTheme || getActiveThemeVersion() || getThemeAIContext().currentTheme || {};
  const vars = theme.themeVariables || theme.variables || {};
  const cfg = theme.themeConfig || {};
  const previewCard = el('div', 'theme-studio-preview-card');
  previewCard.style.setProperty('--preview-bg', vars['bg-primary'] || vars['bg-main'] || 'var(--bg-primary)');
  previewCard.style.setProperty('--preview-card', vars['bg-card'] || 'var(--bg-card)');
  previewCard.style.setProperty('--preview-accent', vars.accent || vars['color-accent'] || 'var(--accent)');
  previewCard.style.setProperty('--preview-text', vars['text-primary'] || vars['color-text'] || 'var(--text-primary)');
  previewCard.append(
    el('strong', '', cfg.themeName || '主题效果'),
    el('span', '', cfg.description || '颜色、圆角、图片和装饰参数会通过主题协议预览。'),
    el('div', 'theme-studio-preview-pill', '按钮与卡片预览')
  );

  const resources = renderResourceStatus(theme.imageSlots || {});
  const decorations = renderDecorationStatus(theme.uiDecorationParameters || {});
  panelNode.append(previewCard, resources, decorations);
  return panelNode;
}

function renderSidePanel() {
  const side = el('div', 'theme-studio-side');
  side.append(renderContextPanel(), renderOptimizationHistory());
  return side;
}

function renderActionDock() {
  const dock = el('section', 'theme-studio-dock');
  dock.append(actionRow([
    actionButton('send', state.isGenerating ? '生成中' : 'AI 生成主题', handleGenerate),
    actionButton('check', '校验', handleValidate),
    actionButton('play', state.isResourceBusy ? '预览中' : '预览', handlePreview),
    actionButton('close', state.isResourceBusy ? '恢复中' : '取消预览', handleCancelPreview),
    actionButton('check', state.isResourceBusy ? '应用中' : '应用', handleConfirm),
    actionButton('refresh', '继续优化', handleContinueEdit),
    actionButton('download', '导出主题', handleExportActive),
    actionButton('upload', '导入主题', handleImportClick)
  ]));
  return dock;
}

function chatBubble(role, text) {
  const node = el('div', `theme-studio-bubble ${role === 'user' ? 'is-user' : 'is-ai'}`);
  node.append(el('strong', '', role === 'user' ? '用户' : 'AI'), el('span', '', text));
  return node;
}

function renderResourceStatus(imageSlots = {}) {
  const box = el('div', 'theme-studio-resource-status');
  box.append(el('strong', '', '图片资源状态'));
  const keys = Object.keys(imageSlots || {});
  if (!keys.length) box.append(el('span', '', '暂无绑定图片资源'));
  keys.forEach((slot) => {
    const item = imageSlots[slot] || {};
    const value = item.resource?.value || item.value || '';
    box.append(keyValue(SLOT_LABELS[slot] || slot, value ? '已绑定' : item.required ? '需要素材' : '未绑定'));
  });
  if (state.validation?.missingAssets?.length) box.append(missingAssetsBox(normalizeMissingAssets(state.validation.missingAssets).filter((item) => !state.skippedAssetSlots.has(item.slot))));
  return box;
}

function renderDecorationStatus(params = {}) {
  const box = el('div', 'theme-studio-decoration-status');
  box.append(el('strong', '', '装饰参数变化'));
  const entries = Object.entries(params || {});
  if (!entries.length) box.append(el('span', '', '暂无装饰参数'));
  entries.forEach(([key, value]) => box.append(keyValue(key, String(value))));
  return box;
}


function renderComposer() {
  const card = panel('主题需求', '描述想要的风格，生成结果必须通过 theme-ai-agent 校验后才能预览。');
  const prompt = el('textarea', 'theme-studio-textarea');
  prompt.value = state.prompt;
  prompt.placeholder = '例如：做一个粉色猫窝风格，圆角软一点，聊天气泡像奶油。';
  prompt.addEventListener('input', () => { state.prompt = prompt.value; });

  const editor = el('textarea', 'theme-studio-code');
  editor.value = state.editorText;
  editor.placeholder = THEME_JSON_EXAMPLE;
  editor.addEventListener('input', () => { state.editorText = editor.value; });

  const importInput = el('input', 'theme-studio-import-file');
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';
  importInput.addEventListener('change', () => handleImportFile(importInput.files?.[0] || null));

  card.append(prompt, actionRow([
    actionButton('send', state.isGenerating ? '生成中' : 'AI 生成主题', handleGenerate),
    actionButton('check', '校验配置', handleValidate),
    actionButton('play', '预览主题', handlePreview),
    actionButton('download', '导出主题', handleExportActive),
    actionButton('upload', '导入主题', handleImportClick)
  ]), statusBox(state.statusText), editor, importInput);
  return card;
}

function renderGeneratedPanel() {
  const card = panel('生成结果', '预览后可应用保存，也可以基于当前主题连续优化。');
  const validation = state.validation;
  const preview = getThemePreviewState();

  if (!state.generatedTheme && !validation) {
    card.append(empty('还没有生成或校验主题配置。'));
    return card;
  }

  if (validation) {
    card.append(resultLine(validation.ok ? '校验通过' : '校验失败', validation.ok ? '可以进入预览。' : validation.errors.join('、')));
    const assets = normalizeMissingAssets(validation.missingAssets).filter((item) => !state.skippedAssetSlots.has(item.slot));
    if (assets.length) card.append(missingAssetsBox(assets));
  }

  if (preview) {
    card.append(resultLine('预览中', `预览编号：${preview.previewId}`));
  }

  card.append(actionRow([
    actionButton('check', '应用', handleConfirm),
    actionButton('download', '保存', handleSaveWithoutPreview),
    actionButton('refresh', '继续优化', handleContinueEdit),
    actionButton('delete', '删除', handleDeleteSelected)
  ]));
  return card;
}

function renderContextPanel() {
  const context = getThemeAIContext();
  const theme = context.currentTheme || {};
  const active = context.activeVersion?.themeConfig;
  const card = panel('当前主题上下文', '只读展示当前主题、允许变量和活动版本。');
  card.append(
    keyValue('当前预设', theme.preset || '未知'),
    keyValue('模式', theme.mode || '未知'),
    keyValue('自定义变量数', String(Object.keys(theme.customVariables || {}).length)),
    keyValue('活动 AI 主题', active ? `${active.themeName || '未命名'} v${active.version || 1}` : '暂无'),
    keyValue('允许变量组', context.allowedVariables.map((item) => `${item.category}(${item.variables.length})`).join('、'))
  );
  return card;
}

function renderOptimizationHistory() {
  const active = getActiveThemeVersion();
  const versions = listThemeVersions();
  const log = listThemeOptimizationLog();
  const card = panel('修改记录', '按版本保留每次连续优化，可查看历史并回滚。');
  const current = active?.themeConfig;
  card.append(
    keyValue('当前主题', current?.themeName || '暂无'),
    keyValue('版本', current ? `v${current.version || 1}` : '暂无')
  );
  if (!versions.length && !log.length) {
    card.append(empty('还没有修改记录。'));
    return card;
  }
  versions
    .slice()
    .sort((a, b) => Number(a.themeConfig?.version || 0) - Number(b.themeConfig?.version || 0))
    .forEach((theme) => {
      const cfg = theme.themeConfig || {};
      const related = log.find((item) => item.themeId === cfg.themeId);
      const item = el('div', 'theme-studio-history-item');
      const text = el('div', 'theme-studio-theme-info');
      text.append(
        el('strong', '', `v${cfg.version || 1} ${cfg.themeName || '未命名主题'}`),
        el('small', '', related?.aiSummary || related?.userPrompt || cfg.description || (cfg.parentThemeId ? '连续优化版本' : '初始生成'))
      );
      item.append(text, miniButton('回滚', () => handleRollbackTheme(theme)));
      card.append(item);
    });
  return card;
}

function renderThemeList() {
  const versions = listThemeVersions();
  const active = getActiveThemeVersion();
  const card = panel('主题管理列表', '可应用、删除、复制或继续编辑已保存主题。');
  if (!versions.length) {
    card.append(empty('还没有保存的 AI 主题。'));
    return card;
  }

  versions.slice().reverse().forEach((theme) => {
    const config = theme.themeConfig || {};
    const id = config.themeId || '';
    const isActive = active?.themeConfig?.themeId === id;
    const item = el('div', 'theme-studio-theme-item');
    const cover = createThemeCover(theme);
    const info = el('div', 'theme-studio-theme-info');
    info.append(
      el('strong', '', config.themeName || '未命名主题'),
      el('small', '', `版本 ${config.version || 1} · ${formatDate(config.createdAt)} · ${isActive ? '当前' : '未应用'}`)
    );
    item.append(cover, info, actionRow([
      miniButton('应用', () => handleApplySaved(theme)),
      miniButton('回滚', () => handleRollbackTheme(theme)),
      miniButton('分享', () => handleShareTheme(id)),
      miniButton('删除', () => handleDeleteTheme(id)),
      miniButton('复制', () => handleCopyTheme(id)),
      miniButton('继续编辑', () => handleEditTheme(theme))
    ]));
    card.append(item);
  });
  return card;
}

async function handleGenerate() {
  const prompt = String(state.prompt || '').trim();
  if (!prompt) {
    setStatus('请先输入主题需求。');
    return;
  }
  if (state.isGenerating) return;

  try {
    state.isGenerating = true;
    render();
    setStatus('正在调用 AI 生成主题...');
    const generated = await requestThemeFromAI(prompt, state.optimizationBaseTheme);
    const result = normalizeGeneratedTheme(generated, prompt, state.optimizationBaseTheme);
    state.generatedTheme = result;
    state.editorText = JSON.stringify(result, null, 2);
    state.validation = validateAIThemeResult(result);
    if (!state.validation.ok) {
      setStatus(`AI 返回结果未通过校验：${state.validation.errors.join('、')}`);
      return;
    }
    state.isResourceBusy = true;
    render();
    const preview = await previewThemeAsync(result);
    state.previewResult = preview;
    setStatus(preview.ok ? 'AI 主题已生成并进入安全预览。' : `AI 主题无法预览：${(preview.errors || []).join('、')}`);
  } catch (error) {
    setStatus(`AI 主题生成失败：${error?.message || error}`);
  } finally {
    state.isGenerating = false;
    state.isResourceBusy = false;
    render();
  }
}

function handleValidate() {
  const parsed = parseEditorTheme();
  if (!parsed.ok) {
    state.validation = { ok: false, errors: [parsed.error], missingAssets: [] };
    setStatus(parsed.error);
    return;
  }
  state.generatedTheme = parsed.value;
  state.validation = validateAIThemeResult(parsed.value);
  setStatus(state.validation.ok ? '配置校验通过，可以预览。' : `配置校验失败：${state.validation.errors.join('、')}`);
}

async function handlePreview() {
  const parsed = parseEditorTheme();
  if (!parsed.ok) {
    state.validation = { ok: false, errors: [parsed.error], missingAssets: [] };
    setStatus(parsed.error);
    return;
  }
  state.isResourceBusy = true;
  render();
  const result = await previewThemeAsync(parsed.value);
  state.generatedTheme = parsed.value;
  state.validation = { ok: result.ok, errors: result.errors || [], missingAssets: result.missingAssets || [] };
  state.previewResult = result;
  state.isResourceBusy = false;
  setStatus(result.ok ? '已进入安全预览，正式主题尚未覆盖。' : `无法预览：${(result.errors || []).join('、')}`);
}

async function handleCancelPreview() {
  state.isResourceBusy = true;
  render();
  const result = await cancelThemePreviewAsync();
  state.previewResult = result;
  state.isResourceBusy = false;
  setStatus(result.ok ? '已取消预览，已恢复进入预览前主题。' : `取消预览失败：${(result.errors || []).join('、')}`);
}

async function handleConfirm() {
  state.isResourceBusy = true;
  render();
  const result = await confirmThemePreviewAsync();
  state.isResourceBusy = false;
  if (!result.ok) {
    setStatus(`没有可应用的预览：${(result.errors || []).join('、')}`);
    return;
  }
  state.selectedThemeId = result.theme.themeConfig.themeId;
  recordOptimizationForTheme(result.theme);
  recordPendingImportLog(result.theme);
  state.optimizationBaseTheme = result.theme;
  setStatus(`已应用并保存：${result.theme.themeConfig.themeName}`);
}

async function handleSaveWithoutPreview() {
  const parsed = parseEditorTheme();
  if (!parsed.ok) {
    setStatus(parsed.error);
    return;
  }
  state.isResourceBusy = true;
  render();
  const result = await saveThemeVersionAsync(parsed.value);
  state.isResourceBusy = false;
  state.validation = { ok: result.ok, errors: result.errors || [], missingAssets: result.missingAssets || [] };
  if (!result.ok) {
    setStatus(`保存失败：${(result.errors || []).join('、')}`);
    return;
  }
  state.selectedThemeId = result.theme.themeConfig.themeId;
  recordOptimizationForTheme(result.theme);
  recordPendingImportLog(result.theme);
  state.optimizationBaseTheme = result.theme;
  setStatus(`已保存并应用：${result.theme.themeConfig.themeName}`);
}

function handleExportActive() {
  const id = state.selectedThemeId || getActiveThemeVersion()?.themeConfig?.themeId || '';
  handleShareTheme(id);
}

async function handleShareTheme(themeId) {
  const result = await exportThemePackageAsync(themeId);
  if (!result.ok) {
    setStatus(`小包还没打好：${(result.errors || []).join('、')}`);
    return;
  }
  downloadThemePackage(result.package);
  const external = result.externalDependencies?.length ? `，还有 ${result.externalDependencies.length} 个外部素材需要朋友设备能访问` : '';
  setStatus(`已导出主题：${result.package.shareInfo.themeName}${external}`);
}

function handleImportClick() {
  const input = rootEl?.querySelector?.('.theme-studio-import-file');
  input?.click?.();
}

async function handleImportFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const result = await importThemePackageAsync(text);
    if (!result.ok) {
      setStatus(`导入失败：${(result.errors || []).join('、')}`);
      return;
    }
    state.generatedTheme = result.theme;
    state.editorText = JSON.stringify(result.theme, null, 2);
    state.validation = validateAIThemeResult(result.theme);
    state.previewResult = result.preview ? { ok: true, preview: result.preview, missingAssets: result.missingAssets || [], resourceTask: result.resourceTask } : await previewThemeAsync(result.theme);
    const preview = state.previewResult;
    state.pendingImportLog = result.optimizationLog || [];
    setStatus(preview.ok ? `已导入并预览：${result.theme.themeConfig.themeName}` : `导入主题无法预览：${(preview.errors || []).join('、')}`);
  } catch (error) {
    setStatus(`导入失败：${error?.message || error}`);
  }
}

function downloadThemePackage(pkg) {
  const name = sanitizeFileName(pkg?.shareInfo?.themeName || 'ai-phone-theme');
  const text = JSON.stringify(pkg, null, 2);
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.theme.json`;
  document.body?.append?.(link);
  link.click();
  link.remove?.();
  URL.revokeObjectURL(url);
}

function sanitizeFileName(value) {
  return String(value || 'ai-phone-theme').trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ai-phone-theme';
}

function handleContinueEdit() {
  const active = getActiveThemeVersion();
  const source = state.generatedTheme || active;
  if (!source) {
    setStatus('还没有可以继续优化的主题。');
    return;
  }
  const nextVersionNumber = Number(source.themeConfig?.version || 1) + 1;
  const next = {
    ...source,
    themeConfig: {
      ...(source.themeConfig || {}),
      themeName: `${source.themeConfig?.themeName || '未命名主题'} 优化稿`,
      parentThemeId: source.themeConfig?.themeId || '',
      version: Number.isFinite(nextVersionNumber) ? nextVersionNumber : 1
    }
  };
  delete next.themeConfig.themeId;
  state.editorText = JSON.stringify(next, null, 2);
  state.generatedTheme = next;
  state.optimizationBaseTheme = source;
  setStatus('已载入当前主题作为连续优化上下文，请输入修改需求后点击 AI 生成主题。');
  render();
}

function handleDeleteSelected() {
  const id = state.selectedThemeId || getActiveThemeVersion()?.themeConfig?.themeId || '';
  if (!id) {
    setStatus('没有选中的主题可删除。');
    return;
  }
  handleDeleteTheme(id);
}

async function handleDeleteTheme(themeId) {
  const id = String(themeId || '').trim();
  if (!id) return;
  const ok = await showConfirm('删除这个 AI 主题？删除后不会删除用户数据。');
  if (!ok) return;
  const result = await deleteThemeVersionAsync(id);
  if (!result.ok) {
    setStatus(`收进小仓库失败：${(result.errors || []).join('、')}`);
    return;
  }
  if (state.selectedThemeId === id) state.selectedThemeId = '';
  setStatus('主题已删除。');
}

function handleCopyTheme(themeId) {
  const result = copyThemeVersion(themeId, { themeName: '主题副本' });
  setStatus(result.ok ? '已复制主题。' : `复制失败：${(result.errors || []).join('、')}`);
}

function handleEditTheme(theme) {
  state.selectedThemeId = theme.themeConfig?.themeId || '';
  state.editorText = JSON.stringify(theme, null, 2);
  state.generatedTheme = theme;
  state.optimizationBaseTheme = theme;
  state.validation = validateAIThemeResult(theme);
  setStatus('已载入主题，可以继续编辑或预览。');
}

async function handleRollbackTheme(theme) {
  state.isResourceBusy = true;
  render();
  const result = await saveThemeVersionAsync(theme);
  state.isResourceBusy = false;
  if (!result.ok) {
    setStatus(`回滚失败：${(result.errors || []).join('、')}`);
    return;
  }
  state.selectedThemeId = result.theme.themeConfig.themeId;
  state.optimizationBaseTheme = result.theme;
  setStatus(`已回滚到：${result.theme.themeConfig.themeName} v${result.theme.themeConfig.version || 1}`);
}

function recordPendingImportLog(theme) {
  if (!Array.isArray(state.pendingImportLog) || !state.pendingImportLog.length) return;
  const cfg = theme?.themeConfig || {};
  state.pendingImportLog.forEach((item) => {
    recordThemeOptimization({
      themeId: cfg.themeId,
      parentThemeId: cfg.parentThemeId || item.parentThemeId || '',
      version: cfg.version || item.version || '',
      userPrompt: item.userPrompt || '导入主题记录',
      aiSummary: item.aiSummary || ''
    });
  });
  state.pendingImportLog = [];
}

function recordOptimizationForTheme(theme) {
  const cfg = theme?.themeConfig || {};
  if (!cfg.themeId || !cfg.parentThemeId) return null;
  return recordThemeOptimization({
    themeId: cfg.themeId,
    parentThemeId: cfg.parentThemeId,
    version: cfg.version || '',
    userPrompt: state.prompt || '',
    aiSummary: cfg.metadata?.aiSummary || cfg.metadata?.summary || cfg.description || ''
  });
}

async function handleApplySaved(theme) {
  state.isResourceBusy = true;
  render();
  const result = await saveThemeVersionAsync(theme);
  state.isResourceBusy = false;
  if (!result.ok) {
    setStatus(`应用失败：${(result.errors || []).join('、')}`);
    return;
  }
  state.selectedThemeId = result.theme.themeConfig.themeId;
  state.optimizationBaseTheme = result.theme;
  setStatus(`已应用：${result.theme.themeConfig.themeName}`);
}

function parseEditorTheme() {
  try {
    const value = JSON.parse(state.editorText || '{}');
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${error.message}` };
  }
}

async function requestThemeFromAI(prompt, baseTheme = null) {
  const generator = resolveThemeGenerator();
  const context = await buildAIThemeGenerationContext(baseTheme);
  if (generator) return generator({ prompt, context });

  const response = await silentRequest({
    messages: [
      { role: 'system', content: buildThemeSystemPrompt(context) },
      { role: 'user', content: buildThemeUserPrompt(prompt, context) }
    ],
    temperature: 0.45,
    maxTokens: 1800,
    timeout: 45000,
    json: true
  });

  if (!response || typeof response !== 'object') throw new Error('AI 没有返回可解析的主题 JSON，请检查 API 设置。');
  return response;
}

function resolveThemeGenerator() {
  const busGenerator = appContext.appBus?.getAPI?.('theme-ai-generator');
  if (typeof busGenerator?.generateTheme === 'function') return (payload) => busGenerator.generateTheme(payload);
  if (typeof window !== 'undefined' && typeof window.ThemeAIStudioGenerator?.generateTheme === 'function') {
    return (payload) => window.ThemeAIStudioGenerator.generateTheme(payload);
  }
  return null;
}

async function buildAIThemeGenerationContext(baseTheme = null) {
  const context = getThemeAIContext();
  const editingBase = baseTheme || state?.optimizationBaseTheme || context.activeVersion || null;
  return {
    currentTheme: context.currentTheme,
    activeVersion: context.activeVersion,
    editingBaseTheme: editingBase,
    parentThemeId: editingBase?.themeConfig?.themeId || '',
    currentDecorationParameters: editingBase?.uiDecorationParameters || {},
    usedImageSlots: editingBase?.imageSlots || {},
    recentModificationTarget: state?.prompt || '',
    allowedFields: context.whitelist.allowedSections,
    allowedVariables: context.allowedVariables,
    allowedImageSlots: context.allowedImageSlots,
    forbiddenTargets: context.whitelist.forbiddenTargets,
    availableImageResources: await readAvailableImageResources(context.allowedImageSlots),
    uiCapabilities: [
      'validateAIThemeResult',
      'previewTheme',
      'confirmThemePreview',
      'cancelThemePreview',
      'saveThemeVersion',
      'deleteThemeVersion',
      'copyThemeVersion',
      'imageSlotUrlInput',
      'imageSlotUploadInput'
    ]
  };
}

async function readAvailableImageResources(slots = []) {
  const images = appContext.images;
  if (!images || typeof images.readImageRecord !== 'function') return [];
  const result = [];
  for (const slot of slots) {
    try {
      const record = await images.readImageRecord(slot);
      const value = images.getImageFromRecord?.(record) || record?.value || '';
      result.push({ slot, label: SLOT_LABELS[slot] || slot, available: Boolean(value), value: value ? '[resource-present]' : '', opacity: record?.opacity ?? 100, isDefault: Boolean(record?.isDefault) });
    } catch (_) {
      result.push({ slot, label: SLOT_LABELS[slot] || slot, available: false, value: '', opacity: 100, isDefault: false });
    }
  }
  return result;
}

function buildThemeSystemPrompt(context) {
  return [
    '你是小手机 AI 主题工作室的主题 JSON 生成器。',
    '只能返回一个 JSON 对象，不要 Markdown，不要解释。',
    '必须遵守允许字段和变量白名单，不能修改 APP 业务逻辑、事件系统、数据结构、用户数据、API 逻辑或 CSS 文件。',
    '顶层只能包含 themeVariables、imageSlots、themeConfig、uiDecorationParameters。',
    '图片只能使用 allowedImageSlots 中的 slot。没有用户提供素材时，用 { required:true, reason:"..." } 请求素材，不要编造未知路径。',
    `允许字段：${JSON.stringify(context.allowedFields)}`,
    `允许图片槽：${JSON.stringify(context.allowedImageSlots)}`,
    `禁止范围：${JSON.stringify(context.forbiddenTargets)}`
  ].join('\n');
}

function buildThemeUserPrompt(prompt, context) {
  return JSON.stringify({
    task: '根据用户描述生成可校验的小手机主题配置',
    userPrompt: prompt,
    mode: context.editingBaseTheme ? 'optimize_existing_theme' : 'create_theme',
    instruction: context.editingBaseTheme ? '必须基于 editingBaseTheme 修改，禁止从空白主题重新生成。输出新版本，不要沿用旧 themeId。' : '生成新主题。',
    editingBaseTheme: context.editingBaseTheme,
    parentThemeId: context.parentThemeId,
    currentDecorationParameters: context.currentDecorationParameters,
    usedImageSlots: context.usedImageSlots,
    recentModificationTarget: context.recentModificationTarget,
    currentTheme: context.currentTheme,
    activeVersion: context.activeVersion,
    allowedVariables: context.allowedVariables,
    availableImageResources: context.availableImageResources,
    uiCapabilities: context.uiCapabilities,
    outputSchema: {
      themeVariables: 'object，key 必须来自 allowedVariables',
      imageSlots: 'object，key 必须来自 allowedImageSlots，缺素材时返回 required/reason',
      themeConfig: { themeName: 'string', description: 'string', metadata: { aiSummary: 'string，概括本次修改' }, parentThemeId: 'string optional', version: 'number optional' },
      uiDecorationParameters: 'object，值必须在 0 到 1'
    }
  });
}

function normalizeGeneratedTheme(generated, prompt, baseTheme = null) {
  const raw = generated?.themeConfig && (generated.themeVariables || generated.imageSlots) ? generated : (generated?.theme || generated?.themeConfig || generated);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('AI 返回内容不是主题对象。');
  const active = baseTheme || getActiveThemeVersion();
  const currentConfig = raw.themeConfig && typeof raw.themeConfig === 'object' ? raw.themeConfig : {};
  const nextVersion = Number(active?.themeConfig?.version || 0) + 1;
  return {
    ...raw,
    themeConfig: {
      ...currentConfig,
      themeName: currentConfig.themeName || inferThemeName(prompt),
      description: currentConfig.description || String(prompt || '').slice(0, 160),
      parentThemeId: active?.themeConfig?.themeId || currentConfig.parentThemeId || '',
      version: active ? nextVersion : (currentConfig.version || 1),
      metadata: { ...(currentConfig.metadata || {}), source: currentConfig.metadata?.source || 'theme-studio-ai', prompt: String(prompt || '') }
    }
  };
}

function inferThemeName(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return 'AI 主题';
  return text.length > 18 ? `${text.slice(0, 18)}主题` : `${text}主题`;
}

function createStarterTheme(prompt) {
  const text = String(prompt || '').toLowerCase();
  const pink = text.includes('粉') || text.includes('猫') || text.includes('窝');
  const dark = text.includes('夜') || text.includes('深色') || text.includes('暗');
  return {
    themeVariables: pink ? {
      accent: STARTER_THEME_TOKENS.pink.accent,
      'accent-light': STARTER_THEME_TOKENS.pink['accent-light'],
      'accent-dark': STARTER_THEME_TOKENS.pink['accent-dark'],
      ...(dark ? STARTER_THEME_TOKENS.pink.dark : STARTER_THEME_TOKENS.pink.light),
      'bubble-user-bg': STARTER_THEME_TOKENS.pink['bubble-user-bg'],
      'radius-md': '24px',
      'radius-lg': '32px',
      'shadow-card': '0 8px 24px color-mix(in srgb, var(--accent) 18%, transparent)'
    } : {
      accent: STARTER_THEME_TOKENS.mint.accent,
      'accent-light': STARTER_THEME_TOKENS.mint['accent-light'],
      'accent-dark': STARTER_THEME_TOKENS.mint['accent-dark'],
      'bg-primary': STARTER_THEME_TOKENS.mint['bg-primary'],
      'bg-secondary': STARTER_THEME_TOKENS.mint['bg-secondary'],
      'bg-card': STARTER_THEME_TOKENS.mint['bg-card'],
      'text-primary': STARTER_THEME_TOKENS.mint['text-primary'],
      'radius-md': '22px'
    },
    imageSlots: {
      app_wallpaper: { required: true, reason: '需要符合主题风格的壁纸' },
      app_widget_area_bg: { required: true, reason: '需要装饰图素材' }
    },
    themeConfig: {
      themeName: pink ? '粉色猫窝主题' : 'AI 主题草案',
      description: String(prompt || '').slice(0, 120),
      metadata: { source: 'theme-studio-ui', prompt: String(prompt || '') }
    },
    uiDecorationParameters: { decorDensity: 0.6, decorIntensity: 0.55 }
  };
}

function setStatus(text) {
  state.statusText = text;
  if (state.activityLog) state.activityLog.push({ role: 'ai', text: String(text || '') });
  showToast(text);
  render();
}

function normalizeMissingAssets(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    slot: item.slot || '',
    label: SLOT_LABELS[item.slot] || item.slot || '素材',
    reason: item.reason || '缺少主题素材'
  }));
}

function createThemeCover(theme) {
  const vars = theme?.themeVariables || {};
  const cover = el('span', 'theme-studio-theme-cover');
  cover.style.setProperty('--cover-bg', vars['bg-primary'] || vars['bg-main'] || 'var(--bg-primary)');
  cover.style.setProperty('--cover-card', vars['bg-card'] || 'var(--bg-card)');
  cover.style.setProperty('--cover-accent', vars.accent || vars['color-accent'] || 'var(--accent)');
  cover.append(el('i'), el('b'));
  return cover;
}

function panel(title, desc) {
  const card = el('section', 'theme-studio-card');
  card.append(el('h3', '', title));
  if (desc) card.append(el('p', 'theme-studio-desc', desc));
  return card;
}

function statusBox(text) {
  const node = el('div', 'theme-studio-status');
  node.textContent = text;
  return node;
}

function missingAssetsBox(items) {
  const box = el('div', 'theme-studio-assets');
  box.append(el('strong', '', '需要素材：'));
  const list = el('div', 'theme-studio-asset-list');
  items.forEach((item) => {
    const row = el('div', 'theme-studio-asset-row');
    const text = el('div', 'theme-studio-asset-text');
    text.append(el('span', '', item.label), el('small', '', item.reason));
    const urlInput = el('input', 'theme-studio-asset-url');
    urlInput.type = 'url';
    urlInput.placeholder = '粘贴图片 URL';
    const generateBtn = miniButton(state.generatingAssetSlots.has(item.slot) ? '生成中' : 'AI生成', () => handleAssetGenerate(item));
    const urlBtn = miniButton('提供URL', () => handleAssetUrl(item.slot, urlInput.value));
    const skipBtn = miniButton('跳过', () => handleAssetSkip(item.slot));
    const upload = el('input', 'theme-studio-asset-file');
    upload.type = 'file';
    upload.accept = 'image/*';
    upload.addEventListener('change', () => handleAssetUpload(item.slot, upload.files?.[0] || null));
    row.append(text, generateBtn, urlInput, urlBtn, upload, skipBtn);
    list.append(row);
  });
  box.append(list);
  return box;
}

async function handleAssetGenerate(item) {
  const slot = String(item?.slot || '').trim();
  if (!slot || state.generatingAssetSlots.has(slot)) return;
  const generator = resolveThemeImageGenerator();
  if (!generator) {
    setStatus('还没有可用的 theme-image-generator 生图接口，请提供 URL 或上传图片。');
    return;
  }
  const ok = await showConfirm(`为“${item.label || slot}”生成图片素材？`);
  if (!ok) {
    setStatus('已取消生成图片素材。');
    return;
  }

  try {
    state.generatingAssetSlots.add(slot);
    render();
    const payload = await buildImageGenerationPayload(item);
    const generated = await generator(payload);
    const resource = normalizeGeneratedImageResource(generated);
    applyImageSlotResource(slot, resource);
    const preview = await previewThemeAsync(state.generatedTheme);
    state.previewResult = preview;
    setStatus(preview.ok ? '图片素材已生成、绑定并进入预览。' : `图片素材已绑定，但预览失败：${(preview.errors || []).join('、')}`);
  } catch (error) {
    setStatus(`图片生成失败：${error?.message || error}`);
  } finally {
    state.generatingAssetSlots.delete(slot);
    render();
  }
}

function handleAssetSkip(slot) {
  const clean = String(slot || '').trim();
  if (!clean) return;
  state.skippedAssetSlots.add(clean);
  setStatus('已跳过这个素材，本次不会自动生成或绑定。');
}

function resolveThemeImageGenerator() {
  const busGenerator = appContext.appBus?.getAPI?.('theme-image-generator');
  if (typeof busGenerator?.generateImage === 'function') return (payload) => busGenerator.generateImage(payload);
  if (typeof busGenerator === 'function') return (payload) => busGenerator(payload);
  if (typeof window !== 'undefined' && typeof window.ThemeImageGenerator?.generateImage === 'function') {
    return (payload) => window.ThemeImageGenerator.generateImage(payload);
  }
  return null;
}

async function buildImageGenerationPayload(item) {
  const context = await buildAIThemeGenerationContext();
  const parsed = parseEditorTheme();
  const theme = parsed.ok ? parsed.value : state.generatedTheme;
  const colors = theme?.themeVariables || context.currentTheme?.variables || {};
  return {
    slot: item.slot,
    description: item.reason || `生成${item.label || item.slot}素材`,
    style: theme?.themeConfig?.description || state.prompt || theme?.themeConfig?.themeName || '小手机主题素材',
    themeContext: {
      themeName: theme?.themeConfig?.themeName || '',
      themeDescription: theme?.themeConfig?.description || '',
      colorVariables: pickColorVariables(colors),
      existingImageResources: context.availableImageResources,
      assetUsage: item.label || item.slot,
      allowedSlot: item.slot,
      forbiddenUsages: item.slot.startsWith('app_icon_') ? [] : ['APP图标']
    }
  };
}

function normalizeGeneratedImageResource(generated) {
  if (!generated || typeof generated !== 'object' || Array.isArray(generated)) throw new Error('生图接口没有返回资源对象。');
  const url = String(generated.url || '').trim();
  if (!url) throw new Error('生图接口没有返回图片 URL。');
  return {
    kind: url.startsWith('data:image/') ? 'dataUrl' : 'url',
    value: url,
    name: String(generated.metadata?.name || generated.name || 'AI生成素材'),
    mimeType: String(generated.mimeType || ''),
    opacity: generated.opacity ?? 100,
    metadata: { ...(generated.metadata || {}), source: 'theme-image-generator' }
  };
}

function pickColorVariables(vars = {}) {
  const keys = ['bg-primary', 'bg-secondary', 'bg-card', 'accent', 'accent-light', 'accent-dark', 'text-primary', 'text-secondary', 'bubble-user-bg', 'bubble-ai-bg'];
  const result = {};
  keys.forEach((key) => { if (vars[key]) result[key] = vars[key]; });
  return result;
}

function handleAssetUrl(slot, url) {
  const value = String(url || '').trim();
  if (!value) {
    setStatus('请先填写图片 URL。');
    return;
  }
  applyImageSlotResource(slot, { kind: 'url', value, name: SLOT_LABELS[slot] || slot, opacity: 100 });
}

async function handleAssetUpload(slot, file) {
  if (!file) return;
  try {
    const dataUrl = await compressImage(file, 1200, 0.86);
    applyImageSlotResource(slot, { kind: 'dataUrl', value: dataUrl, name: file.name || SLOT_LABELS[slot] || slot, mimeType: file.type || '', opacity: 100 });
  } catch (error) {
    setStatus(`图片处理失败：${error?.message || error}`);
  }
}

function applyImageSlotResource(slot, resource) {
  const parsed = parseEditorTheme();
  if (!parsed.ok) {
    setStatus(parsed.error);
    return;
  }
  const next = parsed.value;
  next.imageSlots = next.imageSlots && typeof next.imageSlots === 'object' && !Array.isArray(next.imageSlots) ? next.imageSlots : {};
  next.imageSlots[slot] = { slot, resource, required: false, reason: '' };
  state.skippedAssetSlots.delete(slot);
  state.generatedTheme = next;
  state.editorText = JSON.stringify(next, null, 2);
  state.validation = validateAIThemeResult(next);
  setStatus(state.validation.ok ? '素材已写入 imageSlots，可以重新预览。' : `素材未通过校验：${state.validation.errors.join('、')}`);
}

function resultLine(title, desc) {
  const node = el('div', 'theme-studio-result');
  node.append(el('strong', '', title), el('span', '', desc));
  return node;
}

function keyValue(key, value) {
  const node = el('div', 'theme-studio-kv');
  node.append(el('span', '', key), el('strong', '', value));
  return node;
}

function actionRow(buttons) {
  const row = el('div', 'theme-studio-actions');
  buttons.forEach((item) => row.append(item));
  return row;
}

function actionButton(icon, text, onClick) {
  return button('theme-studio-action', text, icon, onClick);
}

function miniButton(text, onClick) {
  const btn = el('button', 'theme-studio-mini', text);
  btn.type = 'button';
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.();
  });
  return btn;
}

function button(className, text, icon, onClick) {
  const btn = el('button', className);
  btn.type = 'button';
  if (icon) btn.append(createIcon(icon, 16));
  btn.append(el('span', '', text));
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.();
  });
  return btn;
}

function empty(text) {
  const node = el('div', 'theme-studio-empty', text);
  return node;
}

function formatDate(value) {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(value) { return String(value).padStart(2, '0'); }

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function injectStyle() {
  if (styleEl && document.head.contains(styleEl)) return;
  styleEl = document.createElement('style');
  styleEl.textContent = `
    .theme-studio{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--bg-primary);color:var(--text-primary);overflow:hidden}
    .theme-studio::before{content:'';position:absolute;inset:0;background:linear-gradient(160deg,color-mix(in srgb,var(--accent-light) 22%,transparent),transparent 45%);pointer-events:none}
    .theme-studio-nav{position:relative;z-index:1;display:flex;align-items:center;gap:12px;padding:14px 16px 8px}
    .theme-studio-nav-btn,.theme-studio-action,.theme-studio-mini{border:0;border-radius:999px;background:var(--bg-card);color:var(--text-primary);box-shadow:var(--shadow-sm);display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit}
    .theme-studio-nav-btn{width:auto;min-width:96px;padding:9px 12px}
    .theme-studio-titlebox{min-width:0}.theme-studio-titlebox .nav-title{font-weight:800;font-size:18px}.theme-studio-titlebox .nav-subtitle{font-size:12px;color:var(--text-secondary)}
    .theme-studio-content{position:relative;z-index:1;flex:1;overflow:auto;padding:8px 14px 24px}.theme-studio-narrow{display:flex;flex-direction:column;gap:14px;max-width:760px;margin:0 auto}
    .theme-studio-card{background:color-mix(in srgb,var(--bg-card) 92%,transparent);border:1px solid color-mix(in srgb,var(--border-soft) 80%,transparent);border-radius:var(--radius-lg);box-shadow:var(--shadow-card);padding:15px;display:flex;flex-direction:column;gap:10px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
    .theme-studio-card h3{margin:0;font-size:16px}.theme-studio-desc{margin:0;color:var(--text-secondary);font-size:13px}.theme-studio-textarea,.theme-studio-code{width:100%;border:1px solid var(--border-soft);border-radius:20px;background:var(--bg-card);color:var(--text-primary);font:inherit;padding:12px;outline:0;resize:vertical}.theme-studio-textarea{min-height:84px}.theme-studio-code{min-height:190px;font-family:'SFMono-Regular','Consolas',monospace;font-size:12px;line-height:1.5}
    .theme-studio-actions{display:flex;gap:8px;flex-wrap:wrap}.theme-studio-action{padding:9px 12px}.theme-studio-mini{padding:7px 10px;font-size:12px}.theme-studio-status,.theme-studio-empty,.theme-studio-assets{border-radius:18px;background:color-mix(in srgb,var(--accent-light) 30%,var(--bg-card));padding:10px 12px;color:var(--text-secondary);font-size:13px}.theme-studio-assets ul{margin:6px 0 0;padding-left:18px}
    .theme-studio-asset-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}.theme-studio-asset-row{display:grid;grid-template-columns:1fr auto minmax(120px,1fr) auto;gap:8px;align-items:center}.theme-studio-asset-text{display:flex;flex-direction:column;gap:2px}.theme-studio-asset-text small{color:var(--text-secondary);font-size:12px}.theme-studio-asset-url{min-width:0;border:1px solid var(--border-soft);border-radius:14px;background:var(--bg-card);color:var(--text-primary);padding:8px}.theme-studio-asset-file{grid-column:3 / 5;font-size:12px;color:var(--text-secondary)}
    .theme-studio-import-file{display:none}

    .theme-studio-workbench{display:flex;flex-direction:column;gap:14px;max-width:980px;margin:0 auto}
    .theme-studio-topbar{display:flex;justify-content:space-between;gap:12px;align-items:stretch;background:color-mix(in srgb,var(--bg-card) 92%,transparent);border:1px solid var(--border-soft);border-radius:var(--radius-lg);box-shadow:var(--shadow-card);padding:14px}.theme-studio-current{display:flex;flex-direction:column;gap:3px}.theme-studio-current small,.theme-studio-current span{color:var(--text-secondary);font-size:12px}.theme-studio-current strong{font-size:18px}.theme-studio-current-meta{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .theme-studio-canvas{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px}.theme-studio-side{grid-column:1 / -1;display:grid;grid-template-columns:1fr 1fr;gap:14px}.theme-studio-dock{position:sticky;bottom:0;z-index:2;background:color-mix(in srgb,var(--bg-primary) 84%,transparent);border:1px solid var(--border-soft);border-radius:var(--radius-lg);box-shadow:var(--shadow-float);padding:10px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
    .theme-studio-chatlog{display:flex;flex-direction:column;gap:8px;max-height:220px;overflow:auto}.theme-studio-bubble{display:flex;flex-direction:column;gap:3px;border-radius:var(--radius-md);padding:10px 12px;background:var(--bg-secondary);color:var(--text-primary)}.theme-studio-bubble.is-user{align-self:flex-end;background:color-mix(in srgb,var(--accent-light) 72%,var(--bg-card));max-width:86%}.theme-studio-bubble.is-ai{align-self:flex-start;max-width:92%}.theme-studio-bubble span{color:var(--text-secondary);font-size:13px}
    .theme-studio-preview-card{min-height:190px;border-radius:var(--radius-lg);padding:16px;background:linear-gradient(145deg,var(--preview-bg),var(--preview-card));color:var(--preview-text);border:1px solid color-mix(in srgb,var(--preview-accent) 38%,var(--border-soft));box-shadow:var(--shadow-card);display:flex;flex-direction:column;gap:10px;justify-content:flex-end}.theme-studio-preview-card strong{font-size:18px}.theme-studio-preview-card span{font-size:13px}.theme-studio-preview-pill{align-self:flex-start;border-radius:var(--radius-full);background:var(--preview-accent);color:var(--bg-card);padding:8px 12px;font-size:12px}.theme-studio-resource-status,.theme-studio-decoration-status{display:flex;flex-direction:column;gap:8px;border-radius:var(--radius-md);background:color-mix(in srgb,var(--bg-secondary) 58%,transparent);padding:10px}
    .theme-studio-theme-cover{width:42px;height:42px;flex:0 0 auto;border-radius:var(--radius-md);background:var(--cover-bg);border:1px solid var(--border-soft);box-shadow:var(--shadow-sm);position:relative;overflow:hidden}.theme-studio-theme-cover i,.theme-studio-theme-cover b{position:absolute;display:block;border-radius:var(--radius-full)}.theme-studio-theme-cover i{inset:8px;background:var(--cover-card)}.theme-studio-theme-cover b{width:14px;height:14px;right:7px;bottom:7px;background:var(--cover-accent)}
    @media (max-width:720px){.theme-studio-canvas,.theme-studio-side{grid-template-columns:1fr}.theme-studio-side{grid-column:auto}.theme-studio-topbar{flex-direction:column}.theme-studio-current-meta{justify-content:flex-start}}
    .theme-studio-result,.theme-studio-kv,.theme-studio-theme-item,.theme-studio-history-item{display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:18px;background:color-mix(in srgb,var(--bg-secondary) 58%,transparent);padding:10px 12px}.theme-studio-result span,.theme-studio-kv span,.theme-studio-theme-info small{color:var(--text-secondary);font-size:12px}.theme-studio-theme-info{display:flex;flex-direction:column;gap:3px;min-width:0}.theme-studio-theme-item{align-items:flex-start}.theme-studio-theme-item .theme-studio-actions{justify-content:flex-end}
  `;
  document.head.append(styleEl);
}
