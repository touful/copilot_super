import type * as http from 'http';
import type { JsonRpcRequest, JsonRpcResponse } from './mcpTypes';

const POST_KEEPALIVE_INTERVAL_MS = 120_000;

export async function handleToolCallStream(args: {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  message: JsonRpcRequest;
  sessionId: string;
  processMessage: (msg: JsonRpcRequest) => Promise<JsonRpcResponse | null>;
  onClientDisconnected?: () => void;
}): Promise<void> {
  const { req, res, message, sessionId, processMessage, onClientDisconnected } = args;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Mcp-Session-Id': sessionId,
  });

  const keepaliveInterval = setInterval(() => {
    try {
      if (!res.destroyed) {
        res.write(':keepalive\n\n');
      }
    } catch {
      clearInterval(keepaliveInterval);
    }
  }, POST_KEEPALIVE_INTERVAL_MS);

  let clientDisconnected = false;
  req.once('close', () => {
    if (!res.writableFinished) {
      clientDisconnected = true;
      console.log('[MCP Server] Client disconnected during tools/call');
      onClientDisconnected?.();
    }
  });

  try {
    const response = await processMessage(message);
    clearInterval(keepaliveInterval);

    if (clientDisconnected || res.destroyed) {
      return;
    }

    if (response) {
      res.write(`data: ${JSON.stringify(response)}\n\n`);
    }
  } catch (err) {
    clearInterval(keepaliveInterval);
    const errResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: message.id ?? 0,
      error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
    };
    res.write(`data: ${JSON.stringify(errResponse)}\n\n`);
  }

  if (!res.destroyed) {
    res.end();
  }
}
