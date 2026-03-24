/**
 * 统一日志管理工具
 * 支持调试模式和生产模式的区分
 */

import * as vscode from 'vscode';

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

/** 日志级别优先级 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

/**
 * 创建带前缀的日志器
 * @param prefix 日志前缀
 * @param getMinLevel 获取最小日志级别的函数
 */
export function createLogger(prefix: string, getMinLevel: () => LogLevel) {
  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[getMinLevel()];
  };

  return {
    debug: (message: string, ...args: unknown[]) => {
      if (shouldLog('debug')) {
        console.log(`[${prefix}] [DEBUG] ${message}`, ...args);
      }
    },
    info: (message: string, ...args: unknown[]) => {
      if (shouldLog('info')) {
        console.log(`[${prefix}] ${message}`, ...args);
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      if (shouldLog('warn')) {
        console.warn(`[${prefix}] ${message}`, ...args);
      }
    },
    error: (message: string, err?: unknown) => {
      if (shouldLog('error')) {
        if (err !== undefined) {
          console.error(`[${prefix}] ${message}:`, formatError(err));
        } else {
          console.error(`[${prefix}] ${message}`);
        }
      }
    },
  };
}

/**
 * 格式化错误信息为字符串
 */
export function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  if (err !== null && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/**
 * 格式化错误详细信息（包含堆栈）
 */
export function formatErrorDetail(err: unknown): string {
  if (err instanceof Error) {
    return err.stack || err.message;
  }
  return formatError(err);
}

/**
 * 检查是否为特定错误类型
 */
export function isErrorCode(err: unknown, errorCode: string): boolean {
  if (err !== null && typeof err === 'object' && 'code' in err) {
    return (err as { code: string }).code === errorCode;
  }
  return false;
}

/**
 * 全局日志级别管理器
 */
class GlobalLogManager {
  private currentLevel: LogLevel = 'info';

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /** 从 VS Code 配置更新日志级别 */
  updateFromConfig(): void {
    const isDebug = vscode.workspace.getConfiguration('copilot-super').get<boolean>('debug', false);
    this.currentLevel = isDebug ? 'debug' : 'info';
  }
}

export const globalLogManager = new GlobalLogManager();

/**
 * 创建模块日志器（自动使用全局日志级别）
 */
export function createModuleLogger(prefix: string) {
  return createLogger(prefix, () => globalLogManager.getLevel());
}