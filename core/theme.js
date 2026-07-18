// imports:
//   from './storage.js': getData, setData

import { getData, setData } from './storage.js';

const THEME_KEY = 'app_theme';
const PRESET_KEY = 'app_theme_preset';
const MODE_KEY = 'app_theme_mode';

const DEFAULT_PRESET = 'coconut-spring';
const DEFAULT_MODE = 'light';

const FONT_FALLBACK = "'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ═══════════════════════════════════════
// 【基础变量】默认值（椰乳四季春）
// ═══════════════════════════════════════

const BASE_VARIABLES = {
  'bg-main': '#FBF4F1',
  'bg-light': '#F7E8E8',
  'bg-card': '#FFF9F5',
  'color-accent': '#C98F9C',
  'color-text': '#665052',
  'color-success': '#91AA96',
  'color-danger': '#C68181',
  'bg-primary': '#FBF4F1',
  'bg-secondary': '#F7E8E8',
  'bg-overlay': 'color-mix(in srgb, var(--text-primary) 24%, transparent)',
  'surface': '#FFF9F5',
  'surface-muted': 'color-mix(in srgb, var(--bg-card) 90%, var(--text-hint) 10%)',
  'accent': '#C98F9C',
  'accent-light': '#F2DADD',
  'accent-dark': '#A86F7B',
  'text-primary': '#665052',
  'text-secondary': '#907779',
  'text-hint': '#B9A4A3',
  'border-soft': '#EBD9D6',
  'icon-color': '#9C747A',
  'decor-blue': '#C7DCE0',
  'decor-yellow': '#EAD9A9',
  'decor-pink': 'var(--accent-light)',
  'decor-cream': 'var(--bg-card)',
  'media-ink': 'color-mix(in srgb, var(--text-primary) 76%, var(--bg-primary))',
  'media-ink-deep': 'color-mix(in srgb, var(--text-primary) 88%, var(--bg-primary))',
  'media-on-dark': 'var(--bg-card)',
  'media-highlight': 'color-mix(in srgb, var(--decor-yellow) 72%, var(--bg-card))',
  'media-overlay-soft': 'color-mix(in srgb, var(--text-primary) 18%, transparent)',
  'media-overlay': 'color-mix(in srgb, var(--text-primary) 36%, transparent)',
  'bubble-user-bg': '#E9C4CA',
  'bubble-user-text': '#665052',
  'bubble-ai-bg': '#FFF9F5',
  'bubble-ai-text': '#665052',
  'bubble-radius': '23px',
  'bubble-radius-tail': '9px',
  'font-main': FONT_FALLBACK,
  'font-size-base': '15px',
  'font-size-small': '13px',
  'font-size-title': '17px',
  'spacing-xs': '4px',
  'spacing-sm': '8px',
  'spacing-md': '16px',
  'spacing-lg': '24px',
  'radius-sm': '14px',
  'radius-md': '21px',
  'radius-lg': '29px',
  'shadow-sm': '0 3px 10px color-mix(in srgb, var(--text-primary) 6%, transparent)',
  'shadow-md': '0 7px 22px color-mix(in srgb, var(--text-primary) 7%, transparent)',
  'shadow-lg': '0 12px 34px color-mix(in srgb, var(--text-primary) 9%, transparent)',
  'shadow-card': '0 5px 18px color-mix(in srgb, var(--text-primary) 6%, transparent)',
  'shadow-float': '0 10px 30px color-mix(in srgb, var(--text-primary) 9%, transparent)',
  'shadow-neu-out': 'var(--shadow-sm)',
  'shadow-neu-in': 'inset 0 0 0 1px color-mix(in srgb, var(--border-soft) 70%, transparent)',
  'motion': 'all 240ms cubic-bezier(.2,.8,.2,1)',
  'press-scale': '0.97',
  'radius-xl': '36px',
  'radius-full': '999px'
};

// ═══════════════════════════════════════
// 【阴影常量】日间 / 夜间
// ═══════════════════════════════════════

const LIGHT_SHADOWS = {};

const DARK_SHADOWS = {};

// ═══════════════════════════════════════
// 【主题预设】3 浅色 + 3 夜间
// ═══════════════════════════════════════

const PRESETS = {
  'coconut-spring': createPreset('coconut-spring', '草莓奶霜', 'light', {
    background: '#FBF4F1', secondary: '#F7E8E8', card: '#FFF9F5',
    accent: '#C98F9C', accentSoft: '#F2DADD', accentDeep: '#A86F7B',
    text: '#665052', textSoft: '#907779', hint: '#B9A4A3', border: '#EBD9D6',
    success: '#91AA96', danger: '#C68181', blue: '#C7DCE0', yellow: '#EAD9A9'
  }),
  'coconut-iced': createPreset('coconut-iced', '云朵苏打', 'light', {
    background: '#F2F6F3', secondary: '#E2EEE9', card: '#FCFAF5',
    accent: '#89AAA9', accentSoft: '#D7E8E5', accentDeep: '#668B8A',
    text: '#536360', textSoft: '#7B918C', hint: '#A8B7B1', border: '#D6E4DF',
    success: '#86A58E', danger: '#C58B88', blue: '#BDD7DE', yellow: '#E8D9A9'
  }),
  'strawberry-milk': createPreset('strawberry-milk', '蜜桃布丁', 'light', {
    background: '#FFF5ED', secondary: '#F8E4D8', card: '#FFFBF5',
    accent: '#D59A86', accentSoft: '#F4D9CF', accentDeep: '#AD7465',
    text: '#69534C', textSoft: '#92786E', hint: '#BCA69C', border: '#EDDDD4',
    success: '#91A78D', danger: '#C98282', blue: '#C8DADE', yellow: '#EED8A4'
  }),
  'dark-chocolate': createPreset('dark-chocolate', '可可晚安', 'dark', {
    background: '#28201F', secondary: '#352928', card: '#3D302E',
    accent: '#D8A7AD', accentSoft: '#533D40', accentDeep: '#E7BDC1',
    text: '#F3E7E2', textSoft: '#C5AAA4', hint: '#917873', border: '#584440',
    success: '#9DB39D', danger: '#D18F8B', blue: '#90ADB3', yellow: '#CEB879'
  }),
  'teddy-nest': createPreset('teddy-nest', '泰迪暖窝', 'dark', {
    background: '#302521', secondary: '#3B2D28', card: '#44342E',
    accent: '#DAB497', accentSoft: '#594538', accentDeep: '#F0CCAE',
    text: '#F4E8DC', textSoft: '#CAB3A3', hint: '#968075', border: '#604B41',
    success: '#A2B49A', danger: '#D29387', blue: '#91AAB0', yellow: '#D1B77D'
  }),
  'vanilla-pudding': createPreset('vanilla-pudding', '蓝莓月光', 'dark', {
    background: '#25242D', secondary: '#302F3A', card: '#393744',
    accent: '#B3A5C9', accentSoft: '#4C465B', accentDeep: '#D0C3E3',
    text: '#EEEAF2', textSoft: '#BCB4C6', hint: '#858092', border: '#514E5E',
    success: '#96AD9D', danger: '#CA8D91', blue: '#91AFBD', yellow: '#CAB77F'
  })
};

function createPreset(id, name, mode, palette) {
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
      'bg-overlay': 'color-mix(in srgb, var(--text-primary) 30%, transparent)',
      'surface': palette.card,
      'surface-muted': 'color-mix(in srgb, var(--bg-card) 84%, var(--bg-secondary))',
      'accent': palette.accent,
      'accent-light': palette.accentSoft,
      'accent-dark': palette.accentDeep,
      'text-primary': palette.text,
      'text-secondary': palette.textSoft,
      'text-hint': palette.hint,
      'border-soft': palette.border,
      'icon-color': palette.accentDeep,
      'decor-blue': palette.blue,
      'decor-yellow': palette.yellow,
      'bubble-user-bg': 'color-mix(in srgb, var(--accent) 72%, var(--bg-card))',
      // Dark presets deliberately keep the bubble pastel/light, so their normal
      // (light) body copy does not provide enough contrast on a user message.
      'bubble-user-text': mode === 'dark' ? palette.background : palette.text,
      'bubble-ai-bg': palette.card,
      'bubble-ai-text': palette.text,
      ...(mode === 'dark' ? DARK_SHADOWS : LIGHT_SHADOWS)
    }
  };
}

// ═══════════════════════════════════════
// 【旧版兼容】老主题 ID 映射到新 ID
// ═══════════════════════════════════════

const LEGACY_PRESET_ALIAS = {
  default: 'coconut-spring',
  light: 'coconut-spring',
  blue: 'coconut-spring',
  pink: 'strawberry-milk',
  cream: 'coconut-spring',
  sky: 'coconut-iced',
  paper: 'coconut-spring',
  peach: 'coconut-spring',
  coral: 'coconut-iced',
  berry: 'strawberry-milk',
  strawberry: 'strawberry-milk',
  blush: 'coconut-spring',
  lavender: 'strawberry-milk',
  purple: 'strawberry-milk',
  warm: 'coconut-spring',
  dark: 'dark-chocolate',
  night: 'dark-chocolate',
  dusk: 'dark-chocolate',
  'rose-noir': 'dark-chocolate',
  candle: 'teddy-nest',
  milk: 'vanilla-pudding',
  cocoa: 'vanilla-pudding',
  'warm-gray': 'vanilla-pudding',
  'milk-cafe': 'teddy-nest',
  caramel: 'teddy-nest',
  gray: 'vanilla-pudding'
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
  const importedVariables = normalizeVariables(imported.variables || {});
  const importedCustomVariables = normalizeVariables(imported.customVariables || {});
  // `variables` is part of the supported import format, not merely a snapshot
  // for the current page. Persist it as customization data so an import that
  // omits the optional customVariables duplicate survives the next load.
  const customVariables = {
    ...importedVariables,
    ...importedCustomVariables
  };

  document.documentElement.setAttribute('data-theme', preset);

  const next = normalizeTheme({
    preset,
    mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables,
      ...customVariables
    },
    customVariables
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
  const presetId = safeMode === 'dark' ? 'dark-chocolate' : 'coconut-spring';
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
  const cleanId = String(id || '').trim().toLowerCase();
  if (PRESETS[cleanId]) return cleanId;
  if (LEGACY_PRESET_ALIAS[cleanId]) return LEGACY_PRESET_ALIAS[cleanId];
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
