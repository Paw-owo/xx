// tests/test_round4_experience_fixes.mjs
// 静态校验第 4 回合体验修复：输入栏样式权威源、焦点态、APP 失败提示、耳朵配置语义。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const threadJs = readFileSync('apps/chat/thread.js', 'utf8');
const threadCss = readFileSync('apps/chat/thread-style.css', 'utf8');
const html = readFileSync('index.html', 'utf8');
const style = readFileSync('style.css', 'utf8');
const apiPool = readFileSync('apps/settings/api-pool-settings.js', 'utf8');
const ear = readFileSync('apps/chat/sensory-ear.js', 'utf8');
const api = readFileSync('core/api.js', 'utf8');

assert.match(threadJs, /ensureThreadStyleSheet\(\)/, '聊天线程会加载 CSS 权威样式文件');
assert.doesNotMatch(threadJs, /\.chat-thread-input-bar\s*\{/, 'thread.js 不再维护输入栏 grid 布局');
assert.match(threadCss, /\.chat-thread-input-bar\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto auto auto;/, '输入栏五列布局以 CSS 文件为准');
assert.match(threadCss, /@media \(max-width: 380px\)[\s\S]*\.chat-thread-input-bar/, '窄屏输入栏有 CSS 收紧策略');
assert.match(threadCss, /\.chat-pending-images\s*\{[\s\S]*grid-column:\s*1 \/ -1/, '待发图片预览仍跨整行显示');
assert.match(threadCss, /\.chat-recording-bar\s*\{[\s\S]*grid-column:\s*1 \/ -1/, '录音状态栏仍跨整行显示');

assert.doesNotMatch(html, /#app-layer \*:focus/, '桌面拖拽修复不再全局清空 app-layer 焦点');
assert.doesNotMatch(html, /#app-layer button:focus[\s\S]*outline:0!important/, '按钮/输入控件焦点不再被全局清空');
assert.match(style, /:focus-visible[\s\S]*outline:\s*2px solid color-mix\(in srgb, var\(--accent-light\)/, '全局恢复柔和 focus-visible 光圈');
assert.match(html, /\.desktop-icon[\s\S]*outline:0!important/, '桌面图标拖拽相关焦点抑制仍保留在桌面范围');

assert.match(html, /getAppOpenFailureMessage/, 'APP 打开失败有分阶段提示函数');
assert.match(html, /console\.error\('\[desktop\] openApp failed'/, 'console 保留 appId/stage/error 供开发定位');
assert.match(html, /这个入口还没找到/, 'APP 未注册有用户可读提示');
assert.match(html, /再试一次/, '失败占位提供重试操作');
assert.doesNotMatch(html, /哎呀，出了点小问题/, '不再只显示不可操作的通用失败文案');

assert.doesNotMatch(api, /耳朵仅占位|禁止配 endpoint/, 'core/api 耳朵注释不再说仅占位或禁止配置');
assert.doesNotMatch(apiPool, /耳朵仅占位/, '设置页耳朵注释不再说占位');
assert.match(apiPool, /小耳朵是语音转文字接口，不参与聊天模型轮换/, '设置页明确耳朵是 STT 接口');
assert.match(ear, /设置中心的 API 轮换池里，给感官-耳朵加一个语音转文字接口/, '运行时提示引导到感官-耳朵 STT 配置');

console.log('round 4 experience fix checks passed');
