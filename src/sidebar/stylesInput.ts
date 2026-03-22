import { styleBlock } from './stylesBlock';

export function getInputAndTabStyles(): string {
  return styleBlock(`
    /* Input Area */
    .input-area {
      padding: var(--spacing-md);
      border-top: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 98%, var(--vscode-focusBorder) 2%);
    }

    /* Input Wrapper */
    .input-wrapper {
      display: flex;
      gap: var(--spacing-sm);
      align-items: flex-end;
    }

    /* Input Field */
    .input-field {
      flex: 1;
      padding: 10px var(--spacing-md);
      border: 1px solid var(--vscode-input-border);
      border-radius: var(--radius-lg);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: vertical;
      min-height: 40px;
      max-height: 120px;
      line-height: 1.5;
      outline: none;
      transition: all var(--transition-fast);
      box-shadow: var(--shadow-sm);
    }

    .input-field:focus {
      border-color: var(--vscode-focusBorder);
      box-shadow: var(--shadow-focus), var(--shadow-md);
    }

    .input-field::placeholder {
      color: var(--vscode-input-placeholderForeground);
      opacity: 0.7;
    }

    /* Send Button */
    .send-btn {
      padding: 10px 20px;
      border: none;
      border-radius: var(--radius-lg);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-size: var(--font-md);
      font-weight: 600;
      min-width: 80px;
      height: 40px;
      white-space: nowrap;
      transition: all var(--transition-fast);
      position: relative;
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }

    .send-btn::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
      transition: left 0.4s ease;
    }

    .send-btn:hover {
      background: var(--vscode-button-hoverBackground);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }

    .send-btn:hover::before {
      left: 100%;
    }

    .send-btn:active {
      transform: translateY(0);
      box-shadow: var(--shadow-sm);
    }

    .send-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    /* Hint Text */
    .hint-text {
      font-size: var(--font-sm);
      opacity: 0.6;
      margin-top: var(--spacing-xs);
      text-align: left;
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: var(--spacing-sm);
    }

    /* Queue Hint */
    .queue-hint {
      margin-top: 6px;
      font-size: var(--font-sm);
      opacity: 0.65;
      color: var(--vscode-descriptionForeground, var(--vscode-foreground));
      min-height: 16px;
      transition: all var(--transition-fast);
    }

    .queue-hint.active {
      color: var(--vscode-focusBorder);
      opacity: 1;
      font-weight: 600;
    }

    /* Character Count with Progress */
    .char-count {
      font-size: var(--font-xs);
      opacity: 0.5;
      margin-left: auto;
      padding: 2px 8px;
      border-radius: var(--radius-full);
      background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
      transition: all var(--transition-fast);
    }

    .char-count.warning {
      color: var(--color-warning);
      opacity: 1;
      background: color-mix(in srgb, var(--color-warning) 15%, transparent);
    }

    .char-count.danger {
      color: var(--color-error);
      opacity: 1;
      background: color-mix(in srgb, var(--color-error) 15%, transparent);
      animation: pulse 1s ease-in-out infinite;
    }

    /* Tabs Container */
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
      position: relative;
    }

    /* Sliding Indicator */
    .tabs::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2px;
      background: var(--vscode-focusBorder);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 2px 2px 0 0;
      box-shadow: 0 0 8px var(--vscode-focusBorder);
    }

    /* Tab Button */
    .tab-btn {
      flex: 1;
      padding: var(--spacing-md) var(--spacing-lg);
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: var(--font-sm);
      font-weight: 500;
      opacity: 0.65;
      transition: all var(--transition-fast);
      text-align: center;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .tab-btn:hover {
      opacity: 0.9;
      background: color-mix(in srgb, var(--vscode-focusBorder) 5%, transparent);
    }

    .tab-btn.active {
      opacity: 1;
      color: var(--vscode-focusBorder);
    }

    /* Tab Icon */
    .tab-btn .tab-icon {
      font-size: 14px;
      opacity: 0.8;
      transition: all var(--transition-fast);
    }

    .tab-btn.active .tab-icon {
      opacity: 1;
      transform: scale(1.1);
    }

    /* Unread Badge */
    .tab-btn.has-unread::after {
      content: '';
      display: block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-error);
      position: absolute;
      top: 8px;
      right: 16px;
      animation: pulse 1.5s ease-in-out infinite;
      box-shadow: 0 0 4px var(--color-error);
    }

    /* Tab Content */
    .tab-content {
      display: none;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
      animation: fadeIn 0.2s ease-out;
    }

    .tab-content.active {
      display: flex;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Settings Page */
    .settings-page {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: var(--spacing-lg);
      gap: var(--spacing-lg);
    }

    .settings-page::-webkit-scrollbar {
      width: 6px;
    }

    .settings-page::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: var(--radius-full);
    }

    .settings-page::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground);
    }

    /* Setting Group */
    .setting-group {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      border-radius: var(--radius);
      background: color-mix(in srgb, var(--vscode-editor-background) 50%, transparent);
      border: 1px solid var(--vscode-panel-border);
      transition: border-color var(--transition-fast);
    }

    .setting-group:hover {
      border-color: color-mix(in srgb, var(--vscode-focusBorder) 30%, var(--vscode-panel-border));
    }

    .setting-group label {
      font-weight: 600;
      font-size: var(--font-md);
      color: var(--vscode-foreground);
    }

    .setting-group .hint {
      font-size: var(--font-sm);
      opacity: 0.55;
      line-height: 1.5;
    }

    /* Section Step */
    .section-step {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-top: 4px;
      margin-bottom: 4px;
    }

    .step-badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: var(--radius-full);
      font-size: var(--font-xs);
      padding: 2px 10px;
      font-weight: 600;
    }

    /* Rule Textarea */
    .rule-textarea {
      width: 100%;
      min-height: 80px;
      padding: var(--spacing-md);
      border: 1px solid var(--vscode-input-border);
      border-radius: var(--radius);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 11px;
      resize: vertical;
      outline: none;
      transition: all var(--transition-fast);
      line-height: 1.5;
    }

    .rule-textarea:focus {
      border-color: var(--vscode-focusBorder);
      box-shadow: var(--shadow-focus);
    }

    /* Workflow Preview List */
    .workflow-preview-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      max-height: 280px;
      overflow-y: auto;
      padding-right: 4px;
    }

    .workflow-preview-item {
      display: flex;
      gap: var(--spacing-sm);
      align-items: flex-start;
      padding: var(--spacing-md);
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--radius);
      background: var(--vscode-editor-background);
      transition: all var(--transition-fast);
    }

    .workflow-preview-item:hover {
      border-color: var(--vscode-focusBorder);
      transform: translateX(4px);
      box-shadow: var(--shadow-sm);
    }

    .workflow-preview-index {
      min-width: 24px;
      height: 24px;
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--vscode-badge-background), color-mix(in srgb, var(--vscode-focusBorder) 30%, var(--vscode-badge-background)));
      color: var(--vscode-badge-foreground);
      font-size: var(--font-xs);
      font-weight: 700;
      flex-shrink: 0;
    }

    .workflow-preview-content {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
      font-size: var(--font-sm);
      color: var(--vscode-foreground);
      opacity: 0.95;
    }

    /* Workflow Steps List - Edit Mode */
    .workflow-steps-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      min-height: 60px;
      max-height: 300px;
      overflow-y: auto;
      padding: var(--spacing-sm);
      background: color-mix(in srgb, var(--vscode-focusBorder) 3%, transparent);
      border-radius: var(--radius);
      border: 1px dashed var(--vscode-panel-border);
      transition: all var(--transition-fast);
    }

    .workflow-steps-list:hover {
      border-color: color-mix(in srgb, var(--vscode-focusBorder) 40%, var(--vscode-panel-border));
    }

    .workflow-steps-list::-webkit-scrollbar {
      width: 6px;
    }

    .workflow-steps-list::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: var(--radius-full);
    }

    .workflow-step-item {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm);
      border-radius: var(--radius);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      cursor: grab;
      user-select: none;
      transition: all var(--transition-fast);
      animation: stepSlideIn 0.2s ease-out;
    }

    @keyframes stepSlideIn {
      from {
        opacity: 0;
        transform: translateX(-10px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .workflow-step-item:hover {
      border-color: var(--vscode-focusBorder);
      box-shadow: var(--shadow-sm);
    }

    .workflow-step-item.dragging {
      opacity: 0.5;
      transform: scale(0.98);
    }

    .workflow-step-item.drop-target-top {
      box-shadow: inset 0 2px 0 0 var(--vscode-focusBorder);
    }

    .workflow-step-item.drop-target-bottom {
      box-shadow: inset 0 -2px 0 0 var(--vscode-focusBorder);
    }

    .workflow-step-drag-handle {
      flex-shrink: 0;
      opacity: 0.4;
      font-size: 14px;
      cursor: grab;
      padding: 2px;
      transition: opacity var(--transition-fast);
    }

    .workflow-step-item:hover .workflow-step-drag-handle {
      opacity: 0.7;
    }

    .workflow-step-number {
      min-width: 24px;
      height: 24px;
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--vscode-focusBorder), color-mix(in srgb, var(--vscode-focusBorder) 70%, #ffffff));
      color: var(--vscode-sideBar-background);
      font-size: var(--font-xs);
      font-weight: 700;
      flex-shrink: 0;
    }

    .workflow-step-input {
      flex: 1;
      min-width: 0;
      padding: var(--spacing-sm);
      border: 1px solid transparent;
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--font-sm);
      line-height: 1.5;
      resize: none;
      outline: none;
      transition: all var(--transition-fast);
    }

    .workflow-step-input:focus {
      background: var(--vscode-input-background);
      border-color: var(--vscode-focusBorder);
    }

    .workflow-step-input::placeholder {
      color: var(--vscode-input-placeholderForeground);
      opacity: 0.6;
    }

    .workflow-step-delete {
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      min-width: 28px;
      min-height: 28px;
      padding: 4px;
      border-radius: var(--radius-xs);
      font-size: 14px;
      opacity: 0.4;
      transition: all var(--transition-fast);
    }

    .workflow-step-delete:hover {
      opacity: 1;
      background: color-mix(in srgb, var(--color-error) 20%, transparent);
      color: var(--color-error);
    }

    .workflow-steps-empty {
      text-align: center;
      padding: var(--spacing-lg);
      color: var(--vscode-descriptionForeground);
      font-size: var(--font-sm);
      opacity: 0.6;
    }

    .workflow-steps-empty::before {
      content: '📝';
      display: block;
      font-size: 24px;
      margin-bottom: var(--spacing-sm);
      opacity: 0.5;
    }

    .add-step-btn {
      width: 100%;
      padding: var(--spacing-md);
      margin-top: var(--spacing-sm);
      border: 1px dashed var(--vscode-panel-border);
      border-radius: var(--radius);
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: var(--font-sm);
      font-weight: 500;
      opacity: 0.65;
      transition: all var(--transition-fast);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .add-step-btn:hover {
      opacity: 1;
      border-color: var(--vscode-focusBorder);
      background: color-mix(in srgb, var(--vscode-focusBorder) 8%, transparent);
    }

    .add-step-btn:active {
      transform: scale(0.98);
    }

    /* Save Rules Button */
    .save-rules-btn {
      padding: var(--spacing-sm) var(--spacing-lg);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: var(--font-sm);
      font-weight: 600;
      transition: all var(--transition-fast);
      align-self: flex-start;
      min-height: 36px;
      box-shadow: var(--shadow-sm);
    }

    .save-rules-btn:hover {
      background: var(--vscode-button-hoverBackground);
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    .save-rules-btn:active {
      transform: translateY(0);
    }

    /* Status Message */
    .status-message {
      font-size: var(--font-sm);
      padding: 6px var(--spacing-md);
      border-radius: var(--radius);
      background: var(--color-success);
      color: var(--vscode-sideBar-background);
      display: none;
      font-weight: 500;
      box-shadow: var(--shadow-sm);
    }

    .status-message.show {
      display: inline-block;
      animation: scaleIn 0.3s ease-out;
    }

    /* Settings Inputs */
    .settings-page select.rule-textarea,
    .settings-page input.rule-textarea {
      min-height: 40px;
      resize: none;
      font-family: var(--vscode-font-family);
      font-size: var(--font-sm);
    }

    .step-title {
      font-size: var(--font-sm);
      font-weight: 600;
      opacity: 0.85;
    }

    /* Workflow Panel */
    .workflow-panel {
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--radius-lg);
      padding: var(--spacing-lg);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      background: color-mix(in srgb, var(--vscode-editor-background) 70%, transparent);
      transition: border-color var(--transition-fast);
    }

    .workflow-panel:hover {
      border-color: color-mix(in srgb, var(--vscode-focusBorder) 30%, var(--vscode-panel-border));
    }

    .workflow-actions {
      justify-content: flex-start;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      padding-top: var(--spacing-sm);
    }

    .workflow-actions button {
      min-width: 110px;
      min-height: 36px;
    }

    .workflow-actions button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    #workflowList {
      min-height: 160px;
      font-family: var(--vscode-font-family);
      line-height: 1.6;
      padding: var(--spacing-sm);
      border-radius: var(--radius);
    }

    #workflowList option {
      padding: 6px 8px;
      border-radius: var(--radius-xs);
    }

    #workflowStepsInput {
      min-height: 180px;
    }
  `);
}
