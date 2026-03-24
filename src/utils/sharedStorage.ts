/**
 * 跨编辑器共享存储工具
 * 在用户主目录创建 .copilot-super 目录，实现 VSCode/Lingma/Cursor 等编辑器间数据共享
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import type { RuleTemplate, Workflow } from '../sidebar/types';

/** 共享存储目录名 */
const SHARED_DIR_NAME = '.copilot-super';

/** 文件名常量 */
const FILES = {
  templates: 'templates.json',
  workflows: 'workflows.json',
  globalRules: 'global-rules.json',
  migratedFlag: '.migrated',
} as const;

/** 全局规则类型 */
interface GlobalRulesData {
  rules: string;
  updatedAt?: string;
}

/** 获取共享存储目录路径 */
function getSharedDir(): string {
  return path.join(os.homedir(), SHARED_DIR_NAME);
}

/** 确保共享目录存在 */
function ensureSharedDir(): void {
  const sharedDir = getSharedDir();
  if (!fs.existsSync(sharedDir)) {
    fs.mkdirSync(sharedDir, { recursive: true });
  }
}

/** 读取 JSON 文件 */
function readJsonFile<T>(filename: string, defaultValue: T): T {
  const filePath = path.join(getSharedDir(), filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch (err) {
    console.error(`[SharedStorage] Failed to read ${filename}:`, err);
  }
  return defaultValue;
}

/** 写入 JSON 文件（原子写入） */
function writeJsonFile<T>(filename: string, data: T): void {
  ensureSharedDir();
  const filePath = path.join(getSharedDir(), filename);
  const tempPath = `${filePath}.tmp`;
  
  try {
    // 先写入临时文件
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    // 原子重命名
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`[SharedStorage] Failed to write ${filename}:`, err);
    // 清理临时文件
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // 忽略清理错误
    }
  }
}

/** 检查是否已完成迁移 */
function isMigrated(): boolean {
  const flagPath = path.join(getSharedDir(), FILES.migratedFlag);
  return fs.existsSync(flagPath);
}

/** 标记迁移完成 */
function markMigrated(): void {
  ensureSharedDir();
  const flagPath = path.join(getSharedDir(), FILES.migratedFlag);
  fs.writeFileSync(flagPath, new Date().toISOString(), 'utf-8');
}

/** 检查共享存储是否已存在 */
export function isSharedStorageExists(): boolean {
  const sharedDir = getSharedDir();
  return fs.existsSync(sharedDir) && isMigrated();
}

/**
 * 从 VSCode globalState 迁移数据到共享存储
 * 仅在共享目录不存在时执行一次
 */
export function migrateFromGlobalState(context: vscode.ExtensionContext): void {
  if (isMigrated()) {
    return;
  }

  ensureSharedDir();
  const sharedDir = getSharedDir();

  // 迁移规则模板
  const templates = context.globalState.get<RuleTemplate[]>('copilot-super.ruleTemplates', []);
  if (templates.length > 0) {
    writeJsonFile(FILES.templates, templates);
  }

  // 迁移工作流
  const workflows = context.globalState.get<Workflow[]>('copilot-super.workflows', []);
  if (workflows.length > 0) {
    writeJsonFile(FILES.workflows, workflows);
  }

  // 迁移全局规则（优先从配置读取，其次从 globalState）
  const configRules = vscode.workspace.getConfiguration('copilot-super').get<string>('globalRules', '');
  const stateRules = context.globalState.get<string>('copilot-super.globalRules', '');
  const globalRules = configRules || stateRules;
  if (globalRules) {
    const rulesData: GlobalRulesData = {
      rules: globalRules,
      updatedAt: new Date().toISOString(),
    };
    writeJsonFile(FILES.globalRules, rulesData);
  }

  markMigrated();
  console.log(`[SharedStorage] Migrated data to ${sharedDir}`);
}

/** 读取规则模板 */
export function readTemplates(): RuleTemplate[] {
  return readJsonFile<RuleTemplate[]>(FILES.templates, []);
}

/** 写入规则模板 */
export function writeTemplates(templates: RuleTemplate[]): void {
  writeJsonFile(FILES.templates, templates);
}

/** 读取工作流 */
export function readWorkflows(): Workflow[] {
  return readJsonFile<Workflow[]>(FILES.workflows, []);
}

/** 写入工作流 */
export function writeWorkflows(workflows: Workflow[]): void {
  writeJsonFile(FILES.workflows, workflows);
}

/** 读取全局规则 */
export function readGlobalRules(): string {
  const data = readJsonFile<GlobalRulesData>(FILES.globalRules, { rules: '' });
  return data.rules;
}

/** 写入全局规则 */
export function writeGlobalRules(rules: string): void {
  const data: GlobalRulesData = {
    rules,
    updatedAt: new Date().toISOString(),
  };
  writeJsonFile(FILES.globalRules, data);
}

/** 获取共享存储路径（用于日志或调试） */
export function getSharedStoragePath(): string {
  return getSharedDir();
}