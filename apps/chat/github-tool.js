// apps/chat/github-tool.js
// imports:
//   from '../../core/ui.js': showBottomSheet, hideBottomSheet, showToast
//   from '../../core/storage.js': getData, setData

import { showBottomSheet, hideBottomSheet, showToast, showConfirm, createIcon } from '../../core/ui.js';
import { getData, setData } from '../../core/storage.js';

// ═══════════════════════════════════════
// 【配置存储】敏感数据隔离：Token 单独存键，不与 owner/repo/branch 混存
// 依据 storage-key-rules：敏感凭据独立键，便于审查/清理/未来加加密层时定点改造
// 注意：Token 仍为本机明文（项目无加密基础设施），属于已知 P0 blocker，依赖用户使用最小权限 PAT 缓解
// ═══════════════════════════════════════

const CONFIG_KEY = 'github_tool_config';
const TOKEN_KEY = 'github_tool_token';

// 导出存储键常量，供数据管理（清空全部数据等）统一清理，避免散写
export const GITHUB_TOOL_STORAGE_KEYS = [CONFIG_KEY, TOKEN_KEY];

const DEFAULT_CONFIG = {
  owner: '',
  repo: '',
  branch: 'main'
};

function getToken() {
  // 优先读独立键；若旧版本把 token 混存在 CONFIG_KEY 中，迁移过来并清理旧位置
  const fromTokenKey = getData(TOKEN_KEY, null);
  if (fromTokenKey !== null && fromTokenKey !== undefined) {
    return String(fromTokenKey || '');
  }
  const legacy = getData(CONFIG_KEY, null);
  if (legacy && typeof legacy === 'object' && legacy.token) {
    setData(TOKEN_KEY, String(legacy.token));
    // 清掉 CONFIG_KEY 里的 token 字段，避免两处都存
    const nextLegacy = { ...legacy };
    delete nextLegacy.token;
    setData(CONFIG_KEY, nextLegacy);
    return String(legacy.token);
  }
  return '';
}

function getConfig() {
  const saved = getData(CONFIG_KEY, null);
  const base = (!saved || typeof saved !== 'object') ? { ...DEFAULT_CONFIG } : {
    owner: String(saved.owner || ''),
    repo: String(saved.repo || ''),
    branch: String(saved.branch || 'main') || 'main'
  };
  // token 从独立键读取，避免与 owner/repo/branch 混存
  return {
    token: getToken(),
    owner: base.owner,
    repo: base.repo,
    branch: base.branch
  };
}

function saveConfig(config) {
  // token 单独存键；CONFIG_KEY 只保留非敏感字段
  setData(TOKEN_KEY, String(config.token || ''));
  setData(CONFIG_KEY, {
    owner: String(config.owner || ''),
    repo: String(config.repo || ''),
    branch: String(config.branch || 'main') || 'main'
  });
}

export function getGithubDeveloperConfigSummary() {
  const config = getConfig();
  return {
    configured: Boolean(config.owner && config.repo && config.branch),
    hasToken: Boolean(config.token),
    owner: config.owner,
    repo: config.repo,
    branch: config.branch
  };
}

// ═══════════════════════════════════════
// 【API 请求】GitHub REST API
// ═══════════════════════════════════════

const API_BASE = 'https://api.github.com';

async function githubRequest(path, config, options) {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (config.token) {
    headers['Authorization'] = 'Bearer ' + config.token;
  }

  const fetchOpts = { headers };
  if (options && options.method) {
    fetchOpts.method = options.method;
    if (options.body) {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(options.body);
    }
  }
  // 透传 AbortSignal，供上层关闭抽屉/切换文件时取消请求
  if (options && options.signal) {
    fetchOpts.signal = options.signal;
  }

  let resp;
  try {
    resp = await fetch(API_BASE + path, fetchOpts);
  } catch (err) {
    // abort 不改写错误信息，原样抛出便于上层识别
    if (err && err.name === 'AbortError') throw err;
    throw new Error('网络请求失败，请检查网络连接');
  }

  if (resp.status === 401) {
    throw new Error('Token 无效或已过期，请检查 GitHub Token');
  }
  if (resp.status === 403) {
    const remain = resp.headers.get('X-RateLimit-Remaining');
    if (remain === '0') {
      throw new Error('GitHub API 速率限制，请稍后再试');
    }
    throw new Error('没有权限访问该仓库，请检查 Token 权限');
  }
  if (resp.status === 404) {
    throw new Error('仓库或分支不存在，请检查 owner/repo/branch');
  }
  if (resp.status === 409) {
    throw new Error('提交冲突：文件已被修改，请刷新文件树后重试');
  }
  if (resp.status === 422) {
    let detail = '';
    try { const b = await resp.json(); detail = b && b.message ? b.message : ''; } catch (_) {}
    throw new Error('请求参数有误' + (detail ? '：' + detail : ''));
  }
  if (!resp.ok) {
    let msg = '请求失败 (HTTP ' + resp.status + ')';
    try {
      const body = await resp.json();
      if (body && body.message) msg = body.message;
    } catch (_) {}
    throw new Error(msg);
  }

  // 204 No Content 等无 body 场景
  if (resp.status === 204) return null;
  const text = await resp.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return null; }
}

// 路径按 / 分段编码，避免 / 被整体编码成 %2F
function encodePathSegments(p) {
  return String(p || '').split('/').map(function(seg) { return encodeURIComponent(seg); }).join('/');
}

// 读取文件树
async function fetchTree(config, signal) {
  const path = '/repos/' + encodeURIComponent(config.owner) + '/' + encodeURIComponent(config.repo) +
    '/git/trees/' + encodeURIComponent(config.branch) + '?recursive=1';
  const data = await githubRequest(path, config, signal ? { signal } : undefined);
  if (!data || !Array.isArray(data.tree)) return [];
  // 只返回 blob，目录项过滤掉
  return data.tree.filter(function(item) { return item && item.type === 'blob'; });
}

// 读取文件内容
async function fetchFile(config, fileItem, signal) {
  const path = '/repos/' + encodeURIComponent(config.owner) + '/' + encodeURIComponent(config.repo) +
    '/contents/' + encodePathSegments(fileItem.path) + '?ref=' + encodeURIComponent(config.branch);
  const data = await githubRequest(path, config, signal ? { signal } : undefined);
  return data;
}

// 判断是否二进制文件
function isBinaryPath(path) {
  const exts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
    '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
    '.zip', '.gz', '.tar', '.rar', '.7z', '.pdf', '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.exe', '.dll', '.so', '.dylib', '.bin', '.dat'];
  const lower = String(path || '').toLowerCase();
  return exts.some(function(ext) { return lower.endsWith(ext); });
}

// 安全解码 base64 → 文本
function decodeBase64Utf8(b64) {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch (err) {
    return null;
  }
}

// 中文安全 base64 编码：先 UTF-8 字节再 base64，避免 btoa(plainText) 损坏中文
function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ═══════════════════════════════════════
// 【提交相关 API】分支创建 / 文件提交 / PR
// ═══════════════════════════════════════

// 生成安全的分支名：ai-phone/<safe-file-name>-<timestamp>
function buildBranchName(filePath) {
  const baseName = String(filePath || 'file').split('/').pop() || 'file';
  const safe = baseName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[.-]+|[.-]+$/g, '') || 'file';
  const ts = Date.now().toString(36);
  return 'ai-phone/' + safe + '-' + ts;
}

// 读取 base branch 最新 sha
async function fetchBaseBranchSha(config, signal) {
  const path = '/repos/' + encodeURIComponent(config.owner) + '/' + encodeURIComponent(config.repo) +
    '/git/ref/heads/' + encodeURIComponent(config.branch);
  const data = await githubRequest(path, config, signal ? { signal } : undefined);
  if (!data || !data.object || !data.object.sha) {
    throw new Error('无法读取分支 ' + config.branch + ' 的最新提交');
  }
  return data.object.sha;
}

// 创建新分支，基于 baseSha
async function createBranch(config, branchName, baseSha, signal) {
  const path = '/repos/' + encodeURIComponent(config.owner) + '/' + encodeURIComponent(config.repo) + '/git/refs';
  const data = await githubRequest(path, config, {
    method: 'POST',
    body: { ref: 'refs/heads/' + branchName, sha: baseSha },
    ...(signal ? { signal } : {})
  });
  return data;
}

// PUT 文件内容到指定分支
async function putFileContent(config, filePath, params, signal) {
  // params: { message, content(base64), branch, sha }
  const path = '/repos/' + encodeURIComponent(config.owner) + '/' + encodeURIComponent(config.repo) +
    '/contents/' + encodePathSegments(filePath);
  const data = await githubRequest(path, config, {
    method: 'PUT',
    body: {
      message: params.message,
      content: params.content,
      branch: params.branch,
      sha: params.sha
    },
    ...(signal ? { signal } : {})
  });
  return data;
}

// 创建 Pull Request
async function createPullRequest(config, params, signal) {
  // params: { title, head, base, body }
  const path = '/repos/' + encodeURIComponent(config.owner) + '/' + encodeURIComponent(config.repo) + '/pulls';
  const data = await githubRequest(path, config, {
    method: 'POST',
    body: {
      title: params.title,
      head: params.head,
      base: params.base,
      body: params.body || '由小手机 GitHub 工具创建'
    },
    ...(signal ? { signal } : {})
  });
  return data;
}

export async function runGithubDeveloperTask(task = {}, options = {}) {
  const config = getConfig();
  const status = createDeveloperStatus();
  const prompt = String(task.prompt || task.query || '').trim();
  const allowWrite = options.allowWrite === true || task.allowWrite === true;
  if (!config.owner || !config.repo || !config.branch) {
    return buildDeveloperResult({
      ok: false,
      status: 'failed',
      task: prompt || '开发协作',
      summary: '还没有选好仓库，先去 GitHub 工具里补一下 owner、repo 和 branch。',
      processSummary: '读取 GitHub 配置时发现仓库信息还不完整。',
      resultSummary: '没有读取或修改任何文件。',
      decisionSummary: 'developer-agent 只能使用 development 权限域和现有 GitHub 工具，不能绕过配置直接访问仓库。',
      risks: ['需要先保存 GitHub 仓库配置。'],
      statusTimeline: status.push('failed', '仓库配置不完整')
    });
  }

  try {
    status.push('analyzing', '正在分析代码');
    const tree = await fetchTree(config, options.signal);
    const codeFiles = tree.filter((item) => item?.path && !isBinaryPath(item.path));
    const selected = selectDeveloperFiles(codeFiles, task);
    status.push('reading', `读取 ${selected.length} 个文件`);
    const fileReads = [];
    for (const file of selected) {
      const data = await fetchFile(config, file, options.signal);
      const content = data?.encoding === 'base64' ? decodeBase64Utf8(data.content || '') : String(data?.content || '');
      if (content === null) continue;
      fileReads.push({ path: file.path, sha: data?.sha || file.sha || '', content: String(content || '') });
    }

    const analysis = analyzeDeveloperFiles(fileReads, prompt);
    const writePlan = normalizeDeveloperChanges(task.changes, fileReads);
    const modifiedFiles = [];
    let prUrl = '';
    let branchName = '';

    if (writePlan.length && allowWrite) {
      status.push('modifying', `准备修改 ${writePlan.length} 个文件`);
      const baseSha = await fetchBaseBranchSha(config, options.signal);
      branchName = buildBranchName(writePlan[0].path || 'developer-agent');
      await createBranch(config, branchName, baseSha, options.signal);
      for (const change of writePlan) {
        const source = fileReads.find((item) => item.path === change.path);
        const nextText = applyDeveloperChange(source?.content || '', change);
        await putFileContent(config, change.path, {
          message: String(task.commitMessage || `developer-agent: update ${change.path}`),
          content: encodeBase64Utf8(nextText),
          branch: branchName,
          sha: source?.sha || change.sha || ''
        }, options.signal);
        modifiedFiles.push(change.path);
      }
      const pr = await createPullRequest(config, {
        title: String(task.prTitle || task.commitMessage || 'developer-agent 开发协作'),
        head: branchName,
        base: config.branch,
        body: String(task.prBody || buildDeveloperPrBody(prompt, analysis, modifiedFiles))
      }, options.signal);
      prUrl = pr?.html_url || '';
    } else if (writePlan.length && !allowWrite) {
      status.push('modifying', '已生成修改方案，等待明确授权后再写入');
    }

    status.push('testing', '整理可执行检查');
    const tests = buildDeveloperTestSummary(task, fileReads, modifiedFiles);
    status.push('completed', modifiedFiles.length ? '修复完成' : `发现${analysis.issues.length}个问题`);
    return buildDeveloperResult({
      ok: true,
      status: 'completed',
      task: prompt || '开发协作',
      summary: modifiedFiles.length ? '修复完成' : `发现${analysis.issues.length}个问题`,
      processSummary: `已读取 ${fileReads.length} 个文件，梳理了相关导入/调用线索。`,
      resultSummary: analysis.summary,
      decisionSummary: writePlan.length
        ? (allowWrite ? '用户已授权开发写入，修改通过 GitHub 工具提交到新分支并创建 PR。' : '检测到修改意图，但没有明确写入授权，所以只生成方案不写文件。')
        : '当前任务以读取和分析为主，没有执行文件写入。',
      filesRead: fileReads.map((item) => item.path),
      modifiedFiles,
      tests,
      risks: analysis.risks,
      prUrl,
      branchName,
      statusTimeline: status.items
    });
  } catch (error) {
    status.push('failed', String(error?.message || error));
    return buildDeveloperResult({
      ok: false,
      status: 'failed',
      task: prompt || '开发协作',
      summary: '开发小伙伴刚刚没跑顺。',
      processSummary: '已经通过 GitHub 工具发起开发任务，但中途遇到阻碍。',
      resultSummary: String(error?.message || error),
      decisionSummary: '失败后没有继续扩大权限，也没有绕过 GitHub 工具重试写入。',
      risks: [String(error?.message || error)],
      statusTimeline: status.items
    });
  }
}

function createDeveloperStatus() {
  const items = [];
  return {
    items,
    push(status, label) {
      const item = { status, label: String(label || ''), at: new Date().toISOString() };
      items.push(item);
      return items;
    }
  };
}

function selectDeveloperFiles(files = [], task = {}) {
  const requested = Array.isArray(task.files) ? task.files.map(String).filter(Boolean) : [];
  if (requested.length) {
    const wanted = new Set(requested);
    return files.filter((item) => wanted.has(item.path)).slice(0, 8);
  }
  const prompt = String(task.prompt || '').toLowerCase();
  const preferred = files
    .map((item) => ({ item, score: scoreDeveloperPath(item.path, prompt) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
  return (preferred.length ? preferred : files.filter((item) => /(^|\/)(package\.json|README\.md|index\.html|src\/|apps\/|core\/)/i.test(item.path))).slice(0, 8);
}

function scoreDeveloperPath(path, prompt) {
  const lower = String(path || '').toLowerCase();
  let score = 0;
  if (/\.(js|mjs|ts|tsx|jsx|json|html|css|md)$/i.test(lower)) score += 2;
  String(prompt || '').split(/[\s,，。:：/\\_-]+/).filter((word) => word.length >= 2).forEach((word) => {
    if (lower.includes(word)) score += 3;
  });
  if (/bug|fix|修复|问题/.test(prompt) && /(test|spec|thread|api|core|app)/.test(lower)) score += 1;
  return score;
}

function analyzeDeveloperFiles(files = [], prompt = '') {
  const issues = [];
  const imports = [];
  const risks = [];
  for (const file of files) {
    const lines = String(file.content || '').split('\n');
    lines.forEach((line, index) => {
      if (/TODO|FIXME|console\.error|throw new Error\(['"]请求失败|unknown|未知错误/.test(line)) {
        issues.push(`${file.path}:${index + 1} 需要留意 ${line.trim().slice(0, 80)}`);
      }
      const m = line.match(/import\s+.*?from\s+['"](.+?)['"]/);
      if (m) imports.push(`${file.path} -> ${m[1]}`);
    });
    if (file.content.length > 60000) risks.push(`${file.path} 文件较大，建议分段审查。`);
  }
  if (!issues.length && files.length) issues.push('没有发现明显的 TODO/FIXME 或错误占位，建议继续结合具体复现步骤检查。');
  return {
    issues,
    imports: imports.slice(0, 12),
    risks,
    summary: `读取 ${files.length} 个文件，发现 ${issues.length} 个需要确认的点。${imports.length ? `梳理到 ${imports.length} 条导入关系。` : ''}`
  };
}

function normalizeDeveloperChanges(changes, files = []) {
  if (!Array.isArray(changes)) return [];
  return changes
    .filter((change) => change && typeof change === 'object' && change.path)
    .filter((change) => !isBinaryPath(change.path))
    .map((change) => {
      const source = files.find((item) => item.path === change.path);
      return {
        path: String(change.path),
        sha: String(change.sha || source?.sha || ''),
        content: typeof change.content === 'string' ? change.content : undefined,
        search: typeof change.search === 'string' ? change.search : '',
        replace: typeof change.replace === 'string' ? change.replace : ''
      };
    });
}

function applyDeveloperChange(currentText, change) {
  if (typeof change.content === 'string') return change.content;
  if (change.search) return String(currentText || '').replace(change.search, change.replace || '');
  return String(currentText || '');
}

function buildDeveloperTestSummary(task, files, modifiedFiles) {
  const checks = [];
  checks.push({ command: 'GitHub contents/read', status: files.length ? 'passed' : 'warning', summary: files.length ? `已读取 ${files.length} 个文件。` : '没有读取到可分析文件。' });
  checks.push({ command: 'static-import-scan', status: 'passed', summary: '已基于读取到的文件做静态导入和风险扫描。' });
  if (modifiedFiles.length) checks.push({ command: 'GitHub contents/write + pull request', status: 'passed', summary: `已提交 ${modifiedFiles.length} 个文件到新分支。` });
  else checks.push({ command: String(task.testCommand || 'remote-tests'), status: 'warning', summary: 'GitHub REST 工具没有远程测试运行器，未执行项目测试命令。' });
  return checks;
}

function buildDeveloperPrBody(prompt, analysis, modifiedFiles) {
  return [
    '由小手机 developer-agent 通过 GitHub 工具创建。',
    '',
    '任务：',
    prompt || '开发协作',
    '',
    '修改文件：',
    modifiedFiles.length ? modifiedFiles.map((file) => '- ' + file).join('\n') : '- 无',
    '',
    '分析摘要：',
    analysis.summary
  ].join('\n');
}

function buildDeveloperResult(input) {
  return {
    ok: input.ok !== false,
    userSummary: input.summary || (input.ok === false ? '开发任务没有跑顺' : '开发任务完成'),
    internalResult: {
      kind: 'developer',
      task: input.task || '开发协作',
      status: input.status || 'completed',
      processSummary: input.processSummary || '',
      resultSummary: input.resultSummary || input.summary || '',
      decisionSummary: input.decisionSummary || '',
      filesRead: input.filesRead || [],
      modifiedFiles: input.modifiedFiles || [],
      tests: input.tests || [],
      risks: input.risks || [],
      prUrl: input.prUrl || '',
      branchName: input.branchName || '',
      statusTimeline: input.statusTimeline || []
    }
  };
}

// ═══════════════════════════════════════
// 【样式注入】只注入一次
// ═══════════════════════════════════════

const STYLE_ID = 'github-tool-style';
const STYLE_CSS = `
.gh-sheet { padding: 16px 16px calc(20px + env(safe-area-inset-bottom)); max-height: 78vh; display: flex; flex-direction: column; gap: 12px; }
.gh-title { font-size: 17px; font-weight: 600; color: var(--text-primary); }
.gh-sub { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
.gh-field { display: flex; flex-direction: column; gap: 5px; }
.gh-field label { font-size: 12px; color: var(--text-secondary); font-weight: 500; }
.gh-field input { width: 100%; height: 40px; padding: 0 12px; border-radius: 12px; background: var(--bg-card); color: var(--text-primary); font-size: 14px; border: 1px solid transparent; }
.gh-field input:focus { border-color: var(--accent); }
.gh-actions { display: flex; gap: 8px; }
.gh-btn { flex: 1; height: 42px; border-radius: 12px; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.gh-btn-primary { background: var(--accent); color: var(--bubble-user-text); }
.gh-btn-secondary { background: var(--bg-card); color: var(--text-primary); }
.gh-btn:active { transform: scale(0.97); }
.gh-divider { height: 1px; background: var(--border-soft, color-mix(in srgb, var(--text-primary) 10%, transparent)); margin: 4px 0; }
.gh-search { width: 100%; height: 36px; padding: 0 12px; border-radius: 10px; background: var(--bg-card); color: var(--text-primary); font-size: 13px; border: 1px solid transparent; }
.gh-search:focus { border-color: var(--accent); }
.gh-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; min-height: 120px; max-height: 50vh; }
.gh-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; cursor: pointer; font-size: 13px; color: var(--text-primary); background: transparent; text-align: left; width: 100%; }
.gh-item:active { background: var(--bg-card); }
.gh-item-icon { flex: 0 0 auto; width: 16px; height: 16px; color: var(--text-secondary); }
.gh-item-path { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono, monospace); font-size: 12px; }
.gh-loading { display: flex; align-items: center; justify-content: center; padding: 24px; color: var(--text-secondary); font-size: 13px; }
.gh-empty { display: flex; align-items: center; justify-content: center; padding: 24px; color: var(--text-secondary); font-size: 13px; text-align: center; }
.gh-error { display: flex; align-items: center; justify-content: center; padding: 16px; color: var(--accent); font-size: 13px; text-align: center; line-height: 1.5; }
.gh-viewer { flex: 1; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.gh-viewer-path { font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono, monospace); word-break: break-all; }
.gh-viewer-sha { font-size: 11px; color: var(--text-tertiary, var(--text-secondary)); font-family: var(--font-mono, monospace); }
.gh-viewer textarea { width: 100%; flex: 1; min-height: 200px; max-height: 50vh; padding: 12px; border-radius: 12px; background: var(--bg-card); color: var(--text-primary); font-family: var(--font-mono, monospace); font-size: 12px; line-height: 1.5; resize: none; border: 1px solid transparent; }
.gh-viewer textarea:focus { border-color: var(--accent); }
.gh-edit-textarea { min-height: 240px; max-height: 40vh; }
.gh-back-row { display: flex; align-items: center; gap: 8px; }
.gh-back-btn { background: var(--bg-card); color: var(--text-primary); padding: 6px 14px; border-radius: 10px; font-size: 13px; font-weight: 500; cursor: pointer; }
.gh-back-btn:active { transform: scale(0.97); }
.gh-hint { font-size: 11px; color: var(--text-tertiary, var(--text-secondary)); line-height: 1.4; }
.gh-commit-field { display: flex; flex-direction: column; gap: 5px; }
.gh-commit-field label { font-size: 12px; color: var(--text-secondary); font-weight: 500; }
.gh-commit-field input { width: 100%; height: 38px; padding: 0 12px; border-radius: 10px; background: var(--bg-card); color: var(--text-primary); font-size: 13px; border: 1px solid transparent; }
.gh-commit-field input:focus { border-color: var(--accent); }
.gh-submit-btn { width: 100%; height: 44px; border-radius: 12px; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; cursor: pointer; background: var(--accent); color: var(--bubble-user-text); }
.gh-submit-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.gh-submit-btn:active:not(:disabled) { transform: scale(0.97); }
.gh-status { font-size: 12px; color: var(--text-secondary); padding: 8px 12px; border-radius: 10px; background: var(--bg-card); line-height: 1.5; }
.gh-status-error { color: var(--accent); }
.gh-status-success { color: var(--color-success); }
.gh-pr-link { display: inline-block; padding: 10px 14px; border-radius: 10px; background: var(--accent); color: var(--bubble-user-text); font-size: 13px; font-weight: 600; text-decoration: none; margin-top: 4px; word-break: break-all; }
.gh-pr-link:active { transform: scale(0.97); }
.gh-branch-info { font-size: 11px; color: var(--text-tertiary, var(--text-secondary)); font-family: var(--font-mono, monospace); word-break: break-all; }
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_CSS;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════
// 【UI 构建】配置页 / 文件树页 / 文件内容页
// ═══════════════════════════════════════

const FILE_ICON_SVG = '<svg class="gh-item-icon" viewBox="0 0 16 16" fill="none"><path d="M4 2.5h5L13 6.5v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5"/><path d="M9 2.5v4h4" stroke="currentColor" stroke-width="1.5"/></svg>';

function buildConfigView(config, onSave, onContinue) {
  const wrap = document.createElement('div');
  wrap.className = 'gh-sheet';

  const title = document.createElement('div');
  title.className = 'gh-title';
  title.textContent = 'GitHub 仓库浏览';
  wrap.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'gh-sub';
  sub.textContent = 'Token 仅本机明文保存（不会上云），请使用最小权限 PAT：只读浏览勾选 contents:read；编辑文件需 contents:write。不要给 repo 全权限或 admin。';
  wrap.appendChild(sub);

  const fields = [
    { key: 'token', label: 'GitHub Token', type: 'password', placeholder: 'ghp_... 或 github_pat_...' },
    { key: 'owner', label: 'Owner', type: 'text', placeholder: '用户名或组织名' },
    { key: 'repo', label: 'Repo', type: 'text', placeholder: '仓库名' },
    { key: 'branch', label: 'Branch', type: 'text', placeholder: 'main' }
  ];

  const inputs = {};
  fields.forEach(function(f) {
    const field = document.createElement('div');
    field.className = 'gh-field';
    const label = document.createElement('label');
    label.textContent = f.label;
    const input = document.createElement('input');
    input.type = f.type;
    input.value = config[f.key] || '';
    input.placeholder = f.placeholder;
    inputs[f.key] = input;
    field.append(label, input);
    wrap.appendChild(field);
  });

  const actions = document.createElement('div');
  actions.className = 'gh-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'gh-btn gh-btn-secondary';
  saveBtn.textContent = '保存配置';
  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.className = 'gh-btn gh-btn-primary';
  loadBtn.textContent = '加载文件树';
  actions.append(saveBtn, loadBtn);
  wrap.appendChild(actions);

  const hint = document.createElement('div');
  hint.className = 'gh-hint';
  hint.textContent = '编辑文件后提交到新分支并自动创建 PR，不直接推 main。';
  wrap.appendChild(hint);

  saveBtn.addEventListener('click', function() {
    const newConfig = {};
    Object.keys(inputs).forEach(function(k) { newConfig[k] = inputs[k].value.trim(); });
    saveConfig(newConfig);
    showToast('配置已保存');
    if (typeof onSave === 'function') onSave(newConfig);
  });

  loadBtn.addEventListener('click', function() {
    const newConfig = {};
    Object.keys(inputs).forEach(function(k) { newConfig[k] = inputs[k].value.trim(); });
    saveConfig(newConfig);
    if (typeof onContinue === 'function') onContinue(newConfig);
  });

  return wrap;
}

function buildTreeView(config, onBack, session) {
  // session: { isClosed, registerAbort } 由 openGithubToolSheet 统一管理
  const isClosed = (session && typeof session.isClosed === 'function') ? session.isClosed : function() { return false; };

  // 独立 AbortController：tree 请求专用，登记到 session，抽屉真正关闭时被 abort
  const treeAbort = new AbortController();
  if (session && typeof session.registerAbort === 'function') {
    session.registerAbort(treeAbort);
  }
  const signal = treeAbort.signal;

  const wrap = document.createElement('div');
  wrap.className = 'gh-sheet';

  const backRow = document.createElement('div');
  backRow.className = 'gh-back-row';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'gh-back-btn';
  backBtn.append(createIcon('back', 16), document.createTextNode('配置'));
  // 离开 tree view 时立即 abort 旧 tree 请求，避免返回后旧请求继续写 UI
  backBtn.addEventListener('click', function() {
    try { treeAbort.abort(); } catch (_) {}
    onBack();
  });
  backRow.appendChild(backBtn);
  wrap.appendChild(backRow);

  const title = document.createElement('div');
  title.className = 'gh-title';
  title.textContent = config.owner + '/' + config.repo;
  wrap.appendChild(title);

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'gh-search';
  search.placeholder = '搜索文件路径…';
  wrap.appendChild(search);

  const list = document.createElement('div');
  list.className = 'gh-list';
  wrap.appendChild(list);

  let allFiles = [];

  function renderList(filter) {
    if (isClosed()) return;
    list.replaceChildren();
    const f = (filter || '').trim().toLowerCase();
    const filtered = f ? allFiles.filter(function(item) { return item.path.toLowerCase().indexOf(f) !== -1; }) : allFiles;

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'gh-empty';
      empty.textContent = allFiles.length ? '没有匹配的文件' : '仓库没有文件';
      list.appendChild(empty);
      return;
    }

    filtered.slice(0, 500).forEach(function(item) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gh-item';
      btn.innerHTML = FILE_ICON_SVG;
      const pathEl = document.createElement('span');
      pathEl.className = 'gh-item-path';
      pathEl.textContent = item.path;
      btn.appendChild(pathEl);
      btn.addEventListener('click', function() {
        if (isClosed()) return;
        showFileViewer(config, item, function() {
          // 返回文件树
          hideBottomSheet();
          if (isClosed()) return;
          showBottomSheet(buildTreeView(config, onBack, session));
        }, session);
      });
      list.appendChild(btn);
    });

    if (filtered.length > 500) {
      const more = document.createElement('div');
      more.className = 'gh-empty';
      more.textContent = '只显示前 500 个，请用搜索缩小范围';
      list.appendChild(more);
    }
  }

  // 加载
  const loading = document.createElement('div');
  loading.className = 'gh-loading';
  loading.textContent = '加载文件树…';
  list.appendChild(loading);

  search.addEventListener('input', function() { renderList(search.value); });

  fetchTree(config, signal).then(function(files) {
    // 守卫：抽屉已关闭或已 abort 时不再写 UI
    if (isClosed() || (signal && signal.aborted)) return;
    allFiles = files;
    renderList('');
  }).catch(function(err) {
    // abort 静默
    if (err && err.name === 'AbortError') return;
    if (isClosed()) return;
    list.replaceChildren();
    const errEl = document.createElement('div');
    errEl.className = 'gh-error';
    errEl.textContent = err.message || '加载失败';
    list.appendChild(errEl);
  }).finally(function() {
    // 若 loading 仍在，清理掉（成功路径已被 renderList replaceChildren 清掉）
    if (isClosed()) return;
    const stillLoading = list.querySelector('.gh-loading');
    if (stillLoading) stillLoading.remove();
  });

  return wrap;
}

function showFileViewer(config, fileItem, onBack, session) {
  // session: { isClosed, signal } 由 openGithubToolSheet 统一管理
  const isClosed = (session && typeof session.isClosed === 'function') ? session.isClosed : function() { return false; };

  const wrap = document.createElement('div');
  wrap.className = 'gh-sheet';

  const backRow = document.createElement('div');
  backRow.className = 'gh-back-row';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'gh-back-btn';
  backBtn.append(createIcon('back', 16), document.createTextNode('文件列表'));
  backBtn.addEventListener('click', onBack);
  backRow.appendChild(backBtn);
  wrap.appendChild(backRow);

  const pathEl = document.createElement('div');
  pathEl.className = 'gh-viewer-path';
  pathEl.textContent = fileItem.path;
  wrap.appendChild(pathEl);

  const viewer = document.createElement('div');
  viewer.className = 'gh-viewer';
  wrap.appendChild(viewer);

  const loading = document.createElement('div');
  loading.className = 'gh-loading';
  loading.textContent = '读取文件内容…';
  viewer.appendChild(loading);

  hideBottomSheet();
  showBottomSheet(wrap);

  // 文件状态：保留 path/sha/原始内容/编辑后内容
  const fileState = {
    path: fileItem.path,
    sha: null,
    originalText: '',
    binary: isBinaryPath(fileItem.path)
  };

  // 每个文件查看器实例持有自己的 abort controller，关闭/返回时由 session cleanup 触发；
  // 同时登记到 session，让 openGithubToolSheet 的统一 cleanup 能取消它
  const fileAbort = new AbortController();
  if (session && typeof session.registerAbort === 'function') {
    session.registerAbort(fileAbort);
  }

  // 请求序列号：防止旧 fetchFile 返回覆盖新文件内容（快速切换文件时）
  const reqSeq = { current: 0 };
  const mySeq = ++reqSeq.current;

  fetchFile(config, { path: fileItem.path }, fileAbort.signal).then(function(data) {
    // 守卫：抽屉已关闭、请求已被新请求取代、或已 abort 时不再写 UI
    if (isClosed() || reqSeq.current !== mySeq || fileAbort.signal.aborted) return;

    viewer.replaceChildren();
    fileState.sha = data && data.sha ? data.sha : null;

    if (fileState.sha) {
      const shaEl = document.createElement('div');
      shaEl.className = 'gh-viewer-sha';
      shaEl.textContent = 'sha: ' + fileState.sha;
      viewer.appendChild(shaEl);
    }

    // 二进制文件不预览也不可编辑
    if (fileState.binary) {
      const hint = document.createElement('div');
      hint.className = 'gh-empty';
      hint.textContent = '这是二进制文件，不适合预览和编辑～';
      viewer.appendChild(hint);
      return;
    }

    // 解码内容
    const encoding = data && data.encoding;
    const content = data && data.content;
    let text = '';
    if (encoding === 'base64' && content) {
      const decoded = decodeBase64Utf8(content.replace(/\n/g, ''));
      if (decoded === null) {
        const hint = document.createElement('div');
        hint.className = 'gh-empty';
        hint.textContent = '文件内容无法解码为文本，可能是二进制文件～';
        viewer.appendChild(hint);
        return;
      }
      text = decoded;
    } else if (typeof content === 'string') {
      text = content;
    } else {
      const hint = document.createElement('div');
      hint.className = 'gh-empty';
      hint.textContent = '文件内容为空或格式不支持';
      viewer.appendChild(hint);
      return;
    }

    fileState.originalText = text;

    // 可编辑 textarea
    const ta = document.createElement('textarea');
    ta.className = 'gh-edit-textarea';
    ta.value = text;
    viewer.appendChild(ta);

    // commit message 输入
    const commitField = document.createElement('div');
    commitField.className = 'gh-commit-field';
    const commitLabel = document.createElement('label');
    commitLabel.textContent = '提交说明';
    const commitInput = document.createElement('input');
    commitInput.type = 'text';
    commitInput.placeholder = '留空将使用可爱默认说明～';
    commitField.append(commitLabel, commitInput);
    viewer.appendChild(commitField);

    // 状态区
    const statusEl = document.createElement('div');
    statusEl.className = 'gh-status';
    statusEl.style.display = 'none';
    viewer.appendChild(statusEl);

    // 提交按钮
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'gh-submit-btn';
    submitBtn.textContent = '提交到新分支并创建 PR';
    submitBtn.disabled = true;
    viewer.appendChild(submitBtn);

    // 内容改动时启用提交按钮
    function updateSubmitState() {
      const changed = ta.value !== fileState.originalText;
      submitBtn.disabled = !changed;
    }
    ta.addEventListener('input', updateSubmitState);

    submitBtn.addEventListener('click', async function() {
      if (submitBtn.disabled) return;
      const message = commitInput.value.trim() || ('更新 ' + fileState.path.split('/').pop() + ' ～');

      // 二次确认：写操作不可撤销，明确告知目标仓库/分支/文件/提交说明
      // 防止误点 / 被诱导 / 配置错仓库导致误改
      const confirmMsg =
        '即将提交到：\n' +
        config.owner + '/' + config.repo + '（新分支）\n' +
        '文件：' + fileState.path + '\n' +
        '说明：' + message + '\n' +
        '提交后会自动开 PR，无法撤销。';
      const ok = await showConfirm(confirmMsg);
      if (!ok) return;
      // 确认期间用户可能关闭了抽屉
      if (isClosed()) return;

      // 提交链路接入 isClosed 守卫与 fileAbort.signal（关闭抽屉后忽略过期结果）
      commitAndCreatePR(config, fileState, ta.value, message, submitBtn, statusEl, commitInput, {
        isClosed: isClosed,
        signal: fileAbort.signal
      });
    });

  }).catch(function(err) {
    // abort 静默
    if (err && err.name === 'AbortError') return;
    if (isClosed() || reqSeq.current !== mySeq) return;
    viewer.replaceChildren();
    const errEl = document.createElement('div');
    errEl.className = 'gh-error';
    errEl.textContent = err.message || '读取失败';
    viewer.appendChild(errEl);
  }).finally(function() {
    if (isClosed()) return;
    const stillLoading = viewer.querySelector('.gh-loading');
    if (stillLoading) stillLoading.remove();
  });
}

// ═══════════════════════════════════════
// 【提交流程】创建分支 → 提交文件 → 创建 PR
// ═══════════════════════════════════════

async function commitAndCreatePR(config, fileState, newText, message, submitBtn, statusEl, commitInput, ctx) {
  // ctx: { isClosed: ()=>boolean, signal?: AbortSignal }
  // 关闭抽屉后所有 UI 写入都被忽略；能取消的请求传 signal，不能取消的请求返回后用 isClosed 守卫忽略结果
  const isClosed = (ctx && typeof ctx.isClosed === 'function') ? ctx.isClosed : function() { return false; };
  const signal = ctx ? ctx.signal : undefined;
  const aborted = function() { return !!(signal && signal.aborted); };

  // 防重复提交
  submitBtn.disabled = true;
  commitInput.disabled = true;

  function showStatus(text, type) {
    if (isClosed() || aborted()) return;
    statusEl.style.display = 'block';
    statusEl.className = 'gh-status' + (type === 'error' ? ' gh-status-error' : type === 'success' ? ' gh-status-success' : '');
    statusEl.textContent = text;
  }

  function fail(err) {
    if (isClosed() || aborted()) return;
    showStatus(err.message || '提交失败', 'error');
    submitBtn.disabled = false;
    commitInput.disabled = false;
  }

  try {
    // 步骤 1: 读取 base branch 最新 sha
    showStatus('正在读取分支信息…');
    const baseSha = await fetchBaseBranchSha(config, signal);
    if (aborted() || isClosed()) return; // 请求返回后忽略过期结果

    // 步骤 2: 创建新分支（分支名冲突有限循环重试，最多 5 次）
    showStatus('正在创建新分支…');
    let branchName = buildBranchName(fileState.path);
    const MAX_BRANCH_RETRY = 5;
    let branchOk = false;
    for (let attempt = 0; attempt < MAX_BRANCH_RETRY; attempt++) {
      if (aborted() || isClosed()) return;
      try {
        await createBranch(config, branchName, baseSha, signal);
        branchOk = true;
        break;
      } catch (err) {
        // abort 直接退出，不重试
        if (err && err.name === 'AbortError') return;
        // 分支已存在：加随机后缀重试（GitHub 422 + "already exists"）
        const msg = String(err.message || '');
        if (msg.indexOf('already exists') !== -1 || msg.indexOf('422') !== -1) {
          branchName = buildBranchName(fileState.path) + '-' + Math.random().toString(36).slice(2, 6);
          continue;
        }
        // 其他错误直接抛出
        throw err;
      }
    }
    if (!branchOk) {
      // 5 次仍冲突，给清晰错误提示
      throw new Error('分支名持续冲突，已重试 ' + MAX_BRANCH_RETRY + ' 次，请稍后重试或手动创建分支');
    }
    if (aborted() || isClosed()) return;

    // 步骤 3: PUT 文件内容到新分支
    showStatus('正在提交文件…');
    const contentBase64 = encodeBase64Utf8(newText);
    const putResult = await putFileContent(config, fileState.path, {
      message: message,
      content: contentBase64,
      branch: branchName,
      sha: fileState.sha
    }, signal);
    if (aborted() || isClosed()) return;

    // 更新 sha
    if (putResult && putResult.content && putResult.content.sha) {
      fileState.sha = putResult.content.sha;
    }

    // 步骤 4: 创建 PR
    showStatus('正在创建 Pull Request…');
    let prUrl = null;
    try {
      const pr = await createPullRequest(config, {
        title: message,
        head: branchName,
        base: config.branch,
        body: '由小手机 GitHub 工具创建'
      }, signal);
      if (aborted() || isClosed()) return;
      prUrl = pr && pr.html_url ? pr.html_url : null;
    } catch (prErr) {
      if (prErr && prErr.name === 'AbortError') return;
      if (aborted() || isClosed()) return;
      // PR 创建失败但提交成功，提示用户手动开 PR
      showStatus('文件已提交到分支 ' + branchName + '，但 PR 创建失败：' + (prErr.message || '未知错误') + '。请去 GitHub 手动创建 PR。', 'error');
      const branchInfo = document.createElement('div');
      branchInfo.className = 'gh-branch-info';
      branchInfo.textContent = '分支: ' + branchName;
      statusEl.appendChild(branchInfo);
      // 提交成功后更新原始内容，允许继续编辑
      fileState.originalText = newText;
      commitInput.disabled = false;
      return;
    }

    // 成功
    if (prUrl) {
      showStatus('提交成功！PR 已创建：', 'success');
      const link = document.createElement('a');
      link.className = 'gh-pr-link';
      link.href = prUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = prUrl;
      statusEl.appendChild(link);
    } else {
      showStatus('提交成功，但未获取到 PR 链接。分支: ' + branchName, 'success');
    }

    // 提交成功后更新原始内容，禁用提交按钮直到再次修改
    fileState.originalText = newText;
    submitBtn.disabled = true;
    commitInput.disabled = false;

  } catch (err) {
    // abort 静默退出，不写 UI
    if (err && err.name === 'AbortError') return;
    fail(err);
  }
}

// ═══════════════════════════════════════
// 【对外入口】打开 GitHub 工具面板
// ═══════════════════════════════════════

export function openGithubToolSheet() {
  injectStyle();

  // ── 集中 session 管理 ──
  // 统一管理本次打开 GitHub 工具的 closed 标记、abort controller 池、sheet 失活监听，
  // 确保 showConfig/showTree/showFileViewer 互相切换时不残留旧资源，
  // 仅在抽屉真正关闭（非内部切换）时触发 cleanup。
  const abortControllers = new Set();
  let closed = false;
  let switching = false; // 页内切换（config↔tree↔viewer）期间为 true，避免误判关闭
  let currentSheetEl = null;
  let sheetObserver = null;

  function cleanup() {
    if (closed) return;
    closed = true;
    // abort 所有进行中的请求
    abortControllers.forEach(function(ac) { try { ac.abort(); } catch (_) {} });
    abortControllers.clear();
    // 断开 sheet 观察器
    if (sheetObserver) {
      try { sheetObserver.disconnect(); } catch (_) {}
      sheetObserver = null;
    }
    currentSheetEl = null;
  }

  // 监听当前 sheet 元素：从 DOM 移除且非内部切换时，视为抽屉已关闭，触发 cleanup
  function watchSheet(sheetEl) {
    if (sheetObserver) {
      try { sheetObserver.disconnect(); } catch (_) {}
    }
    currentSheetEl = sheetEl;
    if (!sheetEl || typeof MutationObserver === 'undefined') return;
    sheetObserver = new MutationObserver(function() {
      // 当前 sheet 已不在 DOM，且不是内部切换 → 真正关闭
      if (currentSheetEl === sheetEl && !sheetEl.isConnected && !switching) {
        cleanup();
      }
    });
    // 监听 body 子节点变化（sheet 被 remove 时触发）
    sheetObserver.observe(document.body, { childList: true });
  }

  // 内部切换辅助：切换期间设 switching=true，避免 showBottomSheet 内部的 hideBottomSheet
  // 把旧 sheet 移除时误判为关闭
  function withSwitch(fn) {
    switching = true;
    try {
      const sheetEl = fn();
      return sheetEl;
    } finally {
      // 用微任务延迟复位，确保 showBottomSheet 内部的 hideBottomSheet + setTimeout remove 走完
      Promise.resolve().then(function() {
        switching = false;
        // 切换完成后，若当前 sheet 已不在 DOM（极端情况），仍触发关闭判定
        if (currentSheetEl && !currentSheetEl.isConnected && !switching) {
          cleanup();
        }
      });
    }
  }

  const session = {
    isClosed: function() { return closed; },
    registerAbort: function(ac) {
      if (closed) {
        try { ac.abort(); } catch (_) {}
        return;
      }
      abortControllers.add(ac);
    }
  };

  // 用命名函数互相引用，避免深层嵌套和 arguments.callee
  function showConfig() {
    const sheet = withSwitch(function() {
      const sheetEl = showBottomSheet(buildConfigView(getConfig(), null, function(newConfig) {
        // onContinue: 加载文件树（内部切换）
        withSwitch(function() {
          return showTree(newConfig);
        });
      }));
      watchSheet(sheetEl);
      return sheetEl;
    });
    return sheet;
  }

  function showTree(cfg) {
    const sheet = withSwitch(function() {
      const sheetEl = showBottomSheet(buildTreeView(cfg, function() {
        // 返回配置页（内部切换）
        withSwitch(function() {
          return showConfig();
        });
      }, session));
      watchSheet(sheetEl);
      return sheetEl;
    });
    return sheet;
  }

  showConfig();
}
