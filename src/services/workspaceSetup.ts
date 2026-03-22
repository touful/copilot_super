import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'node:util';
import { getMcpServerKey, getMcpToolName } from '../mcpProtocol';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface WorkspaceSetupOptions {
  getDefaultCopilotPrompt: (toolName: string) => string;
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

    for (const folder of workspaceFolders) {
      await ensureCopilotPromptFile(folder, port);
      await ensureMcpJsonFile(folder, port);
    }
  }

  async function ensureCopilotPromptFile(folder: vscode.WorkspaceFolder, port: number): Promise<void> {
    const oldUri = vscode.Uri.joinPath(folder.uri, '.github', 'copilot-instructions.md');
    const newUri = vscode.Uri.joinPath(folder.uri, '.github', 'copilot.md');
    const toolName = getMcpToolName(port);

    try {
      const existing = await vscode.workspace.fs.readFile(newUri);
      const content = textDecoder.decode(existing);
      const updatedContent = applyRulesToPrompt(updateToolName(content, toolName), getRulesText());
      if (updatedContent !== content) {
        await vscode.workspace.fs.writeFile(newUri, textEncoder.encode(updatedContent));
        log(`Updated tool name in ${folder.name}/.github/copilot.md → ${toolName}`);
      }
      return;
    } catch {
    }

    try {
      await vscode.workspace.fs.stat(oldUri);
      await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: false });
      log(`Renamed: ${folder.name}/.github/copilot-instructions.md → copilot.md`);
      return;
    } catch {
    }

    try {
      const content = applyRulesToPrompt(getDefaultCopilotPrompt(toolName), getRulesText());
      await vscode.workspace.fs.writeFile(newUri, textEncoder.encode(content));
      log(`Created: ${folder.name}/.github/copilot.md`);
    } catch (err) {
      log(`Failed to create copilot.md in ${folder.name}: ${err}`);
    }
  }

  async function ensureMcpJsonFile(folder: vscode.WorkspaceFolder, port: number): Promise<void> {
    const mcpJsonUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'mcp.json');
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
      log(`Updated mcp.json in ${folder.name}: ${serverKey} → port ${port}`);
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
      log(`Created: ${folder.name}/.vscode/mcp.json (${serverKey})`);
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
