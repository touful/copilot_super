import * as vscode from 'vscode';
import type { Workflow } from './types';
import { deleteItem, mergeItems, persistItems, saveItem } from './storeUtils';

type WorkflowFileEntry = {
  id: string;
  name: string;
  steps: Array<{
    id: string;
    prompt: string;
  }>;
};

export function getDefaultWorkflows(_extensionPath?: string): Workflow[] {
  try {
    const content = __EMBEDDED_WORKFLOW_TEMPLATES_JSON__;
    const parsed = JSON.parse(content) as WorkflowFileEntry[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((workflow) => workflow && typeof workflow.id === 'string' && typeof workflow.name === 'string' && Array.isArray(workflow.steps))
      .map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        steps: workflow.steps
          .filter((step) => step && typeof step.id === 'string' && typeof step.prompt === 'string')
          .map((step) => ({
            id: step.id,
            prompt: step.prompt,
          })),
      }))
      .filter((workflow) => workflow.steps.length > 0);
  } catch (parseError) {
    console.error('[WorkflowStore] Failed to parse embedded workflows:', parseError instanceof Error ? parseError.message : String(parseError));
    return [];
  }
}

export const saveWorkflow = saveItem<Workflow>;

export const deleteWorkflow = deleteItem<Workflow>;

export const mergeWorkflowsFromPrompt = mergeItems<Workflow>;

export const persistWorkflows = (context: vscode.ExtensionContext, workflows: Workflow[]) =>
  persistItems(context, 'copilot-super.workflows', workflows);
