import { styleBlock } from './stylesBlock';

export function getTemplateAndDialogStyles(): string {
  return styleBlock(`
    /* Template List */
    .template-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    /* Template Item */
    .template-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 10px var(--spacing-md);
      border-radius: var(--radius);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      cursor: grab;
      user-select: none;
      transition: all var(--transition-fast);
      box-shadow: var(--shadow-sm);
    }

    .template-item:hover {
      border-color: var(--vscode-focusBorder);
      transform: translateX(4px);
      box-shadow: var(--shadow-md);
    }

    .template-item.dragging {
      opacity: 0.4;
      transform: scale(0.98);
    }

    .template-item-drag-handle {
      flex-shrink: 0;
      opacity: 0.4;
      font-size: 14px;
      cursor: grab;
      transition: opacity var(--transition-fast);
    }

    .template-item:hover .template-item-drag-handle {
      opacity: 0.7;
    }

    .template-item-info {
      flex: 1;
      min-width: 0;
      cursor: pointer;
    }

    .template-item-name {
      font-size: var(--font-sm);
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--vscode-foreground);
    }

    .template-item-preview {
      font-size: var(--font-xs);
      opacity: 0.55;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-top: 2px;
    }

    .template-item-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    .template-item-actions button {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      min-width: 30px;
      min-height: 30px;
      padding: 6px;
      border-radius: var(--radius-sm);
      font-size: var(--font-sm);
      opacity: 0.5;
      transition: all var(--transition-fast);
    }

    .template-item-actions button:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
      transform: scale(1.05);
    }

    /* Lock Button */
    .template-item.locked {
      border-color: var(--vscode-charts-yellow, #ffcc00);
      background: linear-gradient(135deg, var(--vscode-editor-background) 0%, color-mix(in srgb, var(--vscode-charts-yellow, #ffcc00) 5%, var(--vscode-editor-background)) 100%);
    }

    .lock-btn {
      font-size: 16px !important;
      min-width: 28px !important;
    }

    .lock-btn.locked {
      opacity: 1;
      filter: drop-shadow(0 0 2px var(--vscode-charts-yellow, #ffcc00));
    }

    /* Workspace Template List */
    .workspace-template-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 56px;
      border: 2px dashed var(--vscode-focusBorder);
      border-radius: var(--radius-lg);
      padding: var(--spacing-md);
      background: color-mix(in srgb, var(--vscode-focusBorder) 5%, transparent);
      transition: all var(--transition-normal);
    }

    .workspace-template-list.drag-over {
      border-color: var(--vscode-button-background);
      background: color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent);
      box-shadow: var(--shadow-md);
    }

    .workspace-template-item.drop-target-top {
      box-shadow: inset 0 3px 0 0 var(--vscode-focusBorder);
    }

    .workspace-template-item.drop-target-bottom {
      box-shadow: inset 0 -3px 0 0 var(--vscode-focusBorder);
    }

    .template-drop-placeholder {
      text-align: center;
      padding: var(--spacing-lg);
      font-size: var(--font-sm);
      opacity: 0.5;
      color: var(--vscode-descriptionForeground);
    }

    .template-drop-placeholder::before {
      content: '📄';
      display: block;
      font-size: 24px;
      margin-bottom: var(--spacing-sm);
      opacity: 0.7;
    }

    /* Workspace Template Item */
    .workspace-template-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 10px var(--spacing-md);
      border-radius: var(--radius);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-focusBorder);
      cursor: grab;
      user-select: none;
      transition: all var(--transition-fast);
      box-shadow: var(--shadow-sm);
    }

    .workspace-template-item:hover {
      border-color: var(--vscode-button-background);
      transform: translateX(2px);
      box-shadow: var(--shadow-md);
    }

    .workspace-template-item.dragging {
      opacity: 0.4;
    }

    .workspace-template-item .wt-drag-handle {
      flex-shrink: 0;
      opacity: 0.4;
      font-size: 14px;
      cursor: grab;
    }

    .workspace-template-item .wt-name {
      flex: 1;
      font-size: var(--font-sm);
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .workspace-template-item .wt-remove {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      min-width: 30px;
      min-height: 30px;
      padding: 6px;
      border-radius: var(--radius-sm);
      font-size: var(--font-sm);
      opacity: 0.5;
      transition: all var(--transition-fast);
    }

    .workspace-template-item .wt-remove:hover {
      opacity: 1;
      background: color-mix(in srgb, var(--color-error) 20%, transparent);
      color: var(--color-error);
    }

    /* Add Template Button */
    .add-template-btn {
      width: 100%;
      padding: var(--spacing-md);
      border: 1px dashed var(--vscode-panel-border);
      border-radius: var(--radius);
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: var(--font-sm);
      font-weight: 500;
      opacity: 0.65;
      transition: all var(--transition-fast);
      margin-top: var(--spacing-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .add-template-btn::before {
      content: '+';
      font-size: var(--font-lg);
      font-weight: 700;
    }

    .add-template-btn:hover {
      opacity: 1;
      border-color: var(--vscode-focusBorder);
      background: color-mix(in srgb, var(--vscode-focusBorder) 8%, transparent);
      transform: translateY(-1px);
    }

    /* Template Dialog Overlay */
    .template-dialog-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-xl);
    }

    .template-dialog-overlay.show,
    .template-dialog-overlay.visible {
      display: flex;
      animation: fadeIn 0.2s ease-out;
    }

    /* Template Dialog */
    .template-dialog {
      width: 100%;
      max-width: 420px;
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--radius-lg);
      padding: var(--spacing-xl);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      box-shadow: var(--shadow-lg);
      animation: scaleIn 0.25s ease-out;
    }

    .template-dialog h3 {
      font-size: var(--font-lg);
      font-weight: 700;
      margin: 0;
      color: var(--vscode-foreground);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .template-dialog h3::before {
      content: '📝';
      font-size: 18px;
    }

    .template-dialog input,
    .template-dialog textarea {
      width: 100%;
      padding: var(--spacing-md);
      border: 1px solid var(--vscode-input-border);
      border-radius: var(--radius);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--font-sm);
      outline: none;
      transition: all var(--transition-fast);
      line-height: 1.5;
    }

    .template-dialog input:focus,
    .template-dialog textarea:focus {
      border-color: var(--vscode-focusBorder);
      box-shadow: var(--shadow-focus);
    }

    .template-dialog textarea {
      min-height: 100px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: var(--font-xs);
    }

    /* Dialog Actions */
    .dialog-actions {
      display: flex;
      gap: var(--spacing-sm);
      justify-content: flex-end;
      margin-top: var(--spacing-sm);
    }

    .dialog-actions button {
      padding: 8px 20px;
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: var(--font-sm);
      font-weight: 600;
      transition: all var(--transition-fast);
      box-shadow: var(--shadow-sm);
    }

    .dialog-save-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .dialog-save-btn:hover {
      background: var(--vscode-button-hoverBackground);
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    .dialog-cancel-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .dialog-cancel-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }
  `);
}
