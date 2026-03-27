import { appendHistoryEntry, removeLastUserHistoryEntry } from './historyStore';
import { enqueueResponse, type QueuedResponse } from './queueManager';
import type { RuleTemplate, SidebarHistoryEntry } from './types';
import { buildFullPrefix } from './prefixBuilder';

export function appendUserHistory(
  history: SidebarHistoryEntry[],
  text: string
): SidebarHistoryEntry[] {
  return appendHistoryEntry(history, {
    role: 'user',
    content: text,
    timestamp: Date.now(),
  });
}

export function buildResolvedUserResponse(args: {
  text: string;
  prefix?: string;
  toolName?: string;
  globalRules: string;
  workspaceRuleTemplate: string[];
  ruleTemplates: RuleTemplate[];
}): string {
  const { text, prefix, toolName, globalRules, workspaceRuleTemplate, ruleTemplates } = args;
  if (!prefix) {
    return text;
  }

  const fullPrefix = buildFullPrefix({
    prefix,
    globalRules,
    workspaceRuleTemplate,
    ruleTemplates,
  });

  if (!fullPrefix) {
    return text;
  }

  const suffix = toolName ? `，每次任务完成之后请调用${toolName}进行汇报。` : '';
  return `${fullPrefix}\n\n[新任务]\n${text}${suffix}`;
}

/** 构建工作流后续步骤的响应文本（不含前缀和规则，仅带工具回调后缀） */
export function buildFollowUpResponse(text: string, toolName?: string): string {
  const suffix = toolName ? `，每次任务完成之后请调用${toolName}进行汇报。` : '';
  return `${text}${suffix}`;
}

export function enqueueUserResponse(
  queue: QueuedResponse[],
  original: string,
  full: string
): QueuedResponse[] {
  return enqueueResponse(queue, { original, full });
}

export function removeQueuedUserHistory(history: SidebarHistoryEntry[]): SidebarHistoryEntry[] {
  return removeLastUserHistoryEntry(history);
}
