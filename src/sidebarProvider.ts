/**
 * Sidebar Webview Provider - 侧边栏对话面板
 * 负责展示 Copilot 的消息、用户选项和输入框，收集用户响应
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { ToolCallParams } from './mcpTypes';
import {
  appendHistoryEntry,
  clearHistoryEntries,
  persistHistory,
} from './sidebar/historyStore';
import { buildFullPrefix, buildRulesText } from './sidebar/prefixBuilder';
import {
  clearQueuedResponses,
  shiftQueuedResponse,
  type QueuedResponse,
} from './sidebar/queueManager';
import { buildQueueSyncPayload, recallQueuedResponseView } from './sidebar/queueSync';
import { syncSidebarReadyState } from './sidebar/readySync';
import { getDefaultTemplates, mergeTemplatesFromPrompt, persistTemplates, saveTemplate } from './sidebar/templateStore';
import { deleteTemplate, persistWorkspaceTemplateIds } from './sidebar/templateWorkspaceStore';
import { deleteWorkflow, getDefaultWorkflows, mergeWorkflowsFromPrompt, persistWorkflows, saveWorkflow } from './sidebar/workflowStore';
import {
  type ExtToWebviewMessage,
  type PendingRequest,
  type RuleTemplate,
  type SidebarHistoryEntry,
  type WebviewToExtMessage,
  type Workflow,
  normalizeToolCallParams,
} from './sidebar/types';
import {
  appendUserHistory,
  buildResolvedUserResponse,
  enqueueUserResponse,
  removeQueuedUserHistory,
} from './sidebar/messageFlow';
import { createSidebarMessageHandler } from './sidebar/messageHandler';
import { getSidebarStyles } from './sidebar/styles';
import { buildShowPromptMessage, focusSidebarPanel, notifyToolCall } from './sidebar/toolCallView';

// ============ 常量定义 ============

/** 发送延迟时间（毫秒） */
const SEND_DELAY_MS = 5000;
/** CSP nonce 字符长度 */
const NONCE_LENGTH = 32;
const WEBVIEW_SCRIPT_RELATIVE_PATH = path.join('webview', 'sidebarWebviewApp.js');

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'copilot-super.panel';

  private webviewView?: vscode.WebviewView;
  private pendingRequest: PendingRequest | null = null;
  private responseQueue: QueuedResponse[] = []; // 存储用户预先发送的消息（含原始文本和完整文本）
  public onGetPrefix?: () => string; // 获取前置提示词的回调
  public onGetToolName?: () => string; // 获取工具名的回调

  private messageHistory: SidebarHistoryEntry[] = [];

  // 规则存储 (功能3)
  private globalRules: string = '';
  private ruleTemplates: RuleTemplate[] = [];
  // 工作区级别的规则模版：有序的规则ID数组，每个工作区独立缓存
  private workspaceRuleTemplate: string[] = [];
  private workflows: Workflow[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {
    // 从持久化存储加载对话历史
    this.messageHistory = context.workspaceState.get('copilot-super.history', []);
    // 从持久化存储加载规则（全局共享）
    this.globalRules = vscode.workspace.getConfiguration('copilot-super').get<string>('globalRules', '')
      || context.globalState.get<string>('copilot-super.globalRules', '');
    // 加载规则库（全局共享）
    this.ruleTemplates = context.globalState.get<RuleTemplate[]>('copilot-super.ruleTemplates', []);
    // 加载工作区级别的规则模版（有序ID列表）
    this.workspaceRuleTemplate = context.workspaceState.get<string[]>('copilot-super.workspaceRuleTemplate', []);
    this.workflows = context.globalState.get<Workflow[]>('copilot-super.workflows', []);
    const promptTemplates = getDefaultTemplates(this.context.extensionPath);
    this.ruleTemplates = mergeTemplatesFromPrompt(this.ruleTemplates, promptTemplates);
    context.globalState.update('copilot-super.ruleTemplates', this.ruleTemplates);

    const promptWorkflows = getDefaultWorkflows(this.context.extensionPath);
    this.workflows = mergeWorkflowsFromPrompt(this.workflows, promptWorkflows);
    context.globalState.update('copilot-super.workflows', this.workflows);
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

    const handleMessage = createSidebarMessageHandler({
      resolveUserResponse: (text) => this.resolveUserResponse(text),
      clearHistory: () => this.clearHistory(),
      saveRules: async (globalRules) => {
        this.globalRules = globalRules;
        await vscode.workspace.getConfiguration('copilot-super').update('globalRules', this.globalRules, vscode.ConfigurationTarget.Global);
        await this.context.globalState.update('copilot-super.globalRules', this.globalRules);
        await vscode.commands.executeCommand('copilot-super.refreshWorkspaceFiles');
        this.postMessage({ type: 'rulesSaved' });
      },
      requestRules: () => {
        this.postMessage({ type: 'syncRules', globalRules: this.globalRules });
      },
      saveTemplate: (template) => this.handleSaveTemplate(template),
      deleteTemplate: (id) => this.handleDeleteTemplate(id),
      requestTemplates: () => {
        this.postMessage({ type: 'syncTemplates', templates: this.ruleTemplates });
      },
      saveWorkflow: async (workflow) => this.handleSaveWorkflow(workflow),
      deleteWorkflow: async (id) => this.handleDeleteWorkflow(id),
      requestWorkflows: () => {
        this.postMessage({ type: 'syncWorkflows', workflows: this.workflows });
      },
      runWorkflow: async (id) => this.handlePreviewWorkflow(id),
      confirmRunWorkflow: async (id) => this.handleRunWorkflow(id),
      requestQueueInfo: () => this.syncQueueInfo(),
      recallLastQueued: () => this.handleRecallLastQueued(),
      saveWorkspaceTemplate: async (templateIds) => {
        this.workspaceRuleTemplate = templateIds;
        await this.context.workspaceState.update('copilot-super.workspaceRuleTemplate', this.workspaceRuleTemplate);
        await vscode.commands.executeCommand('copilot-super.refreshWorkspaceFiles');
      },
      requestWorkspaceTemplate: () => {
        this.postMessage({ type: 'syncWorkspaceTemplate', templateIds: this.workspaceRuleTemplate });
      },
      ready: () => {
        syncSidebarReadyState({
          syncHistory: () => this.syncHistory(),
          syncRules: () => this.postMessage({ type: 'syncRules', globalRules: this.globalRules }),
          syncTemplates: () => this.postMessage({ type: 'syncTemplates', templates: this.ruleTemplates }),
          syncWorkspaceTemplate: () => this.postMessage({ type: 'syncWorkspaceTemplate', templateIds: this.workspaceRuleTemplate }),
          syncWorkflows: () => this.postMessage({ type: 'syncWorkflows', workflows: this.workflows }),
          syncQueueInfo: () => this.syncQueueInfo(),
        });
      },
    });

    // 监听来自 Webview 的消息（使用类型化消息协议）
    webviewView.webview.onDidReceiveMessage((msg: WebviewToExtMessage) => {
      handleMessage(msg).catch((error: unknown) => {
        console.error('[SidebarProvider] Failed to handle webview message:', msg.type, error);
      });
    });
  }

  /** 处理工具调用 - 展示信息并等待用户输入 */
  async handleToolCall(params: ToolCallParams): Promise<string> {
    const { title, summary, choices } = normalizeToolCallParams(params);

    // 记录 Copilot 消息 (无论是否立即返回，都记录)
    this.messageHistory = appendHistoryEntry(this.messageHistory, {
      role: 'copilot',
      title,
      content: summary,
      timestamp: Date.now(),
    });
    this.saveHistory();

    // 确保侧边栏可见
    await focusSidebarPanel(this.webviewView);

    // 1. 如果有预先排队的用户消息，立即使用并返回，不进入等待状态
    if (this.responseQueue.length > 0) {
      const queuedResult = shiftQueuedResponse(this.responseQueue);
      this.responseQueue = queuedResult.queue;
      const queued = queuedResult.item;
      // 安全检查：确保队列项存在
      if (!queued) {
        return '';
      }
      const response = queued.full;

      // 更新 Webview 显示 (让用户看到 Copilot 刚才发了什么，虽然已经自动回复了)
      this.postMessage(buildShowPromptMessage({ title, summary, choices }, true));

      // 队列被消费，同步队列状态到 Webview
      this.syncQueueInfo();

      return response;
    }

    // 2. 正常流程：通知用户并等待输入
    const config = vscode.workspace.getConfiguration('copilot-super');
    if (config.get<boolean>('notifyOnToolCall', true)) {
      notifyToolCall(title);
    }

    // 播放提示音（通过 Webview AudioContext）
    if (config.get<boolean>('soundOnToolCall', false)) {
      this.postMessage({ type: 'playSound' });
    }

    // 发送到 Webview
    this.postMessage(buildShowPromptMessage({ title, summary, choices }, false));

    // 等待用户响应
    return new Promise<string>((resolve) => {
      // 清除之前的等待
      if (this.pendingRequest?.timeout) {
        clearTimeout(this.pendingRequest.timeout as NodeJS.Timeout);
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
    this.messageHistory = clearHistoryEntries();
    this.responseQueue = clearQueuedResponses();
    this.saveHistory();
    this.postMessage({ type: 'historyCleared' });
  }

  // ============ 内部方法 ============

  private resolveUserResponse(text: string): void {
    if (!text.trim()) {
      return;
    }

    this.messageHistory = appendUserHistory(this.messageHistory, text);
    this.saveHistory();

    const responseText = buildResolvedUserResponse({
      text,
      prefix: this.onGetPrefix?.(),
      toolName: this.onGetToolName?.(),
      globalRules: this.globalRules,
      workspaceRuleTemplate: this.workspaceRuleTemplate,
      ruleTemplates: this.ruleTemplates,
    });

    // 1. 如果有挂起的 Copilot 请求，立即解决
    if (this.pendingRequest) {
      const { resolve } = this.pendingRequest;
      this.pendingRequest = null;
      resolve(responseText);
      this.postMessage({ type: 'responseAccepted' }); // 更新 UI 状态
      return;
    }

    // 2. 如果没有请求，存入队列，等待下次 Copilot 调用时使用
    this.responseQueue = enqueueUserResponse(this.responseQueue, text, responseText);
    // 通知 Webview 更新队列状态
    this.syncQueueInfo();
  }

  /** 获取带规则的完整提示词 */
  getFullPrompt(): string {
    return this.buildFullPrefix();
  }

  getRulesText(): string {
    return buildRulesText(this.globalRules, this.workspaceRuleTemplate, this.ruleTemplates);
  }

  refresh(): void {
    if (this.webviewView) {
      this.webviewView.webview.html = this.getHtmlContent();
    }
  }

  /** 构建完整的前缀提示词（prefix + 工作区规则 + 规则模版） */
  private buildFullPrefix(): string {
    if (!this.onGetPrefix) {
      return '';
    }

    return buildFullPrefix({
      prefix: this.onGetPrefix(),
      globalRules: this.globalRules,
      workspaceRuleTemplate: this.workspaceRuleTemplate,
      ruleTemplates: this.ruleTemplates,
    });
  }

  /** 持久化对话历史到 workspaceState */
  private saveHistory(): void {
    persistHistory(this.context, this.messageHistory);
  }

  /** 保存(新增/编辑)规则模板 */
  private handleSaveTemplate(template: RuleTemplate): void {
    this.ruleTemplates = saveTemplate(this.ruleTemplates, template);
    persistTemplates(this.context, this.ruleTemplates);
    void vscode.commands.executeCommand('copilot-super.refreshWorkspaceFiles');
    this.postMessage({ type: 'syncTemplates', templates: this.ruleTemplates });
  }

  /** 删除规则模板 */
  private handleDeleteTemplate(id: string): void {
    const result = deleteTemplate(this.ruleTemplates, this.workspaceRuleTemplate, id);
    this.ruleTemplates = result.templates;
    this.workspaceRuleTemplate = result.workspaceTemplateIds;
    persistTemplates(this.context, this.ruleTemplates);
    persistWorkspaceTemplateIds(this.context, this.workspaceRuleTemplate);
    void vscode.commands.executeCommand('copilot-super.refreshWorkspaceFiles');
    this.postMessage({ type: 'syncTemplates', templates: this.ruleTemplates });
    this.postMessage({ type: 'syncWorkspaceTemplate', templateIds: this.workspaceRuleTemplate });
  }

  private async handleSaveWorkflow(workflow: Workflow): Promise<void> {
    this.workflows = saveWorkflow(this.workflows, workflow);
    await persistWorkflows(this.context, this.workflows);
    this.postMessage({ type: 'syncWorkflows', workflows: this.workflows });
  }

  private async handleDeleteWorkflow(id: string): Promise<void> {
    this.workflows = deleteWorkflow(this.workflows, id);
    await persistWorkflows(this.context, this.workflows);
    this.postMessage({ type: 'syncWorkflows', workflows: this.workflows });
  }

  private async handleRunWorkflow(id: string): Promise<void> {
    const workflow = this.workflows.find((item) => item.id === id);
    if (!workflow || workflow.steps.length === 0) {
      return;
    }

    for (const step of workflow.steps) {
      const prompt = step.prompt.trim();
      if (!prompt) {
        continue;
      }

      this.messageHistory = appendUserHistory(this.messageHistory, prompt);
      const responseText = buildResolvedUserResponse({
        text: prompt,
        prefix: this.onGetPrefix?.(),
        toolName: this.onGetToolName?.(),
        globalRules: this.globalRules,
        workspaceRuleTemplate: this.workspaceRuleTemplate,
        ruleTemplates: this.ruleTemplates,
      });
      this.responseQueue = enqueueUserResponse(this.responseQueue, prompt, responseText);
    }

    this.saveHistory();
    this.syncHistory();
    this.syncQueueInfo();
    this.postMessage({
      type: 'workflowRunQueued',
      workflowName: workflow.name,
      stepCount: workflow.steps.filter((item) => item.prompt.trim()).length,
    });
  }

  private async handlePreviewWorkflow(id: string): Promise<void> {
    const workflow = this.workflows.find((item) => item.id === id);
    if (!workflow) {
      return;
    }

    const stepCount = workflow.steps.filter((item) => item.prompt.trim()).length;
    if (stepCount === 0) {
      return;
    }

    this.postMessage({
      type: 'previewWorkflow',
      workflow,
      stepCount,
    });
  }

  /** 同步队列信息到 Webview，让前端知道还有多少条排队的消息 */
  private syncQueueInfo(): void {
    this.postMessage({
      type: 'syncQueue',
      ...buildQueueSyncPayload(this.responseQueue),
    });
  }

  /** 撤回队列中最后一条未发送的消息，返回原始文本给 Webview */
  private handleRecallLastQueued(): void {
    const recallResult = recallQueuedResponseView(this.responseQueue);
    this.responseQueue = recallResult.queue;

    if (!recallResult.payload.text) {
      this.postMessage({ type: 'queueRecalled', ...recallResult.payload });
      return;
    }

    // 同时从消息历史中移除最后一条用户消息（与队列对应）
    this.messageHistory = removeQueuedUserHistory(this.messageHistory);
    this.saveHistory();
    this.postMessage({
      type: 'queueRecalled',
      ...recallResult.payload,
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
    const webviewScript = this.readWebviewScript();
    const webviewBootstrap = JSON.stringify({ sendDelayMs: SEND_DELAY_MS })
      .replace(/&/g, '\\u0026')
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/"/g, '&quot;');
    return /*html*/ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' ${this.webviewView?.webview.cspSource};">
  <style>${getSidebarStyles()}</style>
</head>
<body>
  <div class="header" role="banner">
    <div class="status-dot" id="statusDot" role="status" aria-label="状态: 就绪"></div>
    <span class="header-text" id="statusText">MCP 服务就绪</span>
    <span class="header-state-pill" id="headerStatePill" aria-live="polite">就绪</span>
    <span class="queue-badge" id="queueBadge" title="排队中的消息数" aria-live="polite">0</span>
    <button class="copy-rules-btn" id="copyRulesBtn" title="复制规则" aria-label="复制规则">复制规则</button>
    <button class="activate-prefix-btn" id="activateBtn" title="复制前置提示词" aria-label="复制前置提示词">激活前缀</button>
    <button class="header-icon-btn" id="clearBtn" title="清除对话" aria-label="清除对话"><span role="img" aria-hidden="true">🗑️</span></button>
  </div>

  <!-- 标签页导航 -->
  <div class="tabs" role="tablist" aria-label="面板导航">
    <button class="tab-btn active" role="tab" aria-selected="true" aria-controls="chatTab" data-tab="chat" id="chatTabBtn"><span role="img" aria-hidden="true">💬</span> 对话</button>
    <button class="tab-btn" role="tab" aria-selected="false" aria-controls="rulesTab" data-tab="rules" id="rulesTabBtn"><span role="img" aria-hidden="true">📏</span> 规则</button>
    <button class="tab-btn" role="tab" aria-selected="false" aria-controls="workflowTab" data-tab="workflow" id="workflowTabBtn"><span role="img" aria-hidden="true">🧭</span> 工作流</button>
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
      <div class="queue-hint" id="queueHint" role="status" aria-live="polite">当前无排队消息</div>
      <div class="status-message" id="chatStatusMsg" role="status"></div>
    </div>
  </div>

  <!-- 规则页面 -->
  <div class="tab-content" id="rulesTab" role="tabpanel" aria-labelledby="rulesTabBtn">
    <div class="settings-page">
      <div class="section-step">
        <span class="step-badge">步骤 1</span>
        <span class="step-title">编辑全局规则</span>
      </div>
      <div class="setting-group">
        <label>全局规则</label>
        <div class="hint">在此电脑上打开任意项目时都会生效，并会写入 \`.github/copilot.md\`</div>
        <textarea 
          class="rule-textarea" 
          id="workspaceRulesInput" 
          placeholder="输入全局规则，每条规则占一行或使用段落分隔..."
        ></textarea>
      </div>

      <button class="save-rules-btn" id="saveRulesBtn">保存规则</button>
      <div class="status-message" id="rulesSavedMsg">规则已保存！</div>

      <div class="section-step">
        <span class="step-badge">步骤 2</span>
        <span class="step-title">编排规则模板（拖拽排序）</span>
      </div>
      <div class="setting-group">
        <label>规则模版</label>
        <div class="hint">从下方规则库拖入规则，支持拖拽排序，每个工作区独立缓存</div>
        <div class="workspace-template-list" id="workspaceTemplateList">
          <div class="template-drop-placeholder" id="templateDropPlaceholder">将规则从下方拖到此处</div>
        </div>
      </div>

      <div class="section-step">
        <span class="step-badge">步骤 3</span>
        <span class="step-title">管理规则库（新增/编辑/删除）</span>
      </div>
      <div class="setting-group">
        <label>规则库</label>
        <div class="hint">所有可用的规则，拖拽到上方规则模版中使用</div>
        <div class="template-list" id="templateList"></div>
        <button class="add-template-btn" id="addTemplateBtn">+ 添加自定义规则</button>
      </div>
    </div>
  </div>

  <!-- 工作流页面 -->
  <div class="tab-content" id="workflowTab" role="tabpanel" aria-labelledby="workflowTabBtn">
    <div class="settings-page">
      <div class="section-step">
        <span class="step-badge">步骤 1</span>
        <span class="step-title">选择或新建工作流</span>
      </div>

      <div class="workflow-panel">
        <div class="setting-group">
          <label>工作流</label>
          <div class="hint">把固定流程拆成多条提示词，选中后会按顺序加入待发送队列</div>
        </div>

        <div class="setting-group">
          <label for="workflowList">工作流列表</label>
          <div class="hint">可直接选择“+ 新建工作流”，然后填写并保存</div>
          <select class="rule-textarea" id="workflowList" size="6"></select>
        </div>
      </div>

      <div class="section-step">
        <span class="step-badge">步骤 2</span>
        <span class="step-title">编辑步骤并保存</span>
      </div>

      <div class="workflow-panel">
        <div class="setting-group">
          <label for="workflowNameInput">工作流名称</label>
          <input class="rule-textarea" id="workflowNameInput" placeholder="例如：代码修复流程" />
        </div>

        <div class="setting-group">
          <label>工作流步骤</label>
          <div class="hint">点击“添加步骤”逐条添加提示词，支持拖拽排序</div>
          <div class="workflow-steps-list" id="workflowStepsList">
            <!-- 步骤将动态添加 -->
          </div>
          <button class="add-step-btn" id="addStepBtn" type="button">+ 添加步骤</button>
        </div>

        <div class="dialog-actions workflow-actions">
          <button class="dialog-cancel-btn" id="deleteWorkflowBtn">删除</button>
          <button class="dialog-save-btn" id="runWorkflowBtn">发送工作流</button>
          <button class="dialog-save-btn" id="saveWorkflowBtn">保存工作流</button>
        </div>
      </div>

      <div class="status-message" id="workflowSavedMsg">工作流已更新！</div>
    </div>
  </div>

  <div class="template-dialog-overlay" id="workflowPreviewOverlay" role="dialog" aria-modal="true" aria-labelledby="workflowPreviewTitle">
    <div class="template-dialog">
      <h3 id="workflowPreviewTitle">预览工作流</h3>
      <div class="hint" id="workflowPreviewSummary"></div>
      <div class="workflow-preview-list" id="workflowPreviewList"></div>
      <div class="dialog-actions">
        <button class="dialog-cancel-btn" id="workflowPreviewCancelBtn">取消</button>
        <button class="dialog-save-btn" id="workflowPreviewConfirmBtn">确认发送</button>
      </div>
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

  <script nonce="${nonce}" id="sidebar-webview-bootstrap" data-init="${webviewBootstrap}"></script>
  <script nonce="${nonce}">${webviewScript}</script>
</body>
</html>`;
  }

  private readWebviewScript(): string {
    const candidates = this.getWebviewScriptCandidates();

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf8');
      }
    }

    throw new Error(`Webview script not found. Checked: ${candidates.join(', ')}`);
  }

  private getWebviewScriptCandidates(): string[] {
    const extensionRoot = this.context.extensionPath;
    const distRoot = path.dirname(__filename);

    return [
      path.join(distRoot, WEBVIEW_SCRIPT_RELATIVE_PATH),
      path.join(extensionRoot, 'dist', WEBVIEW_SCRIPT_RELATIVE_PATH),
      path.join(extensionRoot, 'out', WEBVIEW_SCRIPT_RELATIVE_PATH),
      path.join(extensionRoot, 'src', WEBVIEW_SCRIPT_RELATIVE_PATH),
    ];
  }
}
