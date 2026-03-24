/**
 * MCP HTTP Server - 使用官方 MCP SDK 实现 Streamable HTTP 传输协议
 * 处理 VS Code Copilot 的 JSON-RPC 请求，注册并响应 copilot_super_N 工具调用
 */

import * as http from 'http';
import * as crypto from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { getMcpToolName, getMcpInstanceIndex } from './mcpProtocol';
import { createModuleLogger, formatError, formatErrorDetail, isErrorCode } from './utils/logger';
import { isValidToolCallParams } from './sidebar/types';

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

/** MCP Server 日志器 */
const logger = createModuleLogger('MCP Server');

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
  /** 防止 recreateTransport 并发调用 */
  private isRecreating = false;

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
          logger.debug('Heartbeat ping sent');
        } catch (error) {
          // ping 失败可能是因为客户端已断开，记录但不抛出错误
          logger.debug('Heartbeat ping failed:', error);
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

  /**
   * 重建 Transport（会话关闭后调用）
   * Windsurf 客户端可能发送 DELETE 关闭会话，需要重建 transport 支持新连接
   */
  private async recreateTransport(): Promise<void> {
    // 防止并发调用
    if (this.isRecreating) {
      logger.debug('Transport recreation already in progress, skipping');
      return;
    }
    this.isRecreating = true;

    try {
      // 关闭旧的 mcpServer
      if (this.mcpServer) {
        try {
          await this.mcpServer.close();
        } catch {
          // 忽略关闭错误
        }
      }

      // 创建新的 MCP 服务器和 Transport
      this.mcpServer = this.createMcpServer();
      this.transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessionclosed: () => {
          logger.info('Session closed by client, will recreate transport on next request');
          this.recreateTransport();
        },
      });

      try {
        await this.mcpServer.connect(this.transport);
        logger.debug('Transport recreated successfully');
      } catch (error) {
        logger.error('Failed to recreate transport', error);
      }
    } finally {
      this.isRecreating = false;
    }
  }

  /** 创建 MCP 服务器实例 */
  private createMcpServer(): McpServer {
    const port = this.actualPort || this.port;
    const toolName = getMcpToolName(port);

    logger.debug(`Creating MCP server with tool name: ${toolName}`);

    // 不手动声明 capabilities，让 SDK 自动注册
    // tool() 方法会自动调用 setToolRequestHandlers() 注册 tools: { listChanged: true }
    const server = new McpServer(
      {
        name: 'copilot-super',
        version: '2.0.0',
      }
    );

    // 注册工具（使用 registerTool 方法以正确设置 title 字段）
    // ⚠️ MCP 2025-03-26 规范要求工具定义必须包含 title 字段
    logger.debug(`Registering tool: ${toolName}`);
    server.registerTool(
      toolName,
      {
        title: `Copilot Super Tool ${getMcpInstanceIndex(port)}`,
        description: TOOL_DESCRIPTION,
        inputSchema: {
          title: z.string().describe('任务标题'),
          summary: z.string().optional().describe('向用户展示的对话摘要信息'),
          choices: z.array(z.string()).optional().describe('供用户选择的选项列表'),
        },
      },
      async (args: ToolCallParams) => {
        logger.debug(`Tool ${toolName} called with args:`, JSON.stringify(args).substring(0, 200));
        
        // 验证参数结构
        if (!isValidToolCallParams(args)) {
          logger.error(`Tool ${toolName} received invalid params`, args);
          return {
            content: [{ type: 'text' as const, text: 'Error: Invalid tool call parameters' }],
            isError: true,
          };
        }
        
        if (!this.toolCallHandler) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No tool handler registered' }],
            isError: true,
          };
        }

        try {
          const result = await this.toolCallHandler(args);
          logger.debug(`Tool ${toolName} returned:`, result.substring(0, 200));
          return {
            content: [{ type: 'text' as const, text: result }],
          };
        } catch (error) {
          const errMsg = formatError(error);
          logger.error(`Tool ${toolName} error`, error);
          return {
            content: [{ type: 'text' as const, text: `Error: ${errMsg}` }],
            isError: true,
          };
        }
      }
    );
    logger.debug(`Tool ${toolName} registered successfully`);

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
        // actualPort 已在 tryListen 中设置
        logger.info(`Server listening on port ${tryPort}`);
        return tryPort;
      } catch (err: unknown) {
        if (isErrorCode(err, 'EADDRINUSE')) {
          logger.debug(`Port ${tryPort} in use, trying next...`);
          lastError = err as NodeJS.ErrnoException;
          continue;
        }
        throw err;
      }
    }

    // 所有固定端口尝试失败，回退到 OS 随机分配 (port 0)
    try {
      await this.tryListen(0);
      // 安全获取地址，避免空指针风险
      const addr = this.httpServer?.address();
      if (!addr) {
        throw new Error('HTTP server address is null after listen');
      }
      this.actualPort = typeof addr === 'object' && addr ? addr.port : 0;
      logger.info(`Server listening on port ${this.actualPort} (OS assigned)`);
      return this.actualPort;
    } catch (err) {
      throw lastError || err;
    }
  }

  /** 尝试在指定端口监听 */
  private async tryListen(port: number): Promise<void> {
    // ⚠️ 重要：先设置 actualPort，确保 createMcpServer() 使用正确的端口号
    // 否则工具名会错误（如端口 55434 应该生成 copilot_super_2，而不是 copilot_super_1）
    this.actualPort = port;
    
    // 创建 MCP 服务器
    this.mcpServer = this.createMcpServer();

    // 创建 Streamable HTTP Transport
    // 使用 stateful 模式以支持长连接和会话管理
    // stateless 模式不允许 transport 跨请求复用
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      // 当客户端发送 DELETE 请求关闭会话时，重建 transport 以支持新连接
      onsessionclosed: () => {
        logger.info('Session closed by client, will recreate transport on next request');
        this.recreateTransport();
      },
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
      } catch (transportErr) {
        logger.warn('Error closing transport during cleanup:', transportErr);
      }
      this.transport = null;
    }
    if (this.mcpServer) {
      try {
        await this.mcpServer.close();
      } catch (closeErr) {
        logger.warn('Error closing mcpServer during cleanup:', closeErr);
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

    // 处理 OPTIONS 预检请求（CORS）
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // 读取请求体
      const body = await this.readBody(req);

      // 解析 JSON（仅对有请求体的请求）
      let parsedBody: unknown = undefined;
      if (body && body.trim()) {
        try {
          parsedBody = JSON.parse(body);
        } catch (parseError) {
          logger.error('JSON parse error', parseError);
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
      
      // 记录请求信息（仅调试模式）
      logger.debug(`${req.method} request, body length: ${body.length}, parsedBody: ${parsedBody !== undefined ? 'defined' : 'undefined'}`);
      
      // 详细记录请求内容（仅调试模式）
      if (parsedBody && typeof parsedBody === 'object') {
        const bodyObj = parsedBody as { method?: string; params?: unknown };
        logger.debug(`Request method: ${bodyObj.method}, id: ${(parsedBody as { id?: unknown }).id}`);
        if (bodyObj.params) {
          logger.debug('Request params:', JSON.stringify(bodyObj.params).substring(0, 200));
        }
      }
      
      await this.transport.handleRequest(req, res, parsedBody);
      
      // 记录请求完成（仅调试模式）
      logger.debug(`Request ${req.method} completed, headersSent: ${res.headersSent}`);
    } catch (error) {
      logger.error('Error handling request', error);
      logger.error('Stack trace:', formatErrorDetail(error));
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error', data: formatError(error) },
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

    // 只允许 vscode-webview 源或本地无 origin 请求
    if (origin && origin.startsWith('vscode-webview://')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin && isLocalRequest) {
      // 本地请求无 origin，使用特定标识而非通配符
      res.setHeader('Access-Control-Allow-Origin', 'vscode-file://vscode-app');
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
    logger.debug('Server stopped');
  }

  /** 当前是否运行中 */
  get running(): boolean {
    return this.isRunning;
  }
}