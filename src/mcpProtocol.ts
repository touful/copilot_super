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
