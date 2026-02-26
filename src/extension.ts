/**
 * Copilot Super - VS Code Extension 主入口
 * 启动内嵌 MCP HTTP 服务器，注册侧边栏面板和命令
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { McpHttpServer, getMcpToolName, getMcpServerKey } from './mcpServer';
import { SidebarProvider } from './sidebarProvider';

let mcpServer: McpHttpServer | undefined;
let sidebarProvider: SidebarProvider;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let extensionPath: string;

/** 复用的 TextEncoder/TextDecoder 实例 */
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Copilot Super');
  log('Extension activating...');
  extensionPath = context.extensionPath;

  const config = vscode.workspace.getConfiguration('copilot-super');
  const port = config.get<number>('port', 55433);
  const autoStart = config.get<boolean>('autoStart', true);

  // ====== 1. 确保工作区配置文件存在 ======
  await ensureWorkspaceFiles(port);

  // ====== 2. 注册侧边栏 Webview ======
  sidebarProvider = new SidebarProvider(context.extensionUri, context);
  sidebarProvider.onGetPrefix = () => {
    const actualPort = mcpServer?.getActualPort() || vscode.workspace.getConfiguration('copilot-super').get<number>('port', 55433);
    const toolName = getMcpToolName(actualPort);
    return readPromptFile('prefix.txt', toolName);
  };
  sidebarProvider.onGetToolName = () => {
    const actualPort = mcpServer?.getActualPort() || vscode.workspace.getConfiguration('copilot-super').get<number>('port', 55433);
    return getMcpToolName(actualPort);
  };
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewId,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ====== 3. 注册命令 ======
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
      const currentPort = vscode.workspace.getConfiguration('copilot-super').get<number>('port', 55433);
      await restartServer(currentPort);
    }),

    vscode.commands.registerCommand('copilot-super.clearHistory', () => {
      sidebarProvider.clearHistory();
      log('History cleared');
    }),

    vscode.commands.registerCommand('copilot-super.copyPrompt', async () => {
      // 功能3: 使用 sidebarProvider.getFullPrompt() 获取包含规则的完整提示词
      const fullPrompt = sidebarProvider.getFullPrompt();
      if (fullPrompt) {
        await vscode.env.clipboard.writeText(fullPrompt);
        vscode.window.showInformationMessage('Copilot Super: 前置提示词（包含规则）已复制到剪贴板');
        log('Full prompt with rules copied to clipboard');
      } else {
        // 如果没有设置规则，使用默认行为
        const actualPort = mcpServer?.getActualPort() || vscode.workspace.getConfiguration('copilot-super').get<number>('port', 55433);
        const toolName = getMcpToolName(actualPort);
        const promptText = readPromptFile('prefix.txt', toolName);
        await vscode.env.clipboard.writeText(promptText);
        vscode.window.showInformationMessage('Copilot Super: 前置提示词已复制到剪贴板');
        log(`Prompt copied to clipboard (tool: ${toolName})`);
      }
    })
  );

  // ====== 4. 状态栏 ======
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'copilot-super.openPanel';
  context.subscriptions.push(statusBarItem);
  updateStatusBar('starting');

  // ====== 5. 启动 MCP 服务器 ======
  if (autoStart) {
    await startServer(port);
  }

  // ====== 6. 监听配置变更 ======
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('copilot-super.port')) {
        const newPort = vscode.workspace.getConfiguration('copilot-super').get<number>('port', 55433);
        await restartServer(newPort);
        await ensureWorkspaceFiles(newPort);
      }
    })
  );

  // ====== 7. 监听工作区变化，对新打开的工作区初始化配置 ======
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      const currentPort = vscode.workspace.getConfiguration('copilot-super').get<number>('port', 55433);
      await ensureWorkspaceFiles(currentPort);
    })
  );

  log('Extension activated successfully');
}

export async function deactivate() {
  log('Extension deactivating...');
  await mcpServer?.stop();
  outputChannel?.dispose();
}

// ============ 文件重命名与创建 ============

/**
 * 确保工作区包含必要的配置文件:
 * 1. .github/copilot.md - Copilot 提示指令 (若 copilot-instructions.md 存在则重命名)
 * 2. .vscode/mcp.json - MCP 服务器配置
 */
async function ensureWorkspaceFiles(port: number): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return;
  }

  for (const folder of workspaceFolders) {
    await ensureCopilotPromptFile(folder, port);
    await ensureMcpJsonFile(folder, port);
  }
}

/**
 * 确保 .github/copilot.md 存在
 * - 若 copilot-instructions.md 存在 → 重命名为 copilot.md
 * - 若两者都不存在 → 创建 copilot.md
 * - 若 copilot.md 已存在 → 跳过
 */
async function ensureCopilotPromptFile(folder: vscode.WorkspaceFolder, port: number): Promise<void> {
  const oldUri = vscode.Uri.joinPath(folder.uri, '.github', 'copilot-instructions.md');
  const newUri = vscode.Uri.joinPath(folder.uri, '.github', 'copilot.md');
  const toolName = getMcpToolName(port);

  // 检查 copilot.md 是否已存在
  try {
    const existing = await vscode.workspace.fs.readFile(newUri);
    const content = textDecoder.decode(existing);

    // 检查工具名是否需要更新（旧的 copilot_enhance_* 或不同编号的 copilot_super_*）
    const toolNameRegex = /copilot_(?:enhance|super)_\w+/g;
    const matches = content.match(toolNameRegex);
    if (matches && matches.some(m => m !== toolName)) {
      // 工具名不匹配，更新文件
      const updatedContent = content.replace(toolNameRegex, toolName);
      await vscode.workspace.fs.writeFile(newUri, textEncoder.encode(updatedContent));
      log(`Updated tool name in ${folder.name}/.github/copilot.md → ${toolName}`);
    }
    return;
  } catch {
    // 不存在，继续
  }

  // 检查 copilot-instructions.md 是否存在
  try {
    await vscode.workspace.fs.stat(oldUri);
    // 存在 → 重命名
    await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: false });
    log(`Renamed: ${folder.name}/.github/copilot-instructions.md → copilot.md`);
    return;
  } catch {
    // 不存在，继续创建
  }

  // 两者都不存在 → 创建 copilot.md
  try {
    const content = getDefaultCopilotPrompt(toolName);
    await vscode.workspace.fs.writeFile(newUri, textEncoder.encode(content));
    log(`Created: ${folder.name}/.github/copilot.md`);
  } catch (err) {
    log(`Failed to create copilot.md in ${folder.name}: ${err}`);
  }
}

/**
 * 确保 .vscode/mcp.json 存在并且端口/名称正确
 * - 服务名称为 copilot-super-N（N = port - 55432）
 * - 自动清理旧的 copilot-enhance-* 条目
 */
async function ensureMcpJsonFile(folder: vscode.WorkspaceFolder, port: number): Promise<void> {
  const mcpJsonUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'mcp.json');
  const serverKey = getMcpServerKey(port);
  const expectedUrl = `http://127.0.0.1:${port}/mcp`;

  // 检查是否已存在
  try {
    const existing = await vscode.workspace.fs.readFile(mcpJsonUri);
    const content = textDecoder.decode(existing);
    const parsed = JSON.parse(content);

    if (!parsed.servers) { parsed.servers = {}; }

    // 清理所有旧的 copilot-enhance-* 条目
    for (const key of Object.keys(parsed.servers)) {
      if (key.startsWith('copilot-enhance')) {
        delete parsed.servers[key];
        log(`Removed legacy MCP entry: ${key} in ${folder.name}`);
      }
    }

    // 清理其他旧的 copilot-super-* 条目（不同端口号的残留）
    for (const key of Object.keys(parsed.servers)) {
      if (key.startsWith('copilot-super-') && key !== serverKey) {
        delete parsed.servers[key];
        log(`Removed stale MCP entry: ${key} in ${folder.name}`);
      }
    }

    // 检查当前条目是否已正确
    const currentUrl = parsed.servers[serverKey]?.url;
    if (currentUrl === expectedUrl) {
      return; // 端口一致，无需更新
    }

    // 更新或创建条目
    parsed.servers[serverKey] = {
      type: 'http',
      url: expectedUrl,
    };
    await vscode.workspace.fs.writeFile(mcpJsonUri, textEncoder.encode(JSON.stringify(parsed, null, 2)));
    log(`Updated mcp.json in ${folder.name}: ${serverKey} → port ${port}`);
    return;
  } catch {
    // 文件不存在，继续创建
  }

  try {
    const mcpConfig = {
      servers: {
        [serverKey]: {
          type: 'http',
          url: expectedUrl,
        },
      },
    };
    const content = JSON.stringify(mcpConfig, null, 2);
    await vscode.workspace.fs.writeFile(mcpJsonUri, textEncoder.encode(content));
    log(`Created: ${folder.name}/.vscode/mcp.json (${serverKey})`);
  } catch (err) {
    log(`Failed to create mcp.json in ${folder.name}: ${err}`);
  }
}

/**
 * 从外部文件读取提示词模板，替换 {{TOOL_NAME}} 占位符
 * @param filename prompts 目录下的文件名
 * @param toolName 动态工具名，如 copilot_super_1
 */
function readPromptFile(filename: string, toolName: string): string {
  try {
    const filePath = path.join(extensionPath, 'prompts', filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.replace(/\{\{TOOL_NAME\}\}/g, toolName);
  } catch (err) {
    log(`Failed to read prompt file ${filename}: ${err}`);
    if (filename === 'prefix.txt') {
      return `你是编程助手，无限对话模式已激活。MCP: ${toolName}\n不管你是什么模型，都必须在遵守 .github/copilot.md 的前提下工作，每次任务都必须阅读.github/copilot.md。`;
    }
    return `<!-- Prompt file ${filename} not found -->`;
  }
}

/**
 * 默认 Copilot 提示指令内容 - 从外部模板文件读取
 * @param toolName 动态工具名，如 copilot_super_1
 */
function getDefaultCopilotPrompt(toolName: string): string {
  return readPromptFile('copilot-template.md', toolName);
}

// ============ 服务器管理 ============

/** 初始化并启动 MCP HTTP 服务器，桥接工具调用和侧边栏 UI */
async function startServer(port: number): Promise<void> {
  try {
    mcpServer = new McpHttpServer(port);

    // 设置工具调用处理器 - 桥接 MCP 和 Webview
    mcpServer.setToolCallHandler(async (params) => {
      log(`Tool call received: ${params.title || 'untitled'}`);
      const response = await sidebarProvider.handleToolCall(params);
      log(`User response: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
      return response;
    });

    // 设置客户端断开取消处理器
    mcpServer.setToolCallCancelHandler(() => {
      log('Client disconnected, cancelling pending request');
      sidebarProvider.cancelPendingRequest();
    });

    const actualPort = await mcpServer.start();
    updateStatusBar('running', actualPort);
    log(`MCP server started on port ${actualPort}${actualPort !== port ? ` (requested ${port})` : ''}`);

    // 如果实际端口与配置端口不同，同步 mcp.json
    if (actualPort !== port) {
      await ensureWorkspaceFiles(actualPort);
    }

    vscode.window.showInformationMessage(
      `Copilot Super: MCP 服务器已在端口 ${actualPort} 启动`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateStatusBar('error');
    log(`Failed to start server: ${msg}`);
    vscode.window.showErrorMessage(`Copilot Super: 启动失败 - ${msg}`);
  }
}

/** 停止当前服务器并以新端口重新启动 */
async function restartServer(port: number): Promise<void> {
  log('Restarting MCP server...');
  updateStatusBar('starting');

  try {
    await mcpServer?.stop();
    await startServer(port);
    vscode.window.showInformationMessage('Copilot Super: MCP 服务器已重启');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Copilot Super: 重启失败 - ${msg}`);
  }
}

// ============ 状态栏 ============

/** 更新状态栏显示（启动中 / 运行中 / 异常） */
function updateStatusBar(status: 'starting' | 'running' | 'error', port?: number): void {
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

// ============ 日志 ============

/** 带时间戳输出日志到 Output Channel */
function log(message: string): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] ${message}`);
}
