import * as vscode from 'vscode';
import type { Workflow } from './types';

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

export function saveWorkflow(workflows: Workflow[], workflow: Workflow): Workflow[] {
  const nextWorkflows = [...workflows];
  const index = nextWorkflows.findIndex((item) => item.id === workflow.id);

  if (index >= 0) {
    nextWorkflows[index] = workflow;
  } else {
    nextWorkflows.push(workflow);
  }

  return nextWorkflows;
}

export function deleteWorkflow(workflows: Workflow[], id: string): Workflow[] {
  return workflows.filter((workflow) => workflow.id !== id);
}

export function mergeWorkflowsFromPrompt(
  storedWorkflows: Workflow[],
  promptWorkflows: Workflow[]
): Workflow[] {
  if (promptWorkflows.length === 0) {
    return storedWorkflows;
  }

  const promptIds = new Set(promptWorkflows.map((item) => item.id));
  const customWorkflows = storedWorkflows.filter((item) => !promptIds.has(item.id));

  return [...promptWorkflows, ...customWorkflows];
}

export async function persistWorkflows(
  context: vscode.ExtensionContext,
  workflows: Workflow[]
): Promise<void> {
  await context.globalState.update('copilot-super.workflows', workflows);
}
