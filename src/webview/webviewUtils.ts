/**
 * Webview 纯工具函数和类型定义
 * 不依赖任何闭包状态，可被多个 webview 模块复用
 */

import type { DroppedFileCandidate, ExtToWebviewMessage, RuleTemplate, SidebarHistoryEntry, Workflow } from '../sidebar/types';

// ============ 类型定义 ============

export type TabName = 'chat' | 'rules' | 'workflow';
export type StatusKind = 'ready' | 'waiting' | 'sent';

export type RenderPromptPayload = Extract<ExtToWebviewMessage, { type: 'showPrompt' }>;

export type InitPayload = {
  sendDelayMs: number;
};

export type VscodeApi = {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

export type SidebarState = {
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

export type ElementMap = {
  statusDot: HTMLDivElement;
  statusText: HTMLSpanElement;
  headerStatePill: HTMLSpanElement;
  queueBadge: HTMLSpanElement;
  copyRulesBtn: HTMLButtonElement;
  activateBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  chatTab: HTMLDivElement;
  messages: HTMLDivElement;
  emptyState: HTMLDivElement;
  choices: HTMLDivElement;
  inputArea: HTMLDivElement;
  fileDropOverlay: HTMLDivElement;
  inputFieldShell: HTMLDivElement;
  pendingSendArea: HTMLDivElement;
  pendingCountdown: HTMLDivElement;
  pendingSendText: HTMLTextAreaElement;
  pendingSendNowBtn: HTMLButtonElement;
  pendingCancelBtn: HTMLButtonElement;
  responseInput: HTMLTextAreaElement;
  responseInputHighlight: HTMLDivElement;
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

// ============ 常量 ============

export const NEW_WORKFLOW_OPTION = '__new_workflow__';
export const FILE_MENTION_PATTERN = /@([^@\r\n]+)@/g;

// ============ 定时器管理器 ============

/**
 * 定时器管理器
 * 封装 setTimeout/setInterval 的创建和清理，避免资源泄漏
 */
export class TimerManager {
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

// ============ HTML / 文本工具 ============

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEscapedText(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

export function parseCssPx(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ============ 日志工具 ============

export function formatWebviewLogLine(level: 'debug' | 'info' | 'warn' | 'error', message: string, detail?: unknown): string {
  const timestamp = new Date().toISOString();
  const prefix = `copilot-super [Webview] [${level.toUpperCase()}] [${timestamp}]`;
  const text = detail === undefined ? message : `${message} ${formatWebviewLogValue(detail)}`;
  return text.split(/\r?\n/).map((line) => `${prefix} ${line}`).join('\n');
}

export function formatWebviewLogValue(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined) {
    return 'undefined';
  }
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

// ============ DOM 初始化工具 ============

export function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element as T;
}

export function queryElements(): ElementMap {
  return {
    statusDot: requiredElement<HTMLDivElement>('statusDot'),
    statusText: requiredElement<HTMLSpanElement>('statusText'),
    headerStatePill: requiredElement<HTMLSpanElement>('headerStatePill'),
    queueBadge: requiredElement<HTMLSpanElement>('queueBadge'),
    copyRulesBtn: requiredElement<HTMLButtonElement>('copyRulesBtn'),
    activateBtn: requiredElement<HTMLButtonElement>('activateBtn'),
    clearBtn: requiredElement<HTMLButtonElement>('clearBtn'),
    chatTab: requiredElement<HTMLDivElement>('chatTab'),
    messages: requiredElement<HTMLDivElement>('messages'),
    emptyState: requiredElement<HTMLDivElement>('emptyState'),
    choices: requiredElement<HTMLDivElement>('choices'),
    inputArea: requiredElement<HTMLDivElement>('inputArea'),
    fileDropOverlay: requiredElement<HTMLDivElement>('fileDropOverlay'),
    inputFieldShell: requiredElement<HTMLDivElement>('inputFieldShell'),
    pendingSendArea: requiredElement<HTMLDivElement>('pendingSendArea'),
    pendingCountdown: requiredElement<HTMLDivElement>('pendingCountdown'),
    pendingSendText: requiredElement<HTMLTextAreaElement>('pendingSendText'),
    pendingSendNowBtn: requiredElement<HTMLButtonElement>('pendingSendNowBtn'),
    pendingCancelBtn: requiredElement<HTMLButtonElement>('pendingCancelBtn'),
    responseInput: requiredElement<HTMLTextAreaElement>('inputField'),
    responseInputHighlight: requiredElement<HTMLDivElement>('inputHighlight'),
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

export function readInitPayload(): InitPayload {
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

export function createInitialState(api: VscodeApi): SidebarState {
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

// ============ 状态消息显示 ============

/** 状态消息定时器缓存 */
const statusMessageTimers = new Map<HTMLDivElement, number>();

export function showStatusMessage(element: HTMLDivElement, text: string): void {
  element.textContent = text;
  element.classList.add('show');
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

// ============ 音频 ============

let sharedAudioContext: AudioContext | null = null;

export function playBeep(): void {
  try {
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioContext();
    }
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
    // 忽略音频播放错误
  }
}
