import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'node:util';
import * as fs from 'fs';
import * as path from 'path';
import { getMcpServerKey, getMcpToolName } from '../mcpProtocol';
import { getEditorInfo, getRulesMdUri, getMcpJsonUri, getWindsurfMcpConfigPath, usesGlobalMcpConfig } from '../utils/editorDetector';

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

    // Windsurf 使用全局 MCP 配置，需要单独处理
    if (usesGlobalMcpConfig()) {
      await ensureWindsurfMcpConfig(port);
    }

    for (const folder of workspaceFolders) {
      await ensureRulesFile(folder, port);
      // Windsurf 不需要在工作区创建 mcp.json
      if (!usesGlobalMcpConfig()) {
        await ensureMcpJsonFile(folder, port);
      }
    }
  }

  /**
   * 确保 Windsurf 全局 MCP 配置文件存在并包含正确的 copilot-super 配置
   * Windsurf 使用 ~/.codeium/windsurf/mcp_config.json 格式
   */
  async function ensureWindsurfMcpConfig(port: number): Promise<void> {
    const configPath = getWindsurfMcpConfigPath();
    if (!configPath) {
      return;
    }

    const serverKey = `copilot-super-${port}`;
    const expectedUrl = `http://127.0.0.1:${port}/mcp`;

    try {
      // 确保目录存在
      const configDir = path.dirname(configPath);
      await fs.promises.mkdir(configDir, { recursive: true });

      // 读取现有配置
      let config: { mcpServers?: Record<string, { type: string; serverUrl?: string; url?: string }> } = {};
      try {
        const content = await fs.promises.readFile(configPath, 'utf-8');
        config = JSON.parse(content);
      } catch {
        // 文件不存在或解析失败，使用空配置
      }

      if (!config.mcpServers) {
        config.mcpServers = {};
      }

      // 删除旧的 copilot-enhance 条目
      for (const key of Object.keys(config.mcpServers)) {
        if (key.startsWith('copilot-enhance')) {
          delete config.mcpServers[key];
          log(`Removed legacy MCP entry: ${key}`);
        }
      }

      // 删除过期的 copilot-super 条目（端口不同）
      for (const key of Object.keys(config.mcpServers)) {
        if (key.startsWith('copilot-super-') && key !== serverKey) {
          delete config.mcpServers[key];
          log(`Removed stale MCP entry: ${key}`);
        }
      }

      // 检查当前配置是否正确
      const currentEntry = config.mcpServers[serverKey];
      const currentUrl = currentEntry?.serverUrl || currentEntry?.url;
      if (currentUrl === expectedUrl) {
        return;
      }

      // 更新配置
      config.mcpServers[serverKey] = {
        type: 'http',
        serverUrl: expectedUrl,
      };

      // 原子写入：先写入临时文件，再重命名（Windows 兼容：使用 copy + delete）
      const tempPath = `${configPath}.${process.pid}.tmp`;
      await fs.promises.writeFile(tempPath, JSON.stringify(config, null, 2), 'utf-8');
      try {
        // 尝试原子重命名（Unix 系统）
        await fs.promises.rename(tempPath, configPath);
      } catch {
        // Windows 可能失败，使用 copy + delete
        await fs.promises.copyFile(tempPath, configPath);
        await fs.promises.unlink(tempPath);
      }
      log(`Updated Windsurf MCP config: ${serverKey} → port ${port}`);
    } catch (err) {
      log(`Failed to update Windsurf MCP config: ${err}`);
    }
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

      for (const key of Object.keys(parsed.servers)) {
        if (key.startsWith('copilot-enhance')) {
          delete parsed.servers[key];
          log(`Removed legacy MCP entry: ${key} in ${folder.name}`);
        }
      }

      for (const key of Object.keys(parsed.servers)) {
        if (key.startsWith('copilot-super-') && key !== serverKey) {
          delete parsed.servers[key];
          log(`Removed stale MCP entry: ${key} in ${folder.name}`);
        }
      }

      const currentUrl = parsed.servers[serverKey]?.url;
      if (currentUrl === expectedUrl) {
        return;
      }

      parsed.servers[serverKey] = {
        type: 'http',
        url: expectedUrl,
      };
      await vscode.workspace.fs.writeFile(mcpJsonUri, textEncoder.encode(JSON.stringify(parsed, null, 2)));
      log(`Updated mcp.json in ${folder.name}/${editorInfo.configDir}: ${serverKey} → port ${port}`);
      return;
    } catch {
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
