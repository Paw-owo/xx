// apps/chat/theme-agent.js
// theme-agent 主题子智能体：使用 theme-resource-generation 权限域，调用主题 AI 预览链路。

import { registerSubAgent, SUB_AGENT_SCOPES } from '../../core/sub-agent-system.js';
import { canUseAITool, AI_TOOL_SCOPES } from '../../core/ai-tool-registry.js';
import { createThemeConfig, previewThemeAsync } from '../../core/theme-ai-agent.js';

let registered = false;

const THEME_DRAFT_PALETTES = Object.freeze({
  night: Object.freeze({
    accent: '#8f7cf7', accentLight: '#403a68', accentDark: '#d8d0ff', accentStrong: '#b8a8ff',
    bg: '#25243a', card: '#32304a', muted: '#2b2942', paper: '#373551',
    text: '#fff8ff', secondary: '#d8d2ee', hint: '#aaa2c8', border: '#4b4770', shadow: 'rgba(9, 8, 20, 0.34)',
    userBubble: '#6f61d7', aiBubble: '#373551'
  }),
  green: Object.freeze({
    accent: '#8bc9a8', accentLight: '#dff3e7', accentDark: '#3f7d59', accentStrong: '#5aa878',
    bg: '#f1fbf4', card: '#ffffff', muted: '#e8f5ed', paper: '#fffdf8',
    text: '#385345', secondary: '#66796d', hint: '#8da296', border: '#cfe5d7', shadow: 'rgba(65, 108, 80, 0.16)',
    userBubble: '#cfeedd', aiBubble: '#fffdf8'
  }),
  warm: Object.freeze({
    accent: '#e8ae70', accentLight: '#fff0d8', accentDark: '#9a6636', accentStrong: '#c98448',
    bg: '#fff7eb', card: '#fffdf8', muted: '#f7ead8', paper: '#fffaf1',
    text: '#5a4938', secondary: '#806d58', hint: '#a89278', border: '#ead8bf', shadow: 'rgba(123, 89, 48, 0.16)',
    userBubble: '#ffe3ba', aiBubble: '#fffaf1'
  }),
  softPink: Object.freeze({
    accent: '#f3a7c4', accentLight: '#ffe3ee', accentDark: '#a85b7a', accentStrong: '#d8789e',
    bg: '#fff3f7', card: '#fffafa', muted: '#f9e9ef', paper: '#fffdfc',
    text: '#5b4650', secondary: '#806a74', hint: '#aa8f9a', border: '#efd2dd', shadow: 'rgba(128, 74, 96, 0.16)',
    userBubble: '#ffd9e8', aiBubble: '#fffdfc'
  })
});

// 这里的 hex 是 AI 生成主题草案的设计 token 预设，不直接作为 APP 运行样式散写。

export function ensureThemeAgentRegistered() {
  if (registered) return true;
  registerSubAgent({
    id: 'theme-agent',
    name: '主题设计伙伴',
    scope: SUB_AGENT_SCOPES.THEME,
    toolPermissionDomains: [AI_TOOL_SCOPES.THEME_RESOURCE_GENERATION],
    defaultSummary: '主题设计完成',
    handler: runThemeAgentTask
  });
  registered = true;
  return true;
}

export async function runThemeAgentTask(task = {}, context = {}) {
  const permission = canUseAITool('theme-image-generator', {
    permissionDomain: AI_TOOL_SCOPES.THEME_RESOURCE_GENERATION,
    usageScope: AI_TOOL_SCOPES.THEME_RESOURCE_GENERATION,
    write: true
  });
  if (!permission.ok) return buildThemeResult({ ok: false, prompt: task.prompt, styleName: '主题草稿', errors: permission.errors || [] });
  const prompt = String(task.prompt || task.query || '柔软小手机主题').trim();
  const theme = createThemeConfig(buildThemeDraft(prompt));
  const preview = await previewThemeAsync(theme);
  return buildThemeResult({ ok: preview.ok, prompt, theme, preview, errors: preview.errors || [] });
}

function buildThemeDraft(prompt) {
  const lower = prompt.toLowerCase();
  const isCat = /猫|cat|猫猫|猫爪/.test(lower);
  const isNight = /夜|星|梦|深色|night/.test(lower);
  const isGreen = /绿|森林|薄荷|mint|green/.test(lower);
  const isWarm = /奶油|暖|橙|黄|cream|warm|sun/.test(lower);
  const palette = isNight
    ? THEME_DRAFT_PALETTES.night
    : isGreen
      ? THEME_DRAFT_PALETTES.green
      : isWarm
        ? THEME_DRAFT_PALETTES.warm
        : THEME_DRAFT_PALETTES.softPink;
  return {
    themeVariables: {
      accent: palette.accent,
      'accent-light': palette.accentLight,
      'accent-dark': palette.accentDark,
      'accent-strong': palette.accentStrong,
      'bg-primary': palette.bg,
      'bg-card': palette.card,
      'text-primary': palette.text,
      'text-secondary': palette.secondary,
      'text-hint': palette.hint,
      'border-soft': palette.border,
      'shadow-color': palette.shadow,
      'surface-muted': palette.muted,
      'surface-paper': palette.paper,
      'bubble-user-bg': palette.userBubble,
      'bubble-user-text': palette.text,
      'bubble-ai-bg': palette.aiBubble,
      'bubble-ai-text': palette.text,
      'radius-md': '22px',
      'radius-lg': '26px'
    },
    imageSlots: {
      app_widget_area_bg: { required: true, reason: isCat ? '需要一张猫爪或铃铛装饰图。' : '需要一张柔和装饰图。' }
    },
    themeConfig: {
      themeName: isCat ? '猫猫软窝主题' : isNight ? '星夜软梦主题' : isGreen ? '薄荷小森林主题' : isWarm ? '奶油暖光主题' : '柔软小手机主题',
      description: `根据“${prompt}”生成的主题草稿。`,
      metadata: { agent: 'theme-agent', source: 'sub-agent' }
    },
    uiDecorationParameters: { roundness: 0.86, decorDensity: isCat ? 0.72 : 0.58, decorIntensity: isNight ? 0.5 : 0.62, decorEnabled: 1 }
  };
}

function buildThemeResult({ ok, prompt = '', theme = null, preview = null, errors = [] }) {
  const cfg = theme?.themeConfig || {};
  const slots = Object.keys(theme?.imageSlots || {});
  return {
    ok: ok !== false,
    userSummary: ok === false ? '主题设计还没贴好' : '主题设计完成',
    internalResult: {
      kind: 'theme',
      task: prompt || '主题设计',
      status: ok === false ? 'failed' : 'completed',
      processSummary: '已理解需求，生成主题变量、装饰参数和图片资源位，并调用主题预览链路。',
      resultSummary: ok === false ? `预览还没贴好：${errors.join('、')}` : `已生成「${cfg.themeName || '新主题'}」并进入安全预览。`,
      decisionSummary: 'theme-agent 只使用 theme-resource-generation 权限域和主题预览接口，不触碰开发或审查权限。',
      themeStyle: cfg.themeName || '柔软小手机主题',
      resourcesUsed: slots.length ? slots : ['主题变量', '装饰参数'],
      modifications: Object.keys(theme?.themeVariables || {}),
      previewId: preview?.preview?.previewId || ''
    }
  };
}

ensureThemeAgentRegistered();
