/**
 * Sidebar Webview Provider - 侧边栏对话面板
 * 负责展示 Copilot 的消息、用户选项和输入框，收集用户响应
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ToolCallParams } from './mcpServer';
import { getSidebarStyles } from './sidebar/styles';
import { getSidebarScript } from './sidebar/script';

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

// ============ Webview 消息协议类型 ============

/** Webview → Extension 的消息类型 */
type WebviewToExtMessage =
  | { type: 'userResponse'; text: string }
  | { type: 'choiceSelected'; choice: string }
  | { type: 'clearHistory' }
  | { type: 'copyPrompt' }
  | { type: 'copyText'; text: string }
  | { type: 'saveRules'; workspaceRules: string }
  | { type: 'requestRules' }
  | { type: 'saveTemplate'; template: RuleTemplate }
  | { type: 'deleteTemplate'; id: string }
  | { type: 'requestTemplates' }
  | { type: 'saveWorkspaceTemplate'; templateIds: string[] }
  | { type: 'requestWorkspaceTemplate' }
  | { type: 'saveSettings'; notifyOnToolCall: boolean; soundOnToolCall: boolean; showPluginNotifications: boolean }
  | { type: 'requestSettings' }
  | { type: 'requestQueueInfo' }
  | { type: 'recallLastQueued' }
  | { type: 'ready' };

/** Extension → Webview 的消息类型 */
type ExtToWebviewMessage =
  | { type: 'showPrompt'; title: string; summary: string; choices: string[]; defaultFeedback: string; timestamp: number; autoResponded: boolean }
  | { type: 'responseAccepted' }
  | { type: 'requestCancelled' }
  | { type: 'historyCleared' }
  | { type: 'syncHistory'; history: Array<{ role: string; title?: string; content: string; timestamp: number }> }
  | { type: 'syncRules'; workspaceRules: string }
  | { type: 'rulesSaved' }
  | { type: 'syncTemplates'; templates: RuleTemplate[] }
  | { type: 'syncWorkspaceTemplate'; templateIds: string[] }
  | { type: 'syncSettings'; notifyOnToolCall: boolean; soundOnToolCall: boolean; showPluginNotifications: boolean }
  | { type: 'settingsSaved' }
  | { type: 'playSound' }
  | { type: 'syncQueue'; count: number; items: string[] }
  | { type: 'queueRecalled'; text: string | null; count: number };

// ============ 常量定义 ============

/** 消息历史最大保存条数 */
const MAX_HISTORY_ENTRIES = 200;
/** 消息队列最大容量 */
const MAX_QUEUE_SIZE = 50;
/** 发送延迟时间（毫秒） */
const SEND_DELAY_MS = 5000;
/** CSP nonce 字符长度 */
const NONCE_LENGTH = 32;

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'copilot-super.panel';

  private webviewView?: vscode.WebviewView;
  private pendingRequest: PendingRequest | null = null;
  private responseQueue: Array<{original: string; full: string}> = []; // 存储用户预先发送的消息（含原始文本和完整文本）
  public onGetPrefix?: () => string; // 获取前置提示词的回调
  public onGetToolName?: () => string; // 获取工具名的回调

  private messageHistory: Array<{
    role: 'copilot' | 'user'; 
    title?: string;
    content: string;
    timestamp: number;
  }> = [];

  // 规则存储 (功能3)
  private workspaceRules: string = '';
  private ruleTemplates: RuleTemplate[] = [];
  // 工作区级别的规则模版：有序的规则ID数组，每个工作区独立缓存
  private workspaceRuleTemplate: string[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {
    // 从持久化存储加载对话历史
    this.messageHistory = context.workspaceState.get('copilot-super.history', []);
    // 从持久化存储加载规则（仅保留工作区规则）
    this.workspaceRules = context.workspaceState.get<string>('copilot-super.workspaceRules', '');
    // 加载规则库（全局共享）
    this.ruleTemplates = context.globalState.get<RuleTemplate[]>('copilot-super.ruleTemplates', []);
    // 加载工作区级别的规则模版（有序ID列表）
    this.workspaceRuleTemplate = context.workspaceState.get<string[]>('copilot-super.workspaceRuleTemplate', []);
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

    // 监听来自 Webview 的消息（使用类型化消息协议）
    webviewView.webview.onDidReceiveMessage((msg: WebviewToExtMessage) => {
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
        case 'copyText':
          // 通过扩展API写入剪贴板（webview中navigator.clipboard可能不可用）
          if (msg.text) {
            vscode.env.clipboard.writeText(msg.text);
          }
          break;
        case 'saveRules':
          // 保存工作区规则
          this.workspaceRules = msg.workspaceRules || '';
          this.context.workspaceState.update('copilot-super.workspaceRules', this.workspaceRules);
          this.postMessage({ type: 'rulesSaved' });
          break;
        case 'requestRules':
          // 返回当前工作区规则
          this.postMessage({
            type: 'syncRules',
            workspaceRules: this.workspaceRules,
          });
          break;
        case 'saveTemplate':
          this.handleSaveTemplate(msg.template as RuleTemplate);
          break;
        case 'deleteTemplate':
          this.handleDeleteTemplate(msg.id as string);
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
        case 'requestQueueInfo':
          // 返回队列状态
          this.syncQueueInfo();
          break;
        case 'recallLastQueued':
          // 撤回队列中最后一条消息
          this.handleRecallLastQueued();
          break;
        case 'saveWorkspaceTemplate':
          // 保存工作区规则模版（有序ID列表）
          this.workspaceRuleTemplate = msg.templateIds || [];
          this.context.workspaceState.update('copilot-super.workspaceRuleTemplate', this.workspaceRuleTemplate);
          break;
        case 'requestWorkspaceTemplate':
          // 返回当前工作区规则模版
          this.postMessage({ type: 'syncWorkspaceTemplate', templateIds: this.workspaceRuleTemplate });
          break;
        case 'ready':
          // Webview 就绪，同步历史记录、规则、模板、设置和队列
          this.syncHistory();
          this.postMessage({
            type: 'syncRules',
            workspaceRules: this.workspaceRules,
          });
          this.postMessage({ type: 'syncTemplates', templates: this.ruleTemplates });
          this.postMessage({ type: 'syncWorkspaceTemplate', templateIds: this.workspaceRuleTemplate });
          this.syncSettings();
          this.syncQueueInfo();
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
      const queued = this.responseQueue.shift()!;
      const response = queued.full;
      
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

      // 队列被消费，同步队列状态到 Webview
      this.syncQueueInfo();

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
      const fullPrefix = this.buildFullPrefix();
      if (fullPrefix) {
        // 添加后缀提醒
        const toolName = this.onGetToolName?.();
        const suffix = toolName ? `，每次任务完成之后请调用${toolName}进行汇报。` : '';
        // 用[待办任务]引导真实任务，避免AI忽略真实任务
        responseText = `${fullPrefix}\n\n[待办任务]\n${text}${suffix}`;
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
    if (this.responseQueue.length >= MAX_QUEUE_SIZE) {
      this.responseQueue.shift(); // 队列已满时移除最旧的消息
    }
    this.responseQueue.push({ original: text, full: responseText });
    // 通知 Webview 更新队列状态
    this.syncQueueInfo();
  }

  /** 获取带规则的完整提示词 */
  getFullPrompt(): string {
    return this.buildFullPrefix();
  }

  /** 构建完整的前缀提示词（prefix + 工作区规则 + 规则模版） */
  private buildFullPrefix(): string {
    if (!this.onGetPrefix) {
      return '';
    }
    const prefix = this.onGetPrefix();
    let result = prefix;
    if (this.workspaceRules.trim()) {
      result = `${result}\n\n[工作区规则]\n${this.workspaceRules}`;
    }
    // 拼接工作区规则模版中的规则（按拖拽顺序，自动加序号）
    const orderedRules = this.workspaceRuleTemplate
      .map(id => this.ruleTemplates.find(t => t.id === id))
      .filter((t): t is RuleTemplate => !!t)
      .map((t, i) => `${i + 1}. ${t.content}`);
    if (orderedRules.length > 0) {
      result = `${result}\n\n[规则模板]\n${orderedRules.join('\n')}`;
    }
    return result;
  }

  /** 持久化对话历史到 workspaceState */
  private saveHistory(): void {
    if (this.messageHistory.length > MAX_HISTORY_ENTRIES) {
      this.messageHistory = this.messageHistory.slice(-MAX_HISTORY_ENTRIES);
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
    // 同时从工作区规则模版中移除
    this.workspaceRuleTemplate = this.workspaceRuleTemplate.filter(tid => tid !== id);
    this.context.workspaceState.update('copilot-super.workspaceRuleTemplate', this.workspaceRuleTemplate);
    this.postMessage({ type: 'syncTemplates', templates: this.ruleTemplates });
    this.postMessage({ type: 'syncWorkspaceTemplate', templateIds: this.workspaceRuleTemplate });
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

  /** 同步队列信息到 Webview，让前端知道还有多少条排队的消息 */
  private syncQueueInfo(): void {
    this.postMessage({
      type: 'syncQueue',
      count: this.responseQueue.length,
      items: this.responseQueue.map(q => q.original),
    });
  }

  /** 撤回队列中最后一条未发送的消息，返回原始文本给 Webview */
  private handleRecallLastQueued(): void {
    if (this.responseQueue.length === 0) {
      this.postMessage({ type: 'queueRecalled', text: null, count: 0 });
      return;
    }
    const recalled = this.responseQueue.pop()!;
    // 同时从消息历史中移除最后一条用户消息（与队列对应）
    for (let i = this.messageHistory.length - 1; i >= 0; i--) {
      if (this.messageHistory[i].role === 'user') {
        this.messageHistory.splice(i, 1);
        break;
      }
    }
    this.saveHistory();
    this.postMessage({
      type: 'queueRecalled',
      text: recalled.original,
      count: this.responseQueue.length,
    });
  }

  private postMessage(msg: ExtToWebviewMessage): void {
    this.webviewView?.webview.postMessage(msg);
  }

  private syncHistory(): void {
    this.postMessage({
      type: 'syncHistory',
      history: this.messageHistory,
    });
  }

  // ============ Webview HTML ============

  /** 生成密码学安全的 CSP nonce 随机字符串 */
  private getNonce(): string {
    return crypto.randomBytes(NONCE_LENGTH).toString('base64url');
  }

  private getHtmlContent(): string {
    // 生成 CSP nonce 用于内联脚本安全
    const nonce = this.getNonce();
    return /*html*/ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>${getSidebarStyles()}</style>
</head>
<body>
  <div class="header" role="banner">
    <div class="status-dot" id="statusDot" role="status" aria-label="状态: 就绪"></div>
    <span class="header-text" id="statusText">MCP 服务就绪</span>
    <span class="queue-badge" id="queueBadge" title="排队中的消息数" aria-live="polite">0</span>
    <button class="header-icon-btn" id="activateBtn" title="复制前置提示词" aria-label="复制前置提示词"><span role="img" aria-hidden="true">📋</span></button>
    <button class="header-icon-btn" id="clearBtn" title="清除对话" aria-label="清除对话"><span role="img" aria-hidden="true">🗑️</span></button>
  </div>

  <!-- 标签页导航 -->
  <div class="tabs" role="tablist" aria-label="面板导航">
    <button class="tab-btn active" role="tab" aria-selected="true" aria-controls="chatTab" data-tab="chat" id="chatTabBtn"><span role="img" aria-hidden="true">💬</span> 对话</button>
    <button class="tab-btn" role="tab" aria-selected="false" aria-controls="rulesTab" data-tab="rules" id="rulesTabBtn"><span role="img" aria-hidden="true">📏</span> 规则</button>
    <button class="tab-btn" role="tab" aria-selected="false" aria-controls="settingsTab" data-tab="settings" id="settingsTabBtn"><span role="img" aria-hidden="true">⚙️</span> 设置</button>
  </div>

  <!-- 对话页面 -->
  <div class="tab-content active" id="chatTab" role="tabpanel" aria-labelledby="chatTabBtn">
    <div class="messages" id="messages" role="log" aria-live="polite">
      <div class="empty-state" id="emptyState">
        <div class="icon" role="img" aria-label="信号">📡</div>
        <div class="title">Copilot Super</div>
        <div class="desc">
          MCP 服务已就绪，等待 Copilot 连接<br><br>
          <strong>快速开始：</strong><br>
          1. 点击上方 <span role="img" aria-hidden="true">📋</span> 复制提示词<br>
          2. 在 Copilot Chat 中粘贴并发送<br>
          3. 在此面板输入指令交互
        </div>
      </div>
    </div>

    <div class="choices" id="choices"></div>

    <!-- 功能4: 待发送消息浮层（toast 样式） -->
    <div class="pending-send-area" id="pendingSendArea" role="alert">
      <div class="pending-send-header">
        <div class="pending-send-title"><span role="img" aria-hidden="true">⏱️</span> 即将发送</div>
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
          aria-label="消息输入框"
        ></textarea>
        <button class="send-btn" id="sendBtn" disabled aria-label="发送消息">发送</button>
      </div>
      <div class="hint-text">Enter 发送 · Ctrl+Enter 直发 · Shift+Enter 换行 <span class="char-count" id="charCount"></span></div>
      <div class="status-message" id="chatStatusMsg" role="status"></div>
    </div>
  </div>

  <!-- 规则页面 -->
  <div class="tab-content" id="rulesTab" role="tabpanel" aria-labelledby="rulesTabBtn">
    <div class="settings-page">
      <div class="setting-group">
        <label>工作区规则</label>
        <div class="hint">仅在当前工作区适用的规则文本，会添加到提示词前缀之后</div>
        <textarea 
          class="rule-textarea" 
          id="workspaceRulesInput" 
          placeholder="输入工作区规则，每条规则占一行或使用段落分隔..."
        ></textarea>
      </div>

      <button class="save-rules-btn" id="saveRulesBtn">保存规则</button>
      <div class="status-message" id="rulesSavedMsg">规则已保存！</div>

      <div class="setting-group">
        <label>规则模版</label>
        <div class="hint">从下方规则库拖入规则，支持拖拽排序，每个工作区独立缓存</div>
        <div class="workspace-template-list" id="workspaceTemplateList">
          <div class="template-drop-placeholder" id="templateDropPlaceholder">将规则从下方拖到此处</div>
        </div>
      </div>

      <div class="setting-group">
        <label>规则库</label>
        <div class="hint">所有可用的规则，拖拽到上方规则模版中使用</div>
        <div class="template-list" id="templateList"></div>
        <button class="add-template-btn" id="addTemplateBtn">+ 添加自定义规则</button>
      </div>
    </div>
  </div>

  <!-- 设置页面 -->
  <div class="tab-content" id="settingsTab" role="tabpanel" aria-labelledby="settingsTabBtn">
    <div class="settings-page">
      <div class="setting-group">
        <label>提示信息设置</label>
        <div class="hint">控制插件的通知和提示行为</div>
      </div>

      <div class="setting-group">
        <div class="setting-toggle">
          <label class="toggle-switch" for="settingNotifyOnToolCall">
            <input type="checkbox" id="settingNotifyOnToolCall" checked>
            <span class="toggle-slider"></span>
          </label>
          <div class="setting-toggle-info">
            <label for="settingNotifyOnToolCall">允许 MCP 调用时提示信息</label>
            <div class="hint">当 Copilot 通过 MCP 工具调用时，在右下角显示通知</div>
          </div>
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-toggle">
          <label class="toggle-switch" for="settingSoundOnToolCall">
            <input type="checkbox" id="settingSoundOnToolCall">
            <span class="toggle-slider"></span>
          </label>
          <div class="setting-toggle-info">
            <label for="settingSoundOnToolCall">允许 MCP 调用时提示音</label>
            <div class="hint">当 Copilot 通过 MCP 工具调用时，播放提示音效</div>
          </div>
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-toggle">
          <label class="toggle-switch" for="settingShowPluginNotifications">
            <input type="checkbox" id="settingShowPluginNotifications" checked>
            <span class="toggle-slider"></span>
          </label>
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
  <div class="template-dialog-overlay" id="templateDialogOverlay" role="dialog" aria-modal="true" aria-labelledby="templateDialogTitle">
    <div class="template-dialog">
      <h3 id="templateDialogTitle">添加规则</h3>
      <input type="text" id="templateNameInput" placeholder="规则名称...">
      <textarea id="templateContentInput" placeholder="规则内容，如：请使用中文回复所有内容..."></textarea>
      <div class="dialog-actions">
        <button class="dialog-cancel-btn" id="dialogCancelBtn">取消</button>
        <button class="dialog-save-btn" id="dialogSaveBtn">保存</button>
      </div>
    </div>
  </div>

  <!-- 自定义右键菜单 -->
  <div class="context-menu" id="contextMenu" role="menu" aria-label="操作菜单">
    <div class="context-menu-item" id="ctxCopy" role="menuitem" tabindex="-1">
      <span class="icon" role="img" aria-hidden="true">📋</span>
      <span>复制</span>
    </div>
    <div class="context-menu-separator" role="separator"></div>
    <div class="context-menu-item" id="ctxRecallQueued" role="menuitem" tabindex="-1">
      <span class="icon" role="img" aria-hidden="true">↩️</span>
      <span>撤回排队消息</span>
    </div>
  </div>

  <script nonce="${nonce}">${getSidebarScript(SEND_DELAY_MS)}</script>
</body>
</html>`;
  }
}
