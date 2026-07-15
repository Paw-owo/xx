// tests/test_mcp_auth_headers.mjs
// 回归测试：MCP 连接链路认证头拼装与 URL 归一化
// 运行：node tests/test_mcp_auth_headers.mjs
//
// 覆盖本轮修复的两个根因：
//   1. buildHeaders 支持自定义认证头名（apiKeyHeader）
//      - 用户填 x-phone-token 时，必须发 x-phone-token 头，而不是 Authorization: Bearer
//      - 不填 apiKeyHeader 时，回退默认 Authorization: Bearer
//   2. normalizeSseUrl 把裸域名 / /mcp / /mcp/sse 三种形态统一到 /mcp/sse
//
// 注意：测试只用占位假值（test-key / dummy），不涉及任何真实凭据。

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg); }
}
// HTTP header 名大小写不敏感（fetch 会自动归一化），测试也按大小写不敏感判定
function getHeaderCI(haystack, name) {
  const lower = String(name).toLowerCase();
  for (const k of Object.keys(haystack)) {
    if (k.toLowerCase() === lower) return haystack[k];
  }
  return undefined;
}
function hasHeaderCI(haystack, name) {
  const lower = String(name).toLowerCase();
  return Object.keys(haystack).some(k => k.toLowerCase() === lower);
}
function assertHas(haystack, needle, msg) {
  const ok = hasHeaderCI(haystack, needle);
  if (ok) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg, '\n    应包含 header:', JSON.stringify(needle)); }
}
function assertNo(haystack, needle, msg) {
  const ok = !hasHeaderCI(haystack, needle);
  if (ok) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg, '\n    不应包含 header:', JSON.stringify(needle)); }
}

// ═══════════════════════════════════════
// DOM / 全局 mock（mcp.js 顶层不依赖，但 import 时 storage.js 可能触碰）
// ═══════════════════════════════════════
const localStorageStore = new Map();
globalThis.localStorage = {
  getItem: (key) => localStorageStore.has(key) ? localStorageStore.get(key) : null,
  setItem: (key, val) => localStorageStore.set(key, String(val)),
  removeItem: (key) => localStorageStore.delete(key)
};
globalThis.window = {};
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    writable: true, configurable: true
  });
} catch (_) { /* navigator 已存在即可 */ }

// ═══════════════════════════════════════
// 加载真实生产模块的测试钩子
// ═══════════════════════════════════════
const { __testHooks } = await import('../core/mcp.js');
const { buildHeaders, normalizeSseUrl } = __testHooks;

console.log('\n[组 1] buildHeaders — 自定义认证头（apiKeyHeader 生效）');

// 用例 1：用户填 x-phone-token → 必须发 x-phone-token 头，不发 Authorization
{
  const h = buildHeaders(null, 'test-key', 'text/event-stream', 'x-phone-token');
  assertHas(h, 'x-phone-token', 'apiKeyHeader=x-phone-token 时生成 x-phone-token 头');
  assertNo(h, 'authorization', 'apiKeyHeader 生效时不生成 Authorization 头');
  assert(getHeaderCI(h, 'x-phone-token') === 'test-key', 'x-phone-token 头值为 apiKey 原值（不加 Bearer 前缀）');
  assertHas(h, 'content-type', '始终带 Content-Type');
  assert(getHeaderCI(h, 'content-type') === 'application/json', 'Content-Type 为 application/json');
  assert(getHeaderCI(h, 'accept') === 'text/event-stream', 'Accept 透传');
}

// 用例 2：大小写不敏感（用户可能填 X-Phone-Token）
{
  const h = buildHeaders(null, 'test-key', 'text/event-stream', 'X-Phone-Token');
  assertHas(h, 'x-phone-token', 'apiKeyHeader 大写自动归一化为小写头名');
  assertNo(h, 'authorization', '大写 apiKeyHeader 同样不发 Authorization');
}

// 用例 3：apiKeyHeader 为空字符串 → 默认 Bearer
{
  const h = buildHeaders(null, 'test-key', 'text/event-stream', '');
  assertHas(h, 'authorization', 'apiKeyHeader 为空时回退 Authorization 头');
  assert(getHeaderCI(h, 'authorization') === 'Bearer test-key', 'Authorization 头格式为 Bearer <apiKey>');
  assertNo(h, 'x-phone-token', 'apiKeyHeader 为空时不生成 x-phone-token 头');
}

// 用例 4：apiKeyHeader 未传（undefined）→ 默认 Bearer
{
  const h = buildHeaders(null, 'test-key', 'text/event-stream');
  assertHas(h, 'authorization', 'apiKeyHeader 未传时回退 Authorization 头');
  assert(getHeaderCI(h, 'authorization') === 'Bearer test-key', 'Authorization 头格式为 Bearer <apiKey>');
}

// 用例 5：其他自定义头名（x-api-key）
{
  const h = buildHeaders(null, 'test-key', null, 'x-api-key');
  assertHas(h, 'x-api-key', 'apiKeyHeader=x-api-key 时生成 x-api-key 头');
  assertNo(h, 'authorization', 'x-api-key 生效时不生成 Authorization 头');
  assert(getHeaderCI(h, 'x-api-key') === 'test-key', 'x-api-key 头值为 apiKey 原值');
}

console.log('\n[组 2] buildHeaders — 无 apiKey / sessionId 行为');

// 用例 6：没有 apiKey → 不发任何认证头
{
  const h = buildHeaders('sid-123', '', 'application/json, text/event-stream', 'x-phone-token');
  assertNo(h, 'authorization', '无 apiKey 时不发 Authorization');
  assertNo(h, 'x-phone-token', '无 apiKey 时不发 x-phone-token（即便指定了 apiKeyHeader）');
  assertHas(h, 'mcp-session-id', 'sessionId 仍写入 Mcp-Session-Id');
  assert(getHeaderCI(h, 'mcp-session-id') === 'sid-123', 'Mcp-Session-Id 值透传');
}

// 用例 7：sessionId + apiKey + apiKeyHeader 同时存在
{
  const h = buildHeaders('sid-456', 'test-key', 'text/event-stream', 'x-phone-token');
  assertHas(h, 'x-phone-token', 'sessionId 存在时 apiKeyHeader 仍生效');
  assertHas(h, 'mcp-session-id', 'sessionId 写入 Mcp-Session-Id');
  assert(getHeaderCI(h, 'mcp-session-id') === 'sid-456', 'Mcp-Session-Id 值正确');
  assert(getHeaderCI(h, 'x-phone-token') === 'test-key', 'x-phone-token 值正确');
}

console.log('\n[组 3] normalizeSseUrl — URL 归一化（防重复 /mcp、补 /mcp/sse）');

// 用例 8：裸域名 → 补 /mcp/sse
{
  const u = normalizeSseUrl('https://kiss.eoty.cn');
  assert(u === 'https://kiss.eoty.cn/mcp/sse', '裸域名补 /mcp/sse');
}

// 用例 9：以 /mcp 结尾 → 补 /sse
{
  const u = normalizeSseUrl('https://kiss.eoty.cn/mcp');
  assert(u === 'https://kiss.eoty.cn/mcp/sse', '/mcp 结尾补 /sse');
}

// 用例 10：以 /mcp/sse 结尾 → 原样
{
  const u = normalizeSseUrl('https://kiss.eoty.cn/mcp/sse');
  assert(u === 'https://kiss.eoty.cn/mcp/sse', '/mcp/sse 结尾原样保留');
}

// 用例 11：末尾斜杠 → 去掉再归一化
{
  const u = normalizeSseUrl('https://kiss.eoty.cn/mcp/sse/');
  assert(u === 'https://kiss.eoty.cn/mcp/sse', '末尾斜杠去掉后归一化');
}

// 用例 12：末尾多斜杠
{
  const u = normalizeSseUrl('https://kiss.eoty.cn///');
  assert(u === 'https://kiss.eoty.cn/mcp/sse', '末尾多斜杠去掉后补 /mcp/sse');
}

// 用例 13：空字符串
{
  const u = normalizeSseUrl('');
  assert(u === '', '空字符串返回空');
}

// 用例 14：防重复 /mcp（用户已填 /mcp/sse 不应变成 /mcp/sse/mcp/sse）
{
  const u = normalizeSseUrl('https://kiss.eoty.cn/mcp/sse');
  assert(!u.includes('/mcp/sse/mcp'), '不会重复拼接 /mcp');
}

console.log('\n[组 4] 防回归 — 历史死配置不应影响连接');

// 用例 15：buildHeaders 不读 sseEndpoint / messageEndpoint（这些是历史死字段）
// 间接验证：buildHeaders 签名只有 4 个参数，不接受 sseEndpoint/messageEndpoint
{
  const h = buildHeaders(null, 'test-key', 'text/event-stream', 'x-phone-token');
  const keys = Object.keys(h).sort();
  const noDeadFields = !keys.includes('sseEndpoint') && !keys.includes('messageEndpoint');
  assert(noDeadFields, 'buildHeaders 不产出 sseEndpoint/messageEndpoint 死字段');
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  process.exit(1);
}
