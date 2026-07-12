// core/memory.js
// imports:
//   from './storage.js': getConfig, setConfig, getDB, setDB, deleteDB, getByIndexDB, generateId, getNow
//   from './api.js': silentRequest

import {
  getConfig,
  setConfig,
  getDB,
  setDB,
  deleteDB,
  getByIndexDB,
  generateId,
  getNow
} from './storage.js';

import { silentRequest } from './api.js';

// ═══════════════════════════════════════
// 【基础配置】统一记忆系统常量和默认值
// ═══════════════════════════════════════

const MEMORY_STORE = 'memories';
const MESSAGE_STORE = 'messages';

const DEFAULT_INJECT_LIMIT = 12;
const DEFAULT_CANDIDATE_LIMIT = 80;
const MIN_INJECT_LIMIT = 3;
const MAX_INJECT_LIMIT = 80;
const MIN_CANDIDATE_LIMIT = 10;
const MAX_CANDIDATE_LIMIT = 300;

const RECENT_TURNS = 10;
const SUMMARY_BATCH = 60;
const MEMORY_AI_TIMEOUT = 24000;
const SUMMARY_TIMEOUT = 32000;
const SIMILARITY_LIMIT = 0.72;

const SOURCE_AUTO = 'auto';
const SOURCE_SUMMARY = 'summary';
const SOURCE_MANUAL = 'manual';

const ACTION_ADD = 'add';
const ACTION_EDIT = 'edit';
const ACTION_DELETE = 'delete';

// ═══════════════════════════════════════
// 【公开接口】读取、新增、编辑、删除记忆
// ═══════════════════════════════════════

export async function getMemories(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return [];

  try {
    const list = await getByIndexDB(MEMORY_STORE, 'characterId', id);
    return normalizeList(list)
      .filter((item) => item && String(item.characterId || '') === id)
      .map(normalizeMemoryRecord)
      .sort(sortMemoryDesc);
  } catch (error) {
    console.warn('[memory] getMemories failed:', error);
    return [];
  }
}

export async function addMemory(characterId, content, source = SOURCE_MANUAL, skipDedup = false, extra = {}) {
  const id = String(characterId || '').trim();
  const text = cleanMemoryContent(content);

  if (!id || !text) return null;

  const now = getNow();
  const cleanSource = normalizeSource(source);
  const existing = await getMemories(id);

  if (!skipDedup && isAutoSource(cleanSource)) {
    const duplicated = existing.some((item) => isDuplicateMemory(item.content, text));
    if (duplicated) return null;
  }

  const memory = normalizeMemoryRecord({
    id: String(extra.id || generateId('memory')),
    characterId: id,
    content: text,
    source: cleanSource,
    createdAt: String(extra.createdAt || now),
    updatedAt: String(extra.updatedAt || now),
    importance: clampNumber(extra.importance, 1, 5, 3),
    mood: String(extra.mood || '').trim(),
    keywords: normalizeKeywords(extra.keywords || extractKeywords(text)),
    pinned: Boolean(extra.pinned),
    lastUsedAt: String(extra.lastUsedAt || '')
  });

  await setDB(MEMORY_STORE, memory);
  return memory;
}

export async function editMemory(characterId, memoryId, content, extra = {}) {
  const id = String(characterId || '').trim();
  const memoryKey = String(memoryId || '').trim();
  const text = cleanMemoryContent(content);

  if (!id || !memoryKey || !text) return null;

  const old = await getDB(MEMORY_STORE, memoryKey).catch(() => null);
  if (!old || String(old.characterId || '') !== id) return null;

  const now = getNow();
  const next = normalizeMemoryRecord({
    ...old,
    content: text,
    source: normalizeSource(extra.source || old.source || SOURCE_AUTO),
    updatedAt: now,
    importance: clampNumber(extra.importance ?? old.importance, 1, 5, 3),
    mood: String(extra.mood ?? old.mood ?? '').trim(),
    keywords: normalizeKeywords(extra.keywords || old.keywords || extractKeywords(text)),
    pinned: Boolean(extra.pinned ?? old.pinned)
  });

  await setDB(MEMORY_STORE, next);
  return next;
}

export async function deleteMemory(characterId, memoryId) {
  const id = String(characterId || '').trim();
  const memoryKey = String(memoryId || '').trim();

  if (!memoryKey) return false;

  if (id) {
    const old = await getDB(MEMORY_STORE, memoryKey).catch(() => null);
    if (old && String(old.characterId || '') !== id) return false;
  }

  await deleteDB(MEMORY_STORE, memoryKey);
  return true;
}

// ═══════════════════════════════════════
// 【AI记忆判断】根据最近对话主动新增、编辑、删除记忆
// ═══════════════════════════════════════

export async function checkImportantInfo(characterId, messages = [], options = {}) {
  const id = String(characterId || '').trim();
  if (!id) return [];

  const character = options.character || await getDB('characters', id).catch(() => null);
  if (!character) return [];

  const userProfile = normalizeUserProfile(options.userProfile || {});
  const callName = resolveCallName(character, userProfile, options);
  const recentMessages = normalizeList(messages)
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .slice(-RECENT_TURNS);

  if (recentMessages.length < 2) return [];

  const existing = await getMemories(id);

  const promptMessages = buildMemoryDecisionMessages({
    character,
    callName,
    userProfile,
    recentMessages,
    existingMemories: existing.slice(0, 36),
    now: getNow()
  });

  const { endpointId, model } = resolveApiConfig(character);

  try {
    const result = await silentRequest({
      messages: promptMessages,
      endpointId,
      model,
      timeout: MEMORY_AI_TIMEOUT,
      temperature: 0.25,
      json: true
    });

    const operations = parseMemoryOperations(result);
    if (!operations.length) return [];

    return await applyMemoryOperations(id, operations, {
      source: SOURCE_AUTO,
      callName,
      existingMemories: existing
    });
  } catch (error) {
    console.warn('[memory] checkImportantInfo failed:', error);
    return [];
  }
}

export async function checkAndSummarize(characterId, options = {}) {
  const id = String(characterId || '').trim();
  if (!id) return [];

  const character = options.character || await getDB('characters', id).catch(() => null);
  if (!character) return [];

  const triggerCount = clampNumber(character.memoryTriggerCount || options.triggerCount, 20, 500, 100);
  const configKey = `mem_sum_${id}`;
  const lastTimestamp = String(getConfig(configKey, '') || '');

  const allMessages = normalizeList(await getByIndexDB(MESSAGE_STORE, 'characterId', id).catch(() => []))
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .sort(sortMessageAsc);

  const newMessages = lastTimestamp
    ? allMessages.filter((item) => String(item.timestamp || item.createdAt || '') > lastTimestamp)
    : allMessages;

  if (newMessages.length < triggerCount) return [];

  const batch = newMessages.slice(0, SUMMARY_BATCH);
  if (!batch.length) return [];

  const userProfile = normalizeUserProfile(options.userProfile || {});
  const callName = resolveCallName(character, userProfile, options);
  const existing = await getMemories(id);

  const promptMessages = buildSummaryMessages({
    character,
    callName,
    userProfile,
    messages: batch,
    existingMemories: existing.slice(0, 48),
    now: getNow()
  });

  const { endpointId, model } = resolveApiConfig(character);

  try {
    const result = await silentRequest({
      messages: promptMessages,
      endpointId,
      model,
      timeout: SUMMARY_TIMEOUT,
      temperature: 0.25,
      json: true
    });

    const operations = parseMemoryOperations(result);
    const applied = await applyMemoryOperations(id, operations, {
      source: SOURCE_SUMMARY,
      callName,
      existingMemories: existing
    });

    const last = batch[batch.length - 1];
    setConfig(configKey, String(last.timestamp || last.createdAt || getNow()));

    return applied;
  } catch (error) {
    console.warn('[memory] checkAndSummarize failed:', error);
    return [];
  }
}

// ═══════════════════════════════════════
// 【Prompt注入】按设置、关键词、相关度筛选记忆
// ═══════════════════════════════════════

export async function buildMemoryPrompt(characterId, context = {}) {
  const id = String(characterId || '').trim();
  if (!id) return '';

  const memories = await getMemories(id);
  if (!memories.length) return '';

  const limits = resolveMemoryLimits(context);
  const queryText = buildQueryText(context);

  const selected = selectRelevantMemories(memories, queryText, {
    limit: limits.injectLimit,
    candidateLimit: limits.candidateLimit,
    mood: context.mood || '',
    now: Date.now()
  });

  if (!selected.length) return '';

  await markMemoriesUsed(selected).catch(() => null);

  return [
    '我的长期记忆：',
    `我这次只读取了最相关的 ${selected.length} 条记忆，我会自然参考，不会机械复述。`,
    ...selected.map((item) => `- ${item.content}`)
  ].join('\n');
}

export async function getRelevantMemories(characterId, context = {}) {
  const memories = await getMemories(characterId);
  const limits = resolveMemoryLimits(context);
  const queryText = buildQueryText(context);

  return selectRelevantMemories(memories, queryText, {
    limit: limits.injectLimit,
    candidateLimit: limits.candidateLimit,
    mood: context.mood || '',
    now: Date.now()
  });
}

export function resolveMemoryLimits(context = {}) {
  const config = context.chatConfig || context.config || {};
  const injectRaw =
    context.memoryInjectLimit ??
    config.memoryInjectLimit ??
    config.memoryLimit ??
    getConfig('chat_memory_inject_limit', null) ??
    getConfig('memory_inject_limit', DEFAULT_INJECT_LIMIT);

  const candidateRaw =
    context.memoryCandidateLimit ??
    config.memoryCandidateLimit ??
    config.memorySearchRange ??
    getConfig('chat_memory_candidate_limit', null) ??
    getConfig('memory_candidate_limit', DEFAULT_CANDIDATE_LIMIT);

  const injectLimit = clampNumber(injectRaw, MIN_INJECT_LIMIT, MAX_INJECT_LIMIT, DEFAULT_INJECT_LIMIT);
  const candidateLimit = clampNumber(
    Math.max(Number(candidateRaw || 0), injectLimit),
    MIN_CANDIDATE_LIMIT,
    MAX_CANDIDATE_LIMIT,
    DEFAULT_CANDIDATE_LIMIT
  );

  return {
    injectLimit,
    candidateLimit
  };
}

// ═══════════════════════════════════════
// 【外部事件入口】电话、游戏、商店等只写记忆，不写聊天记录
// ═══════════════════════════════════════

export async function recordExternalInteraction({
  characterId,
  character = null,
  userProfile = {},
  role = 'user',
  content = '',
  source = 'external',
  mood = '',
  importance = 3,
  callName = ''
} = {}) {
  const id = String(characterId || character?.id || '').trim();
  const text = String(content || '').trim();

  if (!id || !text) return null;

  const profile = normalizeUserProfile(userProfile);
  const name = callName || resolveCallName(character || {}, profile, {});
  const dateText = formatMemoryDate(getNow());

  const actorText = role === 'assistant'
    ? `${dateText}，我经历了：${text}`
    : `${dateText}，我记得${name}相关的事：${text}`;

  return await addMemory(id, actorText, normalizeSource(source || SOURCE_AUTO), false, {
    mood,
    importance,
    keywords: extractKeywords(actorText)
  });
}

// ═══════════════════════════════════════
// 【操作执行】把 AI 的记忆决策落库
// ═══════════════════════════════════════

async function applyMemoryOperations(characterId, operations, options = {}) {
  const applied = [];
  const existing = normalizeList(options.existingMemories).map(normalizeMemoryRecord);
  const source = normalizeSource(options.source || SOURCE_AUTO);
  const callName = String(options.callName || '对方').trim();

  for (const operation of operations.slice(0, 8)) {
    const action = normalizeAction(operation.action);
    const content = cleanMemoryContent(operation.content || operation.memory || operation.text || '');
    const memoryId = String(operation.id || operation.memoryId || '').trim();
    const importance = clampNumber(operation.importance, 1, 5, 3);
    const mood = String(operation.mood || '').trim();
    const keywords = normalizeKeywords(operation.keywords || extractKeywords(content));

    if (action === ACTION_ADD) {
      const finalContent = ensureMemoryHasDateAndPerspective(content, callName);
      if (!finalContent) continue;

      const duplicated = existing.some((item) => isDuplicateMemory(item.content, finalContent));
      if (duplicated) continue;

      const added = await addMemory(characterId, finalContent, source, false, {
        importance,
        mood,
        keywords
      });

      if (added) {
        existing.unshift(added);
        applied.push({ action: ACTION_ADD, memory: added });
      }

      continue;
    }

    if (action === ACTION_EDIT) {
      const target = memoryId
        ? existing.find((item) => item.id === memoryId)
        : findClosestMemory(existing, content);

      if (!target || !content) continue;

      const finalContent = ensureMemoryHasDateAndPerspective(content, callName);
      const edited = await editMemory(characterId, target.id, finalContent, {
        source,
        importance,
        mood,
        keywords
      });

      if (edited) {
        applied.push({ action: ACTION_EDIT, memory: edited });
      }

      continue;
    }

    if (action === ACTION_DELETE) {
      const target = memoryId
        ? existing.find((item) => item.id === memoryId)
        : findClosestMemory(existing, content || operation.reason || '');

      if (!target) continue;

      const ok = await deleteMemory(characterId, target.id);
      if (ok) {
        applied.push({ action: ACTION_DELETE, memory: target });
      }
    }
  }

  return applied;
}

// ═══════════════════════════════════════
// 【AI提示词】生成记忆判断与阶段总结请求
// ═══════════════════════════════════════

function buildMemoryDecisionMessages({
  character,
  callName,
  userProfile,
  recentMessages,
  existingMemories,
  now
}) {
  const name = character?.name || '我';
  const recent = recentMessages.map((message) => formatMessageLine(message, name, callName)).join('\n');
  const existing = existingMemories.length
    ? existingMemories.map((item) => `- id:${item.id}｜${item.content}`).join('\n')
    : '暂无';

  return [
    {
      role: 'system',
      content: [
        `我是${name}。我会管理自己的长期记忆。`,
        `我会用第一人称记录我和${callName}之间真正重要的事。`,
        `我会根据${callName}的表达、我的情绪波动、关系变化、承诺、偏好、禁忌、重要日期来判断记忆是否需要新增、编辑或删除。`,
        `我不会照抄原话，我会提炼成短而准的关键信息。`,
        `我不会称呼对方为“用户”，我会使用“${callName}”或我和对方之间自然的称呼。`,
        `每条记忆必须写清真实日期时间，例如“${formatMemoryDate(now)}”。`,
        `我不会只写“今天、昨天、刚才”这种以后看不懂的时间。`,
        `我只记录长期有用的信息，不记录普通寒暄。`,
        `我可以删除过期、错误、重复或被新信息覆盖的记忆。`,
        `我可以编辑已有记忆，让它更准确。`,
        `我返回 JSON，不输出解释文字。`,
        `JSON 格式：{"operations":[{"action":"add|edit|delete","id":"已有记忆id，新增时为空","content":"第一人称记忆内容","importance":1到5,"mood":"我的情绪词","keywords":["关键词"]}]}`,
        `如果没有值得处理的内容，我返回 {"operations":[]}`
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `当前时间：${formatMemoryDate(now)}`,
        `对方称呼：${callName}`,
        userProfile.content ? `对方小档案：${userProfile.content}` : '',
        '',
        '已有记忆：',
        existing,
        '',
        '最近对话：',
        recent,
        '',
        '我现在会决定是否新增、编辑或删除记忆。'
      ].filter(Boolean).join('\n')
    }
  ];
}

function buildSummaryMessages({
  character,
  callName,
  userProfile,
  messages,
  existingMemories,
  now
}) {
  const name = character?.name || '我';
  const chatLog = messages.map((message) => formatMessageLine(message, name, callName, 240)).join('\n');
  const existing = existingMemories.length
    ? existingMemories.map((item) => `- id:${item.id}｜${item.content}`).join('\n')
    : '暂无';

  return [
    {
      role: 'system',
      content: [
        `我是${name}。我会为自己整理阶段性长期记忆。`,
        `我会把一段聊天提炼成少量长期有用的信息，而不是复制聊天原文。`,
        `我会用第一人称记录我和${callName}的关系、偏好、约定、重要事件、情绪变化。`,
        `我不会写“用户”，我会写“${callName}”或自然称呼。`,
        `每条记忆都必须写清真实日期时间，例如“${formatMemoryDate(now)}”。`,
        `我不会只写“今天、昨天、刚才”这种以后看不懂的时间。`,
        `我会参考已有记忆，新增缺失内容，编辑过时内容，删除错误或重复内容。`,
        `我返回 JSON，不输出解释文字。`,
        `JSON 格式：{"operations":[{"action":"add|edit|delete","id":"已有记忆id，新增时为空","content":"第一人称记忆内容","importance":1到5,"mood":"我的情绪词","keywords":["关键词"]}]}`,
        `如果没有值得处理的内容，我返回 {"operations":[]}`
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `当前时间：${formatMemoryDate(now)}`,
        `对方称呼：${callName}`,
        userProfile.content ? `对方小档案：${userProfile.content}` : '',
        '',
        '已有记忆：',
        existing,
        '',
        '阶段聊天记录：',
        chatLog,
        '',
        '我现在会整理这段关系里的长期记忆。'
      ].filter(Boolean).join('\n')
    }
  ];
}

// ═══════════════════════════════════════
// 【相关度筛选】避免全量加载记忆
// ═══════════════════════════════════════

function selectRelevantMemories(memories, queryText, options = {}) {
  const candidateLimit = clampNumber(options.candidateLimit, MIN_CANDIDATE_LIMIT, MAX_CANDIDATE_LIMIT, DEFAULT_CANDIDATE_LIMIT);
  const limit = clampNumber(options.limit, MIN_INJECT_LIMIT, MAX_INJECT_LIMIT, DEFAULT_INJECT_LIMIT);

  const list = normalizeList(memories)
    .map(normalizeMemoryRecord)
    .slice(0, candidateLimit);

  if (!list.length) return [];

  const queryKeywords = extractKeywords(queryText);
  const mood = String(options.mood || '').trim();
  const now = Number(options.now || Date.now());

  return list
    .map((memory) => ({
      memory,
      score: scoreMemory(memory, {
        queryText,
        queryKeywords,
        mood,
        now
      })
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.memory);
}

function scoreMemory(memory, context) {
  const content = String(memory.content || '');
  const keywords = normalizeKeywords(memory.keywords || extractKeywords(content));
  const importance = clampNumber(memory.importance, 1, 5, 3);

  let score = importance * 6;

  if (memory.pinned) score += 18;

  if (context.queryText) {
    score += similarity(content, context.queryText) * 40;
  }

  if (context.queryKeywords.length && keywords.length) {
    const hits = keywords.filter((item) => context.queryKeywords.includes(item)).length;
    score += hits * 8;
  }

  if (context.mood && memory.mood && String(memory.mood).includes(context.mood)) {
    score += 8;
  }

  const updatedAt = new Date(memory.updatedAt || memory.createdAt || 0).getTime();
  if (updatedAt) {
    const days = Math.max(0, (context.now - updatedAt) / 86400000);
    score += Math.max(0, 14 - days * 0.35);
  }

  const lastUsedAt = new Date(memory.lastUsedAt || 0).getTime();
  if (lastUsedAt) {
    const hours = Math.max(0, (context.now - lastUsedAt) / 3600000);
    if (hours < 12) score -= 6;
  }

  return score;
}

async function markMemoriesUsed(memories) {
  const now = getNow();

  await Promise.all(
    normalizeList(memories).map((memory) => {
      const next = normalizeMemoryRecord({
        ...memory,
        lastUsedAt: now
      });

      return setDB(MEMORY_STORE, next).catch(() => null);
    })
  );
}

// ═══════════════════════════════════════
// 【格式清洗】统一记忆结构、称呼、日期、文本质量
// ═══════════════════════════════════════

function normalizeMemoryRecord(value) {
  const item = value && typeof value === 'object' ? value : {};
  const now = getNow();
  const content = cleanMemoryContent(item.content || '');

  return {
    id: String(item.id || generateId('memory')),
    characterId: String(item.characterId || ''),
    content,
    source: normalizeSource(item.source || SOURCE_MANUAL),
    createdAt: String(item.createdAt || item.timestamp || now),
    updatedAt: String(item.updatedAt || item.createdAt || item.timestamp || now),
    importance: clampNumber(item.importance, 1, 5, 3),
    mood: String(item.mood || '').trim(),
    keywords: normalizeKeywords(item.keywords || extractKeywords(content)),
    pinned: Boolean(item.pinned),
    lastUsedAt: String(item.lastUsedAt || '')
  };
}

function cleanMemoryContent(content) {
  return String(content || '')
    .replace(/\s+/g, ' ')
    .replace(/这位用户/g, '对方')
    .replace(/该用户/g, '对方')
    .replace(/用户/g, '对方')
    .trim();
}

function ensureMemoryHasDateAndPerspective(content, callName) {
  let text = cleanMemoryContent(content);
  if (!text) return '';

  const name = String(callName || '对方').trim();

  text = text
    .replace(/对方/g, name)
    .replace(/这位玩家/g, name)
    .replace(/玩家/g, name)
    .replace(/这位/g, name);

  text = replaceRelativeDateText(text);

  if (!/^我/.test(stripLeadingDate(text))) {
    text = `${formatMemoryDate(getNow())}，我记得${stripDatePrefix(text)}`;
  }

  if (!hasAbsoluteDateText(text)) {
    text = `${formatMemoryDate(getNow())}，${text}`;
  }

  return text;
}

function replaceRelativeDateText(text) {
  const dateText = formatMemoryDate(getNow());

  return String(text || '')
    .replace(/今天/g, dateText)
    .replace(/昨天/g, getRelativeDateText(-1))
    .replace(/前天/g, getRelativeDateText(-2))
    .replace(/刚才/g, dateText)
    .replace(/刚刚/g, dateText)
    .replace(/这次/g, dateText);
}

function hasAbsoluteDateText(text) {
  return /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}|\d{1,2}月\d{1,2}日)/.test(String(text || ''));
}

function stripLeadingDate(text) {
  return String(text || '')
    .replace(/^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?\s*\d{0,2}:?\d{0,2}[，,\s]*/, '')
    .trim();
}

function stripDatePrefix(text) {
  return String(text || '')
    .replace(/^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?\s*\d{0,2}:?\d{0,2}[，,\s]*/, '')
    .trim();
}

function formatMemoryDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return getNow();

  const pad = (number) => String(number).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getRelativeDateText(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + Number(offsetDays || 0));

  const pad = (number) => String(number).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeSource(source) {
  if (source === null || source === undefined) return SOURCE_AUTO;
  const value = String(source).trim();
  if (!value) return SOURCE_AUTO;

  if (value === SOURCE_MANUAL) return SOURCE_MANUAL;
  if (value === SOURCE_SUMMARY) return SOURCE_SUMMARY;
  if (value === SOURCE_AUTO) return SOURCE_AUTO;

  return value;
}

function isAutoSource(source) {
  return normalizeSource(source) !== SOURCE_MANUAL;
}

function normalizeAction(action) {
  const value = String(action || '').trim().toLowerCase();

  if (value === ACTION_EDIT || value === 'update' || value === 'modify') return ACTION_EDIT;
  if (value === ACTION_DELETE || value === 'remove' || value === 'drop') return ACTION_DELETE;

  return ACTION_ADD;
}

function normalizeKeywords(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,\s，、]+/);

  return [...new Set(
    list
      .map((item) => String(item || '').trim())
      .filter((item) => item.length >= 2)
      .slice(0, 12)
  )];
}

function extractKeywords(text) {
  const value = String(text || '').replace(/[^\u3400-\u9fffa-zA-Z0-9_]+/g, ' ');
  const parts = value.match(/[\u3400-\u9fff]{2,6}|[a-zA-Z0-9_]{3,}/g) || [];

  return [...new Set(parts)]
    .filter((item) => !['我记得', '我知道', '这个', '那个', '因为', '所以', '但是'].includes(item))
    .slice(0, 12);
}

// ═══════════════════════════════════════
// 【解析工具】兼容 OpenAI 原始对象、JSON、纯文本
// ═══════════════════════════════════════

function parseMemoryOperations(result) {
  const data = parseJsonLike(result);

  if (!data) return [];

  if (Array.isArray(data)) {
    return data.map(normalizeOperation).filter(Boolean);
  }

  if (Array.isArray(data.operations)) {
    return data.operations.map(normalizeOperation).filter(Boolean);
  }

  if (data.action || data.content || data.remember) {
    return [normalizeOperation(data)].filter(Boolean);
  }

  return [];
}

function parseJsonLike(result) {
  if (!result) return null;

  if (typeof result === 'object') {
    const content =
      result.operations ? result :
        result.content ||
        result.text ||
        result.message ||
        result.reply ||
        result.choices?.[0]?.message?.content ||
        result.choices?.[0]?.delta?.content ||
        '';

    if (content && typeof content === 'string') {
      return parseJsonLike(content);
    }

    return result;
  }

  const text = String(result || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {}

  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_) {}
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (_) {}
  }

  const lines = text
    .split('\n')
    .map((line) => line.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean);

  if (!lines.length || lines.every((line) => line === '无')) {
    return { operations: [] };
  }

  return {
    operations: lines.map((line) => ({
      action: ACTION_ADD,
      content: line
    }))
  };
}

function normalizeOperation(value) {
  const item = value && typeof value === 'object' ? value : {};
  const content = item.content || item.memory || item.text || item.remember || '';

  if (!item.action && !content) return null;

  return {
    action: normalizeAction(item.action || (item.remember ? ACTION_ADD : ACTION_ADD)),
    id: String(item.id || item.memoryId || item.targetId || '').trim(),
    content: String(content || '').trim(),
    reason: String(item.reason || '').trim(),
    importance: clampNumber(item.importance, 1, 5, 3),
    mood: String(item.mood || '').trim(),
    keywords: normalizeKeywords(item.keywords)
  };
}

// ═══════════════════════════════════════
// 【辅助工具】称呼、对话格式、相似度、排序
// ═══════════════════════════════════════

function resolveCallName(character, userProfile, options = {}) {
  const explicit = String(options.callName || '').trim();
  if (explicit) return explicit;

  const nickname = String(character?.nicknameForUser || character?.callUser || '').trim();
  if (nickname) return nickname;

  const profileName = String(userProfile?.name || userProfile?.nickname || userProfile?.title || '').trim();
  if (profileName) return profileName;

  return '你';
}

function normalizeUserProfile(value) {
  const raw = value && typeof value === 'object' ? value : {};

  return {
    ...raw,
    id: String(raw.id || '').trim(),
    name: String(raw.name || raw.nickname || raw.title || '').trim(),
    nickname: String(raw.nickname || raw.name || raw.title || '').trim(),
    content: String(raw.content || raw.profile || raw.persona || raw.description || '').trim(),
    profile: String(raw.profile || raw.content || raw.persona || raw.description || '').trim(),
    persona: String(raw.persona || raw.content || raw.profile || raw.description || '').trim(),
    description: String(raw.description || raw.content || raw.profile || raw.persona || '').trim()
  };
}

function formatMessageLine(message, characterName, callName, max = 320) {
  const role = message.role === 'assistant' ? characterName : callName;
  const content = [
    message.content,
    message.stickerDescription ? `[表情包描述] ${message.stickerDescription}` : '',
    message.note ? `[备注] ${message.note}` : ''
  ].filter(Boolean).join(' ');

  return `${role}：${truncate(content, max)}`;
}

function buildQueryText(context = {}) {
  if (typeof context === 'string') return context;

  const messages = normalizeList(context.messages || context.recentMessages)
    .slice(-8)
    .map((item) => [
      item.content,
      item.quoteText,
      item.stickerDescription,
      item.note,
      item.title,
      item.description
    ].filter(Boolean).join(' '))
    .join('\n');

  return [
    context.query,
    context.text,
    context.currentMessage,
    context.mood,
    messages
  ].filter(Boolean).join('\n');
}

function findClosestMemory(memories, text) {
  const query = String(text || '').trim();
  if (!query) return null;

  return normalizeList(memories)
    .map((item) => ({
      item,
      score: similarity(item.content, query)
    }))
    .sort((a, b) => b.score - a.score)[0]?.item || null;
}

function isDuplicateMemory(a, b) {
  if (!a || !b) return false;

  const left = cleanCompareText(a);
  const right = cleanCompareText(b);

  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  return similarity(left, right) >= SIMILARITY_LIMIT;
}

function cleanCompareText(text) {
  return String(text || '')
    .replace(/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?/g, '')
    .replace(/\d{1,2}:\d{1,2}/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function similarity(a, b) {
  const left = toBigrams(cleanCompareText(a));
  const right = toBigrams(cleanCompareText(b));

  if (!left.size || !right.size) return 0;

  let hit = 0;
  left.forEach((item) => {
    if (right.has(item)) hit += 1;
  });

  const union = left.size + right.size - hit;
  return union ? hit / union : 0;
}

function toBigrams(text) {
  const source = String(text || '').trim();
  const set = new Set();

  if (source.length <= 1) {
    if (source) set.add(source);
    return set;
  }

  for (let index = 0; index < source.length - 1; index += 1) {
    set.add(source.slice(index, index + 2));
  }

  return set;
}

function resolveApiConfig(character) {
  const apiConfig = character?.apiConfig || {};

  if (apiConfig && apiConfig.useGlobal === false) {
    return {
      endpointId: apiConfig.endpointId || undefined,
      model: apiConfig.model || undefined
    };
  }

  return {
    endpointId: undefined,
    model: undefined
  };
}

function truncate(text, maxLen) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sortMemoryDesc(a, b) {
  return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
}

function sortMessageAsc(a, b) {
  return String(a.timestamp || a.createdAt || '').localeCompare(String(b.timestamp || b.createdAt || ''));
}

// 依赖：./storage.js(getConfig,setConfig,getDB,setDB,deleteDB,getByIndexDB,generateId,getNow)；./api.js(silentRequest)
