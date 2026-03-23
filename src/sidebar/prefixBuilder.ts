import type { RuleTemplate } from './types';

export type BuildFullPrefixOptions = {
  prefix: string;
  globalRules: string;
  workspaceRuleTemplate: string[];
  ruleTemplates: RuleTemplate[];
};

/** 构建规则文本（全局规则 + 规则模板） */
export function buildRulesText(
  globalRules: string,
  workspaceRuleTemplate: string[],
  ruleTemplates: RuleTemplate[]
): string {
  const parts: string[] = [];

  if (globalRules.trim()) {
    parts.push('[全局规则]');
    parts.push(globalRules.trim());
  }

  // 优化：使用 Map 将 O(n*m) 查找降为 O(n)
  const templateMap = new Map(ruleTemplates.map((t) => [t.id, t]));

  const orderedRules: string[] = [];
  for (const id of workspaceRuleTemplate) {
    const template = templateMap.get(id);
    if (template) {
      orderedRules.push(`${orderedRules.length + 1}. ${template.content}`);
    }
  }

  if (orderedRules.length > 0) {
    parts.push('[规则模板]');
    parts.push(orderedRules.join('\n'));
  }

  return parts.join('\n');
}

export function buildFullPrefix(options: BuildFullPrefixOptions): string {
  const { prefix, globalRules, workspaceRuleTemplate, ruleTemplates } = options;

  let result = prefix;

  const rulesText = buildRulesText(globalRules, workspaceRuleTemplate, ruleTemplates);
  if (rulesText) {
    result = `${result}\n\n${rulesText}`;
  }

  return result;
}
