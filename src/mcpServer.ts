/**
 * MCP HTTP Server - 实现 MCP Streamable HTTP 传输协议
 * 处理 VS Code Copilot 的 JSON-RPC 请求，注册并响应 copilot_super_N 工具调用
 * 工具名根据端口动态生成：copilot_super_{port - 55432}
 */

import * as http from 'http';
import * as crypto from 'crypto';

// ============ 类型定义 ============

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ToolCallParams {
  title?: string;
  summary?: string;
  choices?: string[];
  default_feedback?: string;
}

export type ToolCallHandler = (params: ToolCallParams) => Promise<string>;

// ============ MCP 实例编号 ============

const BASE_PORT = 55432;

/** 根据端口计算实例编号。55433→1, 55434→2, ..., 55442→10 */
export function getMcpInstanceIndex(port: number): number {
  const index = port - BASE_PORT;
  if (index >= 1 && index <= 10) {
    return index;
  }
  return port; // OS 随机端口时，退回使用端口号本身
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
function buildToolDefinition(toolName: string) {
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
        default_feedback: {
          type: 'string',
          description: '优化下一步的提示词',
        },
      },
      required: ['title'],
    },
  };
}

// ============ MCP HTTP Server ============

export class McpHttpServer {
  private server: http.Server | null = null;
  private sessionId: string;
  private toolCallHandler: ToolCallHandler | null = null;
  private toolCallCancelHandler: (() => void) | null = null;
  private port: number;
  private actualPort: number = 0;
  private isRunning = false;
  private sessionInitialized = false;

  // SSE 连接管理
  private sseConnections: Set<http.ServerResponse> = new Set();

  constructor(port: number = 55433) {
    this.port = port;
    this.sessionId = crypto.randomUUID();
  }

  /** 设置工具调用处理器 */
  setToolCallHandler(handler: ToolCallHandler): void {
    this.toolCallHandler = handler;
  }

  /** 设置工具调用取消处理器（客户端断开时调用） */
  setToolCallCancelHandler(handler: () => void): void {
    this.toolCallCancelHandler = handler;
  }

  /** 获取实际绑定的端口（可能与请求端口不同） */
  getActualPort(): number {
    return this.actualPort || this.port;
  }

  /** 启动服务器（支持动态端口分配） */
  async start(): Promise<number> {
    if (this.isRunning) {
      await this.stop();
    }

    this.sessionId = crypto.randomUUID();
    this.sessionInitialized = false;

    // 尝试端口: 从配置端口开始递增，最多尝试10个
    const maxAttempts = 10;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const tryPort = this.port + attempt;
      try {
        await this.tryListen(tryPort);
        this.actualPort = tryPort;
        console.log(`[MCP Server] Listening on http://127.0.0.1:${tryPort}/mcp`);
        return tryPort;
      } catch (err: unknown) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code === 'EADDRINUSE') {
          console.log(`[MCP Server] Port ${tryPort} in use, trying next...`);
          lastError = nodeErr;
          continue;
        }
        throw err; // 非端口占用错误直接抛出
      }
    }

    // 所有固定端口尝试失败，回退到 OS 随机分配 (port 0)
    try {
      await this.tryListen(0);
      const addr = this.server!.address();
      this.actualPort = typeof addr === 'object' && addr ? addr.port : 0;
      console.log(`[MCP Server] Listening on http://127.0.0.1:${this.actualPort}/mcp (OS assigned)`);
      return this.actualPort;
    } catch (err) {
      throw lastError || err;
    }
  }

  /** 尝试在指定端口监听 */
  private tryListen(port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.error('[MCP Server] Unhandled error:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal error' },
            }));
          }
        });
      });

      // 设置超时 - 工具调用可能需要用户长时间输入
      this.server.timeout = 0;
      this.server.keepAliveTimeout = 0;

      this.server.listen(port, '127.0.0.1', () => {
        this.isRunning = true;
        resolve();
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        this.server = null;
        reject(err);
      });
    });
  }

  /** 停止服务器 */
  async stop(): Promise<void> {
    // 关闭所有 SSE 连接
    for (const conn of this.sseConnections) {
      try { conn.end(); } catch { /* ignore */ }
    }
    this.sseConnections.clear();

    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.isRunning = false;
          this.server = null;
          console.log('[MCP Server] Stopped');
          resolve();
        });
        // 强制关闭所有连接
        this.server.closeAllConnections?.();
      } else {
        this.isRunning = false;
        resolve();
      }
    });
  }

  /** 当前是否运行中 */
  get running(): boolean {
    return this.isRunning;
  }

  // ============ 请求处理 ============

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // 解析 URL
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.actualPort}`);

    // 只处理 /mcp 路径
    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use /mcp endpoint.' }));
      return;
    }

    // CORS 头
    this.setCorsHeaders(res);

    switch (req.method) {
      case 'OPTIONS':
        res.writeHead(204);
        res.end();
        break;

      case 'GET':
        this.handleSseConnection(req, res);
        break;

      case 'POST':
        await this.handlePost(req, res);
        break;

      case 'DELETE':
        this.handleSessionDelete(res);
        break;

      default:
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
  }

  private setCorsHeaders(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  }

  /** 处理 GET - SSE 长连接 */
  private handleSseConnection(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Mcp-Session-Id': this.sessionId,
    });

    this.sseConnections.add(res);

    // 定期发送心跳
    const keepAlive = setInterval(() => {
      try {
        res.write(':heartbeat\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      this.sseConnections.delete(res);
    });
  }

  /** 处理 DELETE - 终止会话 */
  private handleSessionDelete(res: http.ServerResponse): void {
    this.sessionId = crypto.randomUUID();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }

  /** 处理 POST - JSON-RPC 消息 */
  private async handlePost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Session 验证：初始化后，检查客户端发来的 Mcp-Session-Id 是否匹配
    if (this.sessionInitialized) {
      const clientSessionId = req.headers['mcp-session-id'] as string | undefined;
      if (clientSessionId && clientSessionId !== this.sessionId) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Session ID mismatch' },
        }));
        return;
      }
    }

    const body = await this.readBody(req);

    let message: JsonRpcRequest | JsonRpcRequest[];
    try {
      message = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
      }));
      return;
    }

    // 处理批量或单条消息
    if (Array.isArray(message)) {
      const responses: JsonRpcResponse[] = [];
      for (const msg of message) {
        const response = await this.processMessage(msg);
        if (response) {
          responses.push(response);
        }
      }
      if (responses.length > 0) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Mcp-Session-Id': this.sessionId,
        });
        res.end(JSON.stringify(responses));
      } else {
        res.writeHead(202);
        res.end();
      }
    } else {
      // 对于 tools/call，立即发送 SSE 响应头并启动心跳，
      // 防止 Node.js undici 的 headersTimeout/bodyTimeout (300s) 导致超时断开
      if (message.method === 'tools/call') {
        // 1. 立即发送响应头，避免 headersTimeout
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Mcp-Session-Id': this.sessionId,
        });

        // 2. 启动心跳定时器，每 2 分钟发送 SSE 注释，持续重置 bodyTimeout
        const keepaliveInterval = setInterval(() => {
          try {
            if (!res.destroyed) {
              res.write(':keepalive\n\n');
            }
          } catch {
            clearInterval(keepaliveInterval);
          }
        }, 120_000);

        // 3. 监听客户端断开，取消挂起的工具调用
        let clientDisconnected = false;
        req.once('close', () => {
          if (!res.writableFinished) {
            clientDisconnected = true;
            console.log('[MCP Server] Client disconnected during tools/call');
            this.toolCallCancelHandler?.();
          }
        });

        try {
          // 4. 等待工具执行完成（可能因等待用户输入而耗时很久）
          const response = await this.processMessage(message);
          clearInterval(keepaliveInterval);

          // 客户端已断开，无需写入响应
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
      } else {
        const response = await this.processMessage(message);
        if (response) {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Mcp-Session-Id': this.sessionId,
          });
          res.end(JSON.stringify(response));
        } else {
          // 通知消息 - 无需响应
          res.writeHead(202);
          res.end();
        }
      }
    }
  }

  // ============ JSON-RPC 消息处理 ============

  private async processMessage(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    // 通知 (无 id) 不需要响应
    if (msg.id === undefined || msg.id === null) {
      console.log(`[MCP Server] Notification: ${msg.method}`);
      return null;
    }

    console.log(`[MCP Server] Request: ${msg.method} (id: ${msg.id})`);

    switch (msg.method) {
      case 'initialize':
        return this.handleInitialize(msg);

      case 'tools/list':
        return this.handleToolsList(msg);

      case 'tools/call':
        return await this.handleToolsCall(msg);

      case 'ping':
        return { jsonrpc: '2.0', id: msg.id, result: {} };

      default:
        return {
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32601, message: `Method not found: ${msg.method}` },
        };
    }
  }

  /** 处理 initialize */
  private handleInitialize(msg: JsonRpcRequest): JsonRpcResponse {
    this.sessionInitialized = true;
    return {
      jsonrpc: '2.0',
      id: msg.id!,
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

  /** 处理 tools/list */
  private handleToolsList(msg: JsonRpcRequest): JsonRpcResponse {
    const toolName = getMcpToolName(this.actualPort || this.port);
    return {
      jsonrpc: '2.0',
      id: msg.id!,
      result: {
        tools: [buildToolDefinition(toolName)],
      },
    };
  }

  /** 处理 tools/call */
  private async handleToolsCall(msg: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = msg.params as { name?: string; arguments?: ToolCallParams } | undefined;
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};

    const expectedToolName = getMcpToolName(this.actualPort || this.port);
    if (toolName !== expectedToolName) {
      return {
        jsonrpc: '2.0',
        id: msg.id!,
        error: { code: -32602, message: `Unknown tool: ${toolName}` },
      };
    }

    if (!this.toolCallHandler) {
      return {
        jsonrpc: '2.0',
        id: msg.id!,
        result: {
          content: [{ type: 'text', text: 'Error: No tool handler registered' }],
          isError: true,
        },
      };
    }

    try {
      const userResponse = await this.toolCallHandler(toolArgs);
      return {
        jsonrpc: '2.0',
        id: msg.id!,
        result: {
          content: [{ type: 'text', text: userResponse }],
        },
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        jsonrpc: '2.0',
        id: msg.id!,
        result: {
          content: [{ type: 'text', text: `Error: ${errMsg}` }],
          isError: true,
        },
      };
    }
  }

  // ============ 工具方法 ============

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }
}
