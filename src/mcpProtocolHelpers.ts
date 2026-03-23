import type * as http from 'http';
import type { JsonRpcRequest, JsonRpcResponse } from './mcpTypes';

export function validateSessionId(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessionInitialized: boolean,
  sessionId: string
): boolean {
  if (!sessionInitialized) {
    return true;
  }

  const clientSessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!clientSessionId || clientSessionId === sessionId) {
    return true;
  }

  res.writeHead(409, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32600, message: 'Session ID mismatch' },
  }));
  return false;
}

export function parseJsonRpcMessage(
  body: string,
  res: http.ServerResponse
): JsonRpcRequest | JsonRpcRequest[] | null {
  // 安全检查：拒绝非字符串或空输入
  if (!body || typeof body !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Invalid request' },
    }));
    return null;
  }

  // 安全检查：请求体过大（防止缓冲区溢出攻击）
  if (body.length > 1024 * 1024) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Request too large' },
    }));
    return null;
  }

  try {
    const parsed = JSON.parse(body);
    // 安全检查：确保解析结果为有效对象
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JSON-RPC structure');
    }
    return parsed as JsonRpcRequest | JsonRpcRequest[];
  } catch (parseError) {
    // 不泄漏详细错误信息，防止信息泄露
    console.error('[MCP Protocol] Failed to parse JSON-RPC message');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
    }));
    return null;
  }
}

/** 发送 JSON-RPC 响应的辅助函数 */
function sendJsonRpcResponse(
  res: http.ServerResponse,
  response: JsonRpcResponse | JsonRpcResponse[],
  sessionId: string,
  statusCode: number = 200
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Mcp-Session-Id': sessionId,
  });
  res.end(JSON.stringify(response));
}

export async function processBatchMessages(
  messages: JsonRpcRequest[],
  processMessage: (msg: JsonRpcRequest) => Promise<JsonRpcResponse | null>,
  res: http.ServerResponse,
  sessionId: string
): Promise<void> {
  const responses: JsonRpcResponse[] = [];
  for (const msg of messages) {
    const response = await processMessage(msg);
    if (response) {
      responses.push(response);
    }
  }

  if (responses.length > 0) {
    sendJsonRpcResponse(res, responses, sessionId);
    return;
  }

  res.writeHead(202);
  res.end();
}

export async function processStandardMessage(
  message: JsonRpcRequest,
  processMessage: (msg: JsonRpcRequest) => Promise<JsonRpcResponse | null>,
  res: http.ServerResponse,
  sessionId: string
): Promise<void> {
  const response = await processMessage(message);
  if (response) {
    sendJsonRpcResponse(res, response, sessionId);
    return;
  }

  res.writeHead(202);
  res.end();
}
