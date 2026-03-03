/**
 * Sidebar Webview 的 CSS 样式
 * 从 sidebarProvider.ts 中提取，便于维护
 */
export function getSidebarStyles(): string {
  return `
    :root {
      --spacing-xs: 4px;
      --spacing-sm: 8px;
      --spacing-md: 12px;
      --spacing-lg: 16px;
      --radius: 8px;
      --font-xs: 10px;
      --font-sm: 12px;
      --font-md: 13px;
      --font-lg: 13px;
      --font-xl: 14px;
      --transition-fast: 0.15s ease;
      --transition-normal: 0.2s ease;
      --transition-slow: 0.3s ease;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ====== 头部状态栏 ====== */
    .header {
      padding: var(--spacing-sm) var(--spacing-md);
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      flex-shrink: 0;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vscode-testing-iconPassed);
      flex-shrink: 0;
    }

    .status-dot.waiting {
      background: var(--vscode-editorWarning-foreground);
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .header-text {
      font-size: var(--font-sm);
      opacity: 0.8;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-state-pill {
      font-size: var(--font-xs);
      color: var(--vscode-badge-foreground);
      background: var(--vscode-badge-background);
      border-radius: 999px;
      padding: 2px 8px;
      flex-shrink: 0;
      max-width: 70px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-icon-btn {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 14px;
      min-width: 30px;
      min-height: 30px;
      padding: 4px 8px;
      border-radius: 4px;
      opacity: 0.6;
      transition: opacity 0.15s ease, background 0.15s ease;
      flex-shrink: 0;
    }

    .header-icon-btn:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
    }

    /* 激活前缀按钮 */
    .activate-prefix-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
      font-size: var(--font-sm);
      padding: 3px 10px;
      border-radius: 4px;
      flex-shrink: 0;
      font-weight: 500;
      transition: background var(--transition-fast);
      white-space: nowrap;
    }

    .activate-prefix-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    /* ====== C6: 保存按钮 loading 状态 ====== */
    .save-rules-btn.loading,
    .save-rules-btn.success {
      pointer-events: none;
      opacity: 0.8;
    }

    .save-rules-btn.loading::after {
      content: ' ⏳';
    }

    .save-rules-btn.success::after {
      content: ' ✓';
    }

    /* ====== 消息区域 ====== */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .messages::-webkit-scrollbar {
      width: 6px;
    }

    .messages::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 3px;
    }

    .message {
      padding: var(--spacing-md);
      border-radius: var(--radius);
      max-width: 100%;
      word-break: break-word;
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.copilot {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-left: 3px solid var(--vscode-focusBorder);
      position: relative;
    }

    /* B2: 消息悬浮工具栏 */
    .message-hover-toolbar {
      display: none;
      position: absolute;
      top: 4px;
      right: 4px;
      gap: 2px;
    }

    .message:hover .message-hover-toolbar {
      display: flex;
    }

    .message-hover-toolbar button {
      background: var(--vscode-toolbar-hoverBackground);
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: var(--font-xs);
      opacity: 0.7;
      transition: opacity var(--transition-fast);
    }

    .message-hover-toolbar button:hover {
      opacity: 1;
    }

    .message.user {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      margin-left: 20%;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    }

    .message-title {
      font-weight: 600;
      font-size: var(--font-md);
      margin-bottom: var(--spacing-xs);
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .message-title .icon {
      font-size: 14px;
    }

    .message-content {
      font-size: var(--font-md);
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .message-time {
      font-size: var(--font-xs);
      opacity: 0.6;
      margin-top: var(--spacing-xs);
      text-align: right;
    }

    /* ====== B7: 日期分隔线 ====== */
    .date-separator {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) 0;
      font-size: var(--font-xs);
      opacity: 0.5;
    }

    .date-separator::before,
    .date-separator::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--vscode-panel-border);
    }

    /* ====== 选项按钮区 ====== */
    .choices {
      padding: 0 var(--spacing-md);
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      flex-shrink: 0;
    }

    .choice-btn {
      padding: 6px var(--spacing-md);
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
      border-radius: var(--radius);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      font-size: var(--font-sm);
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .choice-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      transform: translateY(-1px);
    }

    .choice-btn:active {
      transform: translateY(0);
    }

    /* ====== 输入区域 ====== */
    .input-area {
      padding: var(--spacing-md);
      border-top: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }

    .input-wrapper {
      display: flex;
      gap: var(--spacing-sm);
      align-items: flex-end;
    }

    .input-field {
      flex: 1;
      padding: var(--spacing-sm) var(--spacing-md);
      border: 1px solid var(--vscode-input-border);
      border-radius: var(--radius);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: vertical;
      min-height: 36px;
      max-height: 120px;
      line-height: 1.4;
      outline: none;
    }

    .input-field:focus {
      border-color: var(--vscode-focusBorder);
    }

    .input-field::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .send-btn {
      padding: var(--spacing-sm) var(--spacing-md);
      border: none;
      border-radius: var(--radius);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-size: var(--font-md);
      font-weight: 500;
      min-width: 72px;
      height: 38px;
      white-space: nowrap;
      transition: background 0.15s ease;
    }

    .send-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .hint-text {
      font-size: var(--font-sm);
      opacity: 0.65;
      margin-top: var(--spacing-xs);
      text-align: left;
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .queue-hint {
      margin-top: 6px;
      font-size: var(--font-sm);
      opacity: 0.72;
      color: var(--vscode-descriptionForeground, var(--vscode-foreground));
      min-height: 16px;
    }

    .queue-hint.active {
      color: var(--vscode-focusBorder);
      opacity: 1;
      font-weight: 600;
    }

    /* C3: 字数统计 */
    .char-count {
      font-size: var(--font-xs);
      opacity: 0.6;
      margin-left: auto;
    }

    .char-count.warning {
      color: var(--vscode-editorWarning-foreground);
      opacity: 1;
    }

    /* ====== 空状态 ====== */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-lg);
      opacity: 0.5;
      text-align: center;
      gap: var(--spacing-sm);
    }

    .empty-state .icon {
      font-size: 32px;
    }

    .empty-state .title {
      font-size: 14px;
      font-weight: 600;
    }

    .empty-state .desc {
      font-size: 12px;
      line-height: 1.5;
    }

    /* ====== 功能3: 标签页导航 ====== */
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
    }

    .tab-btn {
      flex: 1;
      padding: var(--spacing-md);
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      border-bottom: 2px solid transparent;
      opacity: 0.7;
      transition: all 0.2s ease;
      text-align: center;
      position: relative;
    }

    .tab-btn:hover {
      opacity: 1;
    }

    .tab-btn.active {
      border-bottom-color: var(--vscode-focusBorder);
      color: var(--vscode-focusBorder);
      opacity: 1;
    }

    /* C5: 标签页未读指示（使用 ::after 伪元素，无需额外 DOM） */
    .tab-btn.has-unread::after {
      content: '';
      display: block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--vscode-errorForeground);
      position: absolute;
      top: 6px;
      right: 12px;
    }

    /* ====== 功能3: 设置页面 ====== */
    .tab-content {
      display: none;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
    }

    .tab-content.active {
      display: flex;
    }

    .settings-page {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: var(--spacing-md);
      gap: var(--spacing-lg);
    }

    .settings-page::-webkit-scrollbar {
      width: 6px;
    }

    .settings-page::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 3px;
    }

    .setting-group {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .setting-group label {
      font-weight: 600;
      font-size: var(--font-md);
      color: var(--vscode-foreground);
    }

    .setting-group .hint {
      font-size: var(--font-sm);
      opacity: 0.6;
      line-height: 1.4;
    }

    .section-step {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-top: 2px;
      margin-bottom: calc(var(--spacing-sm) * -1);
    }

    .step-badge {
      font-size: var(--font-xs);
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent);
      color: var(--vscode-focusBorder);
      border: 1px solid color-mix(in srgb, var(--vscode-focusBorder) 45%, transparent);
    }

    .step-title {
      font-size: var(--font-sm);
      opacity: 0.9;
      font-weight: 600;
    }

    .rule-textarea {
      width: 100%;
      min-height: 80px;
      padding: var(--spacing-sm);
      border: 1px solid var(--vscode-input-border);
      border-radius: var(--radius);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 11px;
      resize: vertical;
      outline: none;
    }

    .rule-textarea:focus {
      border-color: var(--vscode-focusBorder);
    }

    .save-rules-btn {
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: var(--font-sm);
      font-weight: 600;
      transition: background 0.15s ease;
      align-self: flex-start;
      min-height: 34px;
    }

    .save-rules-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .status-message {
      font-size: 11px;
      padding: var(--spacing-sm);
      border-radius: var(--radius);
      background: var(--vscode-testing-iconPassed);
      color: var(--vscode-sideBar-background);
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .status-message.show {
      opacity: 1;
    }

    /* ====== 规则库 ====== */
    .template-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .template-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 6px var(--spacing-sm);
      border-radius: var(--radius);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      cursor: grab;
      user-select: none;
    }

    .template-item:hover {
      border-color: var(--vscode-focusBorder);
    }

    .template-item.dragging {
      opacity: 0.4;
    }

    .template-item-drag-handle {
      flex-shrink: 0;
      opacity: 0.4;
      font-size: 12px;
      cursor: grab;
    }

    .template-item-info {
      flex: 1;
      min-width: 0;
      cursor: pointer;
    }

    .template-item-name {
      font-size: 12px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .template-item-preview {
      font-size: 10px;
      opacity: 0.5;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .template-item-actions {
      display: flex;
      gap: 2px;
      flex-shrink: 0;
    }

    .template-item-actions button {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      min-width: 28px;
      min-height: 28px;
      padding: 4px 6px;
      border-radius: 3px;
      font-size: 12px;
      opacity: 0.5;
      transition: opacity 0.15s;
    }

    .template-item-actions button:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
    }

    /* ====== B6: 规则模版（工作区拖拽区域） ====== */
    .workspace-template-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-height: 48px;
      border: 2px dashed var(--vscode-focusBorder);
      border-radius: var(--radius);
      padding: var(--spacing-sm);
      background: color-mix(in srgb, var(--vscode-focusBorder) 5%, transparent);
      transition: border-color var(--transition-normal), background var(--transition-normal);
    }

    .workspace-template-list.drag-over {
      border-color: var(--vscode-button-background);
      background: color-mix(in srgb, var(--vscode-focusBorder) 15%, transparent);
    }

    .workspace-template-item.drop-target-top {
      box-shadow: inset 0 2px 0 0 var(--vscode-focusBorder);
    }

    .workspace-template-item.drop-target-bottom {
      box-shadow: inset 0 -2px 0 0 var(--vscode-focusBorder);
    }

    .template-drop-placeholder {
      text-align: center;
      padding: var(--spacing-md);
      font-size: var(--font-sm);
      opacity: 0.5;
    }

    .workspace-template-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 6px var(--spacing-sm);
      border-radius: var(--radius);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-focusBorder);
      cursor: grab;
      user-select: none;
      transition: opacity 0.15s;
    }

    .workspace-template-item:hover {
      border-color: var(--vscode-button-background);
    }

    .workspace-template-item.dragging {
      opacity: 0.4;
    }

    .workspace-template-item .wt-drag-handle {
      flex-shrink: 0;
      opacity: 0.4;
      font-size: 12px;
      cursor: grab;
    }

    .workspace-template-item .wt-name {
      flex: 1;
      font-size: 12px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .workspace-template-item .wt-remove {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      min-width: 28px;
      min-height: 28px;
      padding: 4px 6px;
      border-radius: 3px;
      font-size: 12px;
      opacity: 0.5;
      transition: opacity 0.15s;
    }

    .workspace-template-item .wt-remove:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
    }

    .add-template-btn {
      width: 100%;
      padding: var(--spacing-sm);
      border: 1px dashed var(--vscode-panel-border);
      border-radius: var(--radius);
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 12px;
      opacity: 0.6;
      transition: all 0.15s;
      margin-top: var(--spacing-sm);
    }

    .add-template-btn:hover {
      opacity: 1;
      border-color: var(--vscode-focusBorder);
    }

    .template-dialog-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-lg);
    }

    .template-dialog-overlay.show {
      display: flex;
    }

    .template-dialog {
      width: 100%;
      max-width: 400px;
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--radius);
      padding: var(--spacing-lg);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .template-dialog h3 {
      font-size: 14px;
      font-weight: 600;
      margin: 0;
    }

    .template-dialog input,
    .template-dialog textarea {
      width: 100%;
      padding: var(--spacing-sm);
      border: 1px solid var(--vscode-input-border);
      border-radius: var(--radius);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: 12px;
      outline: none;
    }

    .template-dialog input:focus,
    .template-dialog textarea:focus {
      border-color: var(--vscode-focusBorder);
    }

    .template-dialog textarea {
      min-height: 80px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 11px;
    }

    .dialog-actions {
      display: flex;
      gap: var(--spacing-sm);
      justify-content: flex-end;
    }

    .dialog-actions button {
      padding: var(--spacing-xs) var(--spacing-md);
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 12px;
    }

    .dialog-save-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .dialog-save-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .dialog-cancel-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .dialog-cancel-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    /* ====== 设置页开关样式 ====== */
    .setting-toggle {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) 0;
    }

    /* B5: Toggle switch 组件 */
    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 36px;
      height: 20px;
      flex-shrink: 0;
      margin-top: 1px;
      cursor: pointer;
    }

    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: absolute;
      inset: 0;
      background: var(--vscode-input-border);
      border-radius: 10px;
      transition: background var(--transition-fast);
    }

    .toggle-slider::before {
      content: '';
      position: absolute;
      width: 14px;
      height: 14px;
      left: 3px;
      bottom: 3px;
      background: var(--vscode-foreground);
      border-radius: 50%;
      transition: transform var(--transition-fast);
    }

    .toggle-switch input:checked + .toggle-slider {
      background: var(--vscode-focusBorder);
    }

    .toggle-switch input:checked + .toggle-slider::before {
      transform: translateX(16px);
    }

    .toggle-switch input:focus-visible + .toggle-slider {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .setting-toggle-info {
      flex: 1;
      min-width: 0;
    }

    .setting-toggle-info label {
      font-weight: 500;
      font-size: 12px;
      cursor: pointer;
      display: block;
    }

    .setting-toggle-info .hint {
      font-size: 10px;
      opacity: 0.6;
      line-height: 1.4;
      margin-top: 2px;
    }

    /* ====== 功能4: 撤回功能 ====== */
    /* B4/C7: 待发送 toast 样式（温和色调） */
    .pending-send-area {
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-focusBorder);
      border-radius: var(--radius);
      margin: 0 var(--spacing-md) var(--spacing-sm);
      display: none;
      flex-direction: column;
      gap: var(--spacing-xs);
      animation: slideUp 0.2s ease-out;
      position: relative;
      overflow: hidden;
    }

    .pending-send-area::after {
      content: '';
      position: absolute;
      left: 0;
      bottom: 0;
      height: 2px;
      width: 100%;
      background: color-mix(in srgb, var(--vscode-focusBorder) 70%, transparent);
      transform-origin: left;
      transform: scaleX(0);
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes pendingProgress {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }

    .pending-send-area.show {
      display: flex;
    }

    .pending-send-area.show::after {
      animation: pendingProgress 5s linear forwards;
    }

    .pending-send-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .pending-send-title {
      font-size: var(--font-sm);
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .pending-countdown {
      font-size: var(--font-sm);
      color: var(--vscode-focusBorder);
      min-width: 30px;
      text-align: right;
      font-weight: 600;
    }

    .pending-send-text {
      font-size: var(--font-sm);
      color: var(--vscode-foreground);
      opacity: 0.8;
      padding: var(--spacing-xs) var(--spacing-sm);
      background: var(--vscode-textCodeBlock-background);
      border-radius: 3px;
      word-break: break-word;
      max-height: 40px;
      overflow-y: auto;
      line-height: 1.4;
    }

    .pending-actions {
      display: flex;
      gap: var(--spacing-sm);
      justify-self: flex-end;
    }

    .pending-send-btn, .pending-cancel-btn {
      flex: 1;
      padding: 4px 8px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.15s ease;
    }

    .pending-send-btn {
      background: var(--vscode-testing-iconPassed);
      color: var(--vscode-sideBar-background);
    }

    .pending-send-btn:hover {
      opacity: 0.9;
    }

    .pending-cancel-btn {
      background: var(--vscode-errorForeground);
      color: var(--vscode-sideBar-background);
    }

    .pending-cancel-btn:hover {
      opacity: 0.9;
    }

    /* ====== 自定义右键菜单 ====== */
    .context-menu {
      display: none;
      position: fixed;
      z-index: 200;
      background: var(--vscode-menu-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
      border-radius: 6px;
      padding: 4px 0;
      min-width: 140px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .context-menu.show {
      display: block;
    }

    .context-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      cursor: pointer;
      font-size: var(--font-sm);
      color: var(--vscode-menu-foreground, var(--vscode-foreground));
      transition: background 0.1s;
      white-space: nowrap;
    }

    .context-menu-item:hover {
      background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
      color: var(--vscode-menu-selectionForeground, var(--vscode-foreground));
    }

    .context-menu-item.disabled {
      opacity: 0.4;
      cursor: default;
    }

    .context-menu-item.disabled:hover {
      background: transparent;
    }

    .context-menu-item .icon {
      font-size: 14px;
      width: 18px;
      text-align: center;
    }

    .context-menu-separator {
      height: 1px;
      background: var(--vscode-menu-separatorBackground, var(--vscode-panel-border));
      margin: 4px 8px;
    }

    /* ====== 队列状态指示 ====== */
    .queue-badge {
      display: none;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: var(--font-xs);
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      flex-shrink: 0;
    }

    .queue-badge.show {
      display: inline-block;
    }
  `;
}
