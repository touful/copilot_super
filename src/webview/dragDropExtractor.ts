/**
 * 拖拽文件数据提取器
 * 从 DataTransfer 中提取文件路径候选值，纯函数，不依赖闭包状态
 */

import type { DroppedFileCandidate } from '../sidebar/types';

// ============ 常量 ============

/** JSON 对象中优先查找路径的键名 */
const DROP_PRIMARY_PATH_KEYS = ['resourceUri', 'uri', 'fsPath', 'external', 'path', 'resource'];
/** JSON 对象中备选查找文件名的键名 */
const DROP_FALLBACK_NAME_KEYS = ['fileName', 'filename', 'name'];

// ============ 主提取函数 ============

/**
 * 从 DataTransfer 中提取所有可能的文件路径候选值
 * 按 10 步优先级依次提取，最终去重返回
 */
export async function extractDroppedFileCandidates(dataTransfer: DataTransfer | null): Promise<DroppedFileCandidate[]> {
  if (!dataTransfer) {
    return [];
  }

  const candidates: DroppedFileCandidate[] = [];

  // 1. Extract file names from File objects (highest priority)
  for (const file of Array.from(dataTransfer.files)) {
    if (file.name) {
      candidates.push({ value: file.name, trustedName: true });
    }
  }

  // 2. Extract files from DataTransferItems
  const itemStringPayloads: Array<Promise<string>> = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file?.name) {
        candidates.push({ value: file.name, trustedName: true });
      }
      continue;
    }

    if (item.kind === 'string') {
      itemStringPayloads.push(readDropItemAsString(item));
    }
  }

  // 3. Parse text/uri-list (standard DnD protocol)
  const uriList = readDropData(dataTransfer, 'text/uri-list');
  if (uriList) {
    candidates.push(...uriList
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => ({ value: line.trim() })));
  }

  // 4. Parse VS Code internal URI list (application/vnd.code.uri-list)
  const vscodeUriList = readDropData(dataTransfer, 'application/vnd.code.uri-list');
  if (vscodeUriList) {
    candidates.push(...vscodeUriList
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => ({ value: line.trim() })));
  }

  // 5. Parse ResourceURLs (VS Code tree view / explorer drag)
  const resourceUrls = readDropData(dataTransfer, 'resourceurls');
  if (resourceUrls) {
    candidates.push(...extractStringsFromDropPayload(resourceUrls).map((value) => ({ value })));
  }

  // 6. Parse CodeEditors (VS Code editor tab drag)
  const codeEditors = readDropData(dataTransfer, 'codeeditors');
  if (codeEditors) {
    candidates.push(...extractStringsFromDropPayload(codeEditors).map((value) => ({ value })));
  }

  // 7. Process remaining non-standard types (may carry JSON with paths)
  for (const type of Array.from(dataTransfer.types)) {
    const normalized = type.toLowerCase();
    if (normalized === 'files'
      || normalized === 'text/uri-list'
      || normalized === 'text/html'
      || normalized === 'text/plain'
      || normalized === 'application/vnd.code.uri-list'
      || normalized === 'resourceurls'
      || normalized === 'codeeditors') {
      continue;
    }
    candidates.push(...extractStringsFromDropPayload(readDropData(dataTransfer, type)).map((value) => ({ value })));
  }

  // 8. Extract file paths from text/html (some file managers embed paths in HTML)
  const htmlData = readDropData(dataTransfer, 'text/html');
  if (htmlData) {
    candidates.push(...extractFilePathsFromHtml(htmlData).map((value) => ({ value })));
  }

  // 9. Fallback: parse text/plain for file paths
  if (candidates.length === 0) {
    candidates.push(...extractPlainFileCandidates(readDropData(dataTransfer, 'text/plain')).map((value) => ({ value })));
  }

  // 10. Process async string payloads from DataTransferItems
  const itemPayloads = await Promise.all(itemStringPayloads);
  for (const payload of itemPayloads) {
    candidates.push(...extractStringsFromDropPayload(payload).map((value) => ({ value })));
    candidates.push(...extractPlainFileCandidates(payload).map((value) => ({ value })));
  }

  return uniqueDroppedFileCandidates(candidates);
}

// ============ DataTransfer 读取 ============

function readDropItemAsString(item: DataTransferItem): Promise<string> {
  return new Promise((resolve) => {
    try {
      item.getAsString((value) => resolve(value || ''));
    } catch {
      resolve('');
    }
  });
}

export function readDropData(dataTransfer: DataTransfer, type: string): string {
  try {
    return dataTransfer.getData(type);
  } catch {
    return '';
  }
}

// ============ 负载解析 ============

export function extractStringsFromDropPayload(payload: string): string[] {
  if (!payload) {
    return [];
  }
  try {
    return collectStrings(JSON.parse(payload));
  } catch {
    return payload.split(/\r?\n/).filter(Boolean);
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const primaryValues = collectObjectValuesByKey(record, DROP_PRIMARY_PATH_KEYS);
    if (primaryValues.length > 0) {
      return primaryValues;
    }

    const fallbackValues = collectObjectValuesByKey(record, DROP_FALLBACK_NAME_KEYS);
    if (fallbackValues.length > 0) {
      return fallbackValues;
    }

    return Object.values(record)
      .filter((item) => typeof item !== 'string')
      .flatMap((item) => collectStrings(item));
  }
  return [];
}

function collectObjectValuesByKey(record: Record<string, unknown>, keys: string[]): string[] {
  return keys.flatMap((key) => key in record ? collectStrings(record[key]) : []);
}

// ============ 文件路径提取 ============

export function extractPlainFileCandidates(text: string): string[] {
  if (!text) {
    return [];
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(?:file|vscode-remote):/i.test(line) || /[\\/]/.test(line) || looksLikeFileName(line));
}

export function extractFilePathsFromHtml(html: string): string[] {
  if (!html) {
    return [];
  }
  const results: string[] = [];
  // Extract href values containing file:// or vscode-remote:// URIs
  const hrefPattern = /href=["']?((?:file|vscode-remote):\/\/[^"'\s>]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(html)) !== null) {
    if (match[1]) {
      results.push(match[1]);
    }
  }
  // Extract file paths from data attributes
  const dataPathPattern = /data-(?:path|uri|file)=["']([^"']+)/gi;
  while ((match = dataPathPattern.exec(html)) !== null) {
    if (match[1]) {
      results.push(match[1]);
    }
  }
  return results;
}

function looksLikeFileName(value: string): boolean {
  return /^[^<>:"|?*\\/]+(?:\.[^<>:"|?*\\/.\\s]+)+$/.test(value);
}

// ============ 去重 ============

function uniqueDroppedFileCandidates(candidates: DroppedFileCandidate[]): DroppedFileCandidate[] {
  const seen = new Set<string>();
  const result: DroppedFileCandidate[] = [];
  for (const candidate of candidates) {
    const value = candidate.value.trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push({
      value,
      trustedName: candidate.trustedName,
    });
  }
  return result;
}
