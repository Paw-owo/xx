// core/theme-resource-manager.js
// imports:
//   from './storage.js': getData, setData, removeData, getNow

import { getData, setData, removeData, getNow } from './storage.js';

export const THEME_RESOURCE_OWNERS_KEY = 'theme_ai_resource_owners';
export const THEME_RESOURCE_TASK_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

const IMAGE_SLOT_ALIASES = Object.freeze({
  desktop_decoration: 'app_widget_area_bg',
  card_decoration: 'app_widget_area_bg',
  page_background: 'app_bg_settings'
});

const DECORATION_VARIABLES = Object.freeze([
  'desktop-wallpaper-soft',
  'theme-card-texture-opacity',
  'theme-decor-density',
  'theme-decor-intensity',
  'theme-decor-enabled',
  'motion',
  'spacing-xs',
  'spacing-sm',
  'spacing-md',
  'spacing-lg',
  'radius-sm',
  'radius-md',
  'radius-lg',
  'radius-xl'
]);

let activePreview = null;
let resourceCache = new Map();
let activeResourceTask = null;
let resourceOperationCount = 0;
const deletingThemeIds = new Set();

export async function previewThemeResources(themeConfig = {}, previewId = '') {
  cancelActiveResourceTask('new_preview');
  if (activePreview) await restoreThemeResourcePreview(activePreview.previewId);
  const id = String(previewId || `theme_preview_${Date.now()}`);
  const task = beginResourceTask('preview', id);
  try {
    markResourceTaskRunning(task);
    const imageSlots = normalizeImageSlots(themeConfig.imageSlots);
    activePreview = {
      previewId: id,
      imageSnapshots: {},
      decorationSnapshot: {},
      createdAt: getNow(),
      status: 'active'
    };
    const imageSnapshots = await snapshotImageSlots(Object.keys(imageSlots));
    assertTaskActive(task);
    if (!activePreview || activePreview.previewId !== id) throw new Error('theme_resource_preview_replaced');
    activePreview.imageSnapshots = imageSnapshots;
    activePreview.decorationSnapshot = snapshotDecorationVariables();
    await applyThemeResources(themeConfig, { persistOwner: false, operationId: task.operationId });
    assertTaskActive(task);
    if (!activePreview || activePreview.previewId !== id) throw new Error('theme_resource_preview_replaced');
    completeResourceTask(task);
    return clonePreview(activePreview);
  } catch (error) {
    failResourceTask(task, error);
    throw error;
  }
}

export async function confirmThemeResourcePreview(previewId = '', theme = null) {
  const id = String(previewId || activePreview?.previewId || '');
  const task = beginResourceTask('confirm', id);
  try {
    markResourceTaskRunning(task);
    if (activePreview && (!previewId || activePreview.previewId === previewId)) {
      const confirmed = { ...activePreview, status: 'confirmed', confirmedAt: getNow() };
      activePreview = null;
      if (theme) await applyThemeResources(theme, { persistOwner: true, operationId: task.operationId });
      assertTaskActive(task);
      completeResourceTask(task);
      return clonePreview(confirmed);
    }
    if (theme) await applyThemeResources(theme, { persistOwner: true, operationId: task.operationId });
    assertTaskActive(task);
    completeResourceTask(task);
    return null;
  } catch (error) {
    failResourceTask(task, error);
    throw error;
  }
}

export async function restoreThemeResourcePreview(previewId = '') {
  const id = String(previewId || activePreview?.previewId || '');
  const task = beginResourceTask('restore', id);
  try {
    markResourceTaskRunning(task);
    if (!activePreview || (previewId && activePreview.previewId !== previewId)) {
      completeResourceTask(task);
      return null;
    }
    const preview = activePreview;
    activePreview = null;
    await restoreImageSnapshots(preview.imageSnapshots, task.operationId);
    assertTaskActive(task);
    restoreDecorationVariables(preview.decorationSnapshot);
    const restored = { ...preview, status: 'cancelled', cancelledAt: getNow() };
    completeResourceTask(task);
    return clonePreview(restored);
  } catch (error) {
    failResourceTask(task, error);
    throw error;
  }
}

export async function applyThemeResources(themeConfig = {}, options = {}) {
  const ownTask = options.operationId ? null : beginResourceTask('apply', '');
  const operationId = options.operationId || ownTask.operationId;
  try {
    if (ownTask) markResourceTaskRunning(ownTask);
    const imageSlots = normalizeImageSlots(themeConfig.imageSlots);
    const themeId = String(themeConfig.themeConfig?.themeId || '').trim();
    if (themeId && deletingThemeIds.has(themeId)) {
      if (ownTask) completeResourceTask(ownTask);
      return { ok: false, errors: ['theme_resource_delete_in_progress'], appliedSlots: [], appliedDecorations: [] };
    }
    const owners = readOwners();
    for (const [slot, record] of Object.entries(imageSlots)) {
      assertOperationActive(operationId);
      const currentOwner = owners[slot] || '';
      const alreadyOwnedByTheme = options.persistOwner && themeId && currentOwner === themeId;
      await writeThemeImageResource(slot, record.resource, { skipIfCached: alreadyOwnedByTheme });
      assertOperationActive(operationId);
      if (options.persistOwner && themeId) owners[slot] = themeId;
    }
    if (options.persistOwner && themeId) setData(THEME_RESOURCE_OWNERS_KEY, owners);
    applyDecorationParameters(themeConfig.uiDecorationParameters || {});
    if (ownTask) completeResourceTask(ownTask);
    return { ok: true, appliedSlots: Object.keys(imageSlots), appliedDecorations: Object.keys(themeConfig.uiDecorationParameters || {}) };
  } catch (error) {
    if (ownTask) failResourceTask(ownTask, error);
    throw error;
  }
}

export async function deleteThemeResources(themeId = '', themeConfig = {}) {
  const cleanId = String(themeId || themeConfig.themeConfig?.themeId || '').trim();
  if (!cleanId) return { ok: false, removedSlots: [] };
  deletingThemeIds.add(cleanId);
  const task = beginResourceTask('delete', '');
  try {
    markResourceTaskRunning(task);
    const owners = readOwners();
    const slots = new Set([...Object.keys(normalizeImageSlots(themeConfig.imageSlots)), ...Object.keys(owners).filter((slot) => owners[slot] === cleanId)]);
    const removedSlots = [];
    for (const slot of slots) {
      assertTaskActive(task);
      if (owners[slot] !== cleanId) continue;
      await removeThemeImageResource(slot);
      assertTaskActive(task);
      delete owners[slot];
      removedSlots.push(slot);
    }
    setData(THEME_RESOURCE_OWNERS_KEY, owners);
    completeResourceTask(task);
    return { ok: true, removedSlots };
  } catch (error) {
    failResourceTask(task, error);
    throw error;
  } finally {
    deletingThemeIds.delete(cleanId);
  }
}

export function getThemeResourcePreviewState() {
  return activePreview ? clonePreview(activePreview) : null;
}

export function getThemeResourceTaskState() {
  return activeResourceTask ? { ...activeResourceTask } : null;
}

export function clearThemeResourceCache() {
  resourceCache = new Map();
}

async function writeThemeImageResource(slot, resource = {}, options = {}) {
  const key = normalizeImageSlotKey(slot);
  const normalized = normalizeImageResource(resource);
  if (!key || !normalized.value) return null;
  const images = getAppImages();
  const cached = resourceCache.get(key);
  if (options.skipIfCached && cached && cached.value === normalized.value && cached.opacity === normalized.opacity) return cached;
  const record = {
    key,
    value: normalized.value,
    source: normalized.value,
    data: normalized.kind === 'dataUrl' ? normalized.value : '',
    image: normalized.value,
    name: normalized.name || key,
    type: normalized.kind,
    mimeType: normalized.mimeType || '',
    opacity: normalized.opacity,
    metadata: normalized.metadata || {},
    updatedAt: getNow()
  };
  resourceCache.set(key, record);
  if (images?.writeImageRecord) return images.writeImageRecord(key, record);
  return record;
}

async function removeThemeImageResource(slot) {
  const key = normalizeImageSlotKey(slot);
  if (!key) return false;
  resourceCache.delete(key);
  const images = getAppImages();
  if (images?.removeImageRecord) return images.removeImageRecord(key);
  return true;
}

async function snapshotImageSlots(slots = []) {
  const result = {};
  const images = getAppImages();
  for (const slot of slots) {
    const key = normalizeImageSlotKey(slot);
    if (!key || result[key]) continue;
    try {
      const record = images?.readImageRecord ? await images.readImageRecord(key) : null;
      result[key] = cloneImageRecord(record);
    } catch (_) {
      result[key] = null;
    }
  }
  return result;
}

async function restoreImageSnapshots(snapshots = {}, operationId = '') {
  const images = getAppImages();
  for (const [key, record] of Object.entries(snapshots || {})) {
    assertOperationActive(operationId);
    if (record && !record.isDefault) {
      if (images?.writeImageRecord) await images.writeImageRecord(key, record);
      resourceCache.set(key, record);
    } else {
      if (images?.removeImageRecord) await images.removeImageRecord(key);
      resourceCache.delete(key);
    }
    assertOperationActive(operationId);
  }
}


function beginResourceTask(type, previewId = '') {
  const task = {
    operationId: `theme_resource_${++resourceOperationCount}`,
    type,
    previewId: String(previewId || ''),
    status: THEME_RESOURCE_TASK_STATUS.PENDING,
    createdAt: getNow(),
    completedAt: '',
    error: ''
  };
  if (activeResourceTask && [THEME_RESOURCE_TASK_STATUS.PENDING, THEME_RESOURCE_TASK_STATUS.RUNNING].includes(activeResourceTask.status)) {
    activeResourceTask = { ...activeResourceTask, status: THEME_RESOURCE_TASK_STATUS.CANCELLED, completedAt: getNow(), error: 'superseded' };
  }
  activeResourceTask = task;
  return task;
}
function markResourceTaskRunning(task) { if (activeResourceTask?.operationId === task.operationId) activeResourceTask = { ...activeResourceTask, status: THEME_RESOURCE_TASK_STATUS.RUNNING }; }
function completeResourceTask(task) { if (activeResourceTask?.operationId === task.operationId) activeResourceTask = { ...activeResourceTask, status: THEME_RESOURCE_TASK_STATUS.COMPLETED, completedAt: getNow(), error: '' }; }
function failResourceTask(task, error) { if (activeResourceTask?.operationId === task.operationId) activeResourceTask = { ...activeResourceTask, status: error?.message === 'theme_resource_operation_cancelled' ? THEME_RESOURCE_TASK_STATUS.CANCELLED : THEME_RESOURCE_TASK_STATUS.FAILED, completedAt: getNow(), error: String(error?.message || error || '') }; }
function cancelActiveResourceTask(reason = 'cancelled') { if (activeResourceTask && [THEME_RESOURCE_TASK_STATUS.PENDING, THEME_RESOURCE_TASK_STATUS.RUNNING].includes(activeResourceTask.status)) activeResourceTask = { ...activeResourceTask, status: THEME_RESOURCE_TASK_STATUS.CANCELLED, completedAt: getNow(), error: reason }; }
function assertTaskActive(task) { assertOperationActive(task?.operationId); }
function assertOperationActive(operationId = '') { if (operationId && activeResourceTask?.operationId !== operationId) throw new Error('theme_resource_operation_cancelled'); }

function applyDecorationParameters(params = {}) {
  const normalized = normalizeDecorationParameters(params);
  const root = getRootElement();
  if (!root?.style) return;

  if (normalized.desktopWallpaperSoft !== undefined) root.style.setProperty('--desktop-wallpaper-soft', String(normalized.desktopWallpaperSoft));
  if (normalized.cardTextureOpacity !== undefined) root.style.setProperty('--theme-card-texture-opacity', String(normalized.cardTextureOpacity));
  if (normalized.decorDensity !== undefined) root.style.setProperty('--theme-decor-density', String(normalized.decorDensity));
  if (normalized.decorIntensity !== undefined) root.style.setProperty('--theme-decor-intensity', String(normalized.decorIntensity));
  if (normalized.decorEnabled !== undefined) root.style.setProperty('--theme-decor-enabled', normalized.decorEnabled > 0 ? '1' : '0');
  if (normalized.motionScale !== undefined) root.style.setProperty('--motion', `all ${Math.round(120 + normalized.motionScale * 280)}ms cubic-bezier(.2,.8,.2,1)`);

  if (normalized.spacingScale !== undefined) {
    const scale = 0.75 + normalized.spacingScale * 0.75;
    root.style.setProperty('--spacing-xs', `${Math.round(4 * scale)}px`);
    root.style.setProperty('--spacing-sm', `${Math.round(8 * scale)}px`);
    root.style.setProperty('--spacing-md', `${Math.round(16 * scale)}px`);
    root.style.setProperty('--spacing-lg', `${Math.round(24 * scale)}px`);
  }

  if (normalized.roundness !== undefined) {
    const scale = 0.65 + normalized.roundness * 0.9;
    root.style.setProperty('--radius-sm', `${Math.round(14 * scale)}px`);
    root.style.setProperty('--radius-md', `${Math.round(21 * scale)}px`);
    root.style.setProperty('--radius-lg', `${Math.round(29 * scale)}px`);
    root.style.setProperty('--radius-xl', `${Math.round(36 * scale)}px`);
  }
}

function snapshotDecorationVariables() {
  const root = getRootElement();
  const result = {};
  if (!root?.style) return result;
  DECORATION_VARIABLES.forEach((key) => { result[key] = root.style.getPropertyValue?.(`--${key}`) || ''; });
  return result;
}

function restoreDecorationVariables(snapshot = {}) {
  const root = getRootElement();
  if (!root?.style) return;
  DECORATION_VARIABLES.forEach((key) => {
    const value = snapshot[key] || '';
    if (value) root.style.setProperty(`--${key}`, value);
    else root.style.removeProperty?.(`--${key}`);
  });
}

function normalizeImageSlots(slots = {}) {
  if (!slots || typeof slots !== 'object') return {};
  const entries = Array.isArray(slots) ? slots.map((item) => [item?.slot, item]) : Object.entries(slots);
  const result = {};
  entries.forEach(([slot, value]) => {
    const key = normalizeImageSlotKey(slot);
    if (!key || !value || typeof value !== 'object') return;
    const resource = normalizeImageResource(value.resource || value);
    if (!resource.value) return;
    result[key] = { slot: key, resource };
  });
  return result;
}

function normalizeImageSlotKey(slot) {
  const clean = String(slot || '').trim();
  if (!clean) return '';
  return IMAGE_SLOT_ALIASES[clean] || clean;
}

function normalizeImageResource(resource = {}) {
  const raw = resource && typeof resource === 'object' ? resource : { value: resource };
  return {
    kind: String(raw.kind || inferResourceKind(raw.value)),
    value: String(raw.value || '').trim(),
    name: String(raw.name || ''),
    mimeType: String(raw.mimeType || ''),
    opacity: normalizeOpacity(raw.opacity),
    metadata: raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata) ? { ...raw.metadata } : {}
  };
}

function normalizeDecorationParameters(params = {}) {
  const result = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    const number = Number(value);
    if (Number.isFinite(number)) result[key] = Math.max(0, Math.min(1, number));
  });
  return result;
}

function normalizeOpacity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  if (number >= 0 && number <= 1) return Math.round(number * 100);
  return Math.max(0, Math.min(100, Math.round(number)));
}

function inferResourceKind(value) {
  const text = String(value || '');
  if (text.startsWith('http://') || text.startsWith('https://')) return 'url';
  if (text.startsWith('data:image/')) return 'dataUrl';
  if (text.startsWith('blob:')) return 'uploaded';
  if (text.startsWith('./') || text.startsWith('../') || text.startsWith('/')) return 'local';
  return 'missing';
}

function cloneImageRecord(record) {
  if (!record || typeof record !== 'object') return null;
  try { return JSON.parse(JSON.stringify(record)); } catch (_) { return { ...record }; }
}

function clonePreview(preview) {
  return preview ? JSON.parse(JSON.stringify(preview)) : null;
}

function readOwners() {
  const data = getData(THEME_RESOURCE_OWNERS_KEY, {});
  return data && typeof data === 'object' && !Array.isArray(data) ? { ...data } : {};
}

function getAppImages() {
  return typeof window !== 'undefined' ? window.AppImages : null;
}

function getRootElement() {
  return typeof document !== 'undefined' ? document.documentElement : null;
}
