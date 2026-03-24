/**
 * 编辑器检测工具
 * 用于识别当前运行的编辑器类型（VSCode、Cursor、Windsurf、Lingma 等）
 */

import * as vscode from 'vscode';

/** 支持的编辑器类型 */
export type EditorType = 'vscode' | 'cursor' | 'windsurf' | 'lingma' | 'trae' | 'unknown';

/** 编辑器信息 */
export interface EditorInfo {
  /** 编辑器类型 */
  type: EditorType;
  /** 编辑器名称（原始值） */
  appName: string;
  /** 编辑器安装路径 */
  appRoot: string;
  /** 是否为 VSCode Fork 编辑器 */
  isVSCodeFork: boolean;
  /** 配置目录名（如 .vscode、.cursor 等） */
  configDir: string;
}

/** 编辑器类型到配置目录的映射 */
const EDITOR_CONFIG_DIRS: Record<EditorType, string> = {
  vscode: '.vscode',
  cursor: '.cursor',
  windsurf: '.windsurf',
  lingma: '.lingma',
  trae: '.trae',
  unknown: '.vscode', // 默认使用 .vscode
};

/**
 * 检测当前编辑器类型和信息
 */
export function detectEditor(): EditorInfo {
  const appName = vscode.env.appName;
  const appRoot = vscode.env.appRoot;
  const lowerAppName = appName.toLowerCase();

  let type: EditorType = 'unknown';

  // 通过 appName 判断编辑器类型
  if (lowerAppName.includes('visual studio code') || lowerAppName === 'code') {
    type = 'vscode';
  } else if (lowerAppName.includes('cursor')) {
    type = 'cursor';
  } else if (lowerAppName.includes('windsurf')) {
    type = 'windsurf';
  } else if (lowerAppName.includes('lingma') || lowerAppName.includes('通义灵码')) {
    type = 'lingma';
  } else if (lowerAppName.includes('trae')) {
    type = 'trae';
  }

  // 通过路径辅助判断（作为后备）
  if (type === 'unknown') {
    const lowerPath = appRoot.toLowerCase();
    if (lowerPath.includes('cursor')) {
      type = 'cursor';
    } else if (lowerPath.includes('windsurf')) {
      type = 'windsurf';
    } else if (lowerPath.includes('lingma')) {
      type = 'lingma';
    } else if (lowerPath.includes('trae')) {
      type = 'trae';
    } else if (lowerPath.includes('microsoft') || lowerPath.includes('vscode')) {
      type = 'vscode';
    }
  }

  return {
    type,
    appName,
    appRoot,
    isVSCodeFork: type !== 'unknown',
    configDir: EDITOR_CONFIG_DIRS[type],
  };
}

/** 缓存的编辑器信息 */
let cachedEditorInfo: EditorInfo | null = null;

/**
 * 获取编辑器信息（带缓存）
 */
export function getEditorInfo(): EditorInfo {
  if (!cachedEditorInfo) {
    cachedEditorInfo = detectEditor();
  }
  return cachedEditorInfo;
}

/**
 * 获取当前编辑器的配置目录名
 * @returns 配置目录名（如 .vscode、.cursor 等）
 */
export function getConfigDir(): string {
  return getEditorInfo().configDir;
}

/**
 * 获取当前编辑器的 rules.md 文件路径
 * @param folder 工作区文件夹
 * @returns rules.md 的 URI
 */
export function getRulesMdUri(folder: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.joinPath(folder.uri, getEditorInfo().configDir, 'rules.md');
}

/**
 * 获取当前编辑器的 mcp.json 文件路径
 * @param folder 工作区文件夹
 * @returns mcp.json 的 URI
 */
export function getMcpJsonUri(folder: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.joinPath(folder.uri, getEditorInfo().configDir, 'mcp.json');
}