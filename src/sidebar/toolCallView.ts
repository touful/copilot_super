import * as vscode from 'vscode';
import type { ExtToWebviewMessage, SidebarToolCallViewModel } from './types';

export function buildShowPromptMessage(
  viewModel: SidebarToolCallViewModel,
  autoResponded: boolean
): ExtToWebviewMessage {
  return {
    type: 'showPrompt',
    title: viewModel.title,
    summary: viewModel.summary,
    choices: viewModel.choices,
    defaultFeedback: viewModel.defaultFeedback,
    timestamp: Date.now(),
    autoResponded,
  };
}

export async function focusSidebarPanel(webviewView?: vscode.WebviewView): Promise<void> {
  if (webviewView) {
    webviewView.show(true);
    return;
  }

  await vscode.commands.executeCommand('copilot-super.panel.focus');
}

export function notifyToolCall(title: string): void {
  vscode.window.showInformationMessage(
    `🤖 ${title}`,
    { modal: false },
    '查看'
  ).then((action: string | undefined) => {
    if (action === '查看') {
      vscode.commands.executeCommand('copilot-super.panel.focus');
    }
  });
}
