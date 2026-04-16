import { styleBlock } from './stylesBlock';

export function getPendingAndContextMenuStyles(): string {
  return styleBlock(`
    /* Pending Send Area */
    .pending-send-area {
      padding: var(--spacing-md);
      background: linear-gradient(135deg, var(--vscode-editor-background), color-mix(in srgb, var(--vscode-focusBorder) 5%, var(--vscode-editor-background)));
      border: 1px solid var(--vscode-focusBorder);
      border-radius: var(--radius-lg);
      margin: 0 var(--spacing-md) var(--spacing-md);
      display: none;
      flex-direction: column;
      gap: var(--spacing-sm);
      animation: pendingSlideIn var(--slide-duration) ease-out;
      position: relative;
      overflow: hidden;
      box-shadow: var(--shadow-md), 0 0 0 1px color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent);
    }

    .pending-send-area::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--vscode-focusBorder), transparent);
      opacity: 0.5;
    }

    .pending-send-area::after {
      content: '';
      position: absolute;
      left: 0;
      bottom: 0;
      height: 3px;
      width: 100%;
      background: linear-gradient(90deg, var(--color-success), var(--vscode-focusBorder), var(--color-info));
      transform-origin: left;
      transform: scaleX(0);
      border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    }

    @keyframes pendingSlideIn {
      from { 
        opacity: 0; 
        transform: translateY(12px) scale(0.98);
      }
      to { 
        opacity: 1; 
        transform: translateY(0) scale(1);
      }
    }

    @keyframes pendingProgress {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }

    .pending-send-area.visible {
      display: flex;
    }

    .pending-send-area.visible.counting::after {
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
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .pending-send-title::before {
      content: '⏳';
      font-size: 14px;
    }

    .pending-countdown {
      font-size: var(--font-lg);
      color: var(--vscode-focusBorder);
      min-width: 40px;
      text-align: right;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      transition: transform var(--transition-fast);
    }

    .pending-countdown:hover {
      transform: scale(1.1);
    }

    .pending-send-text {
      width: 100%;
      min-height: 58px;
      font-size: var(--font-sm);
      color: var(--vscode-foreground);
      opacity: 0.85;
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--vscode-textCodeBlock-background);
      border-radius: var(--radius-sm);
      word-break: break-word;
      max-height: 120px;
      overflow-y: auto;
      line-height: 1.5;
      border: 1px solid var(--vscode-panel-border);
      outline: none;
      resize: vertical;
      font-family: var(--vscode-font-family);
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }

    .pending-send-text:focus {
      border-color: var(--vscode-focusBorder);
      box-shadow: var(--shadow-focus);
      opacity: 1;
    }

    .pending-actions {
      display: flex;
      gap: var(--spacing-sm);
      justify-content: flex-end;
    }

    .pending-send-btn,
    .pending-cancel-btn {
      flex: 1;
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: var(--font-sm);
      font-weight: 600;
      transition: all var(--transition-fast);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .pending-send-btn {
      background: linear-gradient(135deg, var(--color-success), color-mix(in srgb, var(--color-success) 80%, #ffffff));
      color: white;
      box-shadow: var(--shadow-sm);
    }

    .pending-send-btn:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    .pending-send-btn:active {
      transform: translateY(0);
    }

    .pending-cancel-btn {
      background: linear-gradient(135deg, var(--color-error), color-mix(in srgb, var(--color-error) 80%, #000000));
      color: white;
      box-shadow: var(--shadow-sm);
    }

    .pending-cancel-btn:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    .pending-cancel-btn:active {
      transform: translateY(0);
    }

    .pending-send-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    /* Context Menu - Enhanced */
    .context-menu {
      display: none;
      position: fixed;
      z-index: 200;
      background: var(--vscode-menu-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
      border-radius: var(--radius-lg);
      padding: 6px 0;
      min-width: 160px;
      box-shadow: var(--shadow-lg);
      animation: contextMenuIn 0.15s ease-out;
      backdrop-filter: blur(8px);
    }

    @keyframes contextMenuIn {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(-4px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    .context-menu.visible {
      display: block;
    }

    .context-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      cursor: pointer;
      font-size: var(--font-sm);
      color: var(--vscode-menu-foreground, var(--vscode-foreground));
      transition: all var(--transition-fast);
      white-space: nowrap;
      position: relative;
    }

    .context-menu-item:hover {
      background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
      color: var(--vscode-menu-selectionForeground, var(--vscode-foreground));
      padding-left: 20px;
    }

    .context-menu-item.disabled {
      opacity: 0.35;
      cursor: default;
    }

    .context-menu-item.disabled:hover {
      background: transparent;
      padding-left: 16px;
    }

    .context-menu-item .icon {
      font-size: 15px;
      width: 20px;
      text-align: center;
      opacity: 0.8;
    }

    .context-menu-item:hover .icon {
      opacity: 1;
    }

    .context-menu-separator {
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--vscode-menu-separatorBackground, var(--vscode-panel-border)), transparent);
      margin: 6px 12px;
    }

    /* Queue Badge */
    .queue-badge {
      display: none;
      background: linear-gradient(135deg, var(--vscode-badge-background), color-mix(in srgb, var(--vscode-focusBorder) 30%, var(--vscode-badge-background)));
      color: var(--vscode-badge-foreground);
      font-size: var(--font-xs);
      font-weight: 700;
      padding: 3px 10px;
      border-radius: var(--radius-full);
      flex-shrink: 0;
      box-shadow: var(--shadow-sm);
      animation: badgePulse 2s ease-in-out infinite;
    }

    @keyframes badgePulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    .queue-badge.visible {
      display: inline-block;
    }
  `);
}
