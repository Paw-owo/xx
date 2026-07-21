// tests/test_round5_experience_closure.mjs
// 静态校验第 5 回合体验/审美收口：软输入弹层、MCP 空状态入口、温柔失败提示、主题 token 收敛、API 状态文案。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const imageUrl = readFileSync('core/image-url.js', 'utf8');
const sheets = readFileSync('apps/chat/thread-sheets.js', 'utf8');
const actions = readFileSync('apps/chat/thread-actions.js', 'utf8');
const apiPool = readFileSync('apps/settings/api-pool-settings.js', 'utf8');
const themeStudio = readFileSync('apps/theme-studio.js', 'utf8');
const themeAgent = readFileSync('apps/chat/theme-agent.js', 'utf8');
const icons = readFileSync('core/default-app-icons.js', 'utf8');
const settings = readFileSync('apps/settings.js', 'utf8');

assert.doesNotMatch(imageUrl, /window\.prompt|\bprompt\(/, '图片 URL 不再使用原生 prompt');
assert.match(imageUrl, /openImageUrlDialog/, '图片 URL 使用项目内软弹层');
assert.match(imageUrl, /先贴一条图片地址哦/, '图片 URL 软弹层有空值校验文案');
assert.match(imageUrl, /只支持 http 或 https/, '图片 URL 软弹层有 URL 协议校验文案');
assert.match(imageUrl, /var\(--bg-card\)/, '图片 URL 软弹层样式使用 CSS 变量');

assert.match(sheets, /openApp\('settings', \{ section: 'mcp' \}\)/, 'MCP 空状态能跳到设置中心 MCP 区');
assert.match(settings, /normalizeInitialSection[\s\S]*'mcp'/, '设置页支持按 section 进入 MCP 配置区');
assert.match(sheets, /MCP\/外部工具/, 'MCP 空状态保留外部工具说明');
assert.match(sheets, /去设置中心/, 'MCP 空状态提供可操作入口');

assert.doesNotMatch(actions, /模块还没接上|模块没接上/, '动态加载失败提示不再暴露实现层文案');
assert.match(actions, /刷新一下|检查 API 设置|稍后再试/, 'AI 回复失败提示提供恢复方向');
assert.match(actions, /console\.(warn|error)/, '动态加载失败仍保留 console 诊断');

assert.match(apiPool, /还没拉过模型/, '模型列表区区分还没拉过');
assert.match(apiPool, /这次没有读到模型列表/, '模型列表区区分这次为空');
assert.match(apiPool, /可能 Key 或权限不对/, '模型列表区提示 Key 或权限问题');
assert.match(apiPool, /可能不支持列模型/, '模型列表区提示接口可能不支持列模型');
assert.match(apiPool, /最近测通|最近没连上|最近原因/, '接口状态展示包含最近时间或失败原因');

assert.match(themeStudio, /STARTER_THEME_TOKENS/, '主题工坊草案色板收敛为 token 预设');
assert.match(themeAgent, /THEME_DRAFT_PALETTES/, '主题子智能体草案色板收敛为 token 预设');
assert.match(themeStudio + themeAgent, /AI .*主题.*token|设计 token/, '主题色板说明它们是 AI 主题 token 参考');

assert.match(icons, /showTinyDecoration/, '默认图标小尺寸会收起额外装饰');
assert.doesNotMatch(icons, /emoji/i, '默认图标仍不是 emoji 路径');

console.log('round 5 experience closure checks passed');
