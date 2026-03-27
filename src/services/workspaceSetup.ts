import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'node:util';
import { getMcpServerKey, getMcpToolName } from '../mcpProtocol';
import { getEditorInfo, getRulesMdUri, getMcpJsonUri, usesGlobalMcpConfig } from '../utils/editorDetector';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface WorkspaceSetupOptions {
  getDefaultCopilotPrompt: (toolName: string, configDir: string) => string;
  getRulesText: () => string;
  log: (message: string) => void;
}

export function createWorkspaceSetup(options: WorkspaceSetupOptions) {
  const { getDefaultCopilotPrompt, getRulesText, log } = options;

  async function ensureWorkspaceFiles(port: number): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    // Windsurf 不再需要 MCP 配置，跳过全局 MCP 配置写入
    // 其他编辑器仍通过工作区 mcp.json 配置

    for (const folder of workspaceFolders) {
      await ensureRulesFile(folder, port);
      // Windsurf 不需要在工作区创建 mcp.json
      if (!usesGlobalMcpConfig()) {
        await ensureMcpJsonFile(folder, port);
      }
    }
  }

  /** 清理过期的 MCP 配置条目 */
  function cleanupMcpEntries<T extends Record<string, { type: string; url?: string; serverUrl?: string }>>(
    servers: T,
    serverKey: string,
    expectedUrl: string
  ): { modified: boolean; servers: T } {
    let modified = false;
    
    // 删除旧的 copilot-enhance 条目
    for (const key of Object.keys(servers)) {
      if (key.startsWith('copilot-enhance')) {
        delete servers[key];
        log(`Removed legacy MCP entry: ${key}`);
        modified = true;
      }
    }

    // 删除过期的 copilot-super 条目（端口不同）
    for (const key of Object.keys(servers)) {
      if (key.startsWith('copilot-super-') && key !== serverKey) {
        delete servers[key];
        log(`Removed stale MCP entry: ${key}`);
        modified = true;
      }
    }

    // 检查当前配置是否正确
    const currentEntry = servers[serverKey];
    const currentUrl = currentEntry?.serverUrl || currentEntry?.url;
    if (currentUrl === expectedUrl) {
      return { modified: false, servers };
    }

    return { modified: true, servers };
  }


  async function ensureRulesFile(folder: vscode.WorkspaceFolder, port: number): Promise<void> {
    const editorInfo = getEditorInfo();
    const rulesUri = getRulesMdUri(folder);
    const toolName = getMcpToolName(port);

    // 尝试迁移旧文件（.github/copilot.md -> 新目录/rules.md）
    await migrateOldFiles(folder, editorInfo.configDir);

    try {
      const existing = await vscode.workspace.fs.readFile(rulesUri);
      const content = textDecoder.decode(existing);
      const updatedContent = applyRulesToPrompt(updateToolName(content, toolName), getRulesText());
      if (updatedContent !== content) {
        await vscode.workspace.fs.writeFile(rulesUri, textEncoder.encode(updatedContent));
        log(`Updated tool name in ${folder.name}/${editorInfo.configDir}/rules.md → ${toolName}`);
      }
      return;
    } catch {
      // 文件不存在，继续创建
    }

    try {
      const content = applyRulesToPrompt(getDefaultCopilotPrompt(toolName, editorInfo.configDir), getRulesText());
      await vscode.workspace.fs.writeFile(rulesUri, textEncoder.encode(content));
      log(`Created: ${folder.name}/${editorInfo.configDir}/rules.md`);
    } catch (err) {
      log(`Failed to create rules.md in ${folder.name}: ${err}`);
    }
  }

  /**
   * 迁移旧文件到新位置
   * - .github/copilot.md -> {configDir}/rules.md
   * - .github/copilot-instructions.md -> {configDir}/rules.md
   */
  async function migrateOldFiles(folder: vscode.WorkspaceFolder, configDir: string): Promise<void> {
    const oldPaths = [
      ['.github', 'copilot.md'],
      ['.github', 'copilot-instructions.md'],
    ];

    for (const oldPath of oldPaths) {
      const oldUri = vscode.Uri.joinPath(folder.uri, ...oldPath);
      try {
        await vscode.workspace.fs.stat(oldUri);
        const newUri = getRulesMdUri(folder);
        // 检查目标是否已存在
        try {
          await vscode.workspace.fs.stat(newUri);
          // 目标已存在，删除旧文件
          await vscode.workspace.fs.delete(oldUri);
          log(`Deleted old file: ${folder.name}/${oldPath.join('/')}`);
        } catch {
          // 目标不存在，移动旧文件
          await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: false });
          log(`Migrated: ${folder.name}/${oldPath.join('/')} → ${configDir}/rules.md`);
        }
      } catch {
        // 旧文件不存在，忽略
      }
    }
  }

  async function ensureMcpJsonFile(folder: vscode.WorkspaceFolder, port: number): Promise<void> {
    const mcpJsonUri = getMcpJsonUri(folder);
    const editorInfo = getEditorInfo();
    const serverKey = getMcpServerKey(port);
    const expectedUrl = `http://127.0.0.1:${port}/mcp`;

    try {
      const existing = await vscode.workspace.fs.readFile(mcpJsonUri);
      const content = textDecoder.decode(existing);
      const parsed = JSON.parse(content) as { servers?: Record<string, { type: string; url: string }> };

      if (!parsed.servers) {
        parsed.servers = {};
      }

      // 使用公共函数清理过期条目
      const result = cleanupMcpEntries(parsed.servers, serverKey, expectedUrl);
      if (!result.modified && parsed.servers[serverKey]) {
        return;
      }
      parsed.servers = result.servers;

      parsed.servers[serverKey] = {
        type: 'http',
        url: expectedUrl,
      };
      await vscode.workspace.fs.writeFile(mcpJsonUri, textEncoder.encode(JSON.stringify(parsed, null, 2)));
      log(`Updated mcp.json in ${folder.name}/${editorInfo.configDir}: ${serverKey} → port ${port}`);
      return;
    } catch {
      // 文件不存在或解析失败，继续创建
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
      log(`Created: ${folder.name}/${editorInfo.configDir}/mcp.json (${serverKey})`);
    } catch (err) {
      log(`Failed to create mcp.json in ${folder.name}: ${err}`);
    }
  }

  return {
    ensureWorkspaceFiles,
  };
}

function updateToolName(content: string, toolName: string): string {
  const toolNameRegex = /copilot_(?:enhance|super)_\w+/g;
  const matches = content.match(toolNameRegex);
  if (matches && matches.some((match: string) => match !== toolName)) {
    return content.replace(toolNameRegex, toolName);
  }
  return content;
}

function applyRulesToPrompt(content: string, rulesText: string): string {
  const markerStart = '<!-- copilot-super-rules:start -->';
  const markerEnd = '<!-- copilot-super-rules:end -->';
  const block = rulesText.trim()
    ? `\n\n${markerStart}\n${rulesText.trim()}\n${markerEnd}\n`
    : '';

  const markerRegex = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}\\n?`, 'g');
  const cleaned = content.replace(markerRegex, '').trimEnd();
  return block ? `${cleaned}${block}` : `${cleaned}\n`;
}
