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
  'bg-main': '#FFF8E8',
  'bg-light': '#F6E8C9',
  'bg-card': '#FFFDF5',
  'color-accent': '#E8B850',
  'color-text': '#5F4631',
  'color-success': '#85AA8C',
  'color-danger': '#C87C72',
  'bg-primary': '#FFF8E8',
  'bg-secondary': '#F6E8C9',
  'bg-overlay': 'color-mix(in srgb, var(--text-primary) 24%, transparent)',
  'surface': 'var(--bg-card)',
  'surface-soft': 'color-mix(in srgb, var(--bg-card) 88%, transparent)',
  'surface-glass': 'color-mix(in srgb, var(--bg-primary) 86%, transparent)',
  'surface-muted': '#F9EFD7',
  'surface-paper': '#FFF9EA',
  'surface-charm': '#FFEFC2',
  'accent': '#E8B850',
  'accent-light': '#FFE8A9',
  'accent-dark': '#9B6A2E',
  'accent-strong': '#D99A35',
  'text-primary': '#5F4631',
  'text-secondary': '#8F7358',
  'text-hint': '#B9A58D',
  'text-soft': 'color-mix(in srgb, var(--text-primary) 68%, var(--text-secondary))',
  'border-soft': '#E7C99E',
  'border-charm': 'color-mix(in srgb, var(--accent-dark) 24%, var(--bg-card))',
  'icon-color': 'var(--icon-line-stable)',
  'icon-detail': 'var(--icon-line-stable)',
  'icon-body-stable': 'color-mix(in srgb, #FFF9EA 82%, #F2CE72)',
  'icon-line-stable': 'color-mix(in srgb, #5F4631 72%, #9B6A2E)',
  'icon-layer-stable': 'color-mix(in srgb, #FFFDF5 88%, #C8D7E3)',
  'icon-highlight-stable': 'color-mix(in srgb, #FFFDF5 84%, white)',
  'icon-charm-theme': 'color-mix(in srgb, var(--accent) 66%, var(--bg-card))',
  'icon-tile-bg': 'var(--surface-paper)',
  'icon-tile-alt-cool': 'color-mix(in srgb, var(--decor-blue) 40%, var(--bg-card))',
  'icon-tile-alt-warm': 'color-mix(in srgb, var(--decor-yellow) 44%, var(--bg-card))',
  'decor-blue': '#C8D7E3',
  'decor-yellow': '#F2CE72',
  'decor-pink': '#F6C8BC',
  'decor-green': '#C9D8BC',
  'decor-lilac': '#D8CBE0',
  'decor-cream': 'var(--bg-card)',
  'media-ink': 'color-mix(in srgb, var(--text-primary) 76%, var(--bg-primary))',
  'media-ink-deep': 'color-mix(in srgb, var(--text-primary) 88%, var(--bg-primary))',
  'media-on-dark': 'var(--bg-card)',
  'media-highlight': 'color-mix(in srgb, var(--decor-yellow) 72%, var(--bg-card))',
  'media-overlay-soft': 'color-mix(in srgb, var(--text-primary) 18%, transparent)',
  'media-overlay': 'color-mix(in srgb, var(--text-primary) 36%, transparent)',
  'bubble-user-bg': '#FFE0A3',
  'bubble-user-text': '#5D422C',
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
  'shadow-color': '#8A5A28',
  'shadow-neu-out': 'var(--shadow-sm)',
  'shadow-neu-in': 'inset 0 0 0 1px color-mix(in srgb, var(--border-soft) 70%, transparent)',
  'inner-highlight': 'inset 0 1px 0 color-mix(in srgb, white 76%, transparent)',
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
  'inner-highlight': 'inset 0 1px 0 color-mix(in srgb, white 76%, transparent)'
};

const DARK_SHADOWS = {
  'shadow-sm': '0 5px 16px color-mix(in srgb, black 28%, transparent), 0 1px 0 color-mix(in srgb, white 5%, transparent)',
  'shadow-md': '0 12px 30px color-mix(in srgb, black 34%, transparent), 0 1px 0 color-mix(in srgb, white 6%, transparent)',
  'shadow-lg': '0 22px 48px color-mix(in srgb, black 42%, transparent), 0 1px 0 color-mix(in srgb, white 7%, transparent)',
  'shadow-card': '0 10px 24px color-mix(in srgb, black 30%, transparent), inset 0 1px 0 color-mix(in srgb, white 6%, transparent)',
  'shadow-float': '0 20px 46px color-mix(in srgb, black 40%, transparent), 0 0 0 1px color-mix(in srgb, white 6%, transparent)',
  'inner-highlight': 'inset 0 1px 0 color-mix(in srgb, white 9%, transparent)'
};

// ═══════════════════════════════════════
// 【主题预设】3 浅色 + 3 夜间
// ═══════════════════════════════════════

const PRESETS = {
  'cream-bell': createPreset('cream-bell', '焦糖小熊', 'light', {
    background: '#FFF6E6', secondary: '#E8C191', card: '#FFFDF6', paper: '#FFF8EA', charm: '#F4B966',
    accent: '#C8772E', accentSoft: '#FFDDA3', accentDeep: '#6C3B1F', accentStrong: '#A75A25',
    text: '#4C2B1A', textSoft: '#825B3E', hint: '#B18B69', border: '#D79B62', shadow: '#7A431E',
    success: '#7EA36F', danger: '#C57964', blue: '#C9D7D9', yellow: '#F2C76D', pink: '#F2BDAE', green: '#C8D4A9', lilac: '#D4C4D8',
    userBubble: '#F1C184', userText: '#4D2C1B', icon: '#8B4F26', iconDetail: '#6C3B1F'
  }),
  'cloud-soda': createPreset('cloud-soda', '云朵苏打', 'light', {
    background: '#F2F7F6', secondary: '#E1EEEA', card: '#FCFAF5', paper: '#F7FBF8', charm: '#DDF0EC',
    accent: '#86AAA8', accentSoft: '#D7E8E5', accentDeep: '#5E8583', accentStrong: '#6B9996',
    text: '#516360', textSoft: '#78908C', hint: '#A6B7B1', border: '#D5E4DF', shadow: '#416865',
    success: '#86A58E', danger: '#C58B88', blue: '#BDD7DE', yellow: '#E8D9A9', pink: '#EBC6C3', green: '#CFE1D3', lilac: '#D7D0E2',
    userBubble: '#DDF0EC', userText: '#47615F', icon: '#668B8A', iconDetail: '#5E8583'
  }),
  'peach-pudding': createPreset('peach-pudding', '蜜桃布丁', 'light', {
    background: '#FFF5ED', secondary: '#F8E4D8', card: '#FFFBF5', paper: '#FFF7EE', charm: '#F7DFD0',
    accent: '#D59A86', accentSoft: '#F4D9CF', accentDeep: '#AD7465', accentStrong: '#C98770',
    text: '#69534C', textSoft: '#92786E', hint: '#BCA69C', border: '#EDDDD4', shadow: '#8A5548',
    success: '#91A78D', danger: '#C98282', blue: '#C8DADE', yellow: '#EED8A4', pink: '#F1C6C3', green: '#CBD8BC', lilac: '#D8CBE0',
    userBubble: '#F4D9CF', userText: '#654C44', icon: '#AD7465', iconDetail: '#B47A67'
  }),
  'cocoa-night': createPreset('cocoa-night', '可可晚安', 'dark', {
    background: '#28201F', secondary: '#352928', card: '#3D302E', paper: '#453735', charm: '#533D40',
    accent: '#D8A7AD', accentSoft: '#533D40', accentDeep: '#E7BDC1', accentStrong: '#E0B0B5',
    text: '#F3E7E2', textSoft: '#C5AAA4', hint: '#917873', border: '#584440', shadow: '#1A1211',
    success: '#9DB39D', danger: '#D18F8B', blue: '#90ADB3', yellow: '#CEB879', pink: '#D8A7AD', green: '#9DB39D', lilac: '#B8A5CA',
    userBubble: '#533D40', userText: '#F3E7E2', icon: '#E7BDC1', iconDetail: '#E7BDC1'
  }),
  'teddy-nest': createPreset('teddy-nest', '泰迪暖窝', 'dark', {
    background: '#302521', secondary: '#3B2D28', card: '#44342E', paper: '#4B3A32', charm: '#594538',
    accent: '#DAB497', accentSoft: '#594538', accentDeep: '#F0CCAE', accentStrong: '#E5BE9E',
    text: '#F4E8DC', textSoft: '#CAB3A3', hint: '#968075', border: '#604B41', shadow: '#1D1411',
    success: '#A2B49A', danger: '#D29387', blue: '#91AAB0', yellow: '#D1B77D', pink: '#D3A2A0', green: '#A2B49A', lilac: '#B5A2C6',
    userBubble: '#594538', userText: '#F4E8DC', icon: '#F0CCAE', iconDetail: '#E6C09F'
  }),
  'blueberry-moon': createPreset('blueberry-moon', '蓝莓月光', 'dark', {
    background: '#25242D', secondary: '#302F3A', card: '#393744', paper: '#413F4E', charm: '#4C465B',
    accent: '#B3A5C9', accentSoft: '#4C465B', accentDeep: '#D0C3E3', accentStrong: '#C4B4DB',
    text: '#EEEAF2', textSoft: '#BCB4C6', hint: '#858092', border: '#514E5E', shadow: '#17151F',
    success: '#96AD9D', danger: '#CA8D91', blue: '#91AFBD', yellow: '#CAB77F', pink: '#C8A0B7', green: '#96AD9D', lilac: '#B3A5C9',
    userBubble: '#4C465B', userText: '#EEEAF2', icon: '#D0C3E3', iconDetail: '#CDBFE0'
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
      'icon-body-stable': 'color-mix(in srgb, #FFF9EA 82%, #F2CE72)',
      'icon-line-stable': 'color-mix(in srgb, #5F4631 72%, #9B6A2E)',
      'icon-layer-stable': 'color-mix(in srgb, #FFFDF5 88%, #C8D7E3)',
      'icon-highlight-stable': 'color-mix(in srgb, #FFFDF5 84%, white)',
      'icon-charm-theme': 'color-mix(in srgb, var(--accent) 66%, var(--bg-card))',
      'icon-tile-bg': 'var(--surface-paper)',
      'icon-tile-alt-cool': 'color-mix(in srgb, var(--decor-blue) 40%, var(--bg-card))',
      'icon-tile-alt-warm': 'color-mix(in srgb, var(--decor-yellow) 44%, var(--bg-card))',
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
      'inner-highlight': `inset 0 1px 0 color-mix(in srgb, white ${dark ? '12%' : '76%'}, transparent)`,
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
      'cream-bell-lace': 'none',
      'cream-bell-dots': 'none',
      'cream-bell-plaid': 'none',
      'cream-bell-badge-display': id === 'cream-bell' ? 'block' : 'none',
      'cream-bell-charm-opacity': id === 'cream-bell' ? '1' : '0',
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
