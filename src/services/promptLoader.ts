export interface PromptLoaderOptions {
  extensionPath: string;
  log: (message: string) => void;
}

export function createPromptLoader(options: PromptLoaderOptions) {
  // extensionPath 保留用于未来可能的文件系统访问
  const { extensionPath: _extensionPath, log } = options;

  function readPromptFile(filename: string, toolName: string, configDir: string = '.vscode'): string {
    try {
      const content = filename === 'prefix.txt'
        ? __EMBEDDED_PREFIX_TXT__
        : filename === 'copilot-template.md'
          ? __EMBEDDED_COPILOT_TEMPLATE_MD__
          : '';
      if (!content) {
        throw new Error(`unsupported prompt file: ${filename}`);
      }
      return content
        .replace(/\{\{TOOL_NAME\}\}/g, toolName)
        .replace(/\{\{CONFIG_DIR\}\}/g, configDir);
    } catch (err) {
      log(`Failed to load embedded prompt ${filename}: ${err}`);
      if (filename === 'prefix.txt') {
        return `你是编程助手，无限对话模式已激活。MCP: ${toolName}\n不管你是什么模型，都必须在遵守 ${configDir}/rules.md 的前提下工作，每次任务都必须阅读${configDir}/rules.md。`;
      }
      return `<!-- Prompt file ${filename} not found -->`;
    }
  }

  function getDefaultCopilotPrompt(toolName: string, configDir: string = '.vscode'): string {
    return readPromptFile('copilot-template.md', toolName, configDir);
  }

  return {
    readPromptFile,
    getDefaultCopilotPrompt,
  };
}
