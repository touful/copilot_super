/**
 * Webview 渲染辅助函数
 * 将数据转换为 HTML 字符串，不依赖 DOM 状态
 */

import { parse as parseMarkdown } from 'marked';
import { escapeHtml, renderEscapedText, FILE_MENTION_PATTERN } from './webviewUtils';

// ============ Markdown 渲染 ============

/** 渲染 Markdown（Copilot 消息使用 marked 库解析） */
export function renderMarkdown(content: string): string {
  try {
    return parseMarkdown(content, { breaks: true }) as string;
  } catch {
    return renderEscapedText(content);
  }
}

// ============ 纯文本渲染 ============

/** 纯文本渲染（用户消息使用转义 + 换行） */
export function renderPlainText(content: string): string {
  return renderTextWithFileMentions(content);
}

/**
 * 渲染包含文件引用 @filename@ 的文本
 * 将 @xxx@ 渲染为带样式的 file-mention 标签
 */
export function renderTextWithFileMentions(content: string): string {
  let html = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  FILE_MENTION_PATTERN.lastIndex = 0;
  while ((match = FILE_MENTION_PATTERN.exec(content)) !== null) {
    const rawToken = match[1] || '';
    const mentionStart = match.index;
    const fileName = rawToken.trim();

    if (!fileName) {
      continue;
    }

    html += renderEscapedText(content.slice(lastIndex, mentionStart));
    html += `<span class="file-mention" title="@${escapeHtml(fileName)}@"><span class="file-mention-at">@</span>${escapeHtml(rawToken)}<span class="file-mention-at">@</span></span>`;
    lastIndex = mentionStart + match[0].length;
  }

  html += renderEscapedText(content.slice(lastIndex));
  return html;
}
