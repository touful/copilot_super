import { styleBlock } from './stylesBlock';

export function getHeaderStyles(): string {
  return styleBlock(`
    /* Header Container */
    .header {
      padding: var(--spacing-sm) var(--spacing-md);
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      flex-shrink: 0;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 95%, var(--vscode-focusBorder) 5%);
      transition: background var(--transition-slow);
    }

    /* Status Indicator - Ring Style */
    .status-indicator {
      position: relative;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-success);
      position: relative;
      z-index: 2;
      transition: all var(--transition-normal);
    }

    .status-dot.ready {
      background: var(--color-success);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-success) 30%, transparent);
    }

    .status-dot.waiting {
      background: var(--color-warning);
      animation: statusPulse 1.5s ease-in-out infinite;
    }

    .status-dot.waiting::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 20px;
      height: 20px;
      border: 2px solid var(--color-warning);
      border-radius: 50%;
      animation: statusRing 1.5s ease-out infinite;
    }

    .status-dot.sent {
      background: var(--color-info);
    }

    @keyframes statusPulse {
      0%, 100% { 
        opacity: 1;
        transform: scale(1);
      }
      50% { 
        opacity: 0.6;
        transform: scale(1.1);
      }
    }

    @keyframes statusRing {
      0% {
        transform: translate(-50%, -50%) scale(0.5);
        opacity: 1;
      }
      100% {
        transform: translate(-50%, -50%) scale(1.5);
        opacity: 0;
      }
    }

    /* Legacy Pulse - for backward compatibility */
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Header Text */
    .header-text {
      font-size: var(--font-sm);
      opacity: 0.85;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: opacity var(--transition-fast);
    }

    .header:hover .header-text {
      opacity: 1;
    }

    /* State Pill */
    .header-state-pill {
      font-size: var(--font-xs);
      color: var(--vscode-badge-foreground);
      background: var(--vscode-badge-background);
      border-radius: var(--radius-full);
      padding: 3px 10px;
      flex-shrink: 0;
      max-width: 90px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
      transition: all var(--transition-fast);
      border: 1px solid transparent;
    }

    .header-state-pill:hover {
      transform: scale(1.02);
      border-color: var(--vscode-focusBorder);
    }

    /* Icon Buttons */
    .header-icon-btn {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 14px;
      min-width: 32px;
      min-height: 32px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      opacity: 0.6;
      transition: all var(--transition-fast);
      flex-shrink: 0;
      position: relative;
    }

    .header-icon-btn:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
      transform: translateY(-1px);
    }

    .header-icon-btn:active {
      transform: translateY(0);
    }

    /* Copy Rules Button */
    .copy-rules-btn {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
      cursor: pointer;
      font-size: var(--font-sm);
      padding: 5px 12px;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
      font-weight: 500;
      transition: all var(--transition-fast);
      white-space: nowrap;
    }

    .copy-rules-btn:hover {
      background: color-mix(in srgb, var(--vscode-focusBorder) 15%, transparent);
      border-color: var(--vscode-focusBorder);
      color: var(--vscode-focusBorder);
    }

    .copy-rules-btn:active {
      transform: scale(0.98);
    }

    /* Activate Button */
    .activate-prefix-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
      font-size: var(--font-sm);
      padding: 5px 12px;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
      font-weight: 500;
      transition: all var(--transition-fast);
      white-space: nowrap;
      position: relative;
      overflow: hidden;
    }

    .activate-prefix-btn::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
      transition: left 0.5s ease;
    }

    .activate-prefix-btn:hover {
      background: var(--vscode-button-hoverBackground);
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    .activate-prefix-btn:hover::before {
      left: 100%;
    }

    .activate-prefix-btn:active {
      transform: translateY(0);
    }

    /* Button States */
    .save-rules-btn.loading,
    .save-rules-btn.success {
      pointer-events: none;
      opacity: 0.8;
    }

    .save-rules-btn.loading::after {
      content: ' ⏳';
      animation: spin 1s linear infinite;
      display: inline-block;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .save-rules-btn.success::after {
      content: ' ✓';
      color: var(--color-success);
    }
  `);
}