export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
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
