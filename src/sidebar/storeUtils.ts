 /**
 * 通用存储工具函数
 * 提供模板和工作流共用的 CRUD 操作
 */

import * as vscode from 'vscode';

/** 保存或更新项目（根据 id 判断是新增还是更新） */
export function saveItem<T extends { id: string }>(items: T[], item: T): T[] {
  const nextItems = [...items];
  const index = nextItems.findIndex((i) => i.id === item.id);

  if (index >= 0) {
    nextItems[index] = item;
  } else {
    nextItems.push(item);
  }

  return nextItems;
}

/** 删除项目 */
export function deleteItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

/** 合并预设项和自定义项（预设项优先，但保留已存储的用户状态如 locked/enabled） */
export function mergeItems<T extends { id: string }>(
  storedItems: T[],
  presetItems: T[]
): T[] {
  if (presetItems.length === 0) {
    return storedItems;
  }

  const storedMap = new Map(storedItems.map((item) => [item.id, item]));
  const presetIds = new Set(presetItems.map((item) => item.id));
  const customItems = storedItems.filter((item) => !presetIds.has(item.id));

  // 对于 ID 匹配的项，将已存储的用户状态合并到预设项上
  const mergedPresets = presetItems.map((preset) => {
    const stored = storedMap.get(preset.id);
    return stored ? { ...preset, ...stored } : preset;
  });

  return [...mergedPresets, ...customItems];
}

/** 持久化数据到 VS Code 全局状态 */
export async function persistItems<T>(
  context: vscode.ExtensionContext,
  key: string,
  items: T[]
): Promise<void> {
  await context.globalState.update(key, items);
}