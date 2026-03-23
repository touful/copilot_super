import * as vscode from 'vscode';
import type { RuleTemplate } from './types';
import { mergeItems, persistItems, saveItem } from './storeUtils';

type RuleTemplateFileEntry = Pick<RuleTemplate, 'id' | 'name' | 'content'> & {
  enabled?: boolean;
};

const FALLBACK_TEMPLATES: RuleTemplate[] = [
  { id: 'builtin-1', name: '中文回复', content: '请使用中文回复所有内容，包括代码注释。', enabled: false },
  { id: 'builtin-2', name: '简洁模式', content: '请简洁回复，省略不必要的解释，直接给出结果。', enabled: false },
  { id: 'builtin-3', name: '详细解释', content: '请详细解释每一步操作的原因和逻辑，确保用户理解。', enabled: false },
  { id: 'builtin-4', name: '代码审查', content: '请仔细审查代码，关注可能的bug、安全问题、性能瓶颈和最佳实践。', enabled: false },
];

export function getDefaultTemplates(_extensionPath?: string): RuleTemplate[] {
  try {
    const content = __EMBEDDED_RULE_TEMPLATES_JSON__;
    const parsed = JSON.parse(content) as RuleTemplateFileEntry[];

    if (!Array.isArray(parsed)) {
      return FALLBACK_TEMPLATES;
    }

    const templates = parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.content === 'string')
      .map((item) => ({
        id: item.id,
        name: item.name,
        content: item.content,
        enabled: Boolean(item.enabled),
      }));

    return templates.length > 0 ? templates : FALLBACK_TEMPLATES;
  } catch (parseError) {
    console.error('[TemplateStore] Failed to parse embedded templates:', parseError instanceof Error ? parseError.message : String(parseError));
    return FALLBACK_TEMPLATES;
  }
}

export const saveTemplate = saveItem<RuleTemplate>;

export const mergeTemplatesFromPrompt = mergeItems<RuleTemplate>;

export const persistTemplates = (context: vscode.ExtensionContext, templates: RuleTemplate[]) =>
  persistItems(context, 'copilot-super.ruleTemplates', templates);
