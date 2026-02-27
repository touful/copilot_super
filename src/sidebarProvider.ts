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

interface RuleTemplate {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'copilot-super.panel';

  private webviewView?: vscode.WebviewView;
  private pendingRequest: PendingRequest | null = null;
  private responseQueue: string[] = []; // 存储用户预先发送的消息
  public onGetPrefix?: () => string; // 获取前置提示词的回调
  public onGetToolName?: () => string; // 获取工具名的回调

  private messageHistory: Array<{
    role: 'copilot' | 'user'; 
    title?: string;
    content: string;
    timestamp: number;
  }> = [];

  // 规则存储 (功能3)
  private globalRules: string = '';
  private workspaceRules: string = '';
  private ruleTemplates: RuleTemplate[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {
    // 从持久化存储加载对话历史
    this.messageHistory = context.workspaceState.get('copilot-super.history', []);
    // 从持久化存储加载规则
    this.globalRules = context.globalState.get<string>('copilot-super.globalRules', '');
    this.workspaceRules = context.workspaceState.get<string>('copilot-super.workspaceRules', '');
    // 加载规则模板
    this.ruleTemplates = context.globalState.get<RuleTemplate[]>('copilot-super.ruleTemplates', []);
    if (this.ruleTemplates.length === 0) {
      this.ruleTemplates = this.getDefaultTemplates();
      context.globalState.update('copilot-super.ruleTemplates', this.ruleTemplates);
    }
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
        case 'saveRules':
          // 功能3: 保存规则
          this.globalRules = msg.globalRules || '';
          this.workspaceRules = msg.workspaceRules || '';
          this.context.globalState.update('copilot-super.globalRules', this.globalRules);
          this.context.workspaceState.update('copilot-super.workspaceRules', this.workspaceRules);
          this.postMessage({ type: 'rulesSaved' });
          break;
        case 'requestRules':
          // 功能3: 返回当前规则
          this.postMessage({
            type: 'syncRules',
            globalRules: this.globalRules,
            workspaceRules: this.workspaceRules,
          });
          break;
        case 'saveTemplate':
          this.handleSaveTemplate(msg.template as RuleTemplate);
          break;
        case 'deleteTemplate':
          this.handleDeleteTemplate(msg.id as string);
          break;
        case 'toggleTemplate':
          this.handleToggleTemplate(msg.id as string, msg.enabled as boolean);
          break;
        case 'requestTemplates':
          this.postMessage({ type: 'syncTemplates', templates: this.ruleTemplates });
          break;
        case 'saveSettings':
          // 保存设置项到 VS Code 配置
          this.handleSaveSettings(msg as { notifyOnToolCall: boolean; soundOnToolCall: boolean; showPluginNotifications: boolean });
          break;
        case 'requestSettings':
          // 返回当前设置项
          this.syncSettings();
          break;
        case 'ready':
          // Webview 就绪，同步历史记录、规则、模板和设置
          this.syncHistory();
          this.postMessage({
            type: 'syncRules',
            globalRules: this.globalRules,
            workspaceRules: this.workspaceRules,
          });
          this.postMessage({ type: 'syncTemplates', templates: this.ruleTemplates });
          this.syncSettings();
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

    // 播放提示音（通过 Webview AudioContext）
    if (config.get<boolean>('soundOnToolCall', false)) {
      this.postMessage({ type: 'playSound' });
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
        // 功能3: 拼接全局规则和工作区规则
        let fullPrefix = prefix;
        if (this.globalRules.trim()) {
          fullPrefix = `${fullPrefix}\n\n[全局规则]\n${this.globalRules}`;
        }
        if (this.workspaceRules.trim()) {
          fullPrefix = `${fullPrefix}\n\n[工作区规则]\n${this.workspaceRules}`;
        }
        // 拼接启用的规则模板（发送时自动加数字序号，设置中用户不可见）
        const enabledTemplates = this.ruleTemplates.filter(t => t.enabled).map((t, i) => `${i + 1}. ${t.content}`);
        if (enabledTemplates.length > 0) {
          fullPrefix = `${fullPrefix}\n\n[规则模板]\n${enabledTemplates.join('\n')}`;
        }
        // 功能1: 添加后缀提醒
        const toolName = this.onGetToolName?.();
        const suffix = toolName ? `，每次任务完成之后请调用${toolName}进行汇报。` : '';
        responseText = `${fullPrefix}\n\n${text}${suffix}`;
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

  /** 获取带规则的完整提示词 (功能3) */
  getFullPrompt(): string {
    if (!this.onGetPrefix) {
      return '';
    }
    const prefix = this.onGetPrefix();
    let fullPrompt = prefix;
    if (this.globalRules.trim()) {
      fullPrompt = `${fullPrompt}\n\n[全局规则]\n${this.globalRules}`;
    }
    if (this.workspaceRules.trim()) {
      fullPrompt = `${fullPrompt}\n\n[工作区规则]\n${this.workspaceRules}`;
    }
    // 拼接启用的规则模板（发送时自动加数字序号，设置中用户不可见）
    const enabledTemplates = this.ruleTemplates.filter(t => t.enabled).map((t, i) => `${i + 1}. ${t.content}`);
    if (enabledTemplates.length > 0) {
      fullPrompt = `${fullPrompt}\n\n[规则模板]\n${enabledTemplates.join('\n')}`;
    }
    return fullPrompt;
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

  /** 获取默认规则模板 */
  private getDefaultTemplates(): RuleTemplate[] {
    return [
      { id: 'builtin-1', name: '中文回复', content: '请使用中文回复所有内容，包括代码注释。', enabled: false },
      { id: 'builtin-2', name: '简洁模式', content: '请简洁回复，省略不必要的解释，直接给出结果。', enabled: false },
      { id: 'builtin-3', name: '详细解释', content: '请详细解释每一步操作的原因和逻辑，确保用户理解。', enabled: false },
      { id: 'builtin-4', name: '代码审查', content: '请仔细审查代码，关注可能的bug、安全问题、性能瓶颈和最佳实践。', enabled: false },
    ];
  }

  /** 保存(新增/编辑)规则模板 */
  private handleSaveTemplate(template: RuleTemplate): void {
    const idx = this.ruleTemplates.findIndex(t => t.id === template.id);
    if (idx >= 0) {
      this.ruleTemplates[idx] = template;
    } else {
      this.ruleTemplates.push(template);
    }
    this.context.globalState.update('copilot-super.ruleTemplates', this.ruleTemplates);
    this.postMessage({ type: 'syncTemplates', templates: this.ruleTemplates });
  }

  /** 删除规则模板 */
  private handleDeleteTemplate(id: string): void {
    this.ruleTemplates = this.ruleTemplates.filter(t => t.id !== id);
    this.context.globalState.update('copilot-super.ruleTemplates', this.ruleTemplates);
    this.postMessage({ type: 'syncTemplates', templates: this.ruleTemplates });
  }

  /** 切换规则模板启用状态 */
  private handleToggleTemplate(id: string, enabled: boolean): void {
    const template = this.ruleTemplates.find(t => t.id === id);
    if (template) {
      template.enabled = enabled;
      this.context.globalState.update('copilot-super.ruleTemplates', this.ruleTemplates);
    }
  }

  /** 保存设置项到 VS Code 配置 */
  private async handleSaveSettings(settings: { notifyOnToolCall: boolean; soundOnToolCall: boolean; showPluginNotifications: boolean }): Promise<void> {
    const config = vscode.workspace.getConfiguration('copilot-super');
    await config.update('notifyOnToolCall', settings.notifyOnToolCall, vscode.ConfigurationTarget.Global);
    await config.update('soundOnToolCall', settings.soundOnToolCall, vscode.ConfigurationTarget.Global);
    await config.update('showPluginNotifications', settings.showPluginNotifications, vscode.ConfigurationTarget.Global);
    this.postMessage({ type: 'settingsSaved' });
  }

  /** 同步当前设置到 Webview */
  private syncSettings(): void {
    const config = vscode.workspace.getConfiguration('copilot-super');
    this.postMessage({
      type: 'syncSettings',
      notifyOnToolCall: config.get<boolean>('notifyOnToolCall', true),
      soundOnToolCall: config.get<boolean>('soundOnToolCall', false),
      showPluginNotifications: config.get<boolean>('showPluginNotifications', true),
    });
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

    .header-icon-btn {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 14px;
      padding: 2px 6px;
      border-radius: 4px;
      opacity: 0.6;
      transition: opacity 0.15s ease, background 0.15s ease;
      flex-shrink: 0;
    }

    .header-icon-btn:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
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

    /* ====== 功能3: 标签页导航 ====== */
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
    }

    .tab-btn {
      flex: 1;
      padding: var(--spacing-md);
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      border-bottom: 2px solid transparent;
      opacity: 0.7;
      transition: all 0.2s ease;
      text-align: center;
    }

    .tab-btn:hover {
      opacity: 1;
    }

    .tab-btn.active {
      border-bottom-color: var(--vscode-focusBorder);
      color: var(--vscode-focusBorder);
      opacity: 1;
    }

    /* ====== 功能3: 设置页面 ====== */
    .tab-content {
      display: none;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
    }

    .tab-content.active {
      display: flex;
    }

    .settings-page {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: var(--spacing-md);
      gap: var(--spacing-lg);
    }

    .settings-page::-webkit-scrollbar {
      width: 6px;
    }

    .settings-page::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 3px;
    }

    .setting-group {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .setting-group label {
      font-weight: 600;
      font-size: 12px;
      color: var(--vscode-foreground);
    }

    .setting-group .hint {
      font-size: 10px;
      opacity: 0.6;
      line-height: 1.4;
    }

    .rule-textarea {
      width: 100%;
      min-height: 80px;
      padding: var(--spacing-sm);
      border: 1px solid var(--vscode-input-border);
      border-radius: var(--radius);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 11px;
      resize: vertical;
      outline: none;
    }

    .rule-textarea:focus {
      border-color: var(--vscode-focusBorder);
    }

    .save-rules-btn {
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: background 0.15s ease;
      align-self: flex-start;
    }

    .save-rules-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .status-message {
      font-size: 11px;
      padding: var(--spacing-sm);
      border-radius: var(--radius);
      background: var(--vscode-testing-iconPassed);
      color: var(--vscode-sideBar-background);
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .status-message.show {
      opacity: 1;
    }

    /* ====== 规则模板库 ====== */
    .template-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .template-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 6px var(--spacing-sm);
      border-radius: var(--radius);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
    }

    .template-item:hover {
      border-color: var(--vscode-focusBorder);
    }

    .template-item input[type="checkbox"] {
      flex-shrink: 0;
      cursor: pointer;
    }

    .template-item-info {
      flex: 1;
      min-width: 0;
      cursor: pointer;
    }

    .template-item-name {
      font-size: 12px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .template-item-preview {
      font-size: 10px;
      opacity: 0.5;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .template-item-actions {
      display: flex;
      gap: 2px;
      flex-shrink: 0;
    }

    .template-item-actions button {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 12px;
      opacity: 0.5;
      transition: opacity 0.15s;
    }

    .template-item-actions button:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
    }

    .add-template-btn {
      width: 100%;
      padding: var(--spacing-sm);
      border: 1px dashed var(--vscode-panel-border);
      border-radius: var(--radius);
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 12px;
      opacity: 0.6;
      transition: all 0.15s;
      margin-top: var(--spacing-sm);
    }

    .add-template-btn:hover {
      opacity: 1;
      border-color: var(--vscode-focusBorder);
    }

    .template-dialog-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-lg);
    }

    .template-dialog-overlay.show {
      display: flex;
    }

    .template-dialog {
      width: 100%;
      max-width: 400px;
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--radius);
      padding: var(--spacing-lg);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .template-dialog h3 {
      font-size: 14px;
      font-weight: 600;
      margin: 0;
    }

    .template-dialog input,
    .template-dialog textarea {
      width: 100%;
      padding: var(--spacing-sm);
      border: 1px solid var(--vscode-input-border);
      border-radius: var(--radius);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: 12px;
      outline: none;
    }

    .template-dialog input:focus,
    .template-dialog textarea:focus {
      border-color: var(--vscode-focusBorder);
    }

    .template-dialog textarea {
      min-height: 80px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 11px;
    }

    .dialog-actions {
      display: flex;
      gap: var(--spacing-sm);
      justify-content: flex-end;
    }

    .dialog-actions button {
      padding: var(--spacing-xs) var(--spacing-md);
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 12px;
    }

    .dialog-save-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .dialog-save-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .dialog-cancel-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .dialog-cancel-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    /* ====== 设置页开关样式 ====== */
    .setting-toggle {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) 0;
    }

    .setting-toggle input[type="checkbox"] {
      margin-top: 2px;
      flex-shrink: 0;
      cursor: pointer;
    }

    .setting-toggle-info {
      flex: 1;
      min-width: 0;
    }

    .setting-toggle-info label {
      font-weight: 500;
      font-size: 12px;
      cursor: pointer;
      display: block;
    }

    .setting-toggle-info .hint {
      font-size: 10px;
      opacity: 0.6;
      line-height: 1.4;
      margin-top: 2px;
    }

    /* ====== 功能4: 撤回功能 ====== */
    .pending-send-area {
      padding: var(--spacing-md);
      background: var(--vscode-editorWarning-background);
      border: 1px solid var(--vscode-editorWarning-border);
      border-radius: var(--radius);
      margin-bottom: var(--spacing-md);
      display: none;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .pending-send-area.show {
      display: flex;
    }

    .pending-send-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .pending-send-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-editorWarning-foreground);
    }

    .pending-countdown {
      font-size: 11px;
      color: var(--vscode-editorWarning-foreground);
      min-width: 30px;
      text-align: right;
    }

    .pending-send-text {
      font-size: 11px;
      color: var(--vscode-editorWarning-foreground);
      padding: var(--spacing-sm);
      background: rgba(0, 0, 0, 0.2);
      border-radius: 3px;
      word-break: break-word;
      max-height: 60px;
      overflow-y: auto;
      line-height: 1.4;
    }

    .pending-actions {
      display: flex;
      gap: var(--spacing-sm);
      justify-self: flex-end;
    }

    .pending-send-btn, .pending-cancel-btn {
      flex: 1;
      padding: 4px 8px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.15s ease;
    }

    .pending-send-btn {
      background: var(--vscode-testing-iconPassed);
      color: var(--vscode-sideBar-background);
    }

    .pending-send-btn:hover {
      opacity: 0.9;
    }

    .pending-cancel-btn {
      background: var(--vscode-errorForeground);
      color: var(--vscode-sideBar-background);
    }

    .pending-cancel-btn:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="status-dot" id="statusDot"></div>
    <span class="header-text" id="statusText">MCP 服务就绪</span>
    <button class="header-icon-btn" id="clearBtn" title="清除对话">🗑️</button>
  </div>

  <!-- 标签页导航 -->
  <div class="tabs">
    <button class="tab-btn active" data-tab="chat" id="chatTabBtn">💬 对话</button>
    <button class="tab-btn" data-tab="rules" id="rulesTabBtn">📏 规则</button>
    <button class="tab-btn" data-tab="settings" id="settingsTabBtn">⚙️ 设置</button>
  </div>

  <!-- 对话页面 -->
  <div class="tab-content active" id="chatTab">
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

    <!-- 功能4: 待发送消息提示区 -->
    <div class="pending-send-area" id="pendingSendArea">
      <div class="pending-send-header">
        <div class="pending-send-title">⏱️ 消息即将发送，可撤回</div>
        <div class="pending-countdown" id="pendingCountdown">5秒</div>
      </div>
      <div class="pending-send-text" id="pendingSendText"></div>
      <div class="pending-actions">
        <button class="pending-send-btn" id="pendingSendNowBtn">立即发送</button>
        <button class="pending-cancel-btn" id="pendingCancelBtn">撤回</button>
      </div>
    </div>

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
  </div>

  <!-- 规则页面 -->
  <div class="tab-content" id="rulesTab">
    <div class="settings-page" id="rulesPage">
      <div class="setting-group">
        <label>全局规则</label>
        <div class="hint">在所有工作区适用的规则，会添加到提示词前缀之后</div>
        <textarea 
          class="rule-textarea" 
          id="globalRulesInput" 
          placeholder="输入全局规则，每条规则占一行或使用段落分隔..."
        ></textarea>
      </div>

      <div class="setting-group">
        <label>工作区规则</label>
        <div class="hint">仅在当前工作区适用的规则，会添加到全局规则之后</div>
        <textarea 
          class="rule-textarea" 
          id="workspaceRulesInput" 
          placeholder="输入工作区规则，每条规则占一行或使用段落分隔..."
        ></textarea>
      </div>

      <button class="save-rules-btn" id="saveRulesBtn">保存规则</button>
      <div class="status-message" id="rulesSavedMsg">规则已保存！</div>

      <div class="setting-group">
        <label>规则模板库</label>
        <div class="hint">勾选的模板会自动拼接到前置提示词中</div>
        <div class="template-list" id="templateList"></div>
        <button class="add-template-btn" id="addTemplateBtn">+ 添加自定义模板</button>
      </div>
    </div>
  </div>

  <!-- 设置页面 -->
  <div class="tab-content" id="settingsTab">
    <div class="settings-page" id="settingsPage">
      <div class="setting-group">
        <label>提示信息设置</label>
        <div class="hint">控制插件的通知和提示行为</div>
      </div>

      <div class="setting-group">
        <div class="setting-toggle">
          <input type="checkbox" id="settingNotifyOnToolCall" checked>
          <div class="setting-toggle-info">
            <label for="settingNotifyOnToolCall">允许 MCP 调用时提示信息</label>
            <div class="hint">当 Copilot 通过 MCP 工具调用时，在右下角显示通知</div>
          </div>
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-toggle">
          <input type="checkbox" id="settingSoundOnToolCall">
          <div class="setting-toggle-info">
            <label for="settingSoundOnToolCall">允许 MCP 调用时提示音</label>
            <div class="hint">当 Copilot 通过 MCP 工具调用时，播放提示音效</div>
          </div>
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-toggle">
          <input type="checkbox" id="settingShowPluginNotifications" checked>
          <div class="setting-toggle-info">
            <label for="settingShowPluginNotifications">允许插件发送 VS Code 提示</label>
            <div class="hint">允许本插件在各种操作时发送 VS Code 通知消息</div>
          </div>
        </div>
      </div>

      <button class="save-rules-btn" id="saveSettingsBtn">保存设置</button>
      <div class="status-message" id="settingsSavedMsg">设置已保存！</div>
    </div>
  </div>

  <!-- 模板编辑弹窗 -->
  <div class="template-dialog-overlay" id="templateDialogOverlay">
    <div class="template-dialog">
      <h3 id="templateDialogTitle">添加模板</h3>
      <input type="text" id="templateNameInput" placeholder="模板名称...">
      <textarea id="templateContentInput" placeholder="模板内容，如：请使用中文回复所有内容..."></textarea>
      <div class="dialog-actions">
        <button class="dialog-cancel-btn" id="dialogCancelBtn">取消</button>
        <button class="dialog-save-btn" id="dialogSaveBtn">保存</button>
      </div>
    </div>
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

      // 标签页和规则管理引用
      const chatTabBtn = document.getElementById('chatTabBtn');
      const rulesTabBtn = document.getElementById('rulesTabBtn');
      const settingsTabBtn = document.getElementById('settingsTabBtn');
      const chatTab = document.getElementById('chatTab');
      const rulesTab = document.getElementById('rulesTab');
      const settingsTab = document.getElementById('settingsTab');
      const globalRulesInput = document.getElementById('globalRulesInput');
      const workspaceRulesInput = document.getElementById('workspaceRulesInput');
      const saveRulesBtn = document.getElementById('saveRulesBtn');
      const rulesSavedMsg = document.getElementById('rulesSavedMsg');

      // 新设置页元素引用
      const settingNotifyOnToolCall = document.getElementById('settingNotifyOnToolCall');
      const settingSoundOnToolCall = document.getElementById('settingSoundOnToolCall');
      const settingShowPluginNotifications = document.getElementById('settingShowPluginNotifications');
      const saveSettingsBtn = document.getElementById('saveSettingsBtn');
      const settingsSavedMsg = document.getElementById('settingsSavedMsg');

      // 规则模板库元素引用
      const templateList = document.getElementById('templateList');
      const addTemplateBtn = document.getElementById('addTemplateBtn');
      const templateDialogOverlay = document.getElementById('templateDialogOverlay');
      const templateDialogTitle = document.getElementById('templateDialogTitle');
      const templateNameInput = document.getElementById('templateNameInput');
      const templateContentInput = document.getElementById('templateContentInput');
      const dialogSaveBtn = document.getElementById('dialogSaveBtn');
      const dialogCancelBtn = document.getElementById('dialogCancelBtn');

      var currentTemplates = [];
      var editingTemplateId = null; // null = 新增, string = 编辑

      // 功能4: 撤回功能引用
      const pendingSendArea = document.getElementById('pendingSendArea');
      const pendingCountdown = document.getElementById('pendingCountdown');
      const pendingSendText = document.getElementById('pendingSendText');
      const pendingSendNowBtn = document.getElementById('pendingSendNowBtn');
      const pendingCancelBtn = document.getElementById('pendingCancelBtn');
      const clearBtn = document.getElementById('clearBtn');

      let isWaiting = false; // 是否正在等待用户输入以回复当前 Copilot 请求
      
      // 功能4: 待发送消息的状态
      let pendingMessage = null; // { text: string, timeout: NodeJS.Timeout }
      let pendingCountdownInterval = null;

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
          case 'syncRules':
            // 功能3: 同步规则
            globalRulesInput.value = msg.globalRules || '';
            workspaceRulesInput.value = msg.workspaceRules || '';
            break;
          case 'rulesSaved':
            // 显示规则已保存的提示
            showStatusMessage('规则已保存！', rulesSavedMsg);
            break;
          case 'syncTemplates':
            // 同步规则模板
            currentTemplates = msg.templates || [];
            renderTemplateList();
            break;
          case 'syncSettings':
            // 同步设置项
            settingNotifyOnToolCall.checked = msg.notifyOnToolCall !== false;
            settingSoundOnToolCall.checked = msg.soundOnToolCall === true;
            settingShowPluginNotifications.checked = msg.showPluginNotifications !== false;
            break;
          case 'settingsSaved':
            // 显示设置已保存提示
            showStatusMessage('设置已保存！', settingsSavedMsg);
            break;
          case 'playSound':
            // 播放提示音效
            playNotificationSound();
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
      /** 功能4: 实现 5 秒延迟发送 */
      function sendMessage() {
        const text = inputField.value.trim();
        if (!text) return;

        // 先显示消息在 UI 中（乐观更新）
        addMessage('user', '', text, Date.now());
        
        // 取消任何待发送的消息
        if (pendingMessage) {
          clearTimeout(pendingMessage.timeout);
          clearInterval(pendingCountdownInterval);
        }

        // 清空输入框
        inputField.value = '';
        adjustHeight();
        updateButtonState();

        // 功能4: 设置 5 秒延迟发送
        let remainingSeconds = 5;
        pendingSendText.textContent = text.substring(0, 100) + (text.length > 100 ? '...' : '');
        pendingCountdown.textContent = remainingSeconds + '秒';
        pendingSendArea.classList.add('show');

        // 倒数计时
        pendingCountdownInterval = setInterval(() => {
          remainingSeconds--;
          pendingCountdown.textContent = remainingSeconds + '秒';
          if (remainingSeconds <= 0) {
            clearInterval(pendingCountdownInterval);
          }
        }, 1000);

        // 5 秒后自动发送
        const timeout = setTimeout(() => {
          executeSend(text);
          clearPendingUI();
        }, 5000);

        // 存储待发送消息
        pendingMessage = { text, timeout };

        // 如果正在等待，清除选项
        if (isWaiting) {
          choicesEl.innerHTML = '';
        }
      }

      /** 功能4: 立即发送待发送的消息 */
      function executeSend(text) {
        if (pendingMessage) {
          clearTimeout(pendingMessage.timeout);
          clearInterval(pendingCountdownInterval);
        }
        vscode.postMessage({ type: 'userResponse', text: text });
        pendingMessage = null;
      }

      /** 功能4: 清空待发送 UI */
      function clearPendingUI() {
        pendingSendArea.classList.remove('show');
        if (pendingCountdownInterval) {
          clearInterval(pendingCountdownInterval);
        }
      }

      /** 功能4: 撤回消息 */
      function cancelPendingMessage() {
        if (pendingMessage) {
          clearTimeout(pendingMessage.timeout);
          clearInterval(pendingCountdownInterval);
          pendingMessage = null;
          clearPendingUI();
          // 移除乐观更新展示的用户消息
          var allUserMsgs = messagesEl.querySelectorAll('.message.user');
          if (allUserMsgs.length > 0) {
            allUserMsgs[allUserMsgs.length - 1].remove();
          }
          // 如果没有消息了，显示空状态
          if (!messagesEl.querySelector('.message')) {
            if (emptyStateEl) emptyStateEl.style.display = '';
          }
          showStatusMessage('消息已撤回');
        }
      }

      sendBtn.addEventListener('click', sendMessage);

      // 功能4: 立即发送按钮
      pendingSendNowBtn.addEventListener('click', () => {
        if (pendingMessage) {
          executeSend(pendingMessage.text);
          clearPendingUI();
        }
      });

      // 功能4: 撤回按钮
      pendingCancelBtn.addEventListener('click', () => {
        cancelPendingMessage();
      });

      // 功能5: 清除对话按钮
      clearBtn.addEventListener('click', () => {
        cancelPendingMessage();
        vscode.postMessage({ type: 'clearHistory' });
      });

      activateBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'copyPrompt' });
      });

      // 标签页切换
      function switchTab(tabName) {
        // 先移除所有标签和内容的 active
        chatTab.classList.remove('active');
        rulesTab.classList.remove('active');
        settingsTab.classList.remove('active');
        chatTabBtn.classList.remove('active');
        rulesTabBtn.classList.remove('active');
        settingsTabBtn.classList.remove('active');

        if (tabName === 'chat') {
          chatTab.classList.add('active');
          chatTabBtn.classList.add('active');
        } else if (tabName === 'rules') {
          rulesTab.classList.add('active');
          rulesTabBtn.classList.add('active');
          // 请求同步规则
          vscode.postMessage({ type: 'requestRules' });
        } else if (tabName === 'settings') {
          settingsTab.classList.add('active');
          settingsTabBtn.classList.add('active');
          // 请求同步设置
          vscode.postMessage({ type: 'requestSettings' });
        }
      }

      chatTabBtn.addEventListener('click', () => switchTab('chat'));
      rulesTabBtn.addEventListener('click', () => switchTab('rules'));
      settingsTabBtn.addEventListener('click', () => switchTab('settings'));

      // 保存规则
      saveRulesBtn.addEventListener('click', () => {
        const globalRules = globalRulesInput.value;
        const workspaceRules = workspaceRulesInput.value;
        vscode.postMessage({
          type: 'saveRules',
          globalRules: globalRules,
          workspaceRules: workspaceRules,
        });
      });

      // 保存设置
      saveSettingsBtn.addEventListener('click', () => {
        vscode.postMessage({
          type: 'saveSettings',
          notifyOnToolCall: settingNotifyOnToolCall.checked,
          soundOnToolCall: settingSoundOnToolCall.checked,
          showPluginNotifications: settingShowPluginNotifications.checked,
        });
      });

      // 显示状态消息（支持不同目标元素）
      function showStatusMessage(message, targetEl) {
        var el = targetEl || rulesSavedMsg;
        el.textContent = message;
        el.classList.add('show');
        setTimeout(() => {
          el.classList.remove('show');
        }, 2000);
      }

      /** 播放提示音效（使用 Web Audio API） */
      function playNotificationSound() {
        try {
          var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          var oscillator = audioCtx.createOscillator();
          var gainNode = audioCtx.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          oscillator.frequency.value = 800;
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
          oscillator.start(audioCtx.currentTime);
          oscillator.stop(audioCtx.currentTime + 0.3);
        } catch (e) {
          // 静默失败
        }
      }

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

      /** 轻量级 Markdown 渲染（支持加粗、斜体、行内代码、代码块、列表、标题、编码处理） */
      function renderMarkdown(text) {
        if (!text) return '';
        
        // 第一步：处理各种编码和转义序列
        // 统一处理 \\uXXXX, \\xXX, \\n, \\r, \\t, \\\\ 等转义
        function decodeEscape(match, seq) {
          if (seq === 'n') return String.fromCharCode(10);
          if (seq === 'r') return String.fromCharCode(13);
          if (seq === 't') return String.fromCharCode(9);
          if (seq.charAt(0) === 'u') {
            try { return String.fromCharCode(parseInt(seq.substring(1), 16)); }
            catch(e) { return match; }
          }
          if (seq.charAt(0) === 'x') {
            try { return String.fromCharCode(parseInt(seq.substring(1), 16)); }
            catch(e) { return match; }
          }
          return String.fromCharCode(92);
        }
        // 两次处理：先解码双重转义，再解码单重转义
        text = text.replace(/\\\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|n|r|t|\\\\)/g, decodeEscape);
        text = text.replace(/\\\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|n|r|t|\\\\)/g, decodeEscape);
        
        // 处理 URL 编码的连续字节 (%XX%XX... → 实际字符)
        text = text.replace(/(?:%[0-9a-fA-F]{2}){2,}/g, function(match) {
          try { return decodeURIComponent(match); }
          catch(e) { return match; }
        });
        
        // 处理 HTML 数字实体 (&#xXXXX; 或 &#NNNN;)
        text = text.replace(/&#x([0-9a-fA-F]+);/g, function(match, code) {
          try { return String.fromCodePoint(parseInt(code, 16)); }
          catch(e) { return match; }
        });
        text = text.replace(/&#(\\d+);/g, function(match, code) {
          try { return String.fromCodePoint(parseInt(code, 10)); }
          catch(e) { return match; }
        });
        
        // 第二步：对 HTML 转义（防止 XSS）
        let html = escapeHtml(text);
        
        // 第三步：处理 Markdown 语法
        // 代码块 - 支持可选的语言标识符
        const backtick = String.fromCharCode(96);
        const tripleBacktick = backtick + backtick + backtick;
        const codeBlockRegex = new RegExp(tripleBacktick + '([\\s\\S]*?)' + tripleBacktick, 'g');
        html = html.replace(codeBlockRegex, 
          '<pre style="background:var(--vscode-textCodeBlock-background);padding:8px;border-radius:4px;overflow-x:auto;margin:4px 0;"><code>$1</code></pre>');
        
        // 行内代码
        const inlineCodeRegex = new RegExp(backtick + '([^' + backtick + ']+)' + backtick, 'g');
        html = html.replace(inlineCodeRegex,
          '<code style="background:var(--vscode-textCodeBlock-background);padding:1px 4px;border-radius:3px;">$1</code>');
        
        // 加粗 (**, __)
        html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        
        // 斜体 (*...* 或 _.._) - 避免与加粗冲突
        html = html.replace(/(?<!\\*)\\*(.+?)\\*(?!\\*)/g, '<em>$1</em>');
        html = html.replace(/(?<!_)_(.+?)_(?!_)/g, '<em>$1</em>');
        
        // 标题 (# ## ###)
        html = html.replace(/^### (.+)$/gm, '<strong style="font-size:1.1em;">$1</strong>');
        html = html.replace(/^## (.+)$/gm, '<strong style="font-size:1.2em;">$1</strong>');
        html = html.replace(/^# (.+)$/gm, '<strong style="font-size:1.3em;">$1</strong>');
        
        // 引用块 (> ...> 或 >> ...)
        html = html.replace(/^&gt;\\s*(.+)$/gm, '<blockquote style="border-left:3px solid var(--vscode-focusBorder);padding-left:8px;opacity:0.8;">$1</blockquote>');
        
        // 无序列表 (- 或 * 或 +)
        html = html.replace(/^[\\s]*[-*+] (.+)$/gm, '&nbsp;&nbsp;• $1');
        
        // 有序列表 (1. 2. etc)
        html = html.replace(/^[\\s]*(\\d+)\\.\\s+(.+)$/gm, '&nbsp;&nbsp;$1. $2');
        
        // 分割线 (---, ***, ___)
        html = html.replace(/^[\\s]*(---|___|\\*\\*\\*)\\s*$/gm, '<hr style="border:none;border-top:1px solid var(--vscode-panel-border);margin:8px 0;">');
        
        // 第四步：处理换行符
        html = html.replace(/\\r\\n|\\r|\\n/g, '<br>');
        
        return html;
      }

      // ====== 规则模板库管理 ======
      function renderTemplateList() {
        templateList.innerHTML = '';
        currentTemplates.forEach(function(tpl) {
          var item = document.createElement('div');
          item.className = 'template-item';

          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = tpl.enabled;
          cb.addEventListener('change', function() {
            vscode.postMessage({ type: 'toggleTemplate', id: tpl.id, enabled: cb.checked });
          });

          var info = document.createElement('div');
          info.className = 'template-item-info';
          info.innerHTML = '<div class="template-item-name">' + escapeHtml(tpl.name) + '</div>' +
            '<div class="template-item-preview">' + escapeHtml(tpl.content.substring(0, 50)) + '</div>';

          var actions = document.createElement('div');
          actions.className = 'template-item-actions';

          var editBtn = document.createElement('button');
          editBtn.textContent = '\u270f\ufe0f';
          editBtn.title = '\u7f16\u8f91';
          editBtn.addEventListener('click', function() {
            openTemplateDialog(tpl);
          });

          var delBtn = document.createElement('button');
          delBtn.textContent = '\ud83d\uddd1\ufe0f';
          delBtn.title = '\u5220\u9664';
          delBtn.addEventListener('click', function() {
            vscode.postMessage({ type: 'deleteTemplate', id: tpl.id });
          });

          actions.appendChild(editBtn);
          actions.appendChild(delBtn);

          item.appendChild(cb);
          item.appendChild(info);
          item.appendChild(actions);
          templateList.appendChild(item);
        });
      }

      function openTemplateDialog(tpl) {
        if (tpl) {
          editingTemplateId = tpl.id;
          templateDialogTitle.textContent = '\u7f16\u8f91\u6a21\u677f';
          templateNameInput.value = tpl.name;
          templateContentInput.value = tpl.content;
        } else {
          editingTemplateId = null;
          templateDialogTitle.textContent = '\u6dfb\u52a0\u6a21\u677f';
          templateNameInput.value = '';
          templateContentInput.value = '';
        }
        templateDialogOverlay.classList.add('show');
        templateNameInput.focus();
      }

      function closeTemplateDialog() {
        templateDialogOverlay.classList.remove('show');
        editingTemplateId = null;
      }

      addTemplateBtn.addEventListener('click', function() {
        openTemplateDialog(null);
      });

      dialogCancelBtn.addEventListener('click', closeTemplateDialog);

      templateDialogOverlay.addEventListener('click', function(e) {
        if (e.target === templateDialogOverlay) closeTemplateDialog();
      });

      dialogSaveBtn.addEventListener('click', function() {
        var name = templateNameInput.value.trim();
        var content = templateContentInput.value.trim();
        if (!name || !content) return;

        var template = {
          id: editingTemplateId || ('custom-' + Date.now()),
          name: name,
          content: content,
          enabled: false
        };
        // \u7f16\u8f91\u65f6\u4fdd\u7559\u539f\u6765\u7684\u542f\u7528\u72b6\u6001
        if (editingTemplateId) {
          var existing = currentTemplates.find(function(t) { return t.id === editingTemplateId; });
          if (existing) template.enabled = existing.enabled;
        }
        vscode.postMessage({ type: 'saveTemplate', template: template });
        closeTemplateDialog();
      });

      // 通知 extension 就绪
      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
  }
}
