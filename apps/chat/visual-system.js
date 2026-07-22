// apps/chat/visual-system.js
// 消息 APP 唯一视觉层：仅负责主题变量、形状、层级与聊天激活期间的 body 弹层。

const CHAT_APP_STYLE_ID = 'chat-app-style';

export function mountChatVisualSystem() {
  if (document.getElementById(CHAT_APP_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = CHAT_APP_STYLE_ID;
  style.textContent = `
    .chat-route-stage {
      --chat-surface: color-mix(in srgb, var(--bg-card) 92%, var(--accent-light));
      --chat-surface-soft: color-mix(in srgb, var(--bg-card) 76%, var(--accent-light));
      --chat-accent-fill: color-mix(in srgb, var(--accent) 78%, var(--bg-card));
      --chat-line: color-mix(in srgb, var(--text-primary) 48%, var(--accent-dark));
      --chat-line-soft: color-mix(in srgb, var(--chat-line) 36%, transparent);
      --chat-ink: color-mix(in srgb, var(--text-primary) 88%, var(--accent-dark));
      --chat-icon-line: var(--chat-line);
      --chat-icon-fill: color-mix(in srgb, var(--accent-light) 72%, var(--bg-card));
      --chat-icon-paper: color-mix(in srgb, var(--bg-card) 74%, var(--accent-light));
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .chat-page {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: var(--font-size-base);
      line-height: 1.6;
    }

    .chat-icon-btn,
    .chat-primary-btn,
    .chat-ghost-btn {
      border: 0;
      font: inherit;
      transition: all 200ms ease;
    }

    .chat-icon-btn:active,
    .chat-primary-btn:active,
    .chat-ghost-btn:active {
      transform: scale(0.96);
    }

    .chat-icon-btn {
      width: 38px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .chat-primary-btn,
    .chat-ghost-btn {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 16px;
      border-radius: var(--radius-md);
    }

    .chat-primary-btn {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-ghost-btn {
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .chat-input-card {
      width: 100%;
      min-height: 42px;
      border: 0;
      outline: 0;
      border-radius: var(--radius-md);
      background: var(--bg-card);
      color: var(--text-primary);
      padding: 10px 13px;
      font: inherit;
      font-size: 16px;
      line-height: 1.6;
      appearance: none;
    }

    .chat-input-card::placeholder {
      color: var(--text-hint);
    }

    .chat-empty {
      min-height: 190px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 30px 20px;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      text-align: center;
    }

    .chat-empty-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-empty-desc {
      max-width: 270px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .chat-page .chat-icon-btn,
    .chat-page .chat-thread-send,
    .chat-page .chat-primary-btn,
    .chat-page .chat-ghost-btn,
    .chat-page .chat-mini-btn,
    .chat-page .chat-load-more-btn,
    .chat-page .chat-thread-tool-page-btn {
      border: 0;
    }

    .chat-page .chat-icon-btn,
    .chat-page .chat-ghost-btn,
    .chat-page .chat-mini-btn,
    .chat-page .chat-load-more-btn,
    .chat-page .chat-thread-tool-page-btn {
      background: var(--chat-surface);
      color: var(--chat-ink);
    }

    .chat-page .chat-primary-btn,
    .chat-page .chat-mini-btn.primary,
    .chat-page .chat-thread-send,
    .chat-page .chat-list-tab.active {
      background: var(--chat-accent-fill);
      color: var(--chat-ink);
    }

    .chat-page .chat-input-card,
    .chat-page .chat-thread-input,
    .chat-page .chat-thread-search-input,
    .chat-page .chat-list-search-input {
      border: 0;
      background: var(--chat-surface);
      color: var(--chat-ink);
    }

    .chat-page .chat-thread-tool-card,
    .chat-page .chat-list-action,
    .chat-page .chat-list-picker-row,
    .chat-page .chat-thread-row,
    .chat-page .chat-empty,
    .chat-page .chat-pending-image {
      border: 0;
      background: var(--chat-surface);
    }

    .chat-page .chat-thread-tool-icon,
    .chat-page .chat-list-action-icon,
    .chat-page .chat-token-pill,
    .chat-page .chat-thread-lock-badge {
      border: 0;
      background: var(--chat-surface-soft);
      color: var(--chat-ink);
    }

    .chat-page .chat-icon-btn,
    .chat-page .chat-thread-mic,
    .chat-page .chat-thread-send {
      width: 42px;
      height: 42px;
      min-width: 42px;
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 0;
      border-radius: 15px;
      background: var(--chat-surface-soft);
      color: var(--chat-ink);
    }

    .chat-page .chat-thread-send {
      border-radius: 16px;
      background: var(--chat-accent-fill);
    }

    .chat-page .chat-thread-mic.is-recording {
      background: var(--chat-accent-fill);
      color: var(--chat-ink);
    }

    .chat-page .chat-icon-btn:disabled,
    .chat-page .chat-thread-mic:disabled,
    .chat-page .chat-thread-send:disabled {
      opacity: 0.48;
    }

    .chat-page .chat-icon-btn:focus-visible,
    .chat-page .chat-thread-mic:focus-visible,
    .chat-page .chat-thread-send:focus-visible,
    .chat-page .chat-mini-btn:focus-visible,
    .chat-page .chat-load-more-btn:focus-visible,
    .chat-page .chat-thread-tool-page-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .chat-page .chat-thread-tool-card {
      background: var(--chat-surface-soft);
    }

    .chat-page .chat-thread-tool-icon,
    .chat-page .chat-list-action-icon {
      background: transparent;
    }

    .chat-page .chat-message-action-btn,
    .chat-page .tc-pill {
      border: 0;
      background: var(--chat-surface-soft);
      color: var(--chat-ink);
    }

    /* Chat containers share one quiet cat-toy language without covering content. */
    .chat-page .chat-thread-row,
    .chat-page .chat-message-bubble,
    .chat-page .chat-time-pill,
    .chat-page .chat-message-quote,
    .chat-page .chat-quote-preview,
    .chat-page .chat-pending-card,
    .chat-page .chat-pending-image,
    .chat-page .chat-thread-tool-card,
    .chat-page .chat-thread-input-bar {
      position: relative;
    }

    .chat-page .chat-thread-row {
      border-radius: 22px 22px 22px 16px;
    }

    .chat-page .chat-thread-row::before {
      content: '';
      position: absolute;
      top: -4px;
      left: 18px;
      width: 10px;
      height: 10px;
      border-radius: 3px 8px 3px 8px;
      background: var(--chat-surface);
      transform: rotate(35deg);
      pointer-events: none;
    }

    .chat-page .chat-message-bubble:not(.sticker-bubble):not(.image-bubble) {
      overflow: visible;
    }

    .chat-page .chat-message-bubble.role-user:not(.sticker-bubble):not(.image-bubble) {
      border-radius: 21px 21px 8px 21px;
    }

    .chat-page .chat-message-bubble.role-user:not(.sticker-bubble):not(.image-bubble)::after {
      content: '';
      position: absolute;
      right: -5px;
      bottom: 3px;
      width: 11px;
      height: 15px;
      border-right: 5px solid var(--bubble-user-bg);
      border-bottom: 3px solid var(--bubble-user-bg);
      border-radius: 0 0 12px 0;
      transform: rotate(12deg);
      pointer-events: none;
    }

    .chat-page .chat-message-bubble.role-ai:not(.sticker-bubble):not(.image-bubble) {
      border-radius: 21px 21px 21px 9px;
    }

    .chat-page .chat-message-bubble.role-ai:not(.sticker-bubble):not(.image-bubble)::before {
      content: '';
      position: absolute;
      left: 13px;
      top: -5px;
      width: 9px;
      height: 9px;
      border-radius: 2px 7px 2px 7px;
      background: var(--bubble-ai-bg);
      transform: rotate(45deg);
      pointer-events: none;
    }

    .chat-page .chat-message-row.mode-dialog .chat-message-bubble:not(.sticker-bubble):not(.image-bubble) {
      padding: 10px 12px;
      background: var(--chat-surface-soft);
      border-radius: 20px;
    }

    .chat-page .chat-time-pill {
      border-radius: 999px 999px 999px 13px;
      background: var(--chat-surface-soft);
    }

    .chat-page .chat-time-pill::before {
      content: '';
      position: absolute;
      top: -4px;
      left: 11px;
      width: 8px;
      height: 8px;
      border-radius: 2px 7px 2px 7px;
      background: var(--chat-surface-soft);
      transform: rotate(45deg);
    }

    .chat-page .tc-pill {
      position: relative;
      border-radius: 999px 999px 999px 14px;
    }

    .chat-page .tc-pill::before {
      content: '';
      position: absolute;
      top: -4px;
      left: 12px;
      width: 8px;
      height: 8px;
      border-radius: 2px 7px 2px 7px;
      background: var(--chat-surface-soft);
      transform: rotate(45deg);
    }

    .chat-page .chat-message-quote,
    .chat-page .chat-quote-preview {
      border: 0;
      border-radius: 18px 18px 18px 10px;
      background: var(--chat-surface-soft);
    }

    .chat-page .chat-message-quote::before,
    .chat-page .chat-quote-preview::before {
      content: '';
      position: absolute;
      top: 50%;
      left: -5px;
      width: 9px;
      height: 13px;
      border: 2px solid var(--accent);
      border-radius: 8px 3px 8px 3px;
      transform: translateY(-50%) rotate(38deg);
      opacity: 0.5;
      pointer-events: none;
    }

    .chat-page .chat-message-action-btn {
      min-width: 28px;
      min-height: 28px;
      border-radius: 14px 14px 14px 9px;
    }

    .chat-page .chat-pending-card {
      padding: 7px 10px;
      border-radius: 16px 16px 16px 8px;
      background: var(--chat-surface-soft);
    }

    .chat-page .chat-pending-dot {
      width: 7px;
      height: 7px;
      background: var(--accent);
    }

    .chat-page .chat-pending-image {
      border-radius: 18px 18px 18px 10px;
    }

    .chat-page .chat-pending-image::before {
      content: '';
      position: absolute;
      z-index: 1;
      top: -3px;
      left: 10px;
      width: 9px;
      height: 9px;
      border-radius: 2px 7px 2px 7px;
      background: var(--chat-surface-soft);
      transform: rotate(45deg);
      pointer-events: none;
    }

    .chat-page .chat-thread-tool-head {
      align-items: center;
    }

    .chat-page .chat-thread-tool-title {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .chat-page .chat-thread-tool-title::before {
      content: '';
      width: 11px;
      height: 11px;
      border: 2px solid var(--accent);
      border-radius: 7px 7px 9px 9px;
      opacity: 0.55;
    }

    .chat-page .chat-thread-tool-card {
      border-radius: 22px 22px 22px 14px;
    }

    .chat-page .chat-thread-input-bar {
      margin: 0 10px calc(8px + env(safe-area-inset-bottom));
      padding: 10px 10px 10px;
      border-radius: 26px 26px 20px 20px;
      background: var(--chat-surface) !important;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }

    .chat-page .chat-thread-input-bar::before {
      content: '';
      position: absolute;
      top: -7px;
      right: 28px;
      width: 16px;
      height: 11px;
      border: 2px solid var(--accent);
      border-radius: 10px 4px 10px 4px;
      background: var(--chat-surface);
      transform: rotate(12deg);
      opacity: 0.42;
      pointer-events: none;
    }

    .chat-page .chat-thread-input {
      border-radius: 18px 18px 18px 12px;
    }

    .chat-page .chat-icon-btn,
    .chat-page .chat-thread-mic {
      border-radius: 16px 16px 16px 11px;
    }

    .chat-kawaii-icon .fill {
      fill: var(--chat-icon-fill);
      stroke: var(--chat-icon-line);
    }

    .chat-kawaii-icon .paper {
      fill: var(--chat-icon-paper);
      stroke: var(--chat-icon-line);
    }

    .chat-kawaii-icon .dot {
      fill: var(--chat-icon-line);
      stroke: none;
    }

    .chat-empty-icon {
      width: 58px;
      height: 50px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 2px;
      border: 0;
      border-radius: 46% 54% 48% 52%;
      background: var(--chat-surface-soft);
      color: var(--chat-ink);
    }

    body:has(.chat-route-stage) {
      --chat-surface: color-mix(in srgb, var(--bg-card) 92%, var(--accent-light));
      --chat-surface-soft: color-mix(in srgb, var(--bg-card) 76%, var(--accent-light));
      --chat-accent-fill: color-mix(in srgb, var(--accent) 78%, var(--bg-card));
      --chat-ink: color-mix(in srgb, var(--text-primary) 88%, var(--accent-dark));
    }

    /* Option rows: one clipped-soft corner reads as a cat-tail notch. */
    body:has(.chat-route-stage) :is(
      .chat-list-tab,
      .chat-list-action,
      .chat-list-picker-row,
      .chat-action-sheet-item,
      .settings-nav-item,
      .settings-switch-row,
      .settings-label-block,
      .api-choice-card,
      .api-section-entry,
      .api-detail-segment,
      .mcp-server-row,
      .mcp-tool-row,
      .thread-chip-card,
      .editable-card,
      .tools-option-btn,
      .tools-stat-row,
      .tools-chip,
      .tools-empty,
      .gh-item,
      .ask-user-option,
      .tc-step-row,
      .ss-tab-btn
    ) {
      border: 0;
      border-radius: 19px 19px 19px 11px;
      background: var(--chat-surface-soft);
    }

    body:has(.chat-route-stage) :is(
      .settings-nav-item,
      .settings-switch-row,
      .settings-label-block,
      .api-choice-card,
      .api-section-entry,
      .api-detail-segment,
      .mcp-server-row,
      .mcp-tool-row,
      .thread-chip-card,
      .editable-card,
      .tools-option-btn,
      .tools-stat-row,
      .tools-chip,
      .tools-empty,
      .gh-item,
      .ask-user-option,
      .tc-step-row
    ) {
      position: relative;
      overflow: visible;
    }

    /* Panels stay readable and use a single toy-tag corner rather than a plain card. */
    body:has(.chat-route-stage) :is(
      .settings-card,
      .settings-confirm-card,
      .api-detail-card,
      .thread-sheet-card,
      .thread-sheet-empty,
      .chat-memory-card,
      .chat-memory-add-panel,
      .chat-memory-hero-block,
      .chat-lock-card,
      .chat-input-dialog-card,
      .ask-user-card,
      .ask-user-sheet,
      .ss-confirm-card,
      .gh-field,
      .gh-commit-field,
      .chat-game-card,
      .chat-dice-card,
      .chat-rps-card,
      .chat-mini-message-card,
      .chat-voice-card,
      .chat-message-code,
      .tc-detail-section
    ) {
      border: 0;
      border-radius: 22px 22px 22px 13px;
      background-color: var(--chat-surface);
    }

    /* Section labels carry one tiny bell; text and wrapping remain untouched. */
    body:has(.chat-route-stage) :is(
      .settings-card-title,
      .api-sheet-heading,
      .thread-sheet-title,
      .tools-section-label,
      .tools-detail-title,
      .tools-section-title,
      .chat-settings-sheet-title,
      .chat-thread-tools-title,
      .chat-action-sheet-title,
      .tc-sheet-title,
      .tc-detail-section-label
    ) {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    body:has(.chat-route-stage) :is(
      .settings-card-title,
      .api-sheet-heading,
      .thread-sheet-title,
      .tools-section-label,
      .tools-detail-title,
      .tools-section-title,
      .chat-settings-sheet-title,
      .chat-thread-tools-title,
      .chat-action-sheet-title,
      .tc-sheet-title,
      .tc-detail-section-label
    )::before {
      content: '';
      width: 10px;
      height: 10px;
      flex: 0 0 auto;
      border: 2px solid var(--accent);
      border-radius: 7px 7px 9px 9px;
      opacity: 0.5;
    }

    /* Toggles and selection marks become quiet paw/bell shapes. */
    body:has(.chat-route-stage) .settings-switch-dot::after,
    body:has(.chat-route-stage) .mcp-toggle-dot {
      border-radius: 55% 55% 46% 46%;
      background: var(--chat-surface);
    }

    body:has(.chat-route-stage) :is(.tools-dot, .tc-step-dot) {
      border-radius: 55% 55% 42% 42%;
    }

    body:has(.chat-route-stage) :is(.api-choice-check, .mcp-tool-status, .mcp-server-capsule, .api-detail-pill) {
      border: 0;
      border-radius: 999px 999px 999px 10px;
      background: var(--chat-surface-soft);
    }

    body:has(.chat-route-stage) .api-choice-card.selected .api-choice-check {
      border-radius: 55% 55% 42% 42%;
      background: var(--accent);
    }

    body:has(.chat-route-stage) .ask-user-option.selected {
      position: relative;
      padding-right: 34px;
    }

    body:has(.chat-route-stage) .ask-user-option.selected::after {
      content: '';
      position: absolute;
      top: 50%;
      right: 13px;
      width: 10px;
      height: 10px;
      border-radius: 55% 55% 42% 42%;
      background: currentColor;
      opacity: 0.62;
      transform: translateY(-50%);
    }

    body:has(.chat-route-stage) .tools-dot.active {
      width: 10px;
      height: 8px;
      border-radius: 55% 55% 42% 42%;
    }

    /* Drawer/menu actions look like light toy tags; semantic danger colors remain owned by their state classes. */
    body:has(.chat-route-stage) :is(
      .settings-action-btn,
      .settings-confirm-btn,
      .thread-sheet-btn,
      .editable-toolbar-btn,
      .chat-mini-btn,
      .chat-edit-btn,
      .chat-input-dialog-btn,
      .ask-user-btn-primary,
      .ask-user-btn-secondary,
      .gh-btn,
      .ss-delete-btn,
      .chat-version-pager-btn,
      .chat-thread-tool-page-btn
    ) {
      border: 0;
      border-radius: 16px 16px 16px 10px;
    }

    body:has(.chat-route-stage) :is(
      .settings-action-btn,
      .thread-sheet-btn,
      .editable-toolbar-btn,
      .chat-edit-btn,
      .chat-input-dialog-btn,
      .ask-user-btn-secondary,
      .gh-btn-secondary,
      .chat-version-pager-btn,
      .chat-thread-tool-page-btn
    ):not(.primary):not(.danger) {
      background: var(--chat-surface-soft);
      color: var(--chat-ink);
    }

    body:has(.chat-route-stage) .editable-card-del {
      background: color-mix(in srgb, var(--color-danger) 12%, transparent);
      color: var(--color-danger);
    }

    body:has(.chat-route-stage) .bottom-sheet {
      --chat-surface: color-mix(in srgb, var(--bg-card) 92%, var(--accent-light));
      --chat-surface-soft: color-mix(in srgb, var(--bg-card) 76%, var(--accent-light));
      --chat-line: color-mix(in srgb, var(--text-primary) 48%, var(--accent-dark));
      --chat-line-soft: color-mix(in srgb, var(--chat-line) 36%, transparent);
      --chat-ink: color-mix(in srgb, var(--text-primary) 88%, var(--accent-dark));
      --chat-icon-line: var(--chat-line);
      --chat-icon-fill: color-mix(in srgb, var(--accent-light) 72%, var(--bg-card));
      --chat-icon-paper: color-mix(in srgb, var(--bg-card) 74%, var(--accent-light));
      border: 0;
      background: var(--chat-surface);
      color: var(--chat-ink);
    }

    body:has(.chat-route-stage) .sheet-handle {
      width: 42px;
      height: 8px;
      border: 2px solid var(--accent-light);
      border-top: 0;
      border-radius: 0 0 999px 999px;
      background: transparent;
      transform: rotate(-4deg);
    }

    body:has(.chat-route-stage) .bottom-sheet .chat-list-action,
    body:has(.chat-route-stage) .bottom-sheet .chat-list-picker-row,
    body:has(.chat-route-stage) .bottom-sheet .chat-thread-sheet-item {
      border: 0;
      border-radius: 20px 20px 20px 13px;
      background: var(--chat-surface-soft, var(--surface-muted));
    }

    body:has(.chat-route-stage) .bottom-sheet .chat-list-action-icon,
    body:has(.chat-route-stage) .bottom-sheet .chat-thread-tool-icon {
      border: 0;
      background: transparent;
    }

    body:has(.chat-route-stage) .tc-sheet {
      border-radius: 30px 30px 0 0;
      background: var(--chat-surface, var(--bg-card));
    }

    body:has(.chat-route-stage) .tc-sheet-handle {
      width: 42px;
      height: 8px;
      border: 2px solid var(--accent-light);
      border-top: 0;
      border-radius: 0 0 999px 999px;
      background: transparent;
      transform: rotate(-4deg);
    }


    /* ===== Final visual closure: shared cozy system for every Chat surface ===== */
    body:has(.chat-route-stage) :is(
      .chat-page,
      .bottom-sheet,
      .tc-sheet,
      .chat-call-screen,
      .gh-sheet,
      .chat-memory-page
    ) {
      color: var(--chat-ink, var(--text-primary));
      text-rendering: optimizeLegibility;
    }

    body:has(.chat-route-stage) :is(
      .chat-list-header,
      .chat-thread-header,
      .chat-memory-header,
      .gh-title,
      .chat-call-top
    ) {
      border: 0;
      box-shadow: none;
      background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
    }

    body:has(.chat-route-stage) :is(
      .chat-list-title-main,
      .chat-thread-name,
      .chat-memory-title,
      .gh-title,
      .chat-call-name,
      .settings-card-title,
      .thread-sheet-title,
      .tools-detail-title,
      .tc-sheet-title,
      .ask-user-title,
      .chat-sub-agent-title
    ) {
      font-weight: 650;
      letter-spacing: 0;
      color: var(--text-primary);
    }

    body:has(.chat-route-stage) :is(
      .chat-list-title-sub,
      .chat-thread-status,
      .chat-memory-subtitle,
      .gh-sub,
      .chat-call-status,
      .settings-card-desc,
      .thread-sheet-desc,
      .tools-option-desc,
      .ask-user-desc,
      .chat-sub-agent-summary
    ) {
      color: var(--text-secondary);
      line-height: 1.55;
    }

    body:has(.chat-route-stage) :is(
      .chat-list-search-input,
      .chat-thread-search-input,
      .chat-thread-input,
      .chat-memory-search-input,
      .gh-search,
      .gh-field input,
      .gh-commit-field input,
      .gh-viewer textarea,
      .settings-input,
      .settings-textarea
    ) {
      border: 0;
      outline: 0;
      background: var(--chat-surface);
      color: var(--text-primary);
      box-shadow: none;
    }

    body:has(.chat-route-stage) :is(
      button,
      input,
      textarea,
      select,
      [role="button"],
      [tabindex]:not([tabindex="-1"])
    ):focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    body:has(.chat-route-stage) :is(
      .chat-thread-row,
      .chat-list-picker-row,
      .chat-list-action,
      .chat-thread-tool-card,
      .thread-sheet-btn,
      .thread-chip-card,
      .mcp-server-row,
      .mcp-tool-row,
      .settings-nav-item,
      .settings-switch-row,
      .chat-memory-card,
      .chat-memory-filter,
      .ask-user-card,
      .ask-user-option,
      .chat-sub-agent-card,
      .gh-field,
      .gh-status,
      .gh-item,
      .gh-branch-info,
      .ss-cell,
      .ss-tab-btn,
      .chat-call-transcript,
      .chat-call-control,
      .chat-call-send
    ) {
      border: 0;
      box-shadow: none;
      background: var(--chat-surface-soft);
    }

    body:has(.chat-route-stage) :is(
      .chat-thread-row,
      .chat-list-picker-row,
      .chat-list-action,
      .chat-memory-card,
      .ask-user-card,
      .chat-sub-agent-card,
      .gh-field,
      .gh-status,
      .gh-branch-info,
      .chat-call-transcript
    ) {
      border-radius: 24px 24px 24px 15px;
    }

    body:has(.chat-route-stage) :is(
      .chat-thread-row,
      .chat-thread-tool-card,
      .chat-list-action,
      .chat-memory-filter,
      .ask-user-option,
      .chat-sub-agent-card,
      .gh-item,
      .ss-cell,
      .chat-call-control
    ) {
      transition: transform 180ms ease, background 180ms ease, opacity 180ms ease;
    }

    body:has(.chat-route-stage) :is(
      .chat-thread-row,
      .chat-thread-tool-card,
      .chat-list-action,
      .chat-memory-filter,
      .ask-user-option,
      .gh-item,
      .ss-cell,
      .chat-call-control
    ):active {
      transform: scale(0.985);
    }

    body:has(.chat-route-stage) :is(
      .chat-message-bubble.role-user,
      .chat-message-bubble.role-ai,
      .chat-message-bubble.role-assistant
    ) {
      box-shadow: none;
      border: 0;
      line-height: 1.68;
    }

    body:has(.chat-route-stage) :is(
      .chat-message-quote,
      .chat-quote-preview,
      .chat-message-code,
      .chat-tool-result-card,
      .mcp-tool-result,
      .tc-detail-section,
      .ask-user-summary,
      .chat-sub-agent-block,
      .gh-viewer textarea,
      .ss-preview
    ) {
      border: 0;
      box-shadow: none;
      background: var(--chat-surface);
      color: var(--text-primary);
      border-radius: 18px 18px 18px 11px;
    }

    body:has(.chat-route-stage) :is(
      .chat-message-code,
      .gh-viewer textarea
    ) {
      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
      white-space: pre-wrap;
    }

    body:has(.chat-route-stage) :is(
      .chat-message-error,
      .chat-message-stopped,
      .mcp-tool-failed,
      .tc-step-row[data-status="failed"],
      .gh-error,
      .ask-user-error,
      .chat-sub-agent-card[data-status="failed"]
    ) {
      background: color-mix(in srgb, var(--color-danger) 12%, var(--chat-surface));
      color: var(--text-primary);
    }

    body:has(.chat-route-stage) :is(
      .chat-thread-input-bar,
      .chat-pending-images,
      .chat-quote-preview,
      .chat-recording-bar
    ) {
      box-shadow: none;
    }

    body:has(.chat-route-stage) :is(
      .chat-thread-send,
      .chat-primary-btn,
      .chat-mini-btn.primary,
      .thread-sheet-btn.primary,
      .settings-action-btn.primary,
      .ask-user-btn-primary,
      .gh-btn-primary,
      .ss-upload-save
    ) {
      background: var(--chat-accent-fill);
      color: var(--chat-ink);
    }

    body:has(.chat-route-stage) :is(
      .chat-list-tab.active,
      .chat-memory-filter.active,
      .ss-tab-btn.is-active,
      .api-choice-card.selected,
      .ask-user-option.selected
    ) {
      background: color-mix(in srgb, var(--accent-light) 58%, var(--bg-card));
      color: var(--text-primary);
    }

    body:has(.chat-route-stage) :is(
      .chat-thread-unread,
      .chat-token-pill,
      .mcp-server-capsule,
      .api-detail-pill,
      .gh-branch-info,
      .chat-sub-agent-summary,
      .ask-user-state-pill
    ) {
      border: 0;
      background: color-mix(in srgb, var(--accent) 30%, var(--chat-surface));
      color: var(--text-primary);
      border-radius: 999px 999px 999px 10px;
      font-weight: 650;
    }

    body:has(.chat-route-stage) :is(
      .bottom-sheet,
      .chat-action-sheet,
      .thread-sheet-card,
      .tc-sheet,
      .settings-confirm-card,
      .ss-confirm-card
    ) {
      box-shadow: none;
      border: 0;
    }

    body:has(.chat-route-stage) :is(
      .sheet-handle,
      .tc-sheet-handle,
      .chat-action-sheet-handle,
      .thread-sheet-handle
    ) {
      background: color-mix(in srgb, var(--accent-light) 76%, transparent);
    }

    body:has(.chat-route-stage) :is(
      .chat-memory-empty,
      .gh-empty,
      .tools-empty,
      .thread-sheet-empty,
      .ss-empty,
      .ask-user-empty,
      .chat-sub-agent-detail[hidden]
    ) {
      border: 0;
      background: var(--chat-surface);
      color: var(--text-secondary);
      border-radius: 24px 24px 24px 15px;
      text-align: center;
    }

    body:has(.chat-route-stage) :is(
      .chat-call-hangup,
      .thread-sheet-btn.danger,
      .settings-action-btn.danger,
      .chat-list-action.danger,
      .ss-delete-btn,
      .gh-btn-danger
    ) {
      background: color-mix(in srgb, var(--color-danger) 18%, var(--chat-surface));
      color: var(--color-danger);
    }

    @media (prefers-reduced-motion: reduce) {
      body:has(.chat-route-stage) *,
      body:has(.chat-route-stage) *::before,
      body:has(.chat-route-stage) *::after {
        animation-duration: 1ms;
        animation-iteration-count: 1;
        transition-duration: 1ms;
        scroll-behavior: auto;
      }
    }

    @media (max-width: 430px) {
      .chat-page .chat-icon-btn,
      .chat-page .chat-thread-send {
        min-width: 42px;
        min-height: 42px;
      }

      .chat-page .chat-thread-tool-grid {
        gap: 7px;
      }
    }
  `;

  document.head.appendChild(style);
}


export function unmountChatVisualSystem() {
  document.getElementById(CHAT_APP_STYLE_ID)?.remove();
}
