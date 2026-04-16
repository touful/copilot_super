import type { ToolCallParams } from '../mcpServer';
import { normalizeEscapedDisplayText } from './textNormalization';

export interface PendingRequest {
  resolve: (value: string) => void;
  /** 定时器句柄，用于取消超时 */
  timeout?: NodeJS.Timeout;
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

export type DroppedFileCandidate = {
  value: string;
  trustedName?: boolean;
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
  | { type: 'resolveDroppedFiles'; requestId: string; candidates: DroppedFileCandidate[] }
  | { type: 'attachFiles' }
  | { type: 'debugLog'; message: string }
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
  | { type: 'queueRecalled'; text: string | null; count: number }
  | { type: 'resolvedDroppedFiles'; requestId: string; fileRefs: string[] }
  | { type: 'attachedFiles'; fileRefs: string[] };

export type SidebarToolCallViewModel = {
  title: string;
  summary: string;
  choices: string[];
};

export function normalizeToolCallParams(params: ToolCallParams): SidebarToolCallViewModel {
  return {
    title: normalizeEscapedDisplayText(params.title || '来自 Copilot'),
    summary: normalizeEscapedDisplayText(params.summary || ''),
    choices: (params.choices || []).map((choice) => normalizeEscapedDisplayText(choice)),
  };
}

/**
 * 运行时类型校验：检查是否为有效的 ToolCallParams
 */
export function isValidToolCallParams(params: unknown): params is ToolCallParams {
  if (params === null || typeof params !== 'object') {
    return false;
  }
  const obj = params as Record<string, unknown>;
  // 允许空对象或包含 title/summary/choices 的对象
  if ('title' in obj && typeof obj.title !== 'string' && obj.title !== undefined) {
    return false;
  }
  if ('summary' in obj && typeof obj.summary !== 'string' && obj.summary !== undefined) {
    return false;
  }
  if ('choices' in obj) {
    if (!Array.isArray(obj.choices)) {
      return false;
    }
    if (!obj.choices.every((item: unknown) => typeof item === 'string')) {
      return false;
    }
  }
  return true;
}
