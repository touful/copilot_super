export interface PromptLoaderOptions {
  extensionPath: string;
  log: (message: string) => void;
}

export function createPromptLoader(options: PromptLoaderOptions) {
  // extensionPath 保留用于未来可能的文件系统访问
  const { extensionPath: _extensionPath, log } = options;

  function readPromptFile(filename: string, toolName: string): string {
    try {
      const content = filename === 'prefix.txt'
        ? __EMBEDDED_PREFIX_TXT__
        : filename === 'copilot-template.md'
          ? __EMBEDDED_COPILOT_TEMPLATE_MD__
          : '';
      if (!content) {
        throw new Error(`unsupported prompt file: ${filename}`);
      }
      return content.replace(/\{\{TOOL_NAME\}\}/g, toolName);
    } catch (err) {
      log(`Failed to load embedded prompt ${filename}: ${err}`);
      if (filename === 'prefix.txt') {
        return `你是编程助手，无限对话模式已激活。MCP: ${toolName}\n不管你是什么模型，都必须在遵守 .github/copilot.md 的前提下工作，每次任务都必须阅读.github/copilot.md。`;
      }
      return `<!-- Prompt file ${filename} not found -->`;
    }
  }

  function getDefaultCopilotPrompt(toolName: string): string {
    return readPromptFile('copilot-template.md', toolName);
  }

  return {
    readPromptFile,
    getDefaultCopilotPrompt,
  };
}
