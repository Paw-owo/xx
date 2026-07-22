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
    background: '#FFF8E6', secondary: '#F7E8C7', card: '#FFFDF6', paper: '#FFF9EC', charm: '#FFE9B8',
    accent: '#E3B65C', accentSoft: '#FFE8AA', accentDeep: '#8D6431', accentStrong: '#C98C3E',
    text: '#5C4630', textSoft: '#8B7154', hint: '#B7A083', border: '#E8CEA1', shadow: '#8A642E',
    success: '#89A77C', danger: '#C98576', blue: '#CBDCE6', yellow: '#F4D27B', pink: '#F4C5B8', green: '#CEDBB9', lilac: '#D9CEE1',
    userBubble: '#FFE2A6', userText: '#5B432C', icon: '#8D6431', iconDetail: '#76542D'
  }),
  'cloud-soda': createPreset('cloud-soda', '奶粉', 'light', {
    background: '#FFF4F7', secondary: '#F7E2E9', card: '#FFFDFB', paper: '#FFF8FA', charm: '#F8DDE8',
    accent: '#D991A9', accentSoft: '#F8D5E1', accentDeep: '#9B6072', accentStrong: '#C77992',
    text: '#624C56', textSoft: '#927481', hint: '#BBA0AC', border: '#EACDD8', shadow: '#875A69',
    success: '#8EAA8B', danger: '#C98282', blue: '#D4E2F0', yellow: '#EFD8A6', pink: '#F2C1D0', green: '#CFDDBF', lilac: '#DDD0E3',
    userBubble: '#F8D5E1', userText: '#604954', icon: '#9B6072', iconDetail: '#875767'
  }),
  'peach-pudding': createPreset('peach-pudding', '奶蓝', 'light', {
    background: '#F3F8FF', secondary: '#DFECF7', card: '#FFFDF8', paper: '#F9FCFF', charm: '#DCECF8',
    accent: '#8EB7D0', accentSoft: '#D7EAF6', accentDeep: '#5F8295', accentStrong: '#78A4BD',
    text: '#485C68', textSoft: '#728B99', hint: '#9FB4C0', border: '#CFE0EB', shadow: '#4A6D80',
    success: '#87A58F', danger: '#C78A86', blue: '#C5DDF0', yellow: '#EBD9A8', pink: '#EBC9D2', green: '#CADBC7', lilac: '#D7D0E4',
    userBubble: '#D7EAF6', userText: '#435A66', icon: '#5F8295', iconDetail: '#547789'
  }),
  'cocoa-night': createPreset('cocoa-night', '黑红', 'dark', {
    background: '#251C1E', secondary: '#322426', card: '#3B2B2E', paper: '#463235', charm: '#563A40',
    accent: '#D99AA2', accentSoft: '#563A40', accentDeep: '#E9BCC1', accentStrong: '#DAA5AB',
    text: '#F1E2DF', textSoft: '#C8AAA6', hint: '#987B78', border: '#61484A', shadow: '#170E10',
    success: '#9DB39C', danger: '#D1918B', blue: '#91AAB3', yellow: '#CEB879', pink: '#D99AA2', green: '#9DB39C', lilac: '#B8A5CA',
    userBubble: '#563A40', userText: '#F1E2DF', icon: '#E9BCC1', iconDetail: '#E0ADB4'
  }),
  'teddy-nest': createPreset('teddy-nest', '奶棕', 'dark', {
    background: '#2D241F', secondary: '#3A2D27', card: '#44342C', paper: '#4E3B31', charm: '#5C4638',
    accent: '#D9B293', accentSoft: '#5C4638', accentDeep: '#EBC9AC', accentStrong: '#DDB797',
    text: '#F0E2D4', textSoft: '#C8AF9C', hint: '#967E70', border: '#624C40', shadow: '#1A120F',
    success: '#A2B399', danger: '#D09183', blue: '#90A9B0', yellow: '#D1B77D', pink: '#D1A09D', green: '#A2B399', lilac: '#B5A2C6',
    userBubble: '#5C4638', userText: '#F0E2D4', icon: '#EBC9AC', iconDetail: '#DDB797'
  }),
  'blueberry-moon': createPreset('blueberry-moon', '黑粉', 'dark', {
    background: '#272028', secondary: '#332832', card: '#3D303B', paper: '#473844', charm: '#563F51',
    accent: '#D19AB8', accentSoft: '#563F51', accentDeep: '#E6BED3', accentStrong: '#D8A7C2',
    text: '#F0E4EB', textSoft: '#C7ADBA', hint: '#957F8B', border: '#604A58', shadow: '#181017',
    success: '#98AE9E', danger: '#CF8D96', blue: '#92ADBA', yellow: '#CDB77F', pink: '#D19AB8', green: '#98AE9E', lilac: '#B9A4C8',
    userBubble: '#563F51', userText: '#F0E4EB', icon: '#E6BED3', iconDetail: '#D8A7C2'
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
