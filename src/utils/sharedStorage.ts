/**
 * 跨编辑器共享存储工具
 * 在用户主目录创建 .copilot-super 目录，实现 VSCode/Lingma/Cursor 等编辑器间数据共享
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import type { RuleTemplate, Workflow } from '../sidebar/types';
import { createModuleLogger, formatError } from './logger';

/** 共享存储目录名 */
const SHARED_DIR_NAME = '.copilot-super';

/** 日志器 */
const logger = createModuleLogger('SharedStorage');

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
      const parsed = JSON.parse(content);
      // 验证解析结果是有效类型
      if (parsed === null || parsed === undefined) {
        return defaultValue;
      }
      return parsed as T;
    }
  } catch (err) {
    logger.error(`Failed to read ${filename}`, err);
  }
  return defaultValue;
}

/** 写入 JSON 文件（原子写入，兼容 Windows） */
function writeJsonFile<T>(filename: string, data: T): void {
  ensureSharedDir();
  const filePath = path.join(getSharedDir(), filename);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  
  try {
    // 先写入临时文件
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    // Windows 下 rename 可能失败，使用 copy + delete
    fs.copyFileSync(tempPath, filePath);
    fs.unlinkSync(tempPath);
  } catch (err) {
    logger.error(`Failed to write ${filename}`, err);
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
  try {
    fs.writeFileSync(flagPath, new Date().toISOString(), 'utf-8');
  } catch (err) {
    logger.error('Failed to mark migration complete', err);
  }
}

/** 检查共享存储是否已存在 */
export function isSharedStorageExists(): boolean {
  const sharedDir = getSharedDir();
  return fs.existsSync(sharedDir) && isMigrated();
}

/** 迁移锁文件名 */
const MIGRATION_LOCK_FILE = '.migration-lock';

/** 锁过期时间（毫秒）- 防止僵尸锁 */
const LOCK_EXPIRE_MS = 30_000; // 30 秒

/** 获取迁移锁（防止并发迁移） */
function acquireMigrationLock(): boolean {
  const lockPath = path.join(getSharedDir(), MIGRATION_LOCK_FILE);
  try {
    ensureSharedDir();
    
    // 检查是否存在僵尸锁
    if (fs.existsSync(lockPath)) {
      try {
        const content = fs.readFileSync(lockPath, 'utf-8');
        const match = content.match(/@(\d+)$/);
        if (match) {
          const lockTime = parseInt(match[1], 10);
          if (Date.now() - lockTime > LOCK_EXPIRE_MS) {
            // 锁已过期，删除僵尸锁
            fs.unlinkSync(lockPath);
          } else {
            // 锁仍在有效期内
            return false;
          }
        }
      } catch {
        // 无法读取锁文件，尝试删除
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // 忽略删除错误
        }
      }
    }
    
    // 尝试创建锁文件（如果已存在则抛出错误）
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeSync(fd, `${process.pid}@${Date.now()}`);
    fs.closeSync(fd);
    return true;
  } catch {
    // 锁文件已存在，其他进程正在迁移
    return false;
  }
}

/** 释放迁移锁 */
function releaseMigrationLock(): void {
  const lockPath = path.join(getSharedDir(), MIGRATION_LOCK_FILE);
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // 忽略释放错误
  }
}

/**
 * 从 VSCode globalState 迁移数据到共享存储
 * 仅在共享目录不存在时执行一次
 * 使用文件锁防止多编辑器并发迁移
 */
export async function migrateFromGlobalState(context: vscode.ExtensionContext): Promise<void> {
  // 已迁移则跳过
  if (isMigrated()) {
    return;
  }

  // 获取迁移锁
  if (!acquireMigrationLock()) {
    // 其他进程正在迁移，使用指数退避等待
    for (let i = 0; i < 10; i++) {
      if (isMigrated()) {
        return;
      }
      // 使用指数退避等待，初始 50ms，每次增加 50%
      await new Promise(resolve => setTimeout(resolve, 50 * Math.pow(1.5, i)));
    }
    return;
  }

  try {
    // 再次检查（双重检查锁定模式）
    if (isMigrated()) {
      return;
    }

    const sharedDir = getSharedDir();

    // 迁移规则模板（合并现有数据）
    const existingTemplates = readTemplates();
    const newTemplates = context.globalState.get<RuleTemplate[]>('copilot-super.ruleTemplates', []);
    const mergedTemplates = mergeDataById(existingTemplates, newTemplates);
    if (mergedTemplates.length > 0) {
      writeJsonFile(FILES.templates, mergedTemplates);
    }

    // 迁移工作流（合并现有数据）
    const existingWorkflows = readWorkflows();
    const newWorkflows = context.globalState.get<Workflow[]>('copilot-super.workflows', []);
    const mergedWorkflows = mergeDataById(existingWorkflows, newWorkflows);
    if (mergedWorkflows.length > 0) {
      writeJsonFile(FILES.workflows, mergedWorkflows);
    }

    // 迁移全局规则（优先从配置读取，其次从 globalState，最后从共享存储）
    const existingRules = readGlobalRules();
    const configRules = vscode.workspace.getConfiguration('copilot-super').get<string>('globalRules', '');
    const stateRules = context.globalState.get<string>('copilot-super.globalRules', '');
    const globalRules = configRules || stateRules || existingRules;
    if (globalRules) {
      const rulesData: GlobalRulesData = {
        rules: globalRules,
        updatedAt: new Date().toISOString(),
      };
      writeJsonFile(FILES.globalRules, rulesData);
    }

    markMigrated();
    logger.debug(`Migrated data to ${sharedDir}`);
  } finally {
    releaseMigrationLock();
  }
}

/** 按 ID 合并数据（新数据覆盖旧数据） */
function mergeDataById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
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