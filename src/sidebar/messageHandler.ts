import * as vscode from 'vscode';
import type { RuleTemplate, WebviewToExtMessage, Workflow } from './types';

export interface SidebarMessageHandlers {
  resolveUserResponse: (text: string) => void;
  clearHistory: () => void;
  saveRules: (globalRules: string) => Promise<void> | void;
  requestRules: () => void;
  saveTemplate: (template: RuleTemplate) => void;
  deleteTemplate: (id: string) => void;
  requestTemplates: () => void;
  saveWorkflow: (workflow: Workflow) => Promise<void> | void;
  deleteWorkflow: (id: string) => Promise<void> | void;
  requestWorkflows: () => void;
  runWorkflow: (id: string) => Promise<void> | void;
  confirmRunWorkflow: (id: string) => Promise<void> | void;
  requestQueueInfo: () => void;
  recallLastQueued: () => void;
  saveWorkspaceTemplate: (templateIds: string[]) => Promise<void> | void;
  requestWorkspaceTemplate: () => void;
  ready: () => void;
}

export function createSidebarMessageHandler(handlers: SidebarMessageHandlers) {
  return async function handleSidebarMessage(msg: WebviewToExtMessage): Promise<void> {
    switch (msg.type) {
      case 'userResponse':
        handlers.resolveUserResponse(msg.text);
        return;
      case 'choiceSelected':
        handlers.resolveUserResponse(msg.choice);
        return;
      case 'clearHistory':
        handlers.clearHistory();
        return;
      case 'copyPrompt':
        await vscode.commands.executeCommand('copilot-super.copyPrompt');
        return;
      case 'copyRules':
        await vscode.commands.executeCommand('copilot-super.copyRules');
        return;
      case 'copyText':
        if (msg.text) {
          await vscode.env.clipboard.writeText(msg.text);
        }
        return;
      case 'saveRules':
        await handlers.saveRules(msg.globalRules || '');
        return;
      case 'requestRules':
        handlers.requestRules();
        return;
      case 'saveTemplate':
        handlers.saveTemplate(msg.template);
        return;
      case 'deleteTemplate':
        handlers.deleteTemplate(msg.id);
        return;
      case 'requestTemplates':
        handlers.requestTemplates();
        return;
      case 'saveWorkflow':
        await handlers.saveWorkflow(msg.workflow);
        return;
      case 'deleteWorkflow':
        await handlers.deleteWorkflow(msg.id);
        return;
      case 'requestWorkflows':
        handlers.requestWorkflows();
        return;
      case 'runWorkflow':
        await handlers.runWorkflow(msg.id);
        return;
      case 'confirmRunWorkflow':
        await handlers.confirmRunWorkflow(msg.id);
        return;
      case 'requestQueueInfo':
        handlers.requestQueueInfo();
        return;
      case 'recallLastQueued':
        handlers.recallLastQueued();
        return;
      case 'saveWorkspaceTemplate':
        await handlers.saveWorkspaceTemplate(msg.templateIds || []);
        return;
      case 'requestWorkspaceTemplate':
        handlers.requestWorkspaceTemplate();
        return;
      case 'ready':
        handlers.ready();
        return;
    }
  };
}
