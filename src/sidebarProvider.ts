/**
 * Sidebar Webview Provider - 侧边栏对话面板
 * 负责展示 Copilot 的消息、用户选项和输入框，收集用户响应
 */

import * as vscode from 'vscode';
import { ToolCallParams } from './mcpServer';

interface PendingRequest {
  resolve: (value: string) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'copilot-super.panel';

  private webviewView?: vscode.WebviewView;
  private pendingRequest: PendingRequest | null = null;
  private responseQueue: string[] = []; // 存储用户预先发送的消息
  public onGetPrefix?: () => string; // 获取前置提示词的回调

  private messageHistory: Array<{
    role: 'copilot' | 'user'; 
    title?: string;
    content: string;
    timestamp: number;
  }> = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {
    // 从持久化存储加载对话历史
    this.messageHistory = context.workspaceState.get('copilot-super.history', []);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent();

    // 监听来自 Webview 的消息
    webviewView.webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'userResponse':
          this.resolveUserResponse(msg.text);
          break;
        case 'choiceSelected':
          this.resolveUserResponse(msg.choice);
          break;
        case 'clearHistory':
          this.messageHistory = [];
          this.postMessage({ type: 'historyCleared' });
          break;
        case 'copyPrompt':
          vscode.commands.executeCommand('copilot-super.copyPrompt');
          break;
        case 'ready':
          // Webview 就绪，同步历史记录
          this.syncHistory();
          break;
      }
    });
  }

  /** 处理工具调用 - 展示信息并等待用户输入 */
  async handleToolCall(params: ToolCallParams): Promise<string> {
    const title = params.title || '来自 Copilot';
    const summary = params.summary || '';
    const choices = params.choices || [];
    const defaultFeedback = params.default_feedback || '';

    // 记录 Copilot 消息 (无论是否立即返回，都记录)
    this.messageHistory.push({
      role: 'copilot',
      title,
      content: summary,
      timestamp: Date.now(),
    });
    this.saveHistory();

    // 确保侧边栏可见
    if (this.webviewView) {
      this.webviewView.show(true);
    } else {
      await vscode.commands.executeCommand('copilot-super.panel.focus');
    }

    // 1. 如果有预先排队的用户消息，立即使用并返回，不进入等待状态
    if (this.responseQueue.length > 0) {
      const response = this.responseQueue.shift()!;
      
      // 更新 Webview 显示 (让用户看到 Copilot 刚才发了什么，虽然已经自动回复了)
      this.postMessage({
        type: 'showPrompt',
        title,
        summary,
        choices,       // 选项可能不重要了，因为已经自动选择了
        defaultFeedback,
        timestamp: Date.now(),
        // 标记为已快速响应，Webview 可以选择不进入 Input 锁定状态
        autoResponded: true 
      });

      return response;
    }

    // 2. 正常流程：通知用户并等待输入
    const config = vscode.workspace.getConfiguration('copilot-super');
    if (config.get<boolean>('notifyOnToolCall', true)) {
      vscode.window.showInformationMessage(
        `🤖 ${title}`,
        { modal: false },
        '查看'
      ).then((action) => {
        if (action === '查看') {
          vscode.commands.executeCommand('copilot-super.panel.focus');
        }
      });
    }

    // 发送到 Webview
    this.postMessage({
      type: 'showPrompt',
      title,
      summary,
      choices,
      defaultFeedback,
      timestamp: Date.now(),
      autoResponded: false
    });

    // 等待用户响应
    return new Promise<string>((resolve) => {
      // 清除之前的等待
      if (this.pendingRequest?.timeout) {
        clearTimeout(this.pendingRequest.timeout);
      }
      this.pendingRequest = { resolve };
    });
  }

  /** 外部提交响应 (如通过命令调用) */
  submitResponse(text: string): void {
    this.resolveUserResponse(text);
  }

  /** 取消当前挂起的请求（客户端断开时调用） */
  cancelPendingRequest(): void {
    if (this.pendingRequest) {
      const { resolve } = this.pendingRequest;
      this.pendingRequest = null;
      // 解决 Promise，让 mcpServer 的处理链得以继续和清理
      resolve('');
      // 通知 Webview UI 恢复状态
      this.postMessage({ type: 'requestCancelled' });
    }
  }

  /** 清空对话历史 */
  clearHistory(): void {
    this.messageHistory = [];
    this.responseQueue = []; // 清空队列
    this.saveHistory();
    this.postMessage({ type: 'historyCleared' });
  }

  // ============ 内部方法 ============

  private resolveUserResponse(text: string): void {
    if (!text.trim()) {
      return;
    }

    // 记录用户消息
    this.messageHistory.push({
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });
    this.saveHistory();

    let responseText = text;
    if (this.onGetPrefix) {
      const prefix = this.onGetPrefix();
      if (prefix) {
        responseText = `${prefix}\n\n${text}`;
      }
    }

    // 1. 如果有挂起的 Copilot 请求，立即解决
    if (this.pendingRequest) {
      const { resolve } = this.pendingRequest;
      this.pendingRequest = null;
      resolve(responseText);
      this.postMessage({ type: 'responseAccepted' }); // 更新 UI 状态
      return;
    }

    // 2. 如果没有请求，存入队列，等待下次 Copilot 调用时使用
    this.responseQueue.push(responseText);
    // 可选：通知 UI 消息已缓存，但这在 UI 乐观更新下可能不需要额外操作
  }

  /** 持久化对话历史到 workspaceState */
  private saveHistory(): void {
    // 最多保存 200 条，避免存储过大
    const maxEntries = 200;
    if (this.messageHistory.length > maxEntries) {
      this.messageHistory = this.messageHistory.slice(-maxEntries);
    }
    this.context.workspaceState.update('copilot-super.history', this.messageHistory);
  }

  private postMessage(msg: Record<string, unknown>): void {
    this.webviewView?.webview.postMessage(msg);
  }

  private syncHistory(): void {
    this.postMessage({
      type: 'syncHistory',
      history: this.messageHistory,
    });
  }

  // ============ Webview HTML ============

  private getHtmlContent(): string {
    return /*html*/ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --spacing-xs: 4px;
      --spacing-sm: 8px;
      --spacing-md: 12px;
      --spacing-lg: 16px;
      --radius: 8px;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ====== 头部状态栏 ====== */
    .header {
      padding: var(--spacing-sm) var(--spacing-md);
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      flex-shrink: 0;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vscode-testing-iconPassed);
      flex-shrink: 0;
    }

    .status-dot.waiting {
      background: var(--vscode-editorWarning-foreground);
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .header-text {
      font-size: 11px;
      opacity: 0.8;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ====== 激活按钮 ====== */
    .activate-btn {
      margin: var(--spacing-sm);
      padding: var(--spacing-md);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.2s;
      flex-shrink: 0;
    }

    .activate-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .activate-btn .icon {
      font-size: 16px;
    }

    /* ====== 消息区域 ====== */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .messages::-webkit-scrollbar {
      width: 6px;
    }

    .messages::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 3px;
    }

    .message {
      padding: var(--spacing-md);
      border-radius: var(--radius);
      max-width: 100%;
      word-break: break-word;
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.copilot {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
    }

    .message.user {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      margin-left: 20%;
    }

    .message-title {
      font-weight: 600;
      margin-bottom: var(--spacing-xs);
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .message-title .icon {
      font-size: 14px;
    }

    .message-content {
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .message-time {
      font-size: 10px;
      opacity: 0.5;
      margin-top: var(--spacing-xs);
      text-align: right;
    }

    /* ====== 选项按钮区 ====== */
    .choices {
      padding: 0 var(--spacing-md);
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      flex-shrink: 0;
    }

    .choice-btn {
      padding: var(--spacing-xs) var(--spacing-md);
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
      border-radius: var(--radius);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .choice-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      transform: translateY(-1px);
    }

    .choice-btn:active {
      transform: translateY(0);
    }

    /* ====== 输入区域 ====== */
    .input-area {
      padding: var(--spacing-md);
      border-top: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }

    .input-wrapper {
      display: flex;
      gap: var(--spacing-sm);
      align-items: flex-end;
    }

    .input-field {
      flex: 1;
      padding: var(--spacing-sm) var(--spacing-md);
      border: 1px solid var(--vscode-input-border);
      border-radius: var(--radius);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: vertical;
      min-height: 36px;
      max-height: 120px;
      line-height: 1.4;
      outline: none;
    }

    .input-field:focus {
      border-color: var(--vscode-focusBorder);
    }

    .input-field::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .send-btn {
      padding: var(--spacing-sm) var(--spacing-md);
      border: none;
      border-radius: var(--radius);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      height: 36px;
      white-space: nowrap;
      transition: background 0.15s ease;
    }

    .send-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .hint-text {
      font-size: 10px;
      opacity: 0.5;
      margin-top: var(--spacing-xs);
      text-align: center;
    }

    /* ====== 空状态 ====== */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-lg);
      opacity: 0.5;
      text-align: center;
      gap: var(--spacing-sm);
    }

    .empty-state .icon {
      font-size: 32px;
    }

    .empty-state .title {
      font-size: 14px;
      font-weight: 600;
    }

    .empty-state .desc {
      font-size: 12px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="status-dot" id="statusDot"></div>
    <span class="header-text" id="statusText">MCP 服务就绪</span>
  </div>

  <button class="activate-btn" id="activateBtn">
    <span class="icon">📋</span>
    复制前置提示词 (激活)
  </button>

  <div class="messages" id="messages">
    <div class="empty-state" id="emptyState">
      <div class="icon">📡</div>
      <div class="title">Copilot Super</div>
      <div class="desc">
        MCP 服务已就绪，等待 Copilot 连接<br><br>
        <strong>使用方法:</strong><br>
        1. 在 Copilot Chat 中发起对话<br>
        2. Copilot 会自动调用 MCP 工具<br>
        3. 在此面板输入指令继续交互<br><br>
        <em>Shift+Enter 换行 · Enter 发送</em>
      </div>
    </div>
  </div>

  <div class="choices" id="choices"></div>

  <div class="input-area">
    <div class="input-wrapper">
      <textarea
        class="input-field"
        id="inputField"
        placeholder="输入你的指令..."
        rows="1"
      ></textarea>
      <button class="send-btn" id="sendBtn" disabled>发送</button>
    </div>
    <div class="hint-text">Enter 发送 · Shift+Enter 换行</div>
  </div>

  <script>
    (function() {
      // @ts-ignore
      const vscode = acquireVsCodeApi();

      const messagesEl = document.getElementById('messages');
      const emptyStateEl = document.getElementById('emptyState');
      const choicesEl = document.getElementById('choices');
      const inputField = document.getElementById('inputField');
      const sendBtn = document.getElementById('sendBtn');
      const statusDot = document.getElementById('statusDot');
      const statusText = document.getElementById('statusText');
      const activateBtn = document.getElementById('activateBtn');

      let isWaiting = false; // 是否正在等待用户输入以回复当前 Copilot 请求

      // ====== 消息处理 ======
      window.addEventListener('message', (event) => {
        const msg = event.data;

        switch (msg.type) {
          case 'showPrompt':
            handleShowPrompt(msg);
            break;
          case 'responseAccepted':
            handleResponseAccepted();
            break;
          case 'requestCancelled':
            handleRequestCancelled();
            break;
          case 'historyCleared':
            clearMessages();
            break;
          case 'syncHistory':
            syncHistory(msg.history);
            break;
        }
      });

      function handleShowPrompt(msg) {
        // 隐藏空状态
        if (emptyStateEl) emptyStateEl.style.display = 'none';

        // 添加 Copilot 消息
        addMessage('copilot', msg.title, msg.summary, msg.timestamp);

        // 如果已经自动响应（使用了队列中的消息），则不进入等待状态
        if (msg.autoResponded) {
          return;
        }

        // 显示选项
        showChoices(msg.choices || []);

        // 设置默认输入提示
        if (msg.defaultFeedback) {
          inputField.placeholder = msg.defaultFeedback;
        }

        // 进入等待状态（此状态主要用于指示当前正在处理 Copilot 请求，但不禁用输入）
        setWaitingState(true);

        // 聚焦输入框
        inputField.focus();
      }

      function handleResponseAccepted() {
        setWaitingState(false);
        choicesEl.innerHTML = ''; // 清除选项
        inputField.placeholder = '输入指令或预设回复...';
      }

      function handleRequestCancelled() {
        setWaitingState(false);
        choicesEl.innerHTML = '';
        inputField.placeholder = '输入指令或预设回复...';
        // 添加系统提示
        addMessage('copilot', '连接已断开', 'Copilot 已取消请求或连接已中断。', Date.now());
      }

      function setWaitingState(waiting) {
        isWaiting = waiting;
        statusDot.className = 'status-dot' + (waiting ? ' waiting' : '');
        if (waiting) {
          statusText.textContent = 'Copilot 需要您的输入...';
          // 输入框和按钮保持可用
        } else {
          statusText.textContent = '等待 Copilot 请求...';
        }
      }

      // ====== UI 操作 ======
      function addMessage(role, title, content, timestamp) {
        const div = document.createElement('div');
        div.className = 'message ' + role;

        const time = timestamp ? new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

        if (role === 'copilot') {
          div.innerHTML =
            '<div class="message-title"><span class="icon">🤖</span>' + escapeHtml(title || 'Copilot') + '</div>' +
            (content ? '<div class="message-content">' + renderMarkdown(content) + '</div>' : '') +
            '<div class="message-time">' + time + '</div>';
        } else {
          div.innerHTML =
            '<div class="message-content">' + escapeHtml(content) + '</div>' +
            '<div class="message-time">' + time + '</div>';
        }

        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      function showChoices(choices) {
        choicesEl.innerHTML = '';
        if (!choices || choices.length === 0) return;

        choices.forEach((choice) => {
          const btn = document.createElement('button');
          btn.className = 'choice-btn';
          btn.textContent = choice;
          btn.addEventListener('click', () => {
            // 即便不等待，也可以作为文本发送
            addMessage('user', '', choice, Date.now());
            vscode.postMessage({ type: 'choiceSelected', choice: choice });
            if (isWaiting) {
               // 如果正在等待，则这次点击会解决请求
               choicesEl.innerHTML = '';
            }
          });
          choicesEl.appendChild(btn);
        });
      }

      function clearMessages() {
        messagesEl.innerHTML = '';
        if (emptyStateEl) {
          emptyStateEl.style.display = '';
          messagesEl.appendChild(emptyStateEl);
        }
        choicesEl.innerHTML = '';
        setWaitingState(false);
      }

      function syncHistory(history) {
        if (!history || history.length === 0) return;
        if (emptyStateEl) emptyStateEl.style.display = 'none';
        
        // 清空并重新渲染
        const existingEmpty = messagesEl.querySelector('.empty-state');
        messagesEl.innerHTML = '';
        if (existingEmpty) messagesEl.appendChild(existingEmpty);

        history.forEach((item) => {
          addMessage(item.role, item.title || '', item.content, item.timestamp);
        });
      }

      // ====== 发送消息 ======
      function sendMessage() {
        const text = inputField.value.trim();
        if (!text) return; // 移除 isWaiting 检查

        addMessage('user', '', text, Date.now());
        vscode.postMessage({ type: 'userResponse', text: text });
        inputField.value = '';
        adjustHeight();
        updateButtonState();
        
        // 如果正在等待，发送消息也会清除选项
        if (isWaiting) {
             choicesEl.innerHTML = '';
        }
      }

      sendBtn.addEventListener('click', sendMessage);

      activateBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'copyPrompt' });
      });

      inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      function updateButtonState() {
        sendBtn.disabled = !inputField.value.trim();
      }

      // 自适应高度
      function adjustHeight() {
        inputField.style.height = 'auto';
        inputField.style.height = Math.min(inputField.scrollHeight, 120) + 'px';
      }

      inputField.addEventListener('input', () => {
        adjustHeight();
        updateButtonState();
      });

      // ====== 工具函数 ======
      function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      /** 轻量级 Markdown 渲染（支持加粗、斜体、行内代码、代码块、列表、标题） */
      function renderMarkdown(text) {
        if (!text) return '';
        // 先对 HTML 转义
        let html = escapeHtml(text);
        // 代码块
        const bt3 = String.fromCharCode(96,96,96);
        const bt1re = new RegExp(String.fromCharCode(96) + '([^' + String.fromCharCode(96) + ']+)' + String.fromCharCode(96), 'g');
        const bt3re = new RegExp(bt3 + '(\\\\w*)\\n([\\\\s\\\\S]*?)' + bt3, 'g');
        html = html.replace(bt3re,
          '<pre style="background:var(--vscode-textCodeBlock-background);padding:8px;border-radius:4px;overflow-x:auto;"><code>$2</code></pre>');
        // 行内代码
        html = html.replace(bt1re,
          '<code style="background:var(--vscode-textCodeBlock-background);padding:1px 4px;border-radius:3px;">$1</code>');
        // 加粗 **...**
        html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
        // 斜体 *...*
        html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>');
        // 标题
        html = html.replace(/^### (.+)$/gm, '<strong style="font-size:1.1em;">$1</strong>');
        html = html.replace(/^## (.+)$/gm, '<strong style="font-size:1.2em;">$1</strong>');
        html = html.replace(/^# (.+)$/gm, '<strong style="font-size:1.3em;">$1</strong>');
        // 无序列表
        html = html.replace(/^[*\\-] (.+)$/gm, '• $1');
        // 换行
        html = html.replace(/\\n/g, '<br>');
        return html;
      }

      // 通知 extension 就绪
      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
  }
}
