import { parse as parseMarkdown, use as configureMarked } from 'marked';
import type { ExtToWebviewMessage, RuleTemplate, SidebarHistoryEntry, WebviewToExtMessage, Workflow } from '../sidebar/types';

// 配置 marked：转义原始 HTML，防止 XSS
configureMarked({
  renderer: {
    html({ text }) { return text.replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
  },
});

declare const acquireVsCodeApi: () => {
  postMessage(message: WebviewToExtMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type VscodeApi = ReturnType<typeof acquireVsCodeApi>;

type TabName = 'chat' | 'rules' | 'workflow';
type StatusKind = 'ready' | 'waiting' | 'sent';

type ElementMap = {
  statusDot: HTMLDivElement;
  statusText: HTMLSpanElement;
  headerStatePill: HTMLSpanElement;
  queueBadge: HTMLSpanElement;
  copyRulesBtn: HTMLButtonElement;
  activateBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  messages: HTMLDivElement;
  emptyState: HTMLDivElement;
  choices: HTMLDivElement;
  pendingSendArea: HTMLDivElement;
  pendingCountdown: HTMLDivElement;
  pendingSendText: HTMLDivElement;
  pendingSendNowBtn: HTMLButtonElement;
  pendingCancelBtn: HTMLButtonElement;
  responseInput: HTMLTextAreaElement;
  charCount: HTMLSpanElement;
  queueHint: HTMLDivElement;
  chatStatusMsg: HTMLDivElement;
  sendBtn: HTMLButtonElement;
  rulesTextarea: HTMLTextAreaElement;
  saveRulesBtn: HTMLButtonElement;
  rulesSavedMsg: HTMLDivElement;
  workspaceTemplateList: HTMLDivElement;
  templateDropPlaceholder: HTMLDivElement;
  workflowList: HTMLSelectElement;
  workflowNameInput: HTMLInputElement;
  workflowStepsList: HTMLDivElement;
  addStepBtn: HTMLButtonElement;
  deleteWorkflowBtn: HTMLButtonElement;
  runWorkflowBtn: HTMLButtonElement;
  saveWorkflowBtn: HTMLButtonElement;
  workflowSavedMsg: HTMLDivElement;
  templateList: HTMLDivElement;
  addTemplateBtn: HTMLButtonElement;
  templateDialogOverlay: HTMLDivElement;
  templateNameInput: HTMLInputElement;
  templateContentInput: HTMLTextAreaElement;
  dialogCancelBtn: HTMLButtonElement;
  dialogSaveBtn: HTMLButtonElement;
  previewOverlay: HTMLDivElement;
  previewSummary: HTMLDivElement;
  previewList: HTMLDivElement;
  previewCancelBtn: HTMLButtonElement;
  previewConfirmBtn: HTMLButtonElement;
  contextMenu: HTMLDivElement;
  ctxCopy: HTMLDivElement;
  ctxRecallQueued: HTMLDivElement;
  tabButtons: NodeListOf<HTMLButtonElement>;
  tabContents: NodeListOf<HTMLDivElement>;
};

type SidebarState = {
  history: SidebarHistoryEntry[];
  globalRules: string;
  templates: RuleTemplate[];
  workspaceTemplateIds: string[];
  workflows: Workflow[];
  queueItems: string[];
  pendingText: string | null;
  countdownRemaining: number;
  isAwaitingResponse: boolean;
  activeTab: TabName;
};

type RenderPromptPayload = Extract<ExtToWebviewMessage, { type: 'showPrompt' }>;

type InitPayload = {
  sendDelayMs: number;
};

const NEW_WORKFLOW_OPTION = '__new_workflow__';

/**
 * 定时器管理器
 * 封装 setTimeout/setInterval 的创建和清理，避免资源泄漏
 */
class TimerManager {
  private timeoutId: number | null = null;
  private intervalId: number | null = null;

  setTimeout(callback: () => void, delay: number): void {
    this.clearTimeout();
    this.timeoutId = window.setTimeout(callback, delay);
  }

  setInterval(callback: () => void, delay: number): void {
    this.clearInterval();
    this.intervalId = window.setInterval(callback, delay);
  }

  clearTimeout(): void {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  clearInterval(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  clearAll(): void {
    this.clearTimeout();
    this.clearInterval();
  }

  hasActiveTimer(): boolean {
    return this.timeoutId !== null || this.intervalId !== null;
  }
}

(function bootstrap() {
  const vscode = acquireVsCodeApi();
  const sendDelayMs = readInitPayload().sendDelayMs;
  const state = createInitialState(vscode);
  const elements = queryElements();

  // 使用定时器管理器封装定时器操作
  const pendingTimerManager = new TimerManager();
  let currentPrompt: RenderPromptPayload | null = null;
  let activeWorkflowId = '';
  let editingTemplateId: string | null = null;
  let contextMenuText = '';
  let dragTemplateId: string | null = null;
  let dragWorkspaceTemplateId: string | null = null;
  let editingWorkflowSteps: { id: string; prompt: string }[] = [];
  let dragStepId: string | null = null;

  bindEvents();
  renderAll();
  vscode.postMessage({ type: 'ready' });

  window.addEventListener('message', (event: MessageEvent<ExtToWebviewMessage>) => {
    handleExtensionMessage(event.data);
  });

  function bindEvents(): void {
    elements.sendBtn.addEventListener('click', () => {
      queuePendingResponse(elements.responseInput.value);
    });

    elements.responseInput.addEventListener('input', () => {
      updateInputAssist();
    });

    elements.responseInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') {
        return;
      }
      if (event.shiftKey) {
        return;
      }
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        flushResponse(elements.responseInput.value);
        return;
      }
      queuePendingResponse(elements.responseInput.value);
    });

    elements.workflowList.addEventListener('change', () => {
      const selected = elements.workflowList.value;
      if (selected === NEW_WORKFLOW_OPTION) {
        activeWorkflowId = '';
        fillWorkflowEditor('');
        return;
      }
      activeWorkflowId = selected;
      fillWorkflowEditor(activeWorkflowId);
    });

    elements.runWorkflowBtn.addEventListener('click', () => {
      const id = getSelectedWorkflowId();
      if (id) {
        vscode.postMessage({ type: 'runWorkflow', id });
      }
    });

    elements.saveWorkflowBtn.addEventListener('click', () => {
      saveCurrentWorkflow();
    });

    elements.deleteWorkflowBtn.addEventListener('click', () => {
      const id = getSelectedWorkflowId();
      if (!id) {
        return;
      }
      vscode.postMessage({ type: 'deleteWorkflow', id });
      activeWorkflowId = '';
      elements.workflowList.value = NEW_WORKFLOW_OPTION;
      fillWorkflowEditor('');
      showStatusMessage(elements.workflowSavedMsg, '工作流已删除');
    });

    elements.addTemplateBtn.addEventListener('click', () => {
      openTemplateDialog();
    });

    elements.dialogCancelBtn.addEventListener('click', () => {
      closeTemplateDialog();
    });

    elements.dialogSaveBtn.addEventListener('click', () => {
      saveTemplateFromDialog();
    });

    elements.ctxCopy.addEventListener('click', () => {
      if (contextMenuText) {
        vscode.postMessage({ type: 'copyText', text: contextMenuText });
      }
      hideContextMenu();
    });

    elements.ctxRecallQueued.addEventListener('click', () => {
      if (state.queueItems.length === 0) {
        return;
      }
      vscode.postMessage({ type: 'recallLastQueued' });
      hideContextMenu();
    });

    elements.templateDialogOverlay.addEventListener('click', (event) => {
      if (event.target === elements.templateDialogOverlay) {
        closeTemplateDialog();
      }
    });

    elements.previewOverlay.addEventListener('click', (event) => {
      if (event.target === elements.previewOverlay) {
        elements.previewOverlay.classList.remove('visible');
      }
    });

    elements.workspaceTemplateList.addEventListener('dragover', handleWorkspaceDragOver);
    elements.workspaceTemplateList.addEventListener('dragleave', () => {
      elements.workspaceTemplateList.classList.remove('drag-over');
    });
    elements.workspaceTemplateList.addEventListener('drop', handleWorkspaceDrop);

    elements.workflowNameInput.addEventListener('input', () => {
      if (!activeWorkflowId) {
        activeWorkflowId = `wf_${Date.now()}`;
      }
      updateWorkflowActionState();
    });

    elements.addStepBtn.addEventListener('click', () => {
      addWorkflowStep();
    });

    elements.copyRulesBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'copyRules' });
      flashHeader('已复制规则');
    });

    elements.activateBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'copyPrompt' });
      flashHeader('已复制前置提示词');
    });

    elements.clearBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'clearHistory' });
    });

    elements.pendingSendNowBtn.addEventListener('click', () => {
      flushPendingResponse();
    });

    elements.pendingCancelBtn.addEventListener('click', () => {
      cancelPendingResponse();
    });

    elements.saveRulesBtn.addEventListener('click', () => {
      state.globalRules = elements.rulesTextarea.value;
      persistState();
      vscode.postMessage({ type: 'saveRules', globalRules: state.globalRules });
    });

    elements.tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const tab = (button.dataset.tab || 'chat') as TabName;
        switchTab(tab);
      });
    });

    document.addEventListener('click', () => hideContextMenu());
    document.addEventListener('contextmenu', handleContextMenu);
    updateInputAssist();
  }

  function handleExtensionMessage(message: ExtToWebviewMessage): void {
    switch (message.type) {
      case 'showPrompt':
        currentPrompt = message;
        state.isAwaitingResponse = !message.autoResponded;
        appendCopilotMessage(message.title, message.summary, message.timestamp);
        renderChoices(message.choices);
        updateStatus(message.autoResponded ? 'sent' : 'waiting');
        focusInput();
        persistState();
        return;
      case 'responseAccepted':
        clearPromptUi();
        updateStatus('sent');
        return;
      case 'requestCancelled':
        state.isAwaitingResponse = false;
        clearPromptUi();
        updateStatus('ready');
        persistState();
        return;
      case 'historyCleared':
        state.history = [];
        state.queueItems = [];
        cancelPendingResponse();
        renderHistory();
        renderQueueBadge();
        persistState();
        return;
      case 'syncHistory':
        state.history = message.history;
        renderHistory();
        persistState();
        return;
      case 'syncRules':
        state.globalRules = message.globalRules;
        elements.rulesTextarea.value = message.globalRules;
        persistState();
        return;
      case 'rulesSaved':
        flashHeader('规则已保存');
        showStatusMessage(elements.rulesSavedMsg, '规则已保存');
        return;
      case 'syncTemplates':
        state.templates = message.templates;
        renderTemplates();
        persistState();
        return;
      case 'syncWorkspaceTemplate':
        state.workspaceTemplateIds = message.templateIds;
        renderTemplates();
        persistState();
        return;
      case 'syncWorkflows':
        state.workflows = message.workflows;
        renderWorkflows();
        persistState();
        return;
      case 'previewWorkflow':
        showWorkflowPreview(message.workflow, message.stepCount);
        return;
      case 'workflowRunQueued':
        flashHeader(`工作流已入队：${message.stepCount} 步`);
        showStatusMessage(elements.workflowSavedMsg, `工作流已入队（${message.stepCount} 步）`);
        return;
      case 'playSound':
        playBeep();
        return;
      case 'syncQueue':
        state.queueItems = message.items;
        renderQueueBadge();
        updateInputAssist();
        persistState();
        return;
      case 'queueRecalled':
        state.queueItems = state.queueItems.slice(0, message.count);
        if (message.text) {
          // Remove the last user message from history (matches extension-side removal)
          for (let i = state.history.length - 1; i >= 0; i--) {
            if (state.history[i].role === 'user') {
              state.history.splice(i, 1);
              break;
            }
          }
          renderHistory();
          elements.responseInput.value = message.text;
          elements.responseInput.focus();
        }
        renderQueueBadge();
        updateInputAssist();
        persistState();
        return;
    }
  }

  function queuePendingResponse(rawText: string): void {
    const text = rawText.trim();
    if (!text) {
      return;
    }

    cancelPendingResponse();
    state.pendingText = text;
    state.countdownRemaining = Math.ceil(sendDelayMs / 1000);
    elements.pendingSendText.textContent = text;
    elements.pendingSendArea.classList.add('visible');
    renderCountdown();

    pendingTimerManager.setTimeout(() => {
      flushPendingResponse();
    }, sendDelayMs);

    pendingTimerManager.setInterval(() => {
      state.countdownRemaining = Math.max(0, state.countdownRemaining - 1);
      renderCountdown();
    }, 1000);

    showStatusMessage(elements.chatStatusMsg, '消息已加入待发送队列');
    updateInputAssist();
    persistState();
  }

  function flushPendingResponse(): void {
    flushResponse(state.pendingText ?? '');
  }

  function cancelPendingResponse(): void {
    pendingTimerManager.clearAll();

    state.pendingText = null;
    state.countdownRemaining = 0;
    elements.pendingSendArea.classList.remove('visible');
    elements.pendingSendText.textContent = '';
    renderCountdown();

    // Pending messages are local-only (not yet flushed to extension queue),
    // so we must NOT send recallLastQueued here to avoid removing unrelated queued messages.

    updateInputAssist();
    persistState();
  }

  function clearPromptUi(): void {
    currentPrompt = null;
    state.isAwaitingResponse = false;
    renderChoices([]);
    persistState();
  }

  function renderAll(): void {
    elements.rulesTextarea.value = state.globalRules;
    renderHistory();
    renderTemplates();
    renderWorkflows();
    renderQueueBadge();
    renderCountdown();
    updateInputAssist();
    switchTab(state.activeTab, false);

    if (state.pendingText) {
      elements.pendingSendText.textContent = state.pendingText;
      elements.pendingSendArea.classList.add('visible');
    }
  }

  function renderHistory(): void {
    elements.messages.innerHTML = '';
    const fragment = document.createDocumentFragment();

    if (state.history.length === 0) {
      elements.emptyState.style.display = 'flex';
      elements.messages.appendChild(elements.emptyState);
      return;
    }

    elements.emptyState.style.display = 'none';
    for (const entry of state.history) {
      fragment.appendChild(createMessageNode(entry));
    }
    elements.messages.appendChild(fragment);
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  function appendCopilotMessage(title: string, summary: string, timestamp: number): void {
    state.history.push({ role: 'copilot', title, content: summary, timestamp });
    renderHistory();
  }

  function appendUserMessage(content: string): void {
    state.history.push({ role: 'user', content, timestamp: Date.now() });
    renderHistory();
  }

  function createMessageNode(entry: SidebarHistoryEntry): HTMLDivElement {
    const item = document.createElement('div');
    item.className = `message-item ${entry.role}`;

    const body = document.createElement('div');
    body.className = 'message-body';
    body.innerHTML = entry.role === 'copilot' ? renderMarkdown(entry.content) : renderPlainText(entry.content);

    item.appendChild(body);
    return item;
  }

  function renderChoices(choices: string[]): void {
    elements.choices.innerHTML = '';
    for (const choice of choices) {
      const button = document.createElement('button');
      button.className = 'choice-btn';
      button.textContent = choice;
      button.addEventListener('click', () => {
        appendUserMessage(choice);
        vscode.postMessage({ type: 'choiceSelected', choice });
        clearPromptUi();
      });
      elements.choices.appendChild(button);
    }
  }

  function renderTemplates(): void {
    elements.templateList.innerHTML = state.templates.map((template) => {
      const preview = template.content.split('\n')[0] || template.content;
      const isInWorkspace = state.workspaceTemplateIds.includes(template.id);
      const isLocked = template.locked === true;
      // 锁定的规则已在全局生效，不需要单独添加
      const showAddBtn = !isLocked && !isInWorkspace;
      const addBtnText = isLocked ? '全局' : (isInWorkspace ? '已添加' : '添加');
      return `<div class="template-item${isLocked ? ' locked' : ''}" draggable="true" data-template-id="${escapeHtml(template.id)}">
        <span class="template-item-drag-handle">⋮⋮</span>
        <div class="template-item-info" data-template-edit="${escapeHtml(template.id)}">
          <div class="template-item-name">${escapeHtml(template.name)}${isLocked ? ' 🔒' : ''}</div>
          <div class="template-item-preview">${escapeHtml(preview)}</div>
        </div>
        <div class="template-item-actions">
          <button type="button" class="lock-btn${isLocked ? ' locked' : ''}" data-template-lock="${escapeHtml(template.id)}" title="${isLocked ? '点击解锁' : '点击锁定'}">${isLocked ? '🔓' : '🔒'}</button>
          <button type="button" data-template-add="${escapeHtml(template.id)}"${showAddBtn ? '' : ' disabled'}>${addBtnText}</button>
          <button type="button" data-template-edit="${escapeHtml(template.id)}">编辑</button>
          <button type="button" data-template-delete="${escapeHtml(template.id)}">删除</button>
        </div>
      </div>`;
    }).join('');

    renderWorkspaceTemplates();

    elements.templateList.querySelectorAll<HTMLElement>('[data-template-edit]').forEach((node) => {
      node.addEventListener('click', () => openTemplateDialog(node.dataset.templateEdit || null));
    });
    elements.templateList.querySelectorAll<HTMLElement>('[data-template-delete]').forEach((node) => {
      node.addEventListener('click', () => {
        const id = node.dataset.templateDelete;
        if (id) {
          vscode.postMessage({ type: 'deleteTemplate', id });
        }
      });
    });
    elements.templateList.querySelectorAll<HTMLElement>('[data-template-add]').forEach((node) => {
      node.addEventListener('click', () => {
        const id = node.dataset.templateAdd;
        // 只有未锁定且未在工作区的规则才能添加
        const template = state.templates.find((t) => t.id === id);
        if (id && template && !template.locked && !state.workspaceTemplateIds.includes(id)) {
          toggleWorkspaceTemplate(id);
        }
      });
    });
    elements.templateList.querySelectorAll<HTMLElement>('[data-template-lock]').forEach((node) => {
      node.addEventListener('click', () => {
        const id = node.dataset.templateLock;
        if (id) {
          vscode.postMessage({ type: 'toggleTemplateLock', id });
        }
      });
    });
    elements.templateList.querySelectorAll<HTMLDivElement>('.template-item').forEach((item) => {
      item.addEventListener('dragstart', () => {
        dragTemplateId = item.dataset.templateId || null;
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => {
        dragTemplateId = null;
        item.classList.remove('dragging');
      });
    });
  }

  function renderWorkflows(): void {
    const options = state.workflows.map((workflow) => {
      return `<option value="${escapeHtml(workflow.id)}">${escapeHtml(workflow.name)}</option>`;
    }).join('');
    elements.workflowList.innerHTML = `<option value="${NEW_WORKFLOW_OPTION}">+ 新建工作流</option>${options}`;

    if (!activeWorkflowId && state.workflows.length > 0) {
      activeWorkflowId = state.workflows[0].id;
    }
    if (activeWorkflowId && state.workflows.some((item) => item.id === activeWorkflowId)) {
      elements.workflowList.value = activeWorkflowId;
    } else {
      elements.workflowList.value = NEW_WORKFLOW_OPTION;
    }

    const selected = elements.workflowList.value;
    if (selected === NEW_WORKFLOW_OPTION) {
      fillWorkflowEditor('');
    } else {
      fillWorkflowEditor(selected || activeWorkflowId);
    }
    updateWorkflowActionState();
  }

  function renderQueueBadge(): void {
    const count = state.queueItems.length;
    elements.queueBadge.textContent = String(count);
    elements.queueBadge.classList.toggle('visible', count > 0);
    elements.queueBadge.title = count > 0 ? `排队中的消息数：${count}` : '排队中的消息数';
    elements.queueHint.textContent = count > 0 ? `当前有 ${count} 条排队消息` : '当前无排队消息';
    elements.queueHint.classList.toggle('active', count > 0);
  }

  function renderCountdown(): void {
    const seconds = Math.max(0, state.countdownRemaining);
    elements.pendingCountdown.textContent = `${seconds}秒`;
  }

  function switchTab(tab: TabName, persist = true): void {
    state.activeTab = tab;
    elements.tabButtons.forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    elements.tabContents.forEach((panel) => {
      panel.classList.toggle('active', panel.id === `${tab}Tab`);
    });
    if (persist) {
      persistState();
    }
  }

  function updateStatus(kind: StatusKind): void {
    elements.statusDot.dataset.state = kind;
    if (kind === 'waiting') {
      elements.statusText.textContent = '等待用户响应';
      elements.headerStatePill.textContent = '等待中';
      return;
    }
    if (kind === 'sent') {
      elements.statusText.textContent = '消息已发送';
      elements.headerStatePill.textContent = '已发送';
      return;
    }
    elements.statusText.textContent = 'MCP 服务就绪';
    elements.headerStatePill.textContent = '就绪';
  }

  function flushResponse(rawText: string): void {
    const text = rawText.trim();
    if (!text) {
      return;
    }
    cancelPendingResponse();
    appendUserMessage(text);
    vscode.postMessage({ type: 'userResponse', text });
    elements.responseInput.value = '';
    updateInputAssist();
    updateStatus('ready');
    persistState();
  }

  function updateInputAssist(): void {
    const length = elements.responseInput.value.length;
    elements.charCount.textContent = `${length} 字`;
    elements.charCount.classList.toggle('warning', length > 2000);
    elements.sendBtn.disabled = elements.responseInput.value.trim().length === 0;
  }

  /** 状态消息定时器缓存 */
  const statusMessageTimers = new Map<HTMLDivElement, number>();

  function showStatusMessage(element: HTMLDivElement, text: string): void {
    element.textContent = text;
    element.classList.add('show');
    // 清除之前的定时器
    const existingTimer = statusMessageTimers.get(element);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }
    const timer = window.setTimeout(() => {
      element.classList.remove('show');
      statusMessageTimers.delete(element);
    }, 1400);
    statusMessageTimers.set(element, timer);
  }

  function renderWorkspaceTemplates(): void {
    const orderedTemplates = state.workspaceTemplateIds
      .map((id) => state.templates.find((item) => item.id === id))
      .filter((item): item is RuleTemplate => Boolean(item));

    elements.workspaceTemplateList.innerHTML = '';
    elements.workspaceTemplateList.appendChild(elements.templateDropPlaceholder);
    elements.templateDropPlaceholder.style.display = orderedTemplates.length === 0 ? 'block' : 'none';

    for (const template of orderedTemplates) {
      const item = document.createElement('div');
      item.className = 'workspace-template-item';
      item.draggable = true;
      item.dataset.workspaceTemplateId = template.id;
      item.innerHTML = `<span class="wt-drag-handle">⋮⋮</span><span class="wt-name">${escapeHtml(template.name)}</span><button class="wt-remove" type="button" title="移除">×</button>`;
      item.querySelector<HTMLButtonElement>('.wt-remove')?.addEventListener('click', () => {
        toggleWorkspaceTemplate(template.id);
      });
      item.addEventListener('dragstart', () => {
        dragWorkspaceTemplateId = template.id;
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => {
        dragWorkspaceTemplateId = null;
        item.classList.remove('dragging');
      });
      elements.workspaceTemplateList.appendChild(item);
    }
  }

  function openTemplateDialog(templateId: string | null = null): void {
    editingTemplateId = templateId;
    const template = templateId ? state.templates.find((item) => item.id === templateId) : null;
    elements.templateNameInput.value = template?.name || '';
    elements.templateContentInput.value = template?.content || '';
    elements.templateDialogOverlay.classList.add('show');
    elements.templateNameInput.focus();
  }

  function closeTemplateDialog(): void {
    editingTemplateId = null;
    elements.templateDialogOverlay.classList.remove('show');
  }

  function saveTemplateFromDialog(): void {
    const name = elements.templateNameInput.value.trim();
    const content = elements.templateContentInput.value.trim();
    if (!name || !content) {
      return;
    }
    const id = editingTemplateId || `tpl_${Date.now()}`;
    // 编辑已有模板时，保留原有的 locked/enabled 状态
    const existing = editingTemplateId ? state.templates.find((t) => t.id === editingTemplateId) : null;
    const template = {
      id,
      name,
      content,
      enabled: existing?.enabled ?? false,
      locked: existing?.locked,
    };
    vscode.postMessage({ type: 'saveTemplate', template });
    closeTemplateDialog();
  }

  function fillWorkflowEditor(workflowId: string): void {
    const workflow = state.workflows.find((item) => item.id === workflowId);
    if (!workflow) {
      elements.workflowNameInput.value = '';
      editingWorkflowSteps = [];
      renderWorkflowSteps();
      updateWorkflowActionState();
      return;
    }
    activeWorkflowId = workflow.id;
    elements.workflowNameInput.value = workflow.name;
    editingWorkflowSteps = workflow.steps.map((step) => ({ id: step.id, prompt: step.prompt }));
    renderWorkflowSteps();
    updateWorkflowActionState();
  }

  function renderWorkflowSteps(): void {
    elements.workflowStepsList.innerHTML = '';
    
    if (editingWorkflowSteps.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'workflow-steps-empty';
      empty.textContent = '点击下方按钮添加步骤';
      elements.workflowStepsList.appendChild(empty);
      return;
    }

    editingWorkflowSteps.forEach((step, index) => {
      const item = createWorkflowStepItem(step, index + 1);
      elements.workflowStepsList.appendChild(item);
    });
  }

  function createWorkflowStepItem(step: { id: string; prompt: string }, number: number): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'workflow-step-item';
    item.draggable = true;
    item.dataset.stepId = step.id;

    item.innerHTML = `
      <span class="workflow-step-drag-handle">⋮⋮</span>
      <span class="workflow-step-number">${number}</span>
      <textarea class="workflow-step-input" placeholder="输入提示词..." rows="2">${escapeHtml(step.prompt)}</textarea>
      <button class="workflow-step-delete" type="button" title="删除此步骤">×</button>
    `;

    const input = item.querySelector<HTMLTextAreaElement>('.workflow-step-input');
    const deleteBtn = item.querySelector<HTMLButtonElement>('.workflow-step-delete');

    input?.addEventListener('input', () => {
      const stepData = editingWorkflowSteps.find((s) => s.id === step.id);
      if (stepData) {
        stepData.prompt = input.value;
      }
      if (!activeWorkflowId) {
        activeWorkflowId = `wf_${Date.now()}`;
      }
    });

    deleteBtn?.addEventListener('click', () => {
      editingWorkflowSteps = editingWorkflowSteps.filter((s) => s.id !== step.id);
      renderWorkflowSteps();
    });

    // Drag and drop
    item.addEventListener('dragstart', () => {
      dragStepId = step.id;
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      dragStepId = null;
      item.classList.remove('dragging');
      item.classList.remove('drop-target-top');
      item.classList.remove('drop-target-bottom');
    });

    item.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (dragStepId && dragStepId !== step.id) {
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (event.clientY < midY) {
          item.classList.add('drop-target-top');
          item.classList.remove('drop-target-bottom');
        } else {
          item.classList.add('drop-target-bottom');
          item.classList.remove('drop-target-top');
        }
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drop-target-top');
      item.classList.remove('drop-target-bottom');
    });

    item.addEventListener('drop', (event) => {
      event.preventDefault();
      item.classList.remove('drop-target-top');
      item.classList.remove('drop-target-bottom');
      
      if (!dragStepId || dragStepId === step.id) {
        return;
      }

      const dragIndex = editingWorkflowSteps.findIndex((s) => s.id === dragStepId);
      const targetIndex = editingWorkflowSteps.findIndex((s) => s.id === step.id);
      
      if (dragIndex < 0 || targetIndex < 0) {
        return;
      }

      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const insertIndex = event.clientY < midY ? targetIndex : targetIndex + 1;

      const [draggedStep] = editingWorkflowSteps.splice(dragIndex, 1);
      
      const adjustedIndex = insertIndex > dragIndex ? insertIndex - 1 : insertIndex;
      editingWorkflowSteps.splice(adjustedIndex, 0, draggedStep);
      
      renderWorkflowSteps();
    });

    return item;
  }

  function addWorkflowStep(): void {
    const newStep = {
      id: `step_${Date.now()}`,
      prompt: ''
    };
    editingWorkflowSteps.push(newStep);
    renderWorkflowSteps();
    
    if (!activeWorkflowId) {
      activeWorkflowId = `wf_${Date.now()}`;
    }

    // Focus on the new input
    const inputs = elements.workflowStepsList.querySelectorAll<HTMLTextAreaElement>('.workflow-step-input');
    const lastInput = inputs[inputs.length - 1];
    lastInput?.focus();
  }

  function saveCurrentWorkflow(): void {
    const name = elements.workflowNameInput.value.trim();
    const steps = editingWorkflowSteps
      .filter((step) => step.prompt.trim().length > 0)
      .map((step, index) => ({ id: step.id || `step_${index + 1}_${Date.now()}`, prompt: step.prompt.trim() }));
    
    if (!name || steps.length === 0) {
      showStatusMessage(elements.workflowSavedMsg, '请填写名称和至少一个步骤');
      return;
    }
    
    const selectedId = getSelectedWorkflowId();
    const id = selectedId || activeWorkflowId || `wf_${Date.now()}`;
    activeWorkflowId = id;
    vscode.postMessage({ type: 'saveWorkflow', workflow: { id, name, steps } });
    elements.workflowList.value = id;
    updateWorkflowActionState();
    showStatusMessage(elements.workflowSavedMsg, '工作流已保存');
  }

  function getSelectedWorkflowId(): string {
    const selected = elements.workflowList.value;
    if (!selected || selected === NEW_WORKFLOW_OPTION) {
      return '';
    }
    return selected;
  }

  function updateWorkflowActionState(): void {
    const existing = Boolean(getSelectedWorkflowId());
    elements.runWorkflowBtn.disabled = !existing;
    elements.deleteWorkflowBtn.disabled = !existing;
  }

  function handleWorkspaceDragOver(event: DragEvent): void {
    event.preventDefault();
    elements.workspaceTemplateList.classList.add('drag-over');
  }

  function handleWorkspaceDrop(event: DragEvent): void {
    event.preventDefault();
    elements.workspaceTemplateList.classList.remove('drag-over');
    if (dragTemplateId && !state.workspaceTemplateIds.includes(dragTemplateId)) {
      state.workspaceTemplateIds = [...state.workspaceTemplateIds, dragTemplateId];
      vscode.postMessage({ type: 'saveWorkspaceTemplate', templateIds: state.workspaceTemplateIds });
      renderTemplates();
      persistState();
      return;
    }
    if (!dragWorkspaceTemplateId) {
      return;
    }
    const targetItem = (event.target as HTMLElement | null)?.closest('.workspace-template-item') as HTMLDivElement | null;
    if (!targetItem) {
      return;
    }
    const targetId = targetItem.dataset.workspaceTemplateId;
    if (!targetId || targetId === dragWorkspaceTemplateId) {
      return;
    }
    const ids = state.workspaceTemplateIds.filter((id) => id !== dragWorkspaceTemplateId);
    const targetIndex = ids.indexOf(targetId);
    if (targetIndex < 0) {
      return;
    }
    ids.splice(targetIndex, 0, dragWorkspaceTemplateId);
    state.workspaceTemplateIds = ids;
    vscode.postMessage({ type: 'saveWorkspaceTemplate', templateIds: state.workspaceTemplateIds });
    renderTemplates();
    persistState();
  }

  function focusInput(): void {
    elements.responseInput.focus();
    elements.responseInput.setSelectionRange(elements.responseInput.value.length, elements.responseInput.value.length);
  }

  function flashHeader(text: string): void {
    const previous = elements.headerStatePill.textContent || '';
    elements.headerStatePill.textContent = text;
    window.setTimeout(() => {
      if (elements.headerStatePill.textContent === text) {
        elements.headerStatePill.textContent = previous || '就绪';
      }
    }, 1500);
  }

  function toggleWorkspaceTemplate(id: string): void {
    const exists = state.workspaceTemplateIds.includes(id);
    state.workspaceTemplateIds = exists
      ? state.workspaceTemplateIds.filter((item) => item !== id)
      : [...state.workspaceTemplateIds, id];
    renderTemplates();
    persistState();
    vscode.postMessage({ type: 'saveWorkspaceTemplate', templateIds: state.workspaceTemplateIds });
  }

  function showWorkflowPreview(workflow: Workflow, stepCount: number): void {
    const steps = workflow.steps.filter((item) => item.prompt.trim());
    
    // 构建更清晰的预览列表，每个步骤带序号和分隔
    const stepsHtml = steps.map((item, index) => `
      <div class="workflow-preview-item">
        <span class="workflow-preview-index">${index + 1}</span>
        <div class="workflow-preview-content">${escapeHtml(item.prompt)}</div>
      </div>
    `).join('');
    
    elements.previewSummary.textContent = `共 ${stepCount} 步，确认后将按顺序入队。`;
    elements.previewList.innerHTML = stepsHtml;
    elements.previewOverlay.classList.add('visible');
    const onConfirm = () => {
      vscode.postMessage({ type: 'confirmRunWorkflow', id: workflow.id });
      elements.previewOverlay.classList.remove('visible');
    };
    elements.previewConfirmBtn.onclick = onConfirm;
    elements.previewCancelBtn.onclick = () => {
      elements.previewOverlay.classList.remove('visible');
    };
  }

  function handleContextMenu(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const textContainer = target.closest('.message-body');
    if (!textContainer) {
      hideContextMenu();
      return;
    }
    event.preventDefault();
    contextMenuText = textContainer.textContent || '';
    elements.contextMenu.style.left = `${event.clientX}px`;
    elements.contextMenu.style.top = `${event.clientY}px`;
    elements.contextMenu.classList.add('visible');
    const disabled = state.queueItems.length === 0;
    elements.ctxRecallQueued.classList.toggle('disabled', disabled);
  }

  function hideContextMenu(): void {
    elements.contextMenu.classList.remove('visible');
    contextMenuText = '';
  }

  /** 渲染 Markdown（Copilot 消息使用 marked 库解析） */
  function renderMarkdown(content: string): string {
    try {
      return parseMarkdown(content, { breaks: true }) as string;
    } catch {
      return escapeHtml(content).replace(/\n/g, '<br>');
    }
  }

  /** 纯文本渲染（用户消息使用转义 + 换行） */
  function renderPlainText(content: string): string {
    return escapeHtml(content).replace(/\n/g, '<br>');
  }

  /** 音频上下文（复用以避免重复创建） */
  let sharedAudioContext: AudioContext | null = null;

  function playBeep(): void {
    try {
      // 复用音频上下文，避免每次创建新实例
      if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
        sharedAudioContext = new AudioContext();
      }
      // 如果上下文被暂停（某些浏览器策略），尝试恢复
      if (sharedAudioContext.state === 'suspended') {
        void sharedAudioContext.resume();
      }
      const oscillator = sharedAudioContext.createOscillator();
      const gain = sharedAudioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(sharedAudioContext.destination);
      oscillator.start();
      oscillator.stop(sharedAudioContext.currentTime + 0.15);
    } catch {
      // 忽略音频播放错误（可能是浏览器策略限制）
    }
  }

  /** 防抖持久化：批量合并短时间内的多次 setState 调用 */
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  function persistState(): void {
    if (persistTimer !== null) {
      return;
    }
    persistTimer = setTimeout(() => {
      vscode.setState(state);
      persistTimer = null;
    }, 100);
  }

  function createInitialState(api: VscodeApi): SidebarState {
    const saved = api.getState() as Partial<SidebarState> | undefined;
    return {
      history: saved?.history ?? [],
      globalRules: saved?.globalRules ?? '',
      templates: saved?.templates ?? [],
      workspaceTemplateIds: saved?.workspaceTemplateIds ?? [],
      workflows: saved?.workflows ?? [],
      queueItems: saved?.queueItems ?? [],
      pendingText: saved?.pendingText ?? null,
      countdownRemaining: saved?.countdownRemaining ?? 0,
      isAwaitingResponse: saved?.isAwaitingResponse ?? false,
      activeTab: saved?.activeTab ?? 'chat',
    };
  }

  function queryElements(): ElementMap {
    return {
      statusDot: requiredElement<HTMLDivElement>('statusDot'),
      statusText: requiredElement<HTMLSpanElement>('statusText'),
      headerStatePill: requiredElement<HTMLSpanElement>('headerStatePill'),
      queueBadge: requiredElement<HTMLSpanElement>('queueBadge'),
      copyRulesBtn: requiredElement<HTMLButtonElement>('copyRulesBtn'),
      activateBtn: requiredElement<HTMLButtonElement>('activateBtn'),
      clearBtn: requiredElement<HTMLButtonElement>('clearBtn'),
      messages: requiredElement<HTMLDivElement>('messages'),
      emptyState: requiredElement<HTMLDivElement>('emptyState'),
      choices: requiredElement<HTMLDivElement>('choices'),
      pendingSendArea: requiredElement<HTMLDivElement>('pendingSendArea'),
      pendingCountdown: requiredElement<HTMLDivElement>('pendingCountdown'),
      pendingSendText: requiredElement<HTMLDivElement>('pendingSendText'),
      pendingSendNowBtn: requiredElement<HTMLButtonElement>('pendingSendNowBtn'),
      pendingCancelBtn: requiredElement<HTMLButtonElement>('pendingCancelBtn'),
      responseInput: requiredElement<HTMLTextAreaElement>('inputField'),
      charCount: requiredElement<HTMLSpanElement>('charCount'),
      queueHint: requiredElement<HTMLDivElement>('queueHint'),
      chatStatusMsg: requiredElement<HTMLDivElement>('chatStatusMsg'),
      sendBtn: requiredElement<HTMLButtonElement>('sendBtn'),
      rulesTextarea: requiredElement<HTMLTextAreaElement>('workspaceRulesInput'),
      saveRulesBtn: requiredElement<HTMLButtonElement>('saveRulesBtn'),
      rulesSavedMsg: requiredElement<HTMLDivElement>('rulesSavedMsg'),
      workspaceTemplateList: requiredElement<HTMLDivElement>('workspaceTemplateList'),
      templateDropPlaceholder: requiredElement<HTMLDivElement>('templateDropPlaceholder'),
      workflowList: requiredElement<HTMLSelectElement>('workflowList'),
      workflowNameInput: requiredElement<HTMLInputElement>('workflowNameInput'),
      workflowStepsList: requiredElement<HTMLDivElement>('workflowStepsList'),
      addStepBtn: requiredElement<HTMLButtonElement>('addStepBtn'),
      deleteWorkflowBtn: requiredElement<HTMLButtonElement>('deleteWorkflowBtn'),
      runWorkflowBtn: requiredElement<HTMLButtonElement>('runWorkflowBtn'),
      saveWorkflowBtn: requiredElement<HTMLButtonElement>('saveWorkflowBtn'),
      workflowSavedMsg: requiredElement<HTMLDivElement>('workflowSavedMsg'),
      templateList: requiredElement<HTMLDivElement>('templateList'),
      addTemplateBtn: requiredElement<HTMLButtonElement>('addTemplateBtn'),
      templateDialogOverlay: requiredElement<HTMLDivElement>('templateDialogOverlay'),
      templateNameInput: requiredElement<HTMLInputElement>('templateNameInput'),
      templateContentInput: requiredElement<HTMLTextAreaElement>('templateContentInput'),
      dialogCancelBtn: requiredElement<HTMLButtonElement>('dialogCancelBtn'),
      dialogSaveBtn: requiredElement<HTMLButtonElement>('dialogSaveBtn'),
      previewOverlay: requiredElement<HTMLDivElement>('workflowPreviewOverlay'),
      previewSummary: requiredElement<HTMLDivElement>('workflowPreviewSummary'),
      previewList: requiredElement<HTMLDivElement>('workflowPreviewList'),
      previewCancelBtn: requiredElement<HTMLButtonElement>('workflowPreviewCancelBtn'),
      previewConfirmBtn: requiredElement<HTMLButtonElement>('workflowPreviewConfirmBtn'),
      contextMenu: requiredElement<HTMLDivElement>('contextMenu'),
      ctxCopy: requiredElement<HTMLDivElement>('ctxCopy'),
      ctxRecallQueued: requiredElement<HTMLDivElement>('ctxRecallQueued'),
      tabButtons: document.querySelectorAll<HTMLButtonElement>('.tab-btn'),
      tabContents: document.querySelectorAll<HTMLDivElement>('.tab-content'),
    };
  }

  function requiredElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing required element: ${id}`);
    }
    return element as T;
  }

  function readInitPayload(): InitPayload {
    const script = document.getElementById('sidebar-webview-bootstrap');
    const payload = script?.getAttribute('data-init');
    if (!payload) {
      return { sendDelayMs: 5000 };
    }
    try {
      return JSON.parse(payload) as InitPayload;
    } catch {
      return { sendDelayMs: 5000 };
    }
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
