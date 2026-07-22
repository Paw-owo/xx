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
  'cream-bell': createPreset('cream-bell', '奶黄', 'light', {
    background: '#FFF9EA', secondary: '#FFF0C8', card: '#FFFDF7', paper: '#FFFBF0', charm: '#FFF3CE',
    accent: '#E7BE62', accentSoft: '#FFE9A8', accentDeep: '#8A6734', accentStrong: '#D8A348',
    text: '#604D34', textSoft: '#8C7554', hint: '#B7A78D', border: '#ECD8AC', shadow: '#9B7132',
    success: '#90AD82', danger: '#C98276', blue: '#D7E8F7', yellow: '#F6D884', pink: '#F5C9C2', green: '#D6E2BF', lilac: '#DDD4E8',
    userBubble: '#FFE7B0', userText: '#60482F', icon: '#907184', iconDetail: '#8F7480'
  }),
  'cloud-soda': createPreset('cloud-soda', '奶粉', 'light', {
    background: '#FFF5F8', secondary: '#FBE5ED', card: '#FFFCFD', paper: '#FFF8FA', charm: '#FBDDE9',
    accent: '#E7A9BF', accentSoft: '#FFD9E7', accentDeep: '#956579', accentStrong: '#D68AA8',
    text: '#634E59', textSoft: '#927783', hint: '#BBA3AE', border: '#EFCFDB', shadow: '#9B6378',
    success: '#8FAD93', danger: '#C97F88', blue: '#D9E8F8', yellow: '#F1DDAA', pink: '#F5C3D4', green: '#D4E3C7', lilac: '#E3D3EA',
    userBubble: '#FFDCE8', userText: '#604A55', icon: '#907184', iconDetail: '#8F7480'
  }),
  'peach-pudding': createPreset('peach-pudding', '奶蓝', 'light', {
    background: '#F3FAFF', secondary: '#E2F0FB', card: '#FCFEFF', paper: '#F8FCFF', charm: '#DDEEFF',
    accent: '#95C1DD', accentSoft: '#D8EEFF', accentDeep: '#5E8299', accentStrong: '#78ADD0',
    text: '#465E6E', textSoft: '#708D9E', hint: '#9EB7C5', border: '#CFE4F1', shadow: '#4E768D',
    success: '#85A994', danger: '#C78386', blue: '#C9E4FA', yellow: '#EEE0AD', pink: '#EFCBD9', green: '#CEE2CE', lilac: '#DAD6EA',
    userBubble: '#D9EFFF', userText: '#435B6B', icon: '#907184', iconDetail: '#8F7480'
  }),
  'cocoa-night': createPreset('cocoa-night', '黑红', 'dark', {
    background: '#1F1719', secondary: '#2C1E22', card: '#35252A', paper: '#402C31', charm: '#52333A',
    accent: '#F09AA5', accentSoft: '#693E47', accentDeep: '#FFD1D6', accentStrong: '#E77787',
    text: '#F7E5E4', textSoft: '#D2B4B4', hint: '#A08284', border: '#674850', shadow: '#110A0C',
    success: '#9EB796', danger: '#F08C83', blue: '#98B8C6', yellow: '#D7BD7D', pink: '#F09AA5', green: '#9EB796', lilac: '#C0A7D0',
    userBubble: '#633A43', userText: '#FFF1F1', icon: '#F2CED6', iconDetail: '#FFD1D6'
  }),
  'teddy-nest': createPreset('teddy-nest', '奶棕', 'dark', {
    background: '#241B16', secondary: '#30241D', card: '#3B2B22', paper: '#473428', charm: '#5C4030',
    accent: '#E5B98E', accentSoft: '#654832', accentDeep: '#FFE0BE', accentStrong: '#D79A66',
    text: '#F4E5D3', textSoft: '#D0B59C', hint: '#9F806D', border: '#6E5140', shadow: '#130D09',
    success: '#A7B98F', danger: '#DC8E78', blue: '#8FB0BB', yellow: '#D8B86E', pink: '#D6A19C', green: '#A7B98F', lilac: '#BBA6CC',
    userBubble: '#604431', userText: '#FFF0DC', icon: '#F0D1B8', iconDetail: '#FFE0BE'
  }),
  'blueberry-moon': createPreset('blueberry-moon', '黑粉', 'dark', {
    background: '#211A25', secondary: '#2D2232', card: '#382A3D', paper: '#443349', charm: '#583D58',
    accent: '#E7A0C8', accentSoft: '#68435F', accentDeep: '#FFD0E8', accentStrong: '#D97AB5',
    text: '#F5E7F0', textSoft: '#D3B3C7', hint: '#9E8295', border: '#694E64', shadow: '#120C15',
    success: '#98B5A0', danger: '#E48698', blue: '#94B8C8', yellow: '#D4BC82', pink: '#E7A0C8', green: '#98B5A0', lilac: '#C6A8D6',
    userBubble: '#64415C', userText: '#FFF0F8', icon: '#F1CAE0', iconDetail: '#FFD0E8'
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
      'icon-body-stable': 'color-mix(in srgb, var(--surface-paper) 88%, var(--decor-blue))',
      'icon-line-stable': palette.iconDetail || palette.icon || palette.accentDeep,
      'icon-layer-stable': 'color-mix(in srgb, var(--bg-card) 88%, var(--decor-blue))',
      'icon-highlight-stable': 'color-mix(in srgb, var(--bg-card) 86%, white)',
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
      'cream-bell-badge-display': 'block',
      'cream-bell-charm-opacity': '1',
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
  'vanilla-pudding': 'blueberry-moon',
  '\u7126\u7CD6\u5C0F\u718A': 'cream-bell',
  '\u4E91\u6735\u82CF\u6253': 'cloud-soda',
  '\u871C\u6843\u5E03\u4E01': 'peach-pudding',
  '\u53EF\u53EF\u665A\u5B89': 'cocoa-night',
  '\u6CF0\u8FEA\u6696\u7A9D': 'teddy-nest',
  '\u84DD\u8393\u6708\u5149': 'blueberry-moon',
  '奶黄': 'cream-bell',
  '奶粉': 'cloud-soda',
  '奶蓝': 'peach-pudding',
  '黑红': 'cocoa-night',
  '奶棕': 'teddy-nest',
  '黑粉': 'blueberry-moon'
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
