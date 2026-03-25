 /**
 * Copilot Super - VS Code Extension 主入口
 * 启动内嵌 MCP HTTP 服务器，注册侧边栏面板和命令
 */

import * as vscode from 'vscode';
import { McpHttpServer } from './mcpServer';
import { getMcpToolName } from './mcpProtocol';
import { SidebarProvider } from './sidebarProvider';
import { createPromptLoader } from './services/promptLoader';
import { createWorkspaceSetup } from './services/workspaceSetup';
import { createStatusBar, updateStatusBar } from './ui/statusBar';
import { getConfigDir, getEditorInfo } from './utils/editorDetector';
import { globalLogManager, formatError } from './utils/logger';

// ============ 常量定义 ============

const DEFAULT_PORT = 55433;
/** 新任务后缀，用于复制到剪贴板时添加 */
const NEW_TASK_SUFFIX = '\n\n[新任务]';

// ============ 模块级变量 ============

let mcpServer: McpHttpServer | undefined;
let sidebarProvider: SidebarProvider;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

// ============ 辅助函数 ============

/** 获取配置的端口 */
function getConfiguredPort(): number {
  return vscode.workspace.getConfiguration('copilot-super').get<number>('port', DEFAULT_PORT);
}

/** 获取实际运行中的端口（优先使用服务器实际端口） */
function getEffectivePort(): number {
  return mcpServer?.getActualPort() || getConfiguredPort();
}

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Copilot Super');
  
  // 初始化日志级别（根据配置决定是否启用调试日志）
  globalLogManager.updateFromConfig();
  
  log('Extension activating...');

  // 获取编辑器信息（缓存后复用）
  const editorInfo = getEditorInfo();

  // 调试模式：显示编辑器检测信息
  const isDebug = vscode.workspace.getConfiguration('copilot-super').get<boolean>('debug', false);
  if (isDebug) {
    log('Editor Detection:');
    log(`  appName: ${editorInfo.appName}`);
    log(`  appRoot: ${editorInfo.appRoot}`);
    log(`  type: ${editorInfo.type}`);
    log(`  configDir: ${editorInfo.configDir}`);
    void vscode.window.showInformationMessage(
      `Copilot Super 调试: ${editorInfo.appName} | ${editorInfo.type} | ${editorInfo.configDir}`
    );
  }

  // Windsurf 警告：不支持多开编辑器
  if (editorInfo.type === 'windsurf') {
    void vscode.window.showWarningMessage(
      'Copilot Super: Windsurf 不支持多开编辑器，请确保只打开一个 Windsurf 窗口'
    );
  }

  const promptLoader = createPromptLoader({
    extensionPath: context.extensionPath,
    log,
  });

  // 创建 SidebarProvider 后再创建 workspaceSetup，避免循环依赖
  let sidebarProviderInstance: SidebarProvider | undefined;

  const workspaceSetup = createWorkspaceSetup({
    getDefaultCopilotPrompt: promptLoader.getDefaultCopilotPrompt,
    getRulesText: () => sidebarProviderInstance?.getRulesText() ?? '',
    log,
  });

  const config = vscode.workspace.getConfiguration('copilot-super');
  const autoStart = config.get<boolean>('autoStart', true);

  sidebarProvider = new SidebarProvider(context.extensionUri, context);
  sidebarProviderInstance = sidebarProvider;
  sidebarProvider.onGetPrefix = () => {
    const toolName = getMcpToolName(getEffectivePort());
    const configDir = getConfigDir();
    return promptLoader.readPromptFile('prefix.txt', toolName, configDir);
  };
  sidebarProvider.onGetToolName = () => {
    return getMcpToolName(getEffectivePort());
  };

  const port = getConfiguredPort();
  await workspaceSetup.ensureWorkspaceFiles(port);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewId,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-super.openPanel', () => {
      vscode.commands.executeCommand('copilot-super.panel.focus');
    }),

    vscode.commands.registerCommand('copilot-super.sendMessage', async () => {
      const input = await vscode.window.showInputBox({
        prompt: '输入发送给 Copilot 的消息',
        placeHolder: '请输入你的指令...',
        ignoreFocusOut: true,
      });
      if (input) {
        sidebarProvider.submitResponse(input);
        log(`User quick message: ${input}`);
      }
    }),

    vscode.commands.registerCommand('copilot-super.restartServer', async () => {
      await restartServer(getConfiguredPort(), workspaceSetup.ensureWorkspaceFiles);
    }),

    vscode.commands.registerCommand('copilot-super.clearHistory', () => {
      sidebarProvider.clearHistory();
      log('History cleared');
    }),

    vscode.commands.registerCommand('copilot-super.copyPrompt', async () => {
      const fullPrompt = sidebarProvider.getFullPrompt();
      if (fullPrompt) {
        await vscode.env.clipboard.writeText(fullPrompt + NEW_TASK_SUFFIX);
        showNotification('Copilot Super: 前置提示词（包含规则）已复制到剪贴板');
        log('Full prompt with rules copied to clipboard');
      } else {
        const toolName = getMcpToolName(getEffectivePort());
        const configDir = getConfigDir();
        const promptText = promptLoader.readPromptFile('prefix.txt', toolName, configDir);
        await vscode.env.clipboard.writeText(promptText + NEW_TASK_SUFFIX);
        showNotification('Copilot Super: 前置提示词已复制到剪贴板');
        log(`Prompt copied to clipboard (tool: ${toolName})`);
      }
    }),

    vscode.commands.registerCommand('copilot-super.copyRules', async () => {
      const rulesText = sidebarProvider.getRulesText();
      if (rulesText.trim()) {
        await vscode.env.clipboard.writeText(rulesText + NEW_TASK_SUFFIX);
        showNotification('Copilot Super: 规则已复制到剪贴板');
        log('Rules copied to clipboard');
      } else {
        showNotification('Copilot Super: 当前没有规则可复制');
        log('No rules to copy');
      }
    }),

    vscode.commands.registerCommand('copilot-super.refreshWorkspaceFiles', async () => {
      await workspaceSetup.ensureWorkspaceFiles(getEffectivePort());
    })
  );

  statusBarItem = createStatusBar();
  context.subscriptions.push(statusBarItem);
  updateStatusBar(statusBarItem, 'starting');

  if (autoStart) {
    await startServer(port, workspaceSetup.ensureWorkspaceFiles);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
      if (e.affectsConfiguration('copilot-super.port')) {
        const newPort = getConfiguredPort();
        await restartServer(newPort, workspaceSetup.ensureWorkspaceFiles);
        await workspaceSetup.ensureWorkspaceFiles(newPort);
        return;
      }

      // 更新日志级别
      if (e.affectsConfiguration('copilot-super.debug')) {
        globalLogManager.updateFromConfig();
      }

      if (
        e.affectsConfiguration('copilot-super.notifyOnToolCall') ||
        e.affectsConfiguration('copilot-super.soundOnToolCall') ||
        e.affectsConfiguration('copilot-super.showPluginNotifications')
      ) {
        sidebarProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await workspaceSetup.ensureWorkspaceFiles(getConfiguredPort());
    })
  );

  log('Extension activated successfully');
}

export async function deactivate() {
  log('Extension deactivating...');
  try {
    await mcpServer?.stop();
  } catch (err) {
    log(`Error stopping server: ${formatError(err)}`);
  }
  try {
    outputChannel?.dispose();
  } catch {
    // 忽略销毁错误
  }
}

async function startServer(
  port: number,
  ensureWorkspaceFiles: (port: number) => Promise<void>
): Promise<void> {
  try {
    mcpServer = new McpHttpServer(port);

    mcpServer.setToolCallHandler(async (params) => {
      log(`Tool call received: ${params.title || 'untitled'}`);
      const response = await sidebarProvider.handleToolCall(params);
      log(`User response: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
      return response;
    });

    mcpServer.setToolCallCancelHandler(() => {
      log('Client disconnected, cancelling pending request');
      sidebarProvider.cancelPendingRequest();
    });

    mcpServer.setConnectionStateHandler((connected) => {
      if (connected) {
        log('MCP connection recovered');
        updateStatusBar(statusBarItem, 'running', mcpServer!.getActualPort());
      } else {
        log('MCP connection appears disconnected');
        updateStatusBar(statusBarItem, 'disconnected');
      }
    });

    const actualPort = await mcpServer.start();
    updateStatusBar(statusBarItem, 'running', actualPort);
    log(`MCP server started on port ${actualPort}${actualPort !== port ? ` (requested ${port})` : ''}`);

    if (actualPort !== port) {
      await ensureWorkspaceFiles(actualPort);
    }

    showNotification(
      `Copilot Super: MCP 服务器已在端口 ${actualPort} 启动`
    );
  } catch (err: unknown) {
    const msg = formatError(err);
    updateStatusBar(statusBarItem, 'error');
    log(`Failed to start server: ${msg}`);
    vscode.window.showErrorMessage(`Copilot Super: 启动失败 - ${msg}`);
  }
}

async function restartServer(
  port: number,
  ensureWorkspaceFiles: (port: number) => Promise<void>
): Promise<void> {
  log('Restarting MCP server...');
  updateStatusBar(statusBarItem, 'starting');

  try {
    await mcpServer?.stop();
    await startServer(port, ensureWorkspaceFiles);
    showNotification('Copilot Super: MCP 服务器已重启');
  } catch (err: unknown) {
    const msg = formatError(err);
    vscode.window.showErrorMessage(`Copilot Super: 重启失败 - ${msg}`);
  }
}

function log(message: string): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] ${message}`);
}

/** 检查是否允许发送 VS Code 通知，仅在允许时显示 */
function showNotification(message: string, ...items: string[]): Thenable<string | undefined> | undefined {
  const config = vscode.workspace.getConfiguration('copilot-super');
  if (config.get<boolean>('showPluginNotifications', true)) {
    return vscode.window.showInformationMessage(message, ...items);
  }
  return undefined;
}
