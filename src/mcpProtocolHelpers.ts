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
  try {
    return JSON.parse(body) as JsonRpcRequest | JsonRpcRequest[];
  } catch (parseError) {
    console.error('[MCP Protocol] Failed to parse JSON-RPC message:', parseError instanceof Error ? parseError.message : String(parseError));
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
    }));
    return null;
  }
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
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Mcp-Session-Id': sessionId,
    });
    res.end(JSON.stringify(responses));
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
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Mcp-Session-Id': sessionId,
    });
    res.end(JSON.stringify(response));
    return;
  }

  res.writeHead(202);
  res.end();
}
