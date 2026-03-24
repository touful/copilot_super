import type { ToolCallParams } from '../mcpServer';

export interface PendingRequest {
  resolve: (value: string) => void;
  timeout?: unknown;
}

export interface RuleTemplate {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  /** 锁定状态 - 锁定的规则在所有工作区都可见 */
  locked?: boolean;
}

export interface WorkflowStep {
  id: string;
  prompt: string;
}

export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
}

export type SidebarHistoryEntry = {
  role: 'copilot' | 'user';
  title?: string;
  content: string;
  timestamp: number;
};

export type WebviewToExtMessage =
  | { type: 'userResponse'; text: string }
  | { type: 'choiceSelected'; choice: string }
  | { type: 'clearHistory' }
  | { type: 'copyPrompt' }
  | { type: 'copyRules' }
  | { type: 'copyText'; text: string }
  | { type: 'saveRules'; globalRules: string }
  | { type: 'requestRules' }
  | { type: 'saveTemplate'; template: RuleTemplate }
  | { type: 'deleteTemplate'; id: string }
  | { type: 'toggleTemplateLock'; id: string }
  | { type: 'requestTemplates' }
  | { type: 'saveWorkspaceTemplate'; templateIds: string[] }
  | { type: 'requestWorkspaceTemplate' }
  | { type: 'saveWorkflow'; workflow: Workflow }
  | { type: 'deleteWorkflow'; id: string }
  | { type: 'requestWorkflows' }
  | { type: 'runWorkflow'; id: string }
  | { type: 'confirmRunWorkflow'; id: string }
  | { type: 'requestQueueInfo' }
  | { type: 'recallLastQueued' }
  | { type: 'ready' };

export type ExtToWebviewMessage =
  | { type: 'showPrompt'; title: string; summary: string; choices: string[]; timestamp: number; autoResponded: boolean }
  | { type: 'responseAccepted' }
  | { type: 'requestCancelled' }
  | { type: 'historyCleared' }
  | { type: 'syncHistory'; history: SidebarHistoryEntry[] }
  | { type: 'syncRules'; globalRules: string }
  | { type: 'rulesSaved' }
  | { type: 'syncTemplates'; templates: RuleTemplate[] }
  | { type: 'syncWorkspaceTemplate'; templateIds: string[] }
  | { type: 'syncWorkflows'; workflows: Workflow[] }
  | { type: 'previewWorkflow'; workflow: Workflow; stepCount: number }
  | { type: 'workflowRunQueued'; workflowName: string; stepCount: number }
  | { type: 'playSound' }
  | { type: 'syncQueue'; count: number; items: string[] }
  | { type: 'queueRecalled'; text: string | null; count: number };

export type SidebarToolCallViewModel = {
  title: string;
  summary: string;
  choices: string[];
};

export function normalizeToolCallParams(params: ToolCallParams): SidebarToolCallViewModel {
  return {
    title: params.title || '来自 Copilot',
    summary: params.summary || '',
    choices: params.choices || [],
  };
}
