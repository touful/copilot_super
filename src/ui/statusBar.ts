import * as vscode from 'vscode';

export type StatusBarState = 'starting' | 'running' | 'error';

export function createStatusBar(): vscode.StatusBarItem {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'copilot-super.openPanel';
  return statusBarItem;
}

export function updateStatusBar(
  statusBarItem: vscode.StatusBarItem,
  status: StatusBarState,
  port?: number
): void {
  switch (status) {
    case 'starting':
      statusBarItem.text = '$(loading~spin) Copilot Super';
      statusBarItem.tooltip = '正在启动 MCP 服务器...';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'running':
      statusBarItem.text = '$(radio-tower) Copilot Super';
      statusBarItem.tooltip = `MCP 服务器运行中 (端口 ${port})`;
      statusBarItem.backgroundColor = undefined;
      break;
    case 'error':
      statusBarItem.text = '$(error) Copilot Super';
      statusBarItem.tooltip = 'MCP 服务器异常';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      break;
  }
  statusBarItem.show();
}
