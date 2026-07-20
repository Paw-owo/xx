// core/theme-ai-agent.js
// imports:
//   from './storage.js': getData, setData, removeData, generateId, getNow
//   from './theme.js': getCurrentTheme, applyTheme, exportTheme, importTheme
//   from './theme-resource-manager.js': applyThemeResources, previewThemeResources, confirmThemeResourcePreview, restoreThemeResourcePreview, deleteThemeResources

import { getData, setData, removeData, generateId, getNow } from './storage.js';
import { getCurrentTheme, applyTheme, exportTheme, importTheme } from './theme.js';
import { applyThemeResources, previewThemeResources, confirmThemeResourcePreview, restoreThemeResourcePreview, deleteThemeResources, getThemeResourceTaskState, readThemeImageResource } from './theme-resource-manager.js';

export const THEME_AI_PROTOCOL_VERSION = '1.0.0';
export const THEME_AI_PACKAGE_TYPE = 'ai-phone-theme-package';
export const THEME_AI_PACKAGE_SCHEMA_VERSION = '1.0.0';
export const THEME_AI_VERSIONS_KEY = 'theme_ai_versions';
export const THEME_AI_ACTIVE_VERSION_KEY = 'theme_ai_active_version';
export const THEME_AI_OPTIMIZATION_LOG_KEY = 'theme_ai_optimization_log';
export const THEME_AI_PREVIEW_STATUS = Object.freeze({ ACTIVE: 'active', CONFIRMED: 'confirmed', CANCELLED: 'cancelled' });

const CORE_CONFIG_FIELDS = new Set(['preset', 'mode', 'variables', 'customVariables']);
const TOP_LEVEL_FIELDS = new Set(['themeVariables', 'imageSlots', 'themeConfig', 'uiDecorationParameters']);
const THEME_CONFIG_FIELDS = new Set(['themeId', 'themeName', 'version', 'parentThemeId', 'description', 'metadata', 'createdAt', 'updatedAt']);
const IMAGE_SLOT_FIELDS = new Set(['slot', 'resource', 'required', 'reason']);
const IMAGE_RESOURCE_FIELDS = new Set(['kind', 'value', 'name', 'mimeType', 'opacity', 'metadata']);
const DECORATION_FIELDS = new Set(['desktopWallpaperSoft', 'cardTextureOpacity', 'decorDensity', 'decorIntensity', 'decorEnabled', 'roundness', 'spacingScale', 'motionScale']);
const PACKAGE_FIELDS = new Set(['type', 'schemaVersion', 'protocolVersion', 'exportedAt', 'shareInfo', 'versionInfo', 'parentThemeId', 'themeConfig', 'themeVariables', 'imageSlots', 'uiDecorationParameters', 'theme', 'resources', 'optimizationLog']);

export const ALLOWED_THEME_VARIABLES = Object.freeze({
  colors: Object.freeze([
    'bg-main', 'bg-light', 'bg-card', 'color-accent', 'color-text', 'color-success', 'color-danger',
    'bg-primary', 'bg-secondary', 'bg-overlay', 'surface', 'surface-muted', 'accent', 'accent-light',
    'accent-dark', 'text-primary', 'text-secondary', 'text-hint', 'border-soft', 'icon-color',
    'decor-blue', 'decor-yellow', 'decor-pink', 'decor-cream', 'media-ink', 'media-ink-deep',
    'media-on-dark', 'media-highlight', 'media-overlay-soft', 'media-overlay', 'bubble-user-bg',
    'bubble-user-text', 'bubble-ai-bg', 'bubble-ai-text'
  ]),
  radius: Object.freeze(['bubble-radius', 'bubble-radius-tail', 'radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-full']),
  spacing: Object.freeze(['spacing-xs', 'spacing-sm', 'spacing-md', 'spacing-lg']),
  shadow: Object.freeze(['shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-card', 'shadow-float', 'shadow-neu-out', 'shadow-neu-in']),
  typography: Object.freeze(['font-main', 'font-size-base', 'font-size-small', 'font-size-title']),
  motion: Object.freeze(['motion', 'press-scale'])
});

export const ALLOWED_IMAGE_SLOTS = Object.freeze([
  'app_wallpaper', 'app_widget_area_bg', 'app_widget_bg_time', 'app_widget_bg_weather', 'app_widget_bg_anniversary', 'app_widget_bg_focus',
  'app_lock_background', 'app_lock_avatar',
  'app_bg_chat', 'app_bg_dream', 'app_bg_settings', 'app_bg_moments', 'app_bg_characters', 'app_bg_worldbook', 'app_bg_wallet', 'app_bg_shop', 'app_bg_memo', 'app_bg_anniversary', 'app_bg_games',
  'app_icon_chat', 'app_icon_moments', 'app_icon_settings', 'app_icon_gallery', 'app_icon_characters', 'app_icon_worldbook', 'app_icon_wallet', 'app_icon_shop', 'app_icon_memo', 'app_icon_anniversary', 'app_icon_games', 'app_icon_music', 'app_icon_dream'
]);

export const THEME_AI_WHITELIST = Object.freeze({
  allowedSections: Object.freeze([...TOP_LEVEL_FIELDS]),
  themeVariables: ALLOWED_THEME_VARIABLES,
  imageSlots: ALLOWED_IMAGE_SLOTS,
  themeConfig: Object.freeze([...THEME_CONFIG_FIELDS]),
  uiDecorationParameters: Object.freeze([...DECORATION_FIELDS]),
  forbiddenTargets: Object.freeze([
    'appBusinessLogic', 'eventSystem', 'dataStructures', 'userData', 'coreFeatureCode', 'apiLogic'
  ])
});

const ALL_ALLOWED_VARIABLES = new Set(Object.values(ALLOWED_THEME_VARIABLES).flat());

let activeThemePreview = null;

export function getThemeAIContext() {
  const activeVersion = getActiveThemeVersion();
  return {
    protocolVersion: THEME_AI_PROTOCOL_VERSION,
    currentTheme: getCurrentTheme(),
    activeVersion,
    activePreview: getThemePreviewState(),
    resourceTask: getThemeResourceTaskState(),
    allowedVariables: getAllowedThemeVariableList(),
    allowedImageSlots: [...ALLOWED_IMAGE_SLOTS],
    whitelist: THEME_AI_WHITELIST,
    storage: {
      currentThemeKey: 'app_theme',
      versionsKey: THEME_AI_VERSIONS_KEY,
      activeVersionKey: THEME_AI_ACTIVE_VERSION_KEY,
      imageResourceStore: 'AppImages/writeImageRecord 或 blobs/localStorage 中的现有图片记录'
    }
  };
}

export function getAllowedThemeVariableList() {
  return Object.entries(ALLOWED_THEME_VARIABLES).map(([category, variables]) => ({ category, variables: [...variables] }));
}

export function createThemeConfig(input = {}) {
  const now = getNow();
  const themeConfig = input.themeConfig && typeof input.themeConfig === 'object' ? input.themeConfig : {};
  return {
    themeVariables: normalizeThemeVariables(input.themeVariables || {}),
    imageSlots: normalizeImageSlots(input.imageSlots || {}),
    themeConfig: normalizeThemeConfig({ ...themeConfig, createdAt: themeConfig.createdAt || now, updatedAt: themeConfig.updatedAt || now }),
    uiDecorationParameters: normalizeDecorationParameters(input.uiDecorationParameters || {})
  };
}

export function validateAIThemeResult(input) {
  const errors = [];
  const missingAssets = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['theme_result_must_be_object'], missingAssets };

  rejectUnknownFields(input, TOP_LEVEL_FIELDS, '', errors);
  for (const field of CORE_CONFIG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) errors.push(`forbidden_core_field:${field}`);
  }

  if (input.themeVariables !== undefined) validateThemeVariables(input.themeVariables, errors);
  if (input.imageSlots !== undefined) validateImageSlots(input.imageSlots, errors, missingAssets);
  if (input.themeConfig !== undefined) validateThemeConfig(input.themeConfig, errors);
  if (input.uiDecorationParameters !== undefined) validateDecorationParameters(input.uiDecorationParameters, errors);

  return { ok: errors.length === 0, errors, missingAssets };
}


export function previewTheme(input) {
  const validation = validateAIThemeResult(input);
  if (!validation.ok) return { ok: false, errors: validation.errors, missingAssets: validation.missingAssets };

  if (activeThemePreview?.status === THEME_AI_PREVIEW_STATUS.ACTIVE) {
    restoreThemeSnapshot(activeThemePreview.originalThemeSnapshot);
  }

  const now = getNow();
  const previewThemeConfig = createThemeConfig(input);
  const originalThemeSnapshot = cloneThemeSnapshot(exportTheme());
  const previewId = generateId('theme_preview');

  applyTheme(previewThemeConfig.themeVariables);
  void previewThemeResources(previewThemeConfig, previewId).catch(() => {});

  activeThemePreview = {
    previewId,
    originalThemeSnapshot,
    previewThemeConfig,
    createdAt: now,
    status: THEME_AI_PREVIEW_STATUS.ACTIVE
  };

  return { ok: true, preview: getThemePreviewState(), missingAssets: validation.missingAssets };
}


export async function previewThemeAsync(input) {
  const validation = validateAIThemeResult(input);
  if (!validation.ok) return { ok: false, errors: validation.errors, missingAssets: validation.missingAssets, resourceTask: getThemeResourceTaskState() };

  if (activeThemePreview?.status === THEME_AI_PREVIEW_STATUS.ACTIVE) {
    restoreThemeSnapshot(activeThemePreview.originalThemeSnapshot);
    try { await restoreThemeResourcePreview(activeThemePreview.previewId); } catch (_) {}
  }

  const now = getNow();
  const previewThemeConfig = createThemeConfig(input);
  const originalThemeSnapshot = cloneThemeSnapshot(exportTheme());
  const previewId = generateId('theme_preview');

  applyTheme(previewThemeConfig.themeVariables);
  activeThemePreview = {
    previewId,
    originalThemeSnapshot,
    previewThemeConfig,
    createdAt: now,
    status: THEME_AI_PREVIEW_STATUS.ACTIVE
  };

  try {
    await previewThemeResources(previewThemeConfig, previewId);
    return { ok: true, preview: getThemePreviewState(), missingAssets: validation.missingAssets, resourceTask: getThemeResourceTaskState() };
  } catch (error) {
    if (activeThemePreview?.previewId === previewId) {
      restoreThemeSnapshot(originalThemeSnapshot);
      activeThemePreview = null;
    }
    return { ok: false, errors: [String(error?.message || error)], missingAssets: validation.missingAssets, resourceTask: getThemeResourceTaskState() };
  }
}

export function confirmThemePreview() {
  if (!activeThemePreview || activeThemePreview.status !== THEME_AI_PREVIEW_STATUS.ACTIVE) {
    return { ok: false, errors: ['theme_preview_not_active'], missingAssets: [] };
  }

  const preview = activeThemePreview;
  const saved = saveThemeVersion(preview.previewThemeConfig);
  if (!saved.ok) return saved;

  void confirmThemeResourcePreview(preview.previewId, saved.theme).catch(() => {});
  activeThemePreview = {
    ...preview,
    status: THEME_AI_PREVIEW_STATUS.CONFIRMED,
    confirmedAt: getNow(),
    savedThemeId: saved.theme.themeConfig.themeId
  };

  const result = { ok: true, theme: saved.theme, preview: getThemePreviewState(), missingAssets: saved.missingAssets || [] };
  activeThemePreview = null;
  return result;
}

export function cancelThemePreview() {
  if (!activeThemePreview || activeThemePreview.status !== THEME_AI_PREVIEW_STATUS.ACTIVE) {
    return { ok: false, errors: ['theme_preview_not_active'], missingAssets: [] };
  }

  const preview = activeThemePreview;
  restoreThemeSnapshot(preview.originalThemeSnapshot);
  void restoreThemeResourcePreview(preview.previewId).catch(() => {});
  activeThemePreview = {
    ...preview,
    status: THEME_AI_PREVIEW_STATUS.CANCELLED,
    cancelledAt: getNow()
  };

  const result = { ok: true, preview: getThemePreviewState() };
  activeThemePreview = null;
  return result;
}


export async function confirmThemePreviewAsync() {
  if (!activeThemePreview || activeThemePreview.status !== THEME_AI_PREVIEW_STATUS.ACTIVE) {
    return { ok: false, errors: ['theme_preview_not_active'], missingAssets: [], resourceTask: getThemeResourceTaskState() };
  }

  const preview = activeThemePreview;
  const saved = await saveThemeVersionAsync(preview.previewThemeConfig);
  if (!saved.ok) return saved;

  try {
    await confirmThemeResourcePreview(preview.previewId, saved.theme);
  } catch (error) {
    return { ok: false, errors: [String(error?.message || error)], missingAssets: saved.missingAssets || [], resourceTask: getThemeResourceTaskState() };
  }

  activeThemePreview = {
    ...preview,
    status: THEME_AI_PREVIEW_STATUS.CONFIRMED,
    confirmedAt: getNow(),
    savedThemeId: saved.theme.themeConfig.themeId
  };
  const result = { ok: true, theme: saved.theme, preview: getThemePreviewState(), missingAssets: saved.missingAssets || [], resourceTask: getThemeResourceTaskState() };
  activeThemePreview = null;
  return result;
}

export async function cancelThemePreviewAsync() {
  if (!activeThemePreview || activeThemePreview.status !== THEME_AI_PREVIEW_STATUS.ACTIVE) {
    return { ok: false, errors: ['theme_preview_not_active'], missingAssets: [], resourceTask: getThemeResourceTaskState() };
  }

  const preview = activeThemePreview;
  restoreThemeSnapshot(preview.originalThemeSnapshot);
  try {
    await restoreThemeResourcePreview(preview.previewId);
  } catch (error) {
    return { ok: false, errors: [String(error?.message || error)], missingAssets: [], resourceTask: getThemeResourceTaskState() };
  }
  activeThemePreview = {
    ...preview,
    status: THEME_AI_PREVIEW_STATUS.CANCELLED,
    cancelledAt: getNow()
  };

  const result = { ok: true, preview: getThemePreviewState(), resourceTask: getThemeResourceTaskState() };
  activeThemePreview = null;
  return result;
}

export function getThemePreviewState() {
  return activeThemePreview ? cloneThemePreview(activeThemePreview) : null;
}

export function exportThemePackage(themeId = '') {
  const id = String(themeId || getActiveThemeVersion()?.themeConfig?.themeId || '').trim();
  const theme = id
    ? readThemeVersions().find((item) => item.themeConfig?.themeId === id || item.themeId === id)
    : getActiveThemeVersion();
  if (!theme) return { ok: false, errors: ['theme_version_not_found'] };
  const config = theme.themeConfig || {};
  const optimizationLog = listThemeOptimizationLog(config.themeId);
  return {
    ok: true,
    package: {
      type: THEME_AI_PACKAGE_TYPE,
      schemaVersion: THEME_AI_PACKAGE_SCHEMA_VERSION,
      protocolVersion: THEME_AI_PROTOCOL_VERSION,
      exportedAt: getNow(),
      shareInfo: {
        themeName: config.themeName || '未命名主题',
        author: String(config.author || config.metadata?.author || ''),
        description: String(config.description || ''),
        createdAt: String(config.createdAt || ''),
        version: String(config.version || '1'),
        originalThemeId: String(config.themeId || '')
      },
      versionInfo: sanitizePackageValue({
        themeId: config.themeId || '',
        version: config.version || '1',
        parentThemeId: config.parentThemeId || '',
        createdAt: config.createdAt || '',
        updatedAt: config.updatedAt || ''
      }),
      parentThemeId: String(config.parentThemeId || ''),
      themeConfig: sanitizePackageValue(createThemeConfig(theme).themeConfig),
      themeVariables: sanitizePackageValue(createThemeConfig(theme).themeVariables),
      imageSlots: sanitizePackageValue(createThemeConfig(theme).imageSlots),
      uiDecorationParameters: sanitizePackageValue(createThemeConfig(theme).uiDecorationParameters),
      theme: sanitizePackageValue(createThemeConfig(theme)),
      optimizationLog: optimizationLog.map((item) => sanitizePackageValue({
        parentThemeId: String(item.parentThemeId || ''),
        version: String(item.version || ''),
        userPrompt: String(item.userPrompt || ''),
        aiSummary: String(item.aiSummary || ''),
        createdAt: String(item.createdAt || '')
      }))
    }
  };
}

export async function exportThemePackageAsync(themeId = '') {
  const result = exportThemePackage(themeId);
  if (!result.ok) return result;
  const theme = result.package.theme || {};
  const resources = await collectPortableThemeResources(theme.imageSlots || {});
  const portableSlots = rewriteImageSlotsWithPortableResources(theme.imageSlots || {}, resources);
  const pkg = {
    ...result.package,
    imageSlots: sanitizePackageValue(portableSlots),
    theme: sanitizePackageValue({ ...theme, imageSlots: portableSlots }),
    resources: sanitizePackageValue({
      version: '1',
      exportedAt: getNow(),
      imageSlots: resources
    })
  };
  return { ok: true, package: pkg, externalDependencies: Object.values(resources).filter((item) => item?.externalDependency) };
}

async function collectPortableThemeResources(imageSlots = {}) {
  const resources = {};
  for (const [slot, value] of Object.entries(normalizeImageSlots(imageSlots))) {
    const resource = value.resource || {};
    const portable = await makePortableImageResource(slot, resource);
    resources[slot] = portable;
  }
  return resources;
}

async function makePortableImageResource(slot, resource = {}) {
  const base = { slot, kind: resource.kind || inferResourceKind(resource.value), name: resource.name || '', mimeType: resource.mimeType || '', opacity: resource.opacity, metadata: resource.metadata || {} };
  const value = String(resource.value || '').trim();
  if (!value) return { ...base, status: 'missing', value: '' };
  if (value.startsWith('data:image/')) return { ...base, status: 'embedded', kind: 'dataUrl', value };
  const stored = await readThemeImageResource(slot);
  const storedData = await imageRecordToDataUrl(stored);
  if (storedData) return { ...base, status: 'embedded', kind: 'dataUrl', value: storedData, originalKind: base.kind };
  if (/^https?:\/\//i.test(value)) {
    const downloaded = await downloadImageAsDataUrl(value);
    if (downloaded) return { ...base, status: 'embedded', kind: 'dataUrl', value: downloaded, originalKind: 'url', originalUrl: value };
    return { ...base, status: 'external', kind: 'url', value, externalDependency: true, reason: 'resource_download_failed' };
  }
  if (value.startsWith('blob:')) return { ...base, status: 'unavailable', kind: 'blob', value: '', externalDependency: true, reason: 'blob_resource_not_readable' };
  return { ...base, status: 'external', value, externalDependency: true, reason: 'resource_not_embedded' };
}

function rewriteImageSlotsWithPortableResources(imageSlots = {}, resources = {}) {
  const slots = normalizeImageSlots(imageSlots);
  Object.entries(resources || {}).forEach(([slot, portable]) => {
    if (!slots[slot] || portable?.status !== 'embedded' || !portable.value) return;
    slots[slot] = {
      ...slots[slot],
      resource: {
        ...slots[slot].resource,
        kind: 'dataUrl',
        value: portable.value,
        mimeType: portable.mimeType || slots[slot].resource.mimeType || inferMimeTypeFromDataUrl(portable.value),
        metadata: {
          ...(slots[slot].resource.metadata || {}),
          portable: true,
          originalKind: portable.originalKind || slots[slot].resource.kind || ''
        }
      }
    };
  });
  return slots;
}

function hydrateImageSlotsFromPackage(imageSlots = {}, packageResources = {}) {
  return rewriteImageSlotsWithPortableResources(imageSlots, packageResources);
}

async function imageRecordToDataUrl(record) {
  if (!record) return '';
  const direct = [record.data, record.value, record.image, record.source].find((item) => String(item || '').startsWith('data:image/'));
  if (direct) return String(direct);
  const blob = [record.blob, record.file, record.data, record.value].find((item) => typeof Blob !== 'undefined' && item instanceof Blob);
  if (blob) return blobToDataUrl(blob);
  return '';
}

async function downloadImageAsDataUrl(url) {
  if (typeof fetch !== 'function') return '';
  try {
    const response = await fetch(url);
    if (!response?.ok) return '';
    const contentType = String(response.headers?.get?.('content-type') || '');
    if (contentType && !contentType.toLowerCase().startsWith('image/')) return '';
    const blob = await response.blob();
    if (!String(blob.type || contentType).toLowerCase().startsWith('image/')) return '';
    return blobToDataUrl(blob);
  } catch (_) {
    return '';
  }
}

async function blobToDataUrl(blob) {
  if (!blob) return '';
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  }
  if (typeof Buffer !== 'undefined' && typeof blob.arrayBuffer === 'function') {
    const buffer = Buffer.from(await blob.arrayBuffer());
    return `data:${blob.type || 'image/png'};base64,${buffer.toString('base64')}`;
  }
  return '';
}

function inferMimeTypeFromDataUrl(value) {
  return String(value || '').match(/^data:([^;,]+)/)?.[1] || '';
}

function importThemePackageWithoutPreview(input) {
  let data = input;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch (error) { return { ok: false, errors: [`invalid_theme_package_json:${error.message}`], missingAssets: [] }; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['theme_package_must_be_object'], missingAssets: [] };
  const packageErrors = [];
  rejectUnknownFields(data, PACKAGE_FIELDS, '', packageErrors);
  if (packageErrors.length) return { ok: false, errors: packageErrors.map((error) => error.replace('unknown_field:', 'unknown_package_field:')), missingAssets: [] };
  const schemaVersion = String(data.schemaVersion || '');
  if (!schemaVersion) return { ok: false, errors: ['theme_package_schemaVersion_required'], missingAssets: [] };
  if (schemaVersion !== THEME_AI_PACKAGE_SCHEMA_VERSION) return { ok: false, errors: [`unsupported_theme_package_schemaVersion:${schemaVersion}`], missingAssets: [] };
  const rawTheme = sanitizePackageValue(data.theme || {
    themeConfig: data.themeConfig,
    themeVariables: data.themeVariables,
    imageSlots: data.imageSlots,
    uiDecorationParameters: data.uiDecorationParameters
  });
  if (data.resources?.imageSlots) {
    rawTheme.imageSlots = hydrateImageSlotsFromPackage(rawTheme.imageSlots || {}, data.resources.imageSlots);
  }
  const rawValidation = validateAIThemeResult(rawTheme);
  if (!rawValidation.ok) return { ok: false, errors: rawValidation.errors, missingAssets: rawValidation.missingAssets };
  const theme = createThemeConfig(rawTheme);
  const originalConfig = rawTheme.themeConfig || {};
  theme.themeConfig = {
    ...theme.themeConfig,
    themeId: '',
    themeName: theme.themeConfig.themeName || data.shareInfo?.themeName || '导入主题',
    description: theme.themeConfig.description || data.shareInfo?.description || '',
    version: theme.themeConfig.version || data.shareInfo?.version || '1',
    parentThemeId: theme.themeConfig.parentThemeId || originalConfig.parentThemeId || '',
    metadata: {
      ...(theme.themeConfig.metadata || {}),
      importedAt: getNow(),
      importedFromThemeId: String(originalConfig.themeId || data.shareInfo?.originalThemeId || '')
    }
  };
  delete theme.themeConfig.themeId;
  const validation = validateAIThemeResult(theme);
  if (!validation.ok) return { ok: false, errors: validation.errors, missingAssets: validation.missingAssets };
  return {
    ok: true,
    theme,
    shareInfo: sanitizePackageValue(data.shareInfo || {}),
    optimizationLog: Array.isArray(data.optimizationLog) ? data.optimizationLog.map((item) => sanitizePackageValue(item)) : [],
    missingAssets: validation.missingAssets
  };
}

export function importThemePackage(input) {
  const imported = importThemePackageWithoutPreview(input);
  if (!imported.ok) return imported;
  const preview = previewTheme(imported.theme);
  if (!preview.ok) return { ok: false, errors: preview.errors || [], missingAssets: preview.missingAssets || imported.missingAssets };
  return { ...imported, preview: preview.preview };
}


export async function importThemePackageAsync(input) {
  const imported = importThemePackageWithoutPreview(input);
  if (!imported.ok) return imported;
  const preview = await previewThemeAsync(imported.theme);
  if (!preview.ok) return { ok: false, errors: preview.errors || [], missingAssets: preview.missingAssets || imported.missingAssets, resourceTask: preview.resourceTask };
  return { ...imported, preview: preview.preview, resourceTask: preview.resourceTask };
}

export function saveThemeVersion(input) {
  const prepared = prepareThemeVersionSave(input);
  if (!prepared.ok) return prepared;
  persistPreparedThemeVersion(prepared);
  importTheme({ customVariables: prepared.theme.themeVariables });
  void applyThemeResources(prepared.theme, { persistOwner: true }).catch(() => {});
  return { ok: true, theme: prepared.theme, missingAssets: prepared.missingAssets };
}

export async function saveThemeVersionAsync(input) {
  const prepared = prepareThemeVersionSave(input);
  if (!prepared.ok) return { ...prepared, resourceTask: getThemeResourceTaskState() };
  persistPreparedThemeVersion(prepared);
  importTheme({ customVariables: prepared.theme.themeVariables });
  try {
    const resources = await applyThemeResources(prepared.theme, { persistOwner: true });
    if (resources?.ok === false) return { ok: false, errors: resources.errors || ['theme_resource_apply_failed'], missingAssets: prepared.missingAssets, resourceTask: getThemeResourceTaskState() };
  } catch (error) {
    return { ok: false, errors: [String(error?.message || error)], missingAssets: prepared.missingAssets, resourceTask: getThemeResourceTaskState() };
  }
  return { ok: true, theme: prepared.theme, missingAssets: prepared.missingAssets, resourceTask: getThemeResourceTaskState() };
}

export function deleteThemeVersion(themeId) {
  const prepared = prepareThemeVersionDelete(themeId);
  if (!prepared.ok) return false;
  const resourceOwners = getData('theme_ai_resource_owners', {});
  const hasOwnedResource = resourceOwners && typeof resourceOwners === 'object' && Object.values(resourceOwners).includes(prepared.cleanId);
  if (!prepared.removed || !hasOwnedResource) {
    commitThemeVersionDelete(prepared);
    return true;
  }

  void (async () => {
    try {
      await deleteThemeResources(prepared.cleanId, prepared.removed);
      commitThemeVersionDelete(prepared);
    } catch (error) {
      console.warn('[theme-ai-agent] delete theme resources failed', error?.message || error);
    }
  })();
  return true;
}

export async function deleteThemeVersionAsync(themeId) {
  const prepared = prepareThemeVersionDelete(themeId);
  if (!prepared.ok) return { ok: false, errors: ['theme_version_not_found'], resourceTask: getThemeResourceTaskState() };
  try {
    if (prepared.removed) await deleteThemeResources(prepared.cleanId, prepared.removed);
  } catch (error) {
    return { ok: false, errors: [String(error?.message || error)], resourceTask: getThemeResourceTaskState() };
  }
  commitThemeVersionDelete(prepared);
  return { ok: true, removedThemeId: prepared.cleanId, resourceTask: getThemeResourceTaskState() };
}

export function copyThemeVersion(themeId, overrides = {}) {
  const source = readThemeVersions().find((item) => item.themeConfig?.themeId === themeId || item.themeId === themeId);
  if (!source) return { ok: false, errors: ['theme_version_not_found'], missingAssets: [] };
  const now = getNow();
  return saveThemeVersion({
    ...source,
    themeConfig: {
      ...source.themeConfig,
      ...overrides,
      themeId: generateId('theme'),
      parentThemeId: source.themeConfig.themeId,
      createdAt: now,
      updatedAt: now
    }
  });
}

export function listThemeVersions() { return readThemeVersions(); }
export function recordThemeOptimization(input = {}) {
  const themeId = String(input.themeId || '').trim();
  if (!themeId) return null;
  const log = readThemeOptimizationLog();
  const item = {
    id: generateId('theme_edit'),
    themeId,
    parentThemeId: String(input.parentThemeId || ''),
    version: String(input.version || ''),
    userPrompt: String(input.userPrompt || ''),
    aiSummary: String(input.aiSummary || ''),
    createdAt: getNow()
  };
  setData(THEME_AI_OPTIMIZATION_LOG_KEY, log.concat(item));
  return item;
}
export function listThemeOptimizationLog(themeId = '') {
  const id = String(themeId || '').trim();
  const log = readThemeOptimizationLog();
  return id ? log.filter((item) => item.themeId === id || item.parentThemeId === id) : log;
}
export function getActiveThemeVersion() { const id = getData(THEME_AI_ACTIVE_VERSION_KEY); return id ? readThemeVersions().find((item) => item.themeConfig?.themeId === id) || null : null; }



function prepareThemeVersionSave(input) {
  const validation = validateAIThemeResult(input);
  if (!validation.ok) return { ok: false, errors: validation.errors, missingAssets: validation.missingAssets };

  const versions = readThemeVersions();
  const now = getNow();
  const config = createThemeConfig(input);
  const existingId = String(config.themeConfig.themeId || '').trim();
  const themeId = existingId || generateId('theme');
  const previous = versions.find((item) => item.themeConfig?.themeId === themeId || item.themeId === themeId);
  const theme = {
    ...config,
    themeConfig: {
      ...config.themeConfig,
      themeId,
      themeName: config.themeConfig.themeName || '未命名主题',
      version: config.themeConfig.version || nextVersion(previous?.themeConfig?.version),
      parentThemeId: config.themeConfig.parentThemeId || previous?.themeConfig?.parentThemeId || '',
      createdAt: config.themeConfig.createdAt || previous?.themeConfig?.createdAt || now,
      updatedAt: now
    }
  };
  const nextVersions = versions.filter((item) => item.themeConfig?.themeId !== themeId && item.themeId !== themeId).concat(theme);
  return { ok: true, theme, nextVersions, themeId, missingAssets: validation.missingAssets };
}
function persistPreparedThemeVersion(prepared) {
  setData(THEME_AI_VERSIONS_KEY, prepared.nextVersions);
  setData(THEME_AI_ACTIVE_VERSION_KEY, prepared.themeId);
}
function prepareThemeVersionDelete(themeId) {
  const cleanId = String(themeId || '').trim();
  if (!cleanId) return { ok: false, cleanId: '' };
  const versions = readThemeVersions();
  const removed = versions.find((item) => item.themeConfig?.themeId === cleanId || item.themeId === cleanId);
  const next = versions.filter((item) => item.themeConfig?.themeId !== cleanId && item.themeId !== cleanId);
  return { ok: true, cleanId, removed, next };
}
function commitThemeVersionDelete(prepared) {
  setData(THEME_AI_VERSIONS_KEY, prepared.next);
  if (getData(THEME_AI_ACTIVE_VERSION_KEY) === prepared.cleanId) removeData(THEME_AI_ACTIVE_VERSION_KEY);
}

function restoreThemeSnapshot(snapshot) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  importTheme({
    preset: safeSnapshot.preset,
    mode: safeSnapshot.mode,
    variables: safeSnapshot.variables || {},
    customVariables: safeSnapshot.customVariables || {}
  });
}
function cloneThemeSnapshot(theme) {
  return {
    preset: String(theme?.preset || ''),
    mode: String(theme?.mode || ''),
    variables: { ...(theme?.variables || {}) },
    customVariables: { ...(theme?.customVariables || {}) }
  };
}
function cloneThemePreview(preview) {
  return {
    previewId: preview.previewId,
    originalThemeSnapshot: cloneThemeSnapshot(preview.originalThemeSnapshot),
    previewThemeConfig: createThemeConfig(preview.previewThemeConfig),
    createdAt: preview.createdAt,
    status: preview.status,
    ...(preview.confirmedAt ? { confirmedAt: preview.confirmedAt } : {}),
    ...(preview.cancelledAt ? { cancelledAt: preview.cancelledAt } : {}),
    ...(preview.savedThemeId ? { savedThemeId: preview.savedThemeId } : {})
  };
}

const SENSITIVE_PACKAGE_KEYS = /(^|[_-])(api|token|secret|password|private|credential|authorization|auth|key)($|[_-])|apiKey|accessToken|privateToken|authToken|privateKey|secretKey/i;
function sanitizePackageValue(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizePackageValue(item));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  Object.entries(value).forEach(([key, item]) => {
    if (SENSITIVE_PACKAGE_KEYS.test(String(key))) return;
    out[key] = sanitizePackageValue(item);
  });
  return out;
}

function readThemeOptimizationLog() { const items = getData(THEME_AI_OPTIMIZATION_LOG_KEY, []); return Array.isArray(items) ? items.filter((item) => item && typeof item === 'object') : []; }
function readThemeVersions() { const items = getData(THEME_AI_VERSIONS_KEY, []); return Array.isArray(items) ? items.filter((item) => item && typeof item === 'object') : []; }
function nextVersion(version) { const n = Number(version); return Number.isFinite(n) && n >= 1 ? n + 1 : 1; }
function rejectUnknownFields(obj, allowed, path, errors) { Object.keys(obj || {}).forEach((key) => { if (!allowed.has(key)) errors.push(`unknown_field:${path}${key}`); }); }
function normalizeThemeVariables(vars) { const out = {}; Object.entries(vars || {}).forEach(([k, v]) => { const key = String(k).replace(/^--/, ''); if (ALL_ALLOWED_VARIABLES.has(key)) out[key] = String(v); }); return out; }
function normalizeThemeConfig(config) { const out = {}; Object.entries(config || {}).forEach(([k, v]) => { if (THEME_CONFIG_FIELDS.has(k)) out[k] = k === 'metadata' && v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : String(v ?? ''); }); return out; }
function normalizeDecorationParameters(params) { const out = {}; Object.entries(params || {}).forEach(([k, v]) => { if (DECORATION_FIELDS.has(k)) out[k] = Number(v); }); return out; }
function normalizeImageSlots(slots) { const entries = Array.isArray(slots) ? slots.map((item) => [item?.slot, item]) : Object.entries(slots || {}); const out = {}; entries.forEach(([slot, value]) => { if (ALLOWED_IMAGE_SLOTS.includes(slot)) out[slot] = normalizeImageSlot(slot, value); }); return out; }
function normalizeImageSlot(slot, value) { const raw = value && typeof value === 'object' ? value : { resource: value }; return { slot, resource: normalizeImageResource(raw.resource || raw), required: Boolean(raw.required), reason: String(raw.reason || '') }; }
function normalizeImageResource(resource) { const raw = resource && typeof resource === 'object' ? resource : { value: resource }; return { kind: String(raw.kind || inferResourceKind(raw.value)), value: String(raw.value || ''), name: String(raw.name || ''), mimeType: String(raw.mimeType || ''), opacity: raw.opacity === undefined ? 100 : Number(raw.opacity), metadata: raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata) ? { ...raw.metadata } : {} }; }
function inferResourceKind(value) { const text = String(value || ''); if (text.startsWith('http://') || text.startsWith('https://')) return 'url'; if (text.startsWith('data:image/')) return 'dataUrl'; if (text.startsWith('blob:')) return 'uploaded'; if (text.startsWith('./') || text.startsWith('../') || text.startsWith('/')) return 'local'; return 'missing'; }
function validateThemeVariables(vars, errors) { if (!vars || typeof vars !== 'object' || Array.isArray(vars)) { errors.push('themeVariables_must_be_object'); return; } Object.entries(vars).forEach(([key, value]) => { const clean = String(key).replace(/^--/, ''); if (!ALL_ALLOWED_VARIABLES.has(clean)) errors.push(`unknown_theme_variable:${key}`); if (!isSafeCssValue(value)) errors.push(`illegal_css_value:${key}`); }); }
function validateThemeConfig(config, errors) { if (!config || typeof config !== 'object' || Array.isArray(config)) { errors.push('themeConfig_must_be_object'); return; } rejectUnknownFields(config, THEME_CONFIG_FIELDS, 'themeConfig.', errors); }
function validateImageSlots(slots, errors, missingAssets) { if (!slots || typeof slots !== 'object') { errors.push('imageSlots_must_be_object_or_array'); return; } const entries = Array.isArray(slots) ? slots.map((item) => [item?.slot, item]) : Object.entries(slots); entries.forEach(([slot, value]) => { if (!ALLOWED_IMAGE_SLOTS.includes(slot)) errors.push(`unknown_image_slot:${slot}`); if (!value || typeof value !== 'object') { errors.push(`image_slot_must_be_object:${slot}`); return; } rejectUnknownFields(value, IMAGE_SLOT_FIELDS, `imageSlots.${slot}.`, errors); const resource = value.resource; if (resource && typeof resource === 'object') rejectUnknownFields(resource, IMAGE_RESOURCE_FIELDS, `imageSlots.${slot}.resource.`, errors); const normalized = normalizeImageSlot(slot, value); if (normalized.required && !normalized.resource.value) missingAssets.push({ slot, reason: normalized.reason || 'missing_theme_asset' }); if (normalized.resource.value && !isSafeImageResource(normalized.resource.value)) errors.push(`illegal_image_resource:${slot}`); }); }
function validateDecorationParameters(params, errors) { if (!params || typeof params !== 'object' || Array.isArray(params)) { errors.push('uiDecorationParameters_must_be_object'); return; } rejectUnknownFields(params, DECORATION_FIELDS, 'uiDecorationParameters.', errors); Object.entries(params).forEach(([key, value]) => { const n = Number(value); if (!Number.isFinite(n) || n < 0 || n > 1) errors.push(`decoration_parameter_out_of_range:${key}`); }); }
function isSafeImageResource(value) { const text = String(value || '').trim(); return /^(https?:\/\/|data:image\/|blob:|\.\/|\.\.\/|\/)[^\s]*$/i.test(text) && !/["'<>\\]/.test(text); }
function isSafeCssValue(value) { const text = String(value ?? '').trim(); if (!text || text.length > 240) return false; if (/[{};<>]|url\s*\(|@import|expression\s*\(|javascript:/i.test(text)) return false; return /^#[0-9a-f]{3,8}$/i.test(text) || /^-?\d+(\.\d+)?(px|rem|em|%|s|ms)?$/i.test(text) || /^rgba?\([\d\s.,%]+\)$/i.test(text) || /^hsla?\([\d\s.,%]+\)$/i.test(text) || /^color-mix\([\w\s,().%+-]+\)$/i.test(text) || /^var\(--[\w-]+\)$/i.test(text) || /^[\w\s',.-]+$/.test(text); }
