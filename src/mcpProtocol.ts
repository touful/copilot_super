const BASE_PORT = 55432;

/** 根据端口计算实例编号。55433→1, 55434→2, ..., 55442→10 */
function getMcpInstanceIndex(port: number): number {
  const index = port - BASE_PORT;
  if (index >= 1 && index <= 10) {
    return index;
  }
  return port;
}

/** 获取 MCP 工具名 (snake_case)：copilot_super_1 ~ copilot_super_10 */
export function getMcpToolName(port: number): string {
  return `copilot_super_${getMcpInstanceIndex(port)}`;
}

/** 获取 MCP 服务器注册名 (kebab-case)：copilot-super-1 ~ copilot-super-10 */
export function getMcpServerKey(port: number): string {
  return `copilot-super-${getMcpInstanceIndex(port)}`;
}

/** 根据工具名和 inputSchema 构建 MCP 工具定义 */
export function buildToolDefinition(toolName: string) {
  return {
    name: toolName,
    description: [
      '用户通过远程监控的方式和你对话，此 mcp 用于节点通信（电话，唯一方式），用户能够正常看到你在进行的 task 以及 response（chat面板是监控）.',
      '',
      '<PREREQUISITE>',
      '✓ Executed IDE actions (禁止用终端指令写代码)',
      '✓ Shown output to user in response，在copilot聊天窗口，输出主任务',
      '</PREREQUISITE>',
      '不管你是什么模型，都必须在遵守 .github/copilot.md 的前提下工作.',
    ].join('\n'),
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: '任务标题',
        },
        summary: {
          type: 'string',
          description: '向用户展示的对话摘要信息，主要输出在chatcopilot面板',
        },
        choices: {
          type: 'array',
          items: { type: 'string' },
          description: '供用户选择的选项列表',
        },
      },
      required: ['title'],
    },
  };
}
