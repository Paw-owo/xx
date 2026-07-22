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
    background: '#FFF1F5', secondary: '#F8DDE6', card: '#FFF9FA', paper: '#FFF5F7', charm: '#F8C8D5',
    accent: '#E9A0B5', accentSoft: '#F8D2DD', accentDeep: '#9A6672', accentStrong: '#D889A0',
    text: '#4F3538', textSoft: '#7A5A5F', hint: '#A98B91', border: '#E9B7C3', shadow: '#8E5662',
    success: '#8EAA8C', danger: '#C77D7E', blue: '#C9DAEA', yellow: '#F1D893', pink: '#F2B8CB', green: '#CBDCBC', lilac: '#D8C8E4',
    userBubble: '#F6CED9', userText: '#52363A', icon: '#7E5660', iconDetail: '#8D5B67'
  }),
  'cloud-soda': createPreset('cloud-soda', '云朵苏打', 'light', {
    background: '#EEF8FF', secondary: '#D9EAF6', card: '#FAFDFF', paper: '#F3FAFF', charm: '#CAE1F3',
    accent: '#94BAD6', accentSoft: '#D4E8F6', accentDeep: '#55768A', accentStrong: '#78A6C4',
    text: '#344954', textSoft: '#607984', hint: '#91A9B3', border: '#BBD7E8', shadow: '#4C7187',
    success: '#86A493', danger: '#C78B88', blue: '#AED2EA', yellow: '#E9D89E', pink: '#EEC6D1', green: '#CDE0CE', lilac: '#D2CAE5',
    userBubble: '#D3E7F5', userText: '#334C58', icon: '#5F8298', iconDetail: '#55768A'
  }),
  'peach-pudding': createPreset('peach-pudding', '蜜桃布丁', 'light', {
    background: '#FFF7DF', secondary: '#F8E8AE', card: '#FFFDF3', paper: '#FFF9E7', charm: '#F4E3A7',
    accent: '#E2BD5F', accentSoft: '#F5E1A1', accentDeep: '#806735', accentStrong: '#CFA545',
    text: '#4D4027', textSoft: '#7B6A45', hint: '#AA9970', border: '#E6C97C', shadow: '#81652B',
    success: '#8EA676', danger: '#C48670', blue: '#C8DCE3', yellow: '#ECD06E', pink: '#F0C4BE', green: '#CAD9A5', lilac: '#D7CCE2',
    userBubble: '#F3DEA0', userText: '#4E4027', icon: '#806735', iconDetail: '#8B7037'
  }),
  'cocoa-night': createPreset('cocoa-night', '可可晚安', 'dark', {
    background: '#1B1113', secondary: '#28171A', card: '#321F23', paper: '#3A2529', charm: '#542A33',
    accent: '#D85C69', accentSoft: '#5A2C35', accentDeep: '#F2A0A7', accentStrong: '#E17882',
    text: '#EAD8D2', textSoft: '#C9A8A1', hint: '#9B7772', border: '#6E3A43', shadow: '#11090A',
    success: '#9BAF91', danger: '#D17D7B', blue: '#8CADB7', yellow: '#CBB478', pink: '#D86776', green: '#9BAF91', lilac: '#B89BC4',
    userBubble: '#552B34', userText: '#EAD8D2', icon: '#EFA0A6', iconDetail: '#E28A93'
  }),
  'teddy-nest': createPreset('teddy-nest', '泰迪暖窝', 'dark', {
    background: '#221713', secondary: '#2E211B', card: '#3A2A22', paper: '#443229', charm: '#5B4032',
    accent: '#D8AE86', accentSoft: '#5C4235', accentDeep: '#EBCBAB', accentStrong: '#D7AA83',
    text: '#EADCCF', textSoft: '#C7AE9A', hint: '#987F70', border: '#684E40', shadow: '#150D0A',
    success: '#9CAF8A', danger: '#D18C7B', blue: '#8FAAB0', yellow: '#CCB26E', pink: '#D2A0A2', green: '#9CAF8A', lilac: '#B5A0C2',
    userBubble: '#5B4032', userText: '#EADCCF', icon: '#E9C4A4', iconDetail: '#D9B08E'
  }),
  'blueberry-moon': createPreset('blueberry-moon', '蓝莓月光', 'dark', {
    background: '#1E151C', secondary: '#2B1D28', card: '#352633', paper: '#402D3C', charm: '#5B314B',
    accent: '#DD8DB8', accentSoft: '#5C314C', accentDeep: '#F0B8D2', accentStrong: '#E59BC2',
    text: '#ECDAE3', textSoft: '#C9AABD', hint: '#9B7A8B', border: '#6C425B', shadow: '#130B11',
    success: '#94AC94', danger: '#D48691', blue: '#91B1C0', yellow: '#CEB772', pink: '#DD8DB8', green: '#94AC94', lilac: '#B89DD0',
    userBubble: '#5C314C', userText: '#ECDAE3', icon: '#F0B8D2', iconDetail: '#E5A4C8'
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
      'icon-body-stable': `color-mix(in srgb, ${palette.paper} 84%, ${palette.accentSoft})`,
      'icon-line-stable': palette.icon || palette.accentDeep,
      'icon-layer-stable': `color-mix(in srgb, ${palette.card} 88%, ${palette.blue})`,
      'icon-highlight-stable': `color-mix(in srgb, ${palette.card} 82%, ${palette.yellow})`,
      'icon-charm-theme': 'color-mix(in srgb, var(--accent) 72%, var(--bg-card))',
      'icon-ribbon-theme': 'var(--icon-charm-theme)',
      'icon-paw-theme': 'color-mix(in srgb, var(--decor-pink) 76%, var(--bg-card))',
      'icon-star-theme': 'color-mix(in srgb, var(--decor-yellow) 82%, var(--bg-card))',
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
