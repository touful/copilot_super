import { styleBlock } from './stylesBlock';

export function getChatStyles(): string {
  return styleBlock(`
    /* Messages Container */
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
      border-radius: var(--radius-full);
    }

    .messages::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground);
    }

    /* Message Item */
    .message-item {
      display: flex;
      gap: var(--spacing-sm);
      animation: messageSlideIn 0.3s var(--transition-normal);
      max-width: 100%;
    }

    .message-item.copilot {
      flex-direction: row;
    }

    .message-item.user {
      flex-direction: row-reverse;
    }

    @keyframes messageSlideIn {
      from { 
        opacity: 0; 
        transform: translateY(8px); 
      }
      to { 
        opacity: 1; 
        transform: translateY(0); 
      }
    }

    /* Avatar */
    .message-avatar {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      flex-shrink: 0;
      transition: transform var(--transition-fast), box-shadow var(--transition-fast);
    }

    .message-avatar:hover {
      transform: scale(1.05);
    }

    .message-item.copilot .message-avatar {
      background: linear-gradient(135deg, var(--vscode-focusBorder) 0%, color-mix(in srgb, var(--vscode-focusBorder) 70%, #ffffff) 100%);
      color: var(--vscode-sideBar-background);
      box-shadow: 0 2px 8px rgba(0, 122, 204, 0.3);
    }

    .message-item.user .message-avatar {
      background: linear-gradient(135deg, var(--vscode-button-background) 0%, color-mix(in srgb, var(--vscode-button-background) 80%, #ffffff) 100%);
      color: var(--vscode-button-foreground);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    /* Message Content Container */
    .message-content-wrapper {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .message-item.user .message-content-wrapper {
      align-items: flex-end;
    }

    /* Message Header */
    .message-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      font-size: var(--font-sm);
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
    }

    .message-item.user .message-header {
      flex-direction: row-reverse;
    }

    .message-role-badge {
      padding: 2px 8px;
      border-radius: var(--radius-full);
      font-size: var(--font-xs);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .message-item.copilot .message-role-badge {
      background: color-mix(in srgb, var(--vscode-focusBorder) 15%, transparent);
      color: var(--vscode-focusBorder);
    }

    .message-item.user .message-role-badge {
      background: color-mix(in srgb, var(--vscode-button-background) 20%, transparent);
      color: var(--vscode-button-foreground);
    }

    /* Message Body */
    .message-body {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      font-size: var(--font-md);
      line-height: 1.6;
      word-break: break-word;
      white-space: pre-wrap;
      position: relative;
      transition: box-shadow var(--transition-fast), transform var(--transition-fast);
    }

    .message-body:hover {
      transform: translateY(-1px);
    }

    .message-item.copilot .message-body {
      background: var(--message-copilot-bg);
      border: 1px solid var(--message-copilot-border);
      border-left: 3px solid var(--message-copilot-accent);
      box-shadow: var(--shadow-sm);
    }

    .message-item.copilot .message-body:hover {
      box-shadow: var(--shadow-md);
      border-color: color-mix(in srgb, var(--message-copilot-accent) 50%, var(--message-copilot-border));
    }

    .message-item.user .message-body {
      background: var(--message-user-bg);
      color: var(--vscode-button-foreground);
      box-shadow: var(--shadow-md);
      border: none;
      max-width: 85%;
    }

    .message-item.user .message-body:hover {
      box-shadow: var(--shadow-lg);
    }

    /* Legacy Message Styles - for backward compatibility */
    .message {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      max-width: 100%;
      word-break: break-word;
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.copilot {
      background: var(--message-copilot-bg);
      border: 1px solid var(--message-copilot-border);
      border-left: 3px solid var(--message-copilot-accent);
      position: relative;
      box-shadow: var(--shadow-sm);
      transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
    }

    .message.copilot:hover {
      box-shadow: var(--shadow-md);
      border-color: color-mix(in srgb, var(--message-copilot-accent) 50%, var(--message-copilot-border));
    }

    /* Message Hover Toolbar */
    .message-hover-toolbar {
      display: none;
      position: absolute;
      top: 4px;
      right: 4px;
      gap: 4px;
    }

    .message:hover .message-hover-toolbar,
    .message-item:hover .message-hover-toolbar {
      display: flex;
    }

    .message-hover-toolbar button {
      background: var(--vscode-toolbar-hoverBackground);
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: var(--radius-xs);
      font-size: var(--font-xs);
      opacity: 0.7;
      transition: all var(--transition-fast);
      backdrop-filter: blur(4px);
    }

    .message-hover-toolbar button:hover {
      opacity: 1;
      background: var(--vscode-list-hoverBackground);
      transform: translateY(-1px);
      box-shadow: var(--shadow-sm);
    }

    .message.user {
      background: var(--message-user-bg);
      color: var(--vscode-button-foreground);
      margin-left: 20%;
      box-shadow: var(--shadow-md);
      border: none;
    }

    .message.user:hover {
      box-shadow: var(--shadow-lg);
    }

    /* Message Title (Legacy) */
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

    /* Message Content (Legacy) */
    .message-content {
      font-size: var(--font-md);
      line-height: 1.6;
      white-space: pre-wrap;
    }

    /* Message Time */
    .message-time {
      font-size: var(--font-xs);
      opacity: 0.5;
      margin-top: var(--spacing-xs);
      text-align: right;
      transition: opacity var(--transition-fast);
    }

    .message-item:hover .message-time,
    .message:hover .message-time {
      opacity: 0.7;
    }

    /* Date Separator */
    .date-separator {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-md) 0;
      font-size: var(--font-xs);
      opacity: 0.4;
      color: var(--vscode-descriptionForeground);
    }

    .date-separator::before,
    .date-separator::after {
      content: '';
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--vscode-panel-border), transparent);
    }

    .date-separator span {
      padding: 4px 12px;
      background: var(--vscode-sideBar-background);
      border-radius: var(--radius-full);
      border: 1px solid var(--vscode-panel-border);
    }

    /* Choices */
    .choices {
      padding: 0 var(--spacing-md);
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      flex-shrink: 0;
    }

    .choice-btn {
      padding: 8px 16px;
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
      border-radius: var(--radius-full);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      font-size: var(--font-sm);
      font-weight: 500;
      transition: all var(--transition-fast);
      white-space: nowrap;
      position: relative;
      overflow: hidden;
    }

    .choice-btn::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      background: var(--vscode-button-background);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      transition: width 0.4s ease, height 0.4s ease;
      opacity: 0.1;
    }

    .choice-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
      border-color: var(--vscode-focusBorder);
    }

    .choice-btn:hover::before {
      width: 200%;
      height: 200%;
    }

    .choice-btn:active {
      transform: translateY(0);
      box-shadow: var(--shadow-sm);
    }

    /* Empty State */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-xl);
      text-align: center;
      gap: var(--spacing-md);
    }

    .empty-state .icon {
      font-size: 48px;
      opacity: 0.3;
      animation: emptyStateFloat 3s ease-in-out infinite;
    }

    @keyframes emptyStateFloat {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }

    .empty-state .title {
      font-size: var(--font-lg);
      font-weight: 600;
      opacity: 0.7;
      color: var(--vscode-foreground);
    }

    .empty-state .desc {
      font-size: var(--font-sm);
      line-height: 1.6;
      opacity: 0.5;
      max-width: 240px;
    }

    .empty-state .hint {
      margin-top: var(--spacing-md);
      padding: var(--spacing-sm) var(--spacing-md);
      background: color-mix(in srgb, var(--vscode-focusBorder) 10%, transparent);
      border-radius: var(--radius);
      font-size: var(--font-xs);
      color: var(--vscode-focusBorder);
      opacity: 0.8;
    }
  `);
}
