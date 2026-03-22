import * as vscode from 'vscode';
import type { RuleTemplate } from './types';

type DeleteTemplateResult = {
  templates: RuleTemplate[];
  workspaceTemplateIds: string[];
};

export function deleteTemplate(
  templates: RuleTemplate[],
  workspaceTemplateIds: string[],
  id: string
): DeleteTemplateResult {
  return {
    templates: templates.filter((template) => template.id !== id),
    workspaceTemplateIds: workspaceTemplateIds.filter((templateId) => templateId !== id),
  };
}

export async function persistWorkspaceTemplateIds(
  context: vscode.ExtensionContext,
  templateIds: string[]
): Promise<void> {
  await context.workspaceState.update('copilot-super.workspaceRuleTemplate', templateIds);
}
