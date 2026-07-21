// apps/theme-center.js
// 小手机主题中心：用 theme-ai-agent 管理全部 AI 主题资产，不直接读写主题存储。

import {
  listThemeVersions,
  getActiveThemeVersion,
  saveThemeVersionAsync,
  copyThemeVersion,
  deleteThemeVersionAsync,
  exportThemePackage,
  exportThemePackageAsync,
  importThemePackageAsync,
  previewThemeAsync,
  confirmThemePreviewAsync,
  cancelThemePreview,
  cancelThemePreviewAsync,
  getThemePreviewState,
  listThemeOptimizationLog
} from '../core/theme-ai-agent.js';
import { getData, setData } from '../core/storage.js';
import { showToast, showConfirm, showBottomSheet, hideBottomSheet } from '../core/ui.js';

export const THEME_CENTER_FAVORITES_KEY = 'theme_center_favorites';

let rootEl = null;
let appContext = {};
let state = null;
let styleEl = null;

export async function mount(containerEl, context = {}) {
  rootEl = containerEl;
  appContext = context || {};
  state = { selectedLogThemeId: '', statusText: '挑一个小世界，给小手机换一口甜甜的空气。', lastImportName: '' };
  injectStyle();
  render();
}

export function unmount() {
  if (getThemePreviewState()) cancelThemePreview();
  rootEl?.replaceChildren?.();
  rootEl = null;
  appContext = {};
  state = null;
}

function render() {
  if (!rootEl || !state) return;
  rootEl.classList.add('theme-center-root');
  const screen = el('section', 'theme-center app-screen');
  screen.dataset.imageKey = 'app_bg_settings';
  screen.append(renderTopRoom(), renderBody());
  rootEl.replaceChildren(screen);
}

function renderTopRoom() {
  const active = getActiveThemeVersion();
  const nav = el('div', 'theme-center-nav nav-bar');
  const back = button('theme-center-back', '回到桌面', 'back', () => appContext.closeApp?.());
  const title = el('div', 'theme-center-title');
  title.append(el('div', 'nav-title', '主题中心'), el('div', 'nav-subtitle', active ? `现在住在：${active.themeConfig?.themeName || '未命名小世界'}` : '给小手机收纳每一个小世界'));
  nav.append(back, title);
  return nav;
}

function renderBody() {
  const wrap = el('div', 'theme-center-content content-area');
  const room = el('div', 'theme-center-room content-narrow');
  room.append(renderHero(), renderPreviewNotice(), renderSections());
  wrap.append(room);
  return wrap;
}

function renderHero() {
  const active = getActiveThemeVersion();
  const versions = listThemeVersions();
  const hero = el('section', 'theme-center-hero');
  const text = el('div', 'theme-center-hero-text');
  text.append(
    el('small', '', '我的小世界'),
    el('h2', '', active?.themeConfig?.themeName || '还在等第一个小世界'),
    el('p', '', versions.length ? `这里藏着 ${versions.length} 个小世界，可以慢慢试穿、分享和收纳。` : '还没有保存过主题，可以先在聊天里告诉 TA 想做什么风格。')
  );
  hero.append(text, actionRow([
    actionButton('去聊天里做主题', 'chat', () => appContext.openApp?.('chat')),
    actionButton('导入主题小包', 'upload', handleImportClick)
  ]));
  const file = el('input', 'theme-center-import-file');
  file.type = 'file';
  file.accept = 'application/json,.json,.theme.json';
  file.addEventListener('change', () => handleImportFile(file.files?.[0] || null));
  hero.append(file);
  return hero;
}

function renderPreviewNotice() {
  const preview = getThemePreviewState();
  if (!preview) return el('span', 'theme-center-none');
  const box = el('section', 'theme-center-preview-note');
  box.append(
    el('strong', '', '有一个小世界正在门口试穿'),
    el('span', '', '确认后才会真的换上；不喜欢也可以轻轻放回去。'),
    actionRow([
      actionButton('换上这个小世界', 'check', handleConfirmPreview),
      actionButton('先放回去', 'close', handleCancelPreview)
    ])
  );
  return box;
}

function renderSections() {
  const versions = listThemeVersions();
  const active = getActiveThemeVersion();
  const favoriteIds = listFavoriteThemeIds();
  const favorite = versions.filter((theme) => isThemeFavorite(theme.themeConfig?.themeId, favoriteIds));
  const madeByAI = versions.filter((theme) => theme.themeConfig?.metadata?.source || theme.themeConfig?.parentThemeId || theme.imageSlots || theme.uiDecorationParameters);
  const grid = el('div', 'theme-center-sections');
  grid.append(
    themeShelf('当前使用', active ? [active] : [], '小手机现在正穿着它。'),
    themeShelf('收藏主题', favorite, favorite.length ? '被轻轻标记过喜欢的小世界。' : '还没有特别偏爱的小世界。'),
    themeShelf('AI 创造的主题', madeByAI.length ? madeByAI : versions, versions.length ? '和 AI 一起捏出来的外观房间。' : '去聊天里描述想要的风格，保存后会住到这里。'),
    importShelf()
  );
  return grid;
}

function themeShelf(title, themes, emptyText) {
  const shelf = el('section', 'theme-center-card');
  shelf.append(el('h3', '', title), el('p', 'theme-center-soft', emptyText));
  if (!themes.length) {
    shelf.append(emptyNest('这里还空着，等一个小世界住进来。'));
    return shelf;
  }
  const list = el('div', 'theme-center-theme-list');
  themes.forEach((theme) => list.append(themeCard(theme)));
  shelf.append(list);
  return shelf;
}

function importShelf() {
  const shelf = el('section', 'theme-center-card theme-center-import');
  shelf.append(
    el('h3', '', '导入主题'),
    el('p', 'theme-center-soft', state.lastImportName ? `刚刚带回了：${state.lastImportName}` : '把朋友分享的 .theme.json 小包带回家。'),
    actionRow([actionButton('挑选主题小包', 'upload', handleImportClick)])
  );
  return shelf;
}

function themeCard(theme) {
  const cfg = theme.themeConfig || {};
  const active = getActiveThemeVersion();
  const isActive = active?.themeConfig?.themeId === cfg.themeId;
  const card = el('article', `theme-center-theme ${isActive ? 'is-active' : ''}`);
  const cover = createCover(theme);
  const body = el('div', 'theme-center-theme-body');
  body.append(
    el('strong', '', cfg.themeName || '未命名小世界'),
    el('span', '', `${formatDate(cfg.createdAt)} · v${cfg.version || 1}`),
    el('small', '', cfg.parentThemeId ? `从 ${shortId(cfg.parentThemeId)} 长出来` : '第一颗小种子')
  );
  card.append(cover, body, actionRow([
    miniButton('换上它', () => handleWearTheme(theme)),
    miniButton('编辑信息', () => handleEditThemeInfo(theme)),
    miniButton(isThemeFavorite(cfg.themeId) ? '取消珍藏' : '放进珍藏', () => handleToggleFavorite(cfg.themeId)),
    miniButton('查看成长记录', () => toggleLog(cfg.themeId)),
    miniButton('分享', () => handleShareTheme(cfg.themeId)),
    miniButton('捏个分身', () => handleCopyTheme(cfg.themeId)),
    miniButton('收进小仓库', () => handleTuckAway(cfg.themeId))
  ]));
  if (state.selectedLogThemeId === cfg.themeId) card.append(renderGrowthLog(theme));
  return card;
}

function renderGrowthLog(theme) {
  const cfg = theme.themeConfig || {};
  const logs = listThemeOptimizationLog(cfg.themeId);
  const box = el('div', 'theme-center-log');
  box.append(el('strong', '', '成长记录'));
  if (!logs.length) {
    box.append(el('span', '', '它还没有留下打磨记录。'));
    return box;
  }
  logs.forEach((item) => box.append(el('span', '', `${formatDate(item.createdAt)} · ${item.aiSummary || item.userPrompt || '轻轻调整了一次'}`)));
  return box;
}

function createCover(theme) {
  const vars = theme?.themeVariables || {};
  const cover = el('span', 'theme-center-cover');
  cover.style.setProperty('--room-bg', vars['bg-primary'] || vars['bg-main'] || 'var(--bg-primary)');
  cover.style.setProperty('--room-card', vars['bg-card'] || 'var(--bg-card)');
  cover.style.setProperty('--room-accent', vars.accent || vars['color-accent'] || 'var(--accent)');
  cover.append(el('i'), el('b'), el('em'));
  return cover;
}

export function listFavoriteThemeIds() {
  const value = getData(THEME_CENTER_FAVORITES_KEY, []);
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))] : [];
}

export function isThemeFavorite(themeId, ids = listFavoriteThemeIds()) {
  const clean = String(themeId || '').trim();
  return Boolean(clean && ids.includes(clean));
}

export function setThemeFavorite(themeId, favorite) {
  const clean = String(themeId || '').trim();
  if (!clean) return listFavoriteThemeIds();
  const ids = listFavoriteThemeIds();
  const next = favorite ? [...new Set(ids.concat(clean))] : ids.filter((id) => id !== clean);
  setData(THEME_CENTER_FAVORITES_KEY, next);
  return next;
}

function handleToggleFavorite(themeId) {
  const nextFavorite = !isThemeFavorite(themeId);
  setThemeFavorite(themeId, nextFavorite);
  setStatus(nextFavorite ? '已经放进珍藏小格子。' : '已经从珍藏小格子取出来。');
}

async function handleWearTheme(theme) {
  const result = await saveThemeVersionAsync(theme);
  setStatus(result.ok ? `已经换上：${result.theme.themeConfig.themeName}` : `还没换好：${(result.errors || []).join('、')}`);
}


function askThemeInfo(cfg = {}) {
  return new Promise((resolve) => {
    const panel = el('div', 'theme-center-edit-sheet');
    panel.append(el('h3', '', '整理小世界名片'));
    panel.append(el('p', 'theme-center-soft', '给它补上名字和一句轻轻的介绍，不会打断小手机的页面。'));

    const nameInput = el('input', 'theme-center-input');
    nameInput.type = 'text';
    nameInput.value = cfg.themeName || '未命名小世界';
    nameInput.placeholder = '小世界名字';

    const descInput = el('textarea', 'theme-center-textarea');
    descInput.value = cfg.description || '';
    descInput.placeholder = '一句小介绍';

    panel.append(fieldWrap('名字', nameInput), fieldWrap('介绍', descInput));
    const actions = actionRow([
      actionButton('收好名片', 'check', () => {
        const value = {
          themeName: String(nameInput.value || '').trim() || cfg.themeName || '未命名小世界',
          description: String(descInput.value || '').trim()
        };
        hideBottomSheet();
        resolve(value);
      }),
      actionButton('先不改', 'close', () => {
        hideBottomSheet();
        resolve(null);
      })
    ]);
    panel.append(actions);
    showBottomSheet(panel);
    window.setTimeout(() => nameInput.focus?.(), 0);
  });
}

function fieldWrap(label, input) {
  const wrap = el('label', 'theme-center-field');
  wrap.append(el('span', '', label), input);
  return wrap;
}

async function handleEditThemeInfo(theme) {
  const cfg = theme?.themeConfig || {};
  const nextInfo = await askThemeInfo(cfg);
  if (!nextInfo) return;
  const result = await saveThemeVersionAsync({
    ...theme,
    themeConfig: {
      ...cfg,
      themeName: nextInfo.themeName,
      description: nextInfo.description
    }
  });
  setStatus(result.ok ? '小世界信息已经收好。' : `这次还没写好：${(result.errors || []).join('、')}`);
}

function toggleLog(themeId) {
  state.selectedLogThemeId = state.selectedLogThemeId === themeId ? '' : themeId;
  render();
}

async function handleShareTheme(themeId) {
  const result = await exportThemePackageAsync(themeId);
  if (!result.ok) {
    setStatus(`小包还没打好：${(result.errors || []).join('、')}`);
    return;
  }
  downloadThemePackage(result.package);
  const external = result.externalDependencies?.length ? `，还有 ${result.externalDependencies.length} 个外部素材需要朋友设备能访问` : '';
  setStatus(`已经打包好：${result.package.shareInfo.themeName}${external}`);
}

function handleCopyTheme(themeId) {
  const result = copyThemeVersion(themeId, { themeName: '小世界分身' });
  setStatus(result.ok ? '已经捏出一个分身。' : `分身没有成功：${(result.errors || []).join('、')}`);
}

async function handleTuckAway(themeId) {
  const ok = await showConfirm('把这个小世界收进小仓库吗？');
  if (!ok) return;
  const result = await deleteThemeVersionAsync(themeId);
  if (!result.ok) {
    setStatus(`小仓库没有收好：${(result.errors || []).join('、')}`);
    return;
  }
  if (state.selectedLogThemeId === themeId) state.selectedLogThemeId = '';
  setStatus('已经轻轻收进小仓库。');
}

function handleImportClick() {
  rootEl?.querySelector?.('.theme-center-import-file')?.click?.();
}

async function handleImportFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const result = await importThemePackageAsync(text);
    if (!result.ok) {
      setStatus(`这个小包还不能住进来：${(result.errors || []).join('、')}`);
      return;
    }
    state.lastImportName = result.theme.themeConfig?.themeName || file.name || '新小世界';
    const missing = result.missingAssets?.length ? `，还缺 ${result.missingAssets.length} 个素材` : '';
    setStatus(`小世界已在门口试穿${missing}。`);
  } catch (error) {
    setStatus(`小包打开失败：${error?.message || error}`);
  }
}

async function handleConfirmPreview() {
  const result = await confirmThemePreviewAsync();
  setStatus(result.ok ? `已经换上：${result.theme.themeConfig.themeName}` : `还不能换上：${(result.errors || []).join('、')}`);
}

async function handleCancelPreview() {
  const result = await cancelThemePreviewAsync();
  setStatus(result.ok ? '已经放回原来的小世界。' : `暂时放不回去：${(result.errors || []).join('、')}`);
}

function downloadThemePackage(pkg) {
  if (typeof document === 'undefined') return;
  const name = sanitizeFileName(pkg?.shareInfo?.themeName || 'phone-theme');
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.theme.json`;
  document.body?.append?.(link);
  link.click();
  link.remove?.();
  URL.revokeObjectURL(url);
}

function setStatus(text) {
  state.statusText = String(text || '');
  showToast(state.statusText);
  render();
}

function actionRow(buttons) {
  const row = el('div', 'theme-center-actions');
  row.append(...buttons);
  return row;
}

function actionButton(text, icon, onClick) {
  const btn = button('theme-center-action', text, icon, onClick);
  return btn;
}

function miniButton(text, onClick) {
  const btn = el('button', 'theme-center-mini', text);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

function button(className, text, icon, onClick) {
  const btn = el('button', className);
  btn.type = 'button';
  const iconNode = appContext.createIcon?.(icon, 16);
  if (iconNode) btn.append(iconNode);
  btn.append(document.createTextNode(text));
  btn.addEventListener('click', onClick);
  return btn;
}

function emptyNest(text) {
  return el('div', 'theme-center-empty', text);
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '刚刚';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function shortId(value) {
  const text = String(value || '');
  return text ? text.slice(0, 8) : '最初';
}

function sanitizeFileName(value) {
  return String(value || 'phone-theme').trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'phone-theme';
}

function pad2(value) { return String(value).padStart(2, '0'); }

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function injectStyle() {
  if (styleEl || typeof document === 'undefined') return;
  styleEl = document.createElement('style');
  styleEl.id = 'theme-center-style';
  styleEl.textContent = `
    .theme-center{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-primary);color:var(--text-primary)}
    .theme-center::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at top left,color-mix(in srgb,var(--accent-light) 36%,transparent),transparent 42%);pointer-events:none}.theme-center-nav{position:relative;z-index:1;display:flex;align-items:center;gap:var(--spacing-sm);padding:14px 16px 8px}.theme-center-back,.theme-center-action,.theme-center-mini{border:1px solid color-mix(in srgb,var(--border-soft) 68%,transparent);border-radius:var(--radius-full);background:color-mix(in srgb,var(--surface-paper) 88%,var(--accent-light));color:var(--text-primary);box-shadow:var(--shadow-sm),var(--inner-highlight);font:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px}.theme-center-back{min-width:92px;padding:9px 12px}.theme-center-title{min-width:0}.theme-center-title .nav-title{font-weight:800}.theme-center-title .nav-subtitle{font-size:12px;color:var(--text-secondary)}
    .theme-center-content{position:relative;z-index:1;flex:1;overflow:auto;padding:8px 14px 24px}.theme-center-room{max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:14px}.theme-center-hero,.theme-center-card,.theme-center-preview-note{border:1px solid color-mix(in srgb,var(--border-soft) 72%,transparent);border-radius:var(--radius-lg);background:linear-gradient(145deg,color-mix(in srgb,var(--bg-card) 94%,transparent),color-mix(in srgb,var(--accent-light) 18%,var(--bg-card)));box-shadow:var(--shadow-card),var(--inner-highlight);padding:16px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}.theme-center-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--spacing-md)}.theme-center-hero h2{margin:4px 0;font-size:24px}.theme-center-hero p,.theme-center-soft,.theme-center-theme span,.theme-center-theme small,.theme-center-preview-note span{color:var(--text-secondary);font-size:13px}.theme-center-hero small{color:var(--accent-dark);font-weight:700}.theme-center-actions{display:flex;gap:8px;flex-wrap:wrap}.theme-center-action{padding:10px 13px}.theme-center-mini{padding:7px 10px;font-size:12px}.theme-center-import-file,.theme-center-none{display:none}
    .theme-center-preview-note{display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-sm)}.theme-center-sections{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.theme-center-card{display:flex;flex-direction:column;gap:10px}.theme-center-card h3{margin:0;font-size:17px}.theme-center-soft{margin:0}.theme-center-theme-list{display:flex;flex-direction:column;gap:10px}.theme-center-theme{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;border-radius:var(--radius-md);background:color-mix(in srgb,var(--surface-muted) 68%,var(--bg-card));border:1px solid color-mix(in srgb,var(--border-soft) 58%,transparent);box-shadow:inset 0 1px 0 color-mix(in srgb,white 70%,transparent);padding:10px}.theme-center-theme.is-active{outline:2px solid color-mix(in srgb,var(--accent) 44%,transparent)}.theme-center-theme-body{display:flex;flex-direction:column;gap:3px;min-width:0}.theme-center-theme .theme-center-actions{grid-column:1 / -1}.theme-center-cover{width:58px;height:58px;border-radius:var(--radius-md);background:linear-gradient(145deg,var(--room-bg),var(--room-card));border:1px solid color-mix(in srgb,var(--border-soft) 72%,transparent);box-shadow:var(--shadow-sm),var(--inner-highlight);position:relative;overflow:hidden}.theme-center-cover i,.theme-center-cover b,.theme-center-cover em{position:absolute;display:block;border-radius:var(--radius-full)}.theme-center-cover i{inset:11px;background:var(--room-card)}.theme-center-cover b{width:18px;height:18px;right:8px;bottom:8px;background:var(--room-accent)}.theme-center-cover em{width:9px;height:9px;left:10px;top:10px;background:color-mix(in srgb,var(--room-accent) 48%,var(--bg-card))}
    .theme-center-edit-sheet{display:flex;flex-direction:column;gap:12px}.theme-center-edit-sheet h3{margin:0;color:var(--text-primary)}.theme-center-field{display:flex;flex-direction:column;gap:6px;color:var(--text-secondary);font-size:13px}.theme-center-input,.theme-center-textarea{width:100%;border-radius:var(--radius-md);background:var(--surface-muted);color:var(--text-primary);padding:11px 13px;font:inherit}.theme-center-textarea{min-height:96px;resize:none;line-height:1.55}.theme-center-empty,.theme-center-log{border-radius:var(--radius-md);background:color-mix(in srgb,var(--accent-light) 28%,var(--bg-card));padding:11px;color:var(--text-secondary);font-size:13px}.theme-center-log{grid-column:1 / -1;display:flex;flex-direction:column;gap:5px;color:var(--text-primary)}.theme-center-log span{color:var(--text-secondary)}
    @media (max-width:720px){.theme-center-hero,.theme-center-preview-note{align-items:flex-start;flex-direction:column}.theme-center-sections{grid-template-columns:1fr}}
  `;
  document.head.append(styleEl);
}
