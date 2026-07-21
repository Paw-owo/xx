// imports:
//   from './storage.js': getData, setData

import { getData, setData } from './storage.js';

const THEME_KEY = 'app_theme';
const PRESET_KEY = 'app_theme_preset';
const MODE_KEY = 'app_theme_mode';

const DEFAULT_PRESET = 'cream-bell';
const DEFAULT_MODE = 'light';

const FONT_FALLBACK = "'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ═══════════════════════════════════════
// 【基础变量】默认值（椰乳四季春）
// ═══════════════════════════════════════

const BASE_VARIABLES = {
  'bg-main': '#FFF4F7',
  'bg-light': '#F8E7EC',
  'bg-primary': '#FFF4F7',
  'bg-secondary': '#F8E7EC',
  'bg-card': '#FFF9FA',
  'surface': 'var(--bg-card)',
  'surface-soft': 'color-mix(in srgb, var(--bg-card) 88%, transparent)',
  'surface-glass': 'color-mix(in srgb, var(--bg-primary) 86%, transparent)',
  'surface-muted': '#F7E6EA',
  'surface-paper': '#FFF8F5',
  'surface-charm': '#F9DCE5',
  'bg-overlay': 'color-mix(in srgb, var(--text-primary) 26%, transparent)',
  'accent': '#D889A2',
  'accent-light': '#F6C8D6',
  'accent-dark': '#A65D75',
  'accent-strong': '#C9748E',
  'color-accent': '#D889A2',
  'text-primary': '#4E3A3B',
  'text-secondary': '#80686A',
  'text-hint': '#B69DA0',
  'text-soft': 'color-mix(in srgb, var(--text-primary) 68%, var(--text-secondary))',
  'color-text': 'var(--text-primary)',
  'color-success': '#8EAD98',
  'color-danger': '#C77B82',
  'color-warning': '#D8A25E',
  'border-soft': '#EBC8D1',
  'border-charm': 'color-mix(in srgb, var(--accent-dark) 22%, var(--bg-card))',
  'icon-color': 'var(--icon-line-stable)',
  'icon-tile-bg': 'transparent',
  'icon-paper-stable': '#FFF6EF',
  'icon-body-stable': '#E8C9B8',
  'icon-line-stable': '#7A5A56',
  'icon-highlight-stable': '#FFFDF8',
  'icon-shadow-stable': '#D9B7A7',
  'icon-charm-theme': '#E6A0B5',
  'icon-charm-theme-2': '#F1C972',
  'icon-detail': 'var(--icon-line-stable)',
  'icon-layer-stable': 'var(--icon-paper-stable)',
  'icon-tile-alt-cool': 'transparent',
  'icon-tile-alt-warm': 'transparent',
  'decor-blue': '#C7DAE8',
  'decor-yellow': '#F1D58B',
  'decor-pink': '#F0BACB',
  'decor-green': '#C8DDBF',
  'decor-lilac': '#D8CBE8',
  'decor-cream': 'var(--bg-card)',
  'media-ink': 'color-mix(in srgb, var(--text-primary) 76%, var(--bg-primary))',
  'media-ink-deep': 'color-mix(in srgb, var(--text-primary) 88%, var(--bg-primary))',
  'media-on-dark': 'var(--bg-card)',
  'media-highlight': 'color-mix(in srgb, var(--decor-yellow) 72%, var(--bg-card))',
  'media-overlay-soft': 'color-mix(in srgb, var(--text-primary) 18%, transparent)',
  'media-overlay': 'color-mix(in srgb, var(--text-primary) 36%, transparent)',
  'bubble-user-bg': '#F6D4DE',
  'bubble-user-text': '#4E3A3B',
  'bubble-ai-bg': 'var(--surface-paper)',
  'bubble-ai-text': 'var(--text-primary)',
  'bubble-radius': '24px',
  'bubble-radius-tail': '10px',
  'button-primary-bg': 'linear-gradient(180deg, var(--accent-light), var(--accent))',
  'button-primary-text': 'var(--bubble-user-text)',
  'button-soft-bg': 'color-mix(in srgb, var(--surface-paper) 86%, var(--accent-light))',
  'badge-bg': 'var(--accent-strong)',
  'badge-text': 'var(--bubble-user-text)',
  'decoration-spot': 'var(--accent-dark)',
  'illustration-line': 'var(--icon-detail)',
  'illustration-fill': 'var(--surface-paper)',
  'illustration-accent': 'var(--accent-light)',
  'font-main': FONT_FALLBACK,
  'font-size-base': '15px',
  'font-size-small': '13px',
  'font-size-title': '17px',
  'spacing-xs': '4px',
  'spacing-sm': '8px',
  'spacing-md': '16px',
  'spacing-lg': '24px',
  'radius-sm': '15px',
  'radius-md': '22px',
  'radius-lg': '30px',
  'radius-xl': '38px',
  'radius-full': '999px',
  'shadow-sm': '0 4px 12px color-mix(in srgb, var(--shadow-color, var(--text-primary)) 8%, transparent)',
  'shadow-md': '0 9px 24px color-mix(in srgb, var(--shadow-color, var(--text-primary)) 10%, transparent)',
  'shadow-lg': '0 16px 38px color-mix(in srgb, var(--shadow-color, var(--text-primary)) 12%, transparent)',
  'shadow-card': '0 7px 18px color-mix(in srgb, var(--shadow-color, var(--text-primary)) 9%, transparent)',
  'shadow-float': '0 14px 34px color-mix(in srgb, var(--shadow-color, var(--text-primary)) 13%, transparent)',
  'shadow-color': '#8A5A68',
  'shadow-neu-out': 'var(--shadow-sm)',
  'shadow-neu-in': 'inset 0 0 0 1px color-mix(in srgb, var(--border-soft) 70%, transparent)',
  'inner-highlight': 'inset 0 1px 0 color-mix(in srgb, var(--icon-highlight-stable) 76%, transparent)',
  'toy-border': '1px solid color-mix(in srgb, var(--border-soft) 76%, transparent)',
  'motion': 'all 240ms cubic-bezier(.2,.8,.2,1)',
  'press-scale': '0.97',
  'chat-icon-line': 'var(--icon-detail)',
  'chat-icon-paper': 'var(--surface-paper)',
  'chat-icon-fill': 'var(--accent-light)',
  'chat-icon-dot': 'var(--accent-dark)',
  'chat-fold-card-bg': 'var(--surface-paper)',
  'chat-fold-card-open-bg': 'color-mix(in srgb, var(--accent-light) 54%, var(--bg-card))',
  'chat-fold-detail-bg': 'color-mix(in srgb, var(--bg-card) 76%, var(--surface-muted))',
  'chat-fold-line': 'var(--accent-strong)',
  'chat-fold-summary-color': 'var(--text-secondary)',
  'chat-fold-title-color': 'var(--text-primary)',
  'chat-fold-code-color': 'var(--text-secondary)',
  'chat-fold-divider': 'color-mix(in srgb, var(--accent-light) 72%, transparent)',
  'chat-tool-breath-shadow': 'var(--shadow-sm)',
  'chat-tool-breath-shadow-strong': 'var(--shadow-md)'
};

// ═══════════════════════════════════════
// 【阴影常量】日间 / 夜间
// ═══════════════════════════════════════

const LIGHT_SHADOWS = {
  'shadow-sm': '0 4px 12px color-mix(in srgb, var(--shadow-color, var(--text-primary)) 8%, transparent)',
  'shadow-md': '0 9px 24px color-mix(in srgb, var(--shadow-color, var(--text-primary)) 10%, transparent)',
  'shadow-lg': '0 16px 38px color-mix(in srgb, var(--shadow-color, var(--text-primary)) 12%, transparent)',
  'shadow-card': '0 7px 18px color-mix(in srgb, var(--shadow-color, var(--text-primary)) 9%, transparent)',
  'shadow-float': '0 14px 34px color-mix(in srgb, var(--shadow-color, var(--text-primary)) 13%, transparent)',
  'inner-highlight': 'inset 0 1px 0 color-mix(in srgb, var(--icon-highlight-stable) 76%, transparent)'
};

const DARK_SHADOWS = {
  'shadow-sm': '0 5px 16px color-mix(in srgb, #120E10 28%, transparent), 0 1px 0 color-mix(in srgb, #FFF7EF 5%, transparent)',
  'shadow-md': '0 12px 30px color-mix(in srgb, #120E10 34%, transparent), 0 1px 0 color-mix(in srgb, #FFF7EF 6%, transparent)',
  'shadow-lg': '0 22px 48px color-mix(in srgb, #120E10 42%, transparent), 0 1px 0 color-mix(in srgb, #FFF7EF 7%, transparent)',
  'shadow-card': '0 10px 24px color-mix(in srgb, #120E10 30%, transparent), inset 0 1px 0 color-mix(in srgb, #FFF7EF 6%, transparent)',
  'shadow-float': '0 20px 46px color-mix(in srgb, #120E10 40%, transparent), 0 0 0 1px color-mix(in srgb, #FFF7EF 6%, transparent)',
  'inner-highlight': 'inset 0 1px 0 color-mix(in srgb, #FFF7EF 9%, transparent)'
};

// ═══════════════════════════════════════
// 【主题预设】3 浅色 + 3 夜间
// ═══════════════════════════════════════

const PRESETS = {
  'cream-bell': createPreset('cream-bell', '奶粉糖霜', 'light', {
    background: '#FFF4F7', secondary: '#F8E7EC', card: '#FFF9FA', paper: '#FFF8F5', charm: '#F9DCE5',
    accent: '#D889A2', accentSoft: '#F6C8D6', accentDeep: '#A65D75', accentStrong: '#C9748E', accent2: '#F0C56F',
    text: '#4E3A3B', textSoft: '#80686A', hint: '#B69DA0', border: '#EBC8D1', shadow: '#8A5A68',
    success: '#8EAD98', danger: '#C77B82', blue: '#C7DAE8', yellow: '#F1D58B', pink: '#F0BACB', green: '#C8DDBF', lilac: '#D8CBE8',
    userBubble: '#F6D4DE', userText: '#4E3A3B'
  }),
  'cloud-soda': createPreset('cloud-soda', '奶蓝云朵', 'light', {
    background: '#F2F8FB', secondary: '#E2EEF5', card: '#FBFCF8', paper: '#FFF8F1', charm: '#DDEDF6',
    accent: '#8AB8D0', accentSoft: '#CFE7F3', accentDeep: '#5D8294', accentStrong: '#77A8C2', accent2: '#EACB78',
    text: '#3F4A4E', textSoft: '#6C7D84', hint: '#9EADB3', border: '#CDE0EA', shadow: '#54768A',
    success: '#8EAA9B', danger: '#C48186', blue: '#BFDCEA', yellow: '#EED58B', pink: '#EEC4CF', green: '#C9DDC6', lilac: '#D5CEE8',
    userBubble: '#D5EBF5', userText: '#3F4A4E'
  }),
  'peach-pudding': createPreset('peach-pudding', '奶黄布丁', 'light', {
    background: '#FFF8E7', secondary: '#F5E8C9', card: '#FFFDF5', paper: '#FFF8EA', charm: '#FCE7B5',
    accent: '#D8A75F', accentSoft: '#F5DCA2', accentDeep: '#8C6740', accentStrong: '#C6904C', accent2: '#E79BAE',
    text: '#514337', textSoft: '#806B56', hint: '#B29E84', border: '#E8D2A6', shadow: '#8A6A3D',
    success: '#91AA83', danger: '#C9827A', blue: '#C8DDE8', yellow: '#F2D784', pink: '#F1C6C3', green: '#D1DDBA', lilac: '#D9CBE2',
    userBubble: '#F7E0AB', userText: '#514337'
  }),
  'cocoa-night': createPreset('cocoa-night', '黑红莓夜', 'dark', {
    background: '#211719', secondary: '#2B1E21', card: '#35272A', paper: '#403033', charm: '#4D3036',
    accent: '#B85D6B', accentSoft: '#5B343A', accentDeep: '#E6B2B9', accentStrong: '#C97783', accent2: '#D6A15C',
    text: '#EFE3D8', textSoft: '#C8B0A8', hint: '#927B76', border: '#5A4043', shadow: '#160D0F',
    success: '#9CB396', danger: '#D18E8E', blue: '#8FA9B3', yellow: '#CEB57B', pink: '#D193A0', green: '#A0B598', lilac: '#BBA9CA',
    userBubble: '#53343A', userText: '#F0E4DA'
  }),
  'teddy-nest': createPreset('teddy-nest', '奶棕暖窝', 'dark', {
    background: '#332822', secondary: '#40322A', card: '#4B3B32', paper: '#554338', charm: '#634E40',
    accent: '#C89665', accentSoft: '#6A5140', accentDeep: '#F0D0AE', accentStrong: '#D6A676', accent2: '#D8B875',
    text: '#F1E2D2', textSoft: '#CEB4A0', hint: '#9B8373', border: '#685145', shadow: '#1F1713',
    success: '#A5B497', danger: '#D09285', blue: '#91ABB0', yellow: '#D5B878', pink: '#D4A0A1', green: '#A7B897', lilac: '#B6A4C4',
    userBubble: '#654D3E', userText: '#F1E2D2'
  }),
  'blueberry-moon': createPreset('blueberry-moon', '黑粉莓月', 'dark', {
    background: '#211B26', secondary: '#2B2331', card: '#362C3D', paper: '#40354A', charm: '#513B52',
    accent: '#D08BAD', accentSoft: '#5C4058', accentDeep: '#EBC1D6', accentStrong: '#DA9AB9', accent2: '#D6B76F',
    text: '#F0E5EC', textSoft: '#C9B5C3', hint: '#948092', border: '#5D485E', shadow: '#17101B',
    success: '#9BAF98', danger: '#CF8C99', blue: '#8FAEC0', yellow: '#CCB57C', pink: '#D7A0BA', green: '#9FB59A', lilac: '#BBA7D0',
    userBubble: '#5B4058', userText: '#F0E5EC'
  })
};

function createPreset(id, name, mode, palette) {
  const dark = mode === 'dark';
  return {
    id,
    name,
    mode,
    variables: {
      'bg-main': palette.background,
      'bg-light': palette.secondary,
      'bg-card': palette.card,
      'color-accent': palette.accent,
      'color-text': palette.text,
      'color-success': palette.success,
      'color-danger': palette.danger,
      'bg-primary': palette.background,
      'bg-secondary': palette.secondary,
      'bg-overlay': `color-mix(in srgb, var(--text-primary) ${dark ? '42%' : '30%'}, transparent)`,
      'surface': palette.card,
      'surface-soft': 'color-mix(in srgb, var(--bg-card) 88%, transparent)',
      'surface-glass': `color-mix(in srgb, var(--bg-primary) ${dark ? '78%' : '86%'}, transparent)`,
      'surface-muted': `color-mix(in srgb, var(--bg-card) ${dark ? '76%' : '84%'}, var(--bg-secondary))`,
      'surface-paper': palette.paper,
      'surface-charm': palette.charm,
      'accent': palette.accent,
      'accent-light': palette.accentSoft,
      'accent-dark': palette.accentDeep,
      'accent-strong': palette.accentStrong,
      'text-primary': palette.text,
      'text-secondary': palette.textSoft,
      'text-hint': palette.hint,
      'text-soft': 'color-mix(in srgb, var(--text-primary) 68%, var(--text-secondary))',
      'border-soft': palette.border,
      'border-charm': 'color-mix(in srgb, var(--accent-dark) 24%, var(--bg-card))',
      'icon-color': 'var(--icon-line-stable)',
      'icon-detail': 'var(--icon-line-stable)',
      'icon-paper-stable': '#FFF6EF',
      'icon-body-stable': '#E8C9B8',
      'icon-line-stable': '#7A5A56',
      'icon-highlight-stable': '#FFFDF8',
      'icon-shadow-stable': '#D9B7A7',
      'icon-charm-theme': palette.accent,
      'icon-charm-theme-2': palette.accent2 || palette.yellow,
      'icon-layer-stable': 'var(--icon-paper-stable)',
      'icon-tile-bg': 'transparent',
      'icon-tile-alt-cool': 'transparent',
      'icon-tile-alt-warm': 'transparent',
      'decor-blue': palette.blue,
      'decor-yellow': palette.yellow,
      'decor-pink': palette.pink,
      'decor-green': palette.green,
      'decor-lilac': palette.lilac,
      'decor-cream': palette.card,
      'bubble-user-bg': palette.userBubble,
      'bubble-user-text': palette.userText || palette.text,
      'bubble-ai-bg': palette.paper,
      'bubble-ai-text': palette.text,
      'button-primary-bg': 'linear-gradient(180deg, var(--accent-light), var(--accent))',
      'button-primary-text': 'var(--bubble-user-text)',
      'button-soft-bg': 'color-mix(in srgb, var(--surface-paper) 86%, var(--accent-light))',
      'badge-bg': 'var(--accent-strong)',
      'badge-text': 'var(--bubble-user-text)',
      'decoration-spot': dark ? 'var(--accent-light)' : 'var(--accent-dark)',
      'illustration-line': 'var(--icon-detail)',
      'illustration-fill': 'var(--surface-paper)',
      'illustration-accent': 'var(--accent-light)',
      'shadow-color': palette.shadow,
      'inner-highlight': `inset 0 1px 0 color-mix(in srgb, var(--icon-highlight-stable) ${dark ? '18%' : '76%'}, transparent)`,
      'toy-border': '1px solid color-mix(in srgb, var(--border-soft) 76%, transparent)',
      'chat-icon-line': 'var(--icon-detail)',
      'chat-icon-paper': 'var(--surface-paper)',
      'chat-icon-fill': 'var(--accent-light)',
      'chat-icon-dot': 'var(--accent-dark)',
      'chat-fold-card-bg': 'var(--surface-paper)',
      'chat-fold-card-open-bg': 'color-mix(in srgb, var(--accent-light) 54%, var(--bg-card))',
      'chat-fold-detail-bg': 'color-mix(in srgb, var(--bg-card) 76%, var(--surface-muted))',
      'chat-fold-line': 'var(--accent-strong)',
      'chat-fold-summary-color': 'var(--text-secondary)',
      'chat-fold-title-color': 'var(--text-primary)',
      'chat-fold-code-color': 'var(--text-secondary)',
      'chat-fold-divider': 'color-mix(in srgb, var(--accent-light) 72%, transparent)',
      'chat-tool-breath-shadow': 'var(--shadow-sm)',
      'chat-tool-breath-shadow-strong': 'var(--shadow-md)',
      ...(dark ? DARK_SHADOWS : LIGHT_SHADOWS)
    }
  };
}
// ═══════════════════════════════════════
// 【旧版兼容】老主题 ID 映射到新 ID
// ═══════════════════════════════════════

const LEGACY_PRESET_ALIAS = {
  default: 'cream-bell',
  light: 'cream-bell',
  blue: 'cloud-soda',
  pink: 'peach-pudding',
  cream: 'cream-bell',
  sky: 'cloud-soda',
  paper: 'cream-bell',
  peach: 'peach-pudding',
  coral: 'cloud-soda',
  berry: 'peach-pudding',
  strawberry: 'peach-pudding',
  blush: 'peach-pudding',
  lavender: 'blueberry-moon',
  purple: 'blueberry-moon',
  warm: 'cream-bell',
  dark: 'cocoa-night',
  night: 'cocoa-night',
  dusk: 'cocoa-night',
  'rose-noir': 'cocoa-night',
  candle: 'teddy-nest',
  milk: 'blueberry-moon',
  cocoa: 'cocoa-night',
  'warm-gray': 'blueberry-moon',
  'milk-cafe': 'teddy-nest',
  caramel: 'teddy-nest',
  gray: 'blueberry-moon',
  'coconut-spring': 'cream-bell',
  'coconut-iced': 'cloud-soda',
  'strawberry-milk': 'peach-pudding',
  'dark-chocolate': 'cocoa-night',
  'vanilla-pudding': 'blueberry-moon'
};

let currentTheme = null;

// ═══════════════════════════════════════
// 【主题应用】写入变量 + 更新主题对象
// ═══════════════════════════════════════

export function applyTheme(variables = {}) {
  const safeVariables = normalizeVariables(variables);
  const root = document.documentElement;

  Object.entries(safeVariables).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    root.style.setProperty(`--${key}`, String(value));
  });

  const base = readCurrentTheme();
  const mergedCustom = {
    ...(base.customVariables || {}),
    ...safeVariables
  };

  currentTheme = normalizeTheme({
    ...base,
    variables: {
      ...(base.variables || {}),
      ...safeVariables
    },
    customVariables: mergedCustom
  });

  setMetaColor(currentTheme.variables['bg-main'] || currentTheme.variables['bg-primary']);
  return currentTheme;
}

// ═══════════════════════════════════════
// 【导入导出】主题文件读写
// ═══════════════════════════════════════

export function exportTheme() {
  const theme = getCurrentTheme();
  return {
    preset: theme.preset,
    mode: theme.mode,
    variables: { ...theme.variables },
    customVariables: { ...theme.customVariables }
  };
}

export function importTheme(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const imported = data && typeof data === 'object' ? data : {};

  const preset = normalizePresetId(imported.preset || getData(PRESET_KEY) || DEFAULT_PRESET);
  const presetTheme = getPresetById(preset);
  const mode = normalizeMode(imported.mode || presetTheme.mode || DEFAULT_MODE);

  document.documentElement.setAttribute('data-theme', preset);

  const next = normalizeTheme({
    preset,
    mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables,
      ...normalizeVariables(imported.variables || {}),
      ...normalizeVariables(imported.customVariables || {})
    },
    customVariables: {
      ...normalizeVariables(imported.customVariables || {})
    }
  });

  currentTheme = next;
  writeTheme(next);
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-main'] || next.variables['bg-primary']);
  return next;
}

// ═══════════════════════════════════════
// 【预设切换】选择内置主题，清除自定义颜色
// ═══════════════════════════════════════

export function setPreset(name) {
  const presetId = normalizePresetId(name);
  const presetTheme = getPresetById(presetId);

  document.documentElement.setAttribute('data-theme', presetId);

  const next = normalizeTheme({
    preset: presetId,
    mode: presetTheme.mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables
    },
    customVariables: {}
  });

  currentTheme = next;
  writeTheme(next);
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-main'] || next.variables['bg-primary']);
  return next;
}

// ═══════════════════════════════════════
// 【模式切换】浅色 → 椰乳四季春 / 夜间 → 黑巧夜语
// ═══════════════════════════════════════

export function setThemeMode(mode) {
  const safeMode = normalizeMode(mode);
  const presetId = safeMode === 'dark' ? 'cocoa-night' : 'cream-bell';
  const presetTheme = getPresetById(presetId);

  document.documentElement.setAttribute('data-theme', presetId);

  const next = normalizeTheme({
    preset: presetId,
    mode: safeMode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables
    },
    customVariables: {}
  });

  currentTheme = next;
  writeTheme(next);
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-main'] || next.variables['bg-primary']);
  return next;
}

// ═══════════════════════════════════════
// 【保存 / 加载】持久化到 localStorage
// ═══════════════════════════════════════

export function saveTheme() {
  const theme = getCurrentTheme();
  writeTheme(theme);
  return theme;
}

export function loadTheme() {
  const saved = getData(THEME_KEY);
  const preset = normalizePresetId(getData(PRESET_KEY) || saved?.preset || DEFAULT_PRESET);
  const presetTheme = getPresetById(preset);
  const mode = normalizeMode(getData(MODE_KEY) || saved?.mode || presetTheme.mode || DEFAULT_MODE);

  const savedCustom = normalizeVariables(saved?.customVariables || {});

  document.documentElement.setAttribute('data-theme', preset);

  const next = normalizeTheme({
    preset,
    mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables,
      ...savedCustom
    },
    customVariables: { ...savedCustom }
  });

  currentTheme = next;
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-main'] || next.variables['bg-primary']);
  return next;
}

// ═══════════════════════════════════════
// 【查询】获取预设列表 / 当前主题
// ═══════════════════════════════════════

export function getThemePresets() {
  return Object.values(PRESETS).map((preset) => ({
    id: preset.id,
    name: preset.name,
    mode: preset.mode
  }));
}

export function getCurrentTheme() {
  if (currentTheme) return { ...currentTheme };
  return readCurrentTheme();
}

export function getThemeVariableKeys() {
  return Object.keys(BASE_VARIABLES);
}

export function getBaseThemeVariables() {
  return { ...BASE_VARIABLES };
}

// ═══════════════════════════════════════
// 【内部工具】读写、归一化、DOM操作
// ═══════════════════════════════════════

function readCurrentTheme() {
  if (currentTheme) return { ...currentTheme };

  const saved = getData(THEME_KEY);
  const preset = normalizePresetId(getData(PRESET_KEY) || saved?.preset || DEFAULT_PRESET);
  const presetTheme = getPresetById(preset);
  const mode = normalizeMode(getData(MODE_KEY) || saved?.mode || presetTheme.mode || DEFAULT_MODE);

  return normalizeTheme({
    preset,
    mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables,
      ...normalizeVariables(saved?.customVariables || {})
    },
    customVariables: normalizeVariables(saved?.customVariables || {})
  });
}

function writeTheme(theme) {
  setData(THEME_KEY, {
    preset: theme.preset,
    mode: theme.mode,
    variables: { ...theme.variables },
    customVariables: { ...theme.customVariables }
  });

  setData(PRESET_KEY, theme.preset);
  setData(MODE_KEY, theme.mode);
}

function applyVariablesToDOM(variables) {
  const root = document.documentElement;

  Object.entries(variables).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    root.style.setProperty(`--${key}`, String(value));
  });
}

function setMetaColor(color) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && color) meta.setAttribute('content', String(color));
}

function normalizeTheme(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};

  return {
    preset: normalizePresetId(obj.preset || DEFAULT_PRESET),
    mode: normalizeMode(obj.mode || DEFAULT_MODE),
    variables: {
      ...BASE_VARIABLES,
      ...normalizeVariables(obj.variables || {})
    },
    customVariables: normalizeVariables(obj.customVariables || {})
  };
}

function normalizeVariables(vars) {
  if (!vars || typeof vars !== 'object') return {};

  const result = {};

  Object.entries(vars).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const cleanKey = String(key).replace(/^--/, '');
    if (!cleanKey) return;
    result[cleanKey] = String(value);
  });

  return result;
}

function normalizePresetId(id) {
  let cleanId = String(id || '').trim().toLowerCase();
  const visited = new Set();

  while (LEGACY_PRESET_ALIAS[cleanId] && !visited.has(cleanId)) {
    visited.add(cleanId);
    cleanId = LEGACY_PRESET_ALIAS[cleanId];
    if (PRESETS[cleanId]) return cleanId;
  }

  if (PRESETS[cleanId]) return cleanId;
  return DEFAULT_PRESET;
}

function normalizeMode(mode) {
  const clean = String(mode || '').trim().toLowerCase();
  return clean === 'dark' ? 'dark' : 'light';
}

function getPresetById(id) {
  return PRESETS[normalizePresetId(id)] || PRESETS[DEFAULT_PRESET];
}

function isPresetDark(id) {
  const preset = PRESETS[normalizePresetId(id)];
  return preset ? preset.mode === 'dark' : false;
}

// 依赖：./storage.js(getData, setData)
