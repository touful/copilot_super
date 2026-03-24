/**
 * MCP HTTP Server - 使用官方 MCP SDK 实现 Streamable HTTP 传输协议
 * 处理 VS Code Copilot 的 JSON-RPC 请求，注册并响应 copilot_super_N 工具调用
 */

import * as http from 'http';
import * as crypto from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { getMcpToolName } from './mcpProtocol';

// ============ 常量定义 ============

/** 端口重试最大次数 */
const MAX_PORT_ATTEMPTS = 10;

/**
 * SSE 心跳间隔（毫秒）
 *
 * ⚠️ 重要：心跳机制不能删除！
 * - 某些 MCP 客户端（如 Windsurf）使用 SSE 长连接，若长时间无数据传输会触发超时断开
 * - 心跳至少每 4 分钟发送一次，此处设置为 3 分钟（180000ms）以提供安全余量
 * - 删除心跳将导致 MCP 连接在长时间无活动时被客户端断开，造成工具调用失败
 */
const SSE_HEARTBEAT_INTERVAL_MS = 180_000; // 3 分钟

// ============ 类型定义 ============

export interface ToolCallParams {
  title?: string;
  summary?: string;
  choices?: string[];
}

export type ToolCallHandler = (params: ToolCallParams) => Promise<string>;

/** 检查是否为端口占用错误 */
function isAddressInUseError(err: unknown): err is NodeJS.ErrnoException {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'EADDRINUSE'
  );
}

/** 工具描述 */
const TOOL_DESCRIPTION = [
  '用户通过远程监控的方式和你对话，此 mcp 用于节点通信（电话，唯一方式），用户能够正常看到你在进行的 task 以及 response（chat面板是监控）.',
  '',
  '<PREREQUISITE>',
  '✓ Executed IDE actions (禁止用终端指令写代码)',
  '✓ Shown output to user in response，在copilot聊天窗口，输出主任务',
  '</PREREQUISITE>',
  '不管你是什么模型，都必须在遵守 .github/copilot.md 的前提下工作.',
].join('\n');

// ============ MCP HTTP Server ============

export class McpHttpServer {
  private httpServer: http.Server | null = null;
  private mcpServer: McpServer | null = null;
  private transport: InstanceType<typeof StreamableHTTPServerTransport> | null = null;
  private toolCallHandler: ToolCallHandler | null = null;
  private toolCallCancelHandler: (() => void) | null = null;
  /**
   * SSE 心跳定时器
   * ⚠️ 重要：心跳机制不能删除！详见 SSE_HEARTBEAT_INTERVAL_MS 常量注释
   */
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private port: number;
  private actualPort: number = 0;
  private isRunning = false;

  constructor(port: number = 55433) {
    this.port = port;
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

  /**
   * 启动 SSE 心跳
   * ⚠️ 重要：心跳机制不能删除！详见 SSE_HEARTBEAT_INTERVAL_MS 常量注释
   */
  private startHeartbeat(): void {
    this.stopHeartbeat(); // 确保不会重复启动
    this.heartbeatTimer = setInterval(async () => {
      // 发送 MCP ping 保持连接活跃
      // MCP 协议定义：服务器可以主动发送 ping 请求，客户端必须响应
      if (this.mcpServer && this.isRunning) {
        try {
          // 通过底层 Server 实例发送 ping（McpServer.server 是公开属性）
          await this.mcpServer.server.ping();
          console.log('[MCP Server] Heartbeat ping sent');
        } catch (error) {
          // ping 失败可能是因为客户端已断开，记录但不抛出错误
          console.log('[MCP Server] Heartbeat ping failed:', error instanceof Error ? error.message : String(error));
        }
      }
    }, SSE_HEARTBEAT_INTERVAL_MS);
  }

  /**
   * 停止 SSE 心跳
   * ⚠️ 重要：仅服务器关闭时调用，不要在其他场景删除心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** 创建 MCP 服务器实例 */
  private createMcpServer(): McpServer {
    const port = this.actualPort || this.port;
    const toolName = getMcpToolName(port);

    const server = new McpServer(
      {
        name: 'copilot-super',
        version: '1.5.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // 注册工具
    server.tool(
      toolName,
      TOOL_DESCRIPTION,
      {
        title: z.string().describe('任务标题'),
        summary: z.string().optional().describe('向用户展示的对话摘要信息'),
        choices: z.array(z.string()).optional().describe('供用户选择的选项列表'),
      },
      async (args: ToolCallParams) => {
        if (!this.toolCallHandler) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No tool handler registered' }],
            isError: true,
          };
        }

        try {
          const result = await this.toolCallHandler(args);
          return {
            content: [{ type: 'text' as const, text: result }],
          };
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: 'text' as const, text: `Error: ${errMsg}` }],
            isError: true,
          };
        }
      }
    );

    return server;
  }

  /** 启动服务器（支持动态端口分配） */
  async start(): Promise<number> {
    if (this.isRunning) {
      await this.stop();
    }

    // 尝试端口: 从配置端口开始递增
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
      const tryPort = this.port + attempt;
      try {
        await this.tryListen(tryPort);
        this.actualPort = tryPort;
        console.log(`[MCP Server] Listening on http://127.0.0.1:${tryPort}/mcp`);
        return tryPort;
      } catch (err: unknown) {
        if (isAddressInUseError(err)) {
          console.log(`[MCP Server] Port ${tryPort} in use, trying next...`);
          lastError = err as NodeJS.ErrnoException;
          continue;
        }
        throw err;
      }
    }

    // 所有固定端口尝试失败，回退到 OS 随机分配 (port 0)
    try {
      await this.tryListen(0);
      const addr = this.httpServer!.address();
      this.actualPort = typeof addr === 'object' && addr ? addr.port : 0;
      console.log(`[MCP Server] Listening on http://127.0.0.1:${this.actualPort}/mcp (OS assigned)`);
      return this.actualPort;
    } catch (err) {
      throw lastError || err;
    }
  }

  /** 尝试在指定端口监听 */
  private async tryListen(port: number): Promise<void> {
    // 创建 MCP 服务器
    this.mcpServer = this.createMcpServer();

    // 创建 Streamable HTTP Transport
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    try {
      // 连接 MCP 服务器到 Transport
      await this.mcpServer.connect(this.transport);

      // 创建 HTTP 服务器
      this.httpServer = http.createServer(async (req, res) => {
        await this.handleRequest(req, res);
      });

      // 设置超时 - 工具调用可能需要用户长时间输入
      this.httpServer.timeout = 0;
      this.httpServer.keepAliveTimeout = 0;

      await new Promise<void>((resolve, reject) => {
        this.httpServer!.listen(port, '127.0.0.1', () => {
          this.isRunning = true;
          // ⚠️ 重要：启动心跳，不能删除！详见 SSE_HEARTBEAT_INTERVAL_MS 常量注释
          this.startHeartbeat();
          resolve();
        });

        this.httpServer!.on('error', (err: NodeJS.ErrnoException) => {
          this.httpServer = null;
          reject(err);
        });
      });
    } catch (error) {
      // 清理已创建的资源
      await this.cleanupResources();
      throw error;
    }
  }

  /** 清理资源 */
  private async cleanupResources(): Promise<void> {
    // ⚠️ 重要：停止心跳，仅在服务器关闭时调用
    this.stopHeartbeat();
    
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // 忽略关闭错误
      }
      this.transport = null;
    }
    if (this.mcpServer) {
      try {
        await this.mcpServer.close();
      } catch {
        // 忽略关闭错误
      }
      this.mcpServer = null;
    }
    if (this.httpServer) {
      this.httpServer.closeAllConnections?.();
      this.httpServer.close();
      this.httpServer = null;
    }
  }

  /** 处理 HTTP 请求 */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.actualPort}`);

    // 只处理 /mcp 路径
    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use /mcp endpoint.' }));
      return;
    }

    // 设置 CORS 头
    this.setCorsHeaders(req, res);

    try {
      // 读取请求体
      const body = await this.readBody(req);

      // 解析 JSON
      let parsedBody: unknown;
      if (body) {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error' },
            id: null,
          }));
          return;
        }
      }

      // 使用 Transport 处理请求
      if (!this.transport) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Server not ready' },
          id: null,
        }));
        return;
      }
      await this.transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      console.error('[MCP Server] Error handling request:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        }));
      }
    }
  }

  /** 设置 CORS 头 */
  private setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse): void {
    const origin = req.headers.origin;
    const remoteAddress = req.socket.remoteAddress;
    const isLocalRequest = !!remoteAddress && this.isLoopbackAddress(remoteAddress);

    if (origin && origin.startsWith('vscode-webview://')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin && isLocalRequest) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  }

  /** 检查是否为本地回环地址 */
  private isLoopbackAddress(address: string): boolean {
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
  }

  /** 读取请求体 */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      const maxSize = 1024 * 1024; // 1MB

      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
          req.destroy();
          reject(new Error('Request body too large'));
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });

      req.on('error', reject);
    });
  }

  /** 停止服务器 */
  async stop(): Promise<void> {
    await this.cleanupResources();
    this.isRunning = false;
    console.log('[MCP Server] Stopped');
  }

  /** 当前是否运行中 */
  get running(): boolean {
    return this.isRunning;
  }
}