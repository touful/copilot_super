import type { RuleTemplate } from './types';

export type BuildFullPrefixOptions = {
  prefix: string;
  globalRules: string;
  workspaceRuleTemplate: string[];
  ruleTemplates: RuleTemplate[];
};

/** 构建规则文本（全局规则 + 锁定规则 + 工作区规则模板） */
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

  // 收集锁定的规则（所有工作区都可见）
  const lockedRules: string[] = [];
  for (const template of ruleTemplates) {
    if (template.locked === true) {
      lockedRules.push(template.content);
    }
  }

  // 收集工作区选择的规则（排除已锁定的，避免重复）
  const workspaceRules: string[] = [];
  for (const id of workspaceRuleTemplate) {
    const template = templateMap.get(id);
    if (template && template.locked !== true) {
      workspaceRules.push(template.content);
    }
  }

  // 合并规则：锁定规则 + 工作区规则
  const allRules = [...lockedRules, ...workspaceRules];
  if (allRules.length > 0) {
    parts.push('[规则模板]');
    parts.push(allRules.map((rule, index) => `${index + 1}. ${rule}`).join('\n'));
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
