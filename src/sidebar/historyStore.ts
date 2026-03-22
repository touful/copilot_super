import * as vscode from 'vscode';
import type { SidebarHistoryEntry } from './types';

export const MAX_HISTORY_ENTRIES = 200;

export function appendHistoryEntry(
  history: SidebarHistoryEntry[],
  entry: SidebarHistoryEntry
): SidebarHistoryEntry[] {
  const nextHistory = [...history, entry];

  if (nextHistory.length > MAX_HISTORY_ENTRIES) {
    return nextHistory.slice(-MAX_HISTORY_ENTRIES);
  }

  return nextHistory;
}

export function clearHistoryEntries(): SidebarHistoryEntry[] {
  return [];
}

export function removeLastUserHistoryEntry(history: SidebarHistoryEntry[]): SidebarHistoryEntry[] {
  const nextHistory = [...history];

  for (let i = nextHistory.length - 1; i >= 0; i--) {
    if (nextHistory[i].role === 'user') {
      nextHistory.splice(i, 1);
      break;
    }
  }

  return nextHistory;
}

export async function persistHistory(
  context: vscode.ExtensionContext,
  history: SidebarHistoryEntry[]
): Promise<void> {
  await context.workspaceState.update('copilot-super.history', history);
}
