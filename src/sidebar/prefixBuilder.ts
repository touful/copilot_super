import type { RuleTemplate } from './types';

export type BuildFullPrefixOptions = {
  prefix: string;
  globalRules: string;
  workspaceRuleTemplate: string[];
  ruleTemplates: RuleTemplate[];
};

export function buildFullPrefix(options: BuildFullPrefixOptions): string {
  const { prefix, globalRules, workspaceRuleTemplate, ruleTemplates } = options;

  let result = prefix;

  if (globalRules.trim()) {
    result = `${result}\n\n[全局规则]\n${globalRules}`;
  }

  const orderedRules = workspaceRuleTemplate
    .map((id) => ruleTemplates.find((template) => template.id === id))
    .filter((template): template is RuleTemplate => !!template)
    .map((template, index) => `${index + 1}. ${template.content}`);

  if (orderedRules.length > 0) {
    result = `${result}\n\n[规则模板]\n${orderedRules.join('\n')}`;
  }

  return result;
}
