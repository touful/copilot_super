import { buildToolDefinition, getMcpToolName } from './mcpProtocol';
import type { JsonRpcRequest, JsonRpcResponse, ToolCallHandler, ToolCallParams } from './mcpTypes';

/** 安全获取 JSON-RPC 请求 ID，如果没有则返回默认值 */
function getRequestId(msg: JsonRpcRequest): number | string {
  return msg.id ?? 0;
}

export function buildInitializeResponse(msg: JsonRpcRequest): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: getRequestId(msg),
    result: {
      protocolVersion: '2025-03-26',
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: {
        name: 'copilot-super',
        version: '1.0.0',
      },
    },
  };
}

export function buildToolsListResponse(msg: JsonRpcRequest, port: number): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: getRequestId(msg),
    result: {
      tools: [buildToolDefinition(getMcpToolName(port))],
    },
  };
}

export function buildUnknownToolResponse(msg: JsonRpcRequest, toolName: string | undefined): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: getRequestId(msg),
    error: { code: -32602, message: `Unknown tool: ${toolName}` },
  };
}

export function buildMissingHandlerResponse(msg: JsonRpcRequest): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: getRequestId(msg),
    result: {
      content: [{ type: 'text', text: 'Error: No tool handler registered' }],
      isError: true,
    },
  };
}

export async function buildToolCallResult(
  msg: JsonRpcRequest,
  handler: ToolCallHandler,
  toolArgs: ToolCallParams
): Promise<JsonRpcResponse> {
  try {
    const userResponse = await handler(toolArgs);
    return {
      jsonrpc: '2.0',
      id: getRequestId(msg),
      result: {
        content: [{ type: 'text', text: userResponse }],
      },
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      jsonrpc: '2.0',
      id: getRequestId(msg),
      result: {
        content: [{ type: 'text', text: `Error: ${errMsg}` }],
        isError: true,
      },
    };
  }
}
