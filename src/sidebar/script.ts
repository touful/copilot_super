/**
 * Sidebar Webview 的前端 JavaScript
 * 从 sidebarProvider.ts 中提取，便于维护
 * @param sendDelayMs - 发送延迟毫秒数（注入到前端代码中）
 */
export function getSidebarScript(sendDelayMs: number): string {
  return `
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
      const workspaceRulesInput = document.getElementById('workspaceRulesInput');
      const saveRulesBtn = document.getElementById('saveRulesBtn');
      const rulesSavedMsg = document.getElementById('rulesSavedMsg');

      // 新设置页元素引用
      const settingNotifyOnToolCall = document.getElementById('settingNotifyOnToolCall');
      const settingSoundOnToolCall = document.getElementById('settingSoundOnToolCall');
      const settingShowPluginNotifications = document.getElementById('settingShowPluginNotifications');
      const saveSettingsBtn = document.getElementById('saveSettingsBtn');
      const settingsSavedMsg = document.getElementById('settingsSavedMsg');

      // 规则库元素引用
      const templateList = document.getElementById('templateList');
      const addTemplateBtn = document.getElementById('addTemplateBtn');
      const templateDialogOverlay = document.getElementById('templateDialogOverlay');
      const templateDialogTitle = document.getElementById('templateDialogTitle');
      const templateNameInput = document.getElementById('templateNameInput');
      const templateContentInput = document.getElementById('templateContentInput');
      const dialogSaveBtn = document.getElementById('dialogSaveBtn');
      const dialogCancelBtn = document.getElementById('dialogCancelBtn');

      // 规则模版（工作区拖拽区域）元素引用
      const workspaceTemplateList = document.getElementById('workspaceTemplateList');

      let currentTemplates = [];
      let workspaceTemplateIds = []; // 工作区规则模版：有序的规则ID列表
      let editingTemplateId = null; // null = 新增, string = 编辑

      // 功能4: 撤回功能引用
      const pendingSendArea = document.getElementById('pendingSendArea');
      const pendingCountdown = document.getElementById('pendingCountdown');
      const pendingSendText = document.getElementById('pendingSendText');
      const pendingSendNowBtn = document.getElementById('pendingSendNowBtn');
      const pendingCancelBtn = document.getElementById('pendingCancelBtn');
      const clearBtn = document.getElementById('clearBtn');

      // 自定义右键菜单元素引用
      const contextMenu = document.getElementById('contextMenu');
      const ctxCopy = document.getElementById('ctxCopy');
      const ctxRecallQueued = document.getElementById('ctxRecallQueued');
      const queueBadge = document.getElementById('queueBadge');
      const chatStatusMsg = document.getElementById('chatStatusMsg');
      const charCount = document.getElementById('charCount');

      let isWaiting = false; // 是否正在等待用户输入以回复当前 Copilot 请求
      let queueCount = 0; // 队列中待消费的消息数量
      let savedSelectedText = ''; // 右键菜单打开时保存的选中文本
      let activeTab = 'chat'; // 当前活动标签页
      let lastMessageDate = ''; // 上一条消息的日期（用于日期分隔符）
      const MAX_INPUT_LENGTH = 5000; // 输入框最大字符数
      
      // 功能4: 待发送消息的状态
      let pendingMessage = null; // { text: string, timeout: NodeJS.Timeout }
      let pendingCountdownInterval = null;

      // D2: 预编译正则和常量（避免在 renderMarkdown 中反复创建）
      const MD_MAX_RENDER_LENGTH = 50000;
      const backtick = String.fromCharCode(96);
      const tripleBacktick = backtick + backtick + backtick;
      const RE_CODE_BLOCK = new RegExp(tripleBacktick + '([\\\\s\\\\S]*?)' + tripleBacktick, 'g');
      const RE_INLINE_CODE = new RegExp(backtick + '([^' + backtick + ']+)' + backtick, 'g');
      const RE_ESCAPE = /\\\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|n|r|t|\\\\)/g;
      const RE_URL_ENCODE = /(?:%[0-9a-fA-F]{2}){2,}/g;
      const RE_HTML_HEX_ENTITY = /&#x([0-9a-fA-F]+);/g;
      const RE_HTML_DEC_ENTITY = /&#(\\d+);/g;
      const RE_NEWLINE = /\\r\\n|\\r|\\n/g;

      /** 解码转义序列（供 renderMarkdown 使用） */
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
            // 同步工作区规则
            workspaceRulesInput.value = msg.workspaceRules || '';
            break;
          case 'rulesSaved':
            // 显示规则已保存的提示
            setSaveBtnSuccess(saveRulesBtn);
            showStatusMessage('规则已保存！', rulesSavedMsg);
            break;
          case 'syncTemplates':
            // 同步规则库
            currentTemplates = msg.templates || [];
            renderTemplateList();
            renderWorkspaceTemplate();
            break;
          case 'syncWorkspaceTemplate':
            // 同步工作区规则模版
            workspaceTemplateIds = msg.templateIds || [];
            renderWorkspaceTemplate();
            break;
          case 'syncSettings':
            // 同步设置项
            settingNotifyOnToolCall.checked = msg.notifyOnToolCall !== false;
            settingSoundOnToolCall.checked = msg.soundOnToolCall === true;
            settingShowPluginNotifications.checked = msg.showPluginNotifications !== false;
            break;
          case 'settingsSaved':
            // 显示设置已保存提示
            setSaveBtnSuccess(saveSettingsBtn);
            showStatusMessage('设置已保存！', settingsSavedMsg);
            break;
          case 'playSound':
            // 播放提示音效
            playNotificationSound();
            break;
          case 'syncQueue':
            // 同步队列信息
            queueCount = msg.count || 0;
            updateQueueBadge();
            break;
          case 'queueRecalled':
            // 队列撤回结果
            queueCount = msg.count || 0;
            updateQueueBadge();
            if (msg.text) {
              // 将撤回的文本回退到输入框中
              inputField.value = msg.text;
              adjustHeight();
              updateButtonState();
              inputField.focus();
              // 移除 UI 中最后一条用户消息
              const allUserMsgs = messagesEl.querySelectorAll('.message.user');
              if (allUserMsgs.length > 0) {
                allUserMsgs[allUserMsgs.length - 1].remove();
              }
              if (!messagesEl.querySelector('.message')) {
                if (emptyStateEl) emptyStateEl.style.display = '';
              }
              showStatusMessage('队列消息已撤回，内容已回退到输入框', chatStatusMsg);
            } else {
              showStatusMessage('队列中没有可撤回的消息', chatStatusMsg);
            }
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
          statusDot.setAttribute('aria-label', '状态: 等待输入');
        } else {
          statusText.textContent = '等待 Copilot 请求...';
          statusDot.setAttribute('aria-label', '状态: 就绪');
        }
      }

      // ====== UI 操作 ======
      function addMessage(role, title, content, timestamp) {
        // B7: 日期分隔符 — 跨天显示日期标签
        if (timestamp) {
          const dateStr = new Date(timestamp).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
          if (lastMessageDate && dateStr !== lastMessageDate) {
            const sep = document.createElement('div');
            sep.className = 'date-separator';
            sep.textContent = dateStr;
            messagesEl.appendChild(sep);
          }
          lastMessageDate = dateStr;
        }

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

        // C2: 悬浮工具栏 — 鼠标悬停时显示复制按钮
        const toolbar = document.createElement('div');
        toolbar.className = 'message-hover-toolbar';
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋';
        copyBtn.title = '复制消息';
        copyBtn.addEventListener('click', function() {
          const contentEl = div.querySelector('.message-content');
          const text = contentEl ? contentEl.textContent : '';
          if (text) {
            vscode.postMessage({ type: 'copyText', text: text });
          }
        });
        toolbar.appendChild(copyBtn);
        div.appendChild(toolbar);

        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        // C5: 非对话标签页收到新消息时显示未读小红点
        if (activeTab !== 'chat' && role === 'copilot') {
          chatTabBtn.classList.add('has-unread');
        }
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
      function clearMessages() {
        messagesEl.innerHTML = '';
        lastMessageDate = ''; // 重置日期分隔符
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
        lastMessageDate = ''; // 重置日期分隔符
        const existingEmpty = messagesEl.querySelector('.empty-state');
        messagesEl.innerHTML = '';
        if (existingEmpty) messagesEl.appendChild(existingEmpty);

        history.forEach((item) => {
          addMessage(item.role, item.title || '', item.content, item.timestamp);
        });
      }

      // ====== 发送消息 ======
      /** 功能4: 实现 5 秒延迟发送，skipDelay=true 时直接发送 */
      function sendMessage(skipDelay) {
        const text = inputField.value.trim();
        if (!text) return;

        // 先显示消息在 UI 中（乐观更新）
        addMessage('user', '', text, Date.now());
        
        // 如果有上一条待发送的消息，先立即发送它（避免丢失）
        if (pendingMessage) {
          executeSend(pendingMessage.text);
          clearPendingUI();
        }

        // 清空输入框
        inputField.value = '';
        adjustHeight();
        updateButtonState();

        // Ctrl+Enter：跳过延迟，直接发送
        if (skipDelay) {
          executeSendDirect(text);
          return;
        }

        // 设置延迟发送
        const SEND_DELAY = ${sendDelayMs};
        let remainingSeconds = Math.ceil(SEND_DELAY / 1000);
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

        // 延迟后自动发送
        const timeout = setTimeout(() => {
          executeSend(text);
          clearPendingUI();
        }, SEND_DELAY);

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

      /** Ctrl+Enter 直接发送，不进入延迟队列 */
      function executeSendDirect(text) {
        vscode.postMessage({ type: 'userResponse', text: text });
        // 如果正在等待，清除选项
        if (isWaiting) {
          choicesEl.innerHTML = '';
      /** 功能4: 清空待发送 UI */
      function clearPendingUI() {
        pendingSendArea.classList.remove('show');
        if (pendingCountdownInterval) {
          clearInterval(pendingCountdownInterval);
        }
      }

      /** 功能4: 撤回消息，并将文本回退到输入框 */
      function cancelPendingMessage() {
        if (pendingMessage) {
          // 保存待发送的原始文本
          const recalledText = pendingMessage.text;
          clearTimeout(pendingMessage.timeout);
          clearInterval(pendingCountdownInterval);
          pendingMessage = null;
          clearPendingUI();
          // 移除乐观更新展示的用户消息
          const allUserMsgs = messagesEl.querySelectorAll('.message.user');
          if (allUserMsgs.length > 0) {
            allUserMsgs[allUserMsgs.length - 1].remove();
          }
          // 如果没有消息了，显示空状态
          if (!messagesEl.querySelector('.message')) {
            if (emptyStateEl) emptyStateEl.style.display = '';
          }
          // 将撤回的文本回退到输入框中，方便用户编辑后重新发送
          inputField.value = recalledText;
          adjustHeight();
          updateButtonState();
          inputField.focus();
          showStatusMessage('消息已撤回，内容已回退到输入框', chatStatusMsg);
        }
      }

      sendBtn.addEventListener('click', function() { sendMessage(false); });

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
        activeTab = tabName;

        // 更新 ARIA 属性
        [chatTabBtn, rulesTabBtn, settingsTabBtn].forEach(function(btn) {
          btn.setAttribute('aria-selected', 'false');
        });

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
          chatTabBtn.setAttribute('aria-selected', 'true');
          // C5: 切换到对话标签时清除未读标记
          chatTabBtn.classList.remove('has-unread');
        } else if (tabName === 'rules') {
          rulesTab.classList.add('active');
          rulesTabBtn.classList.add('active');
          rulesTabBtn.setAttribute('aria-selected', 'true');
          // 请求同步规则
          vscode.postMessage({ type: 'requestRules' });
        } else if (tabName === 'settings') {
          settingsTab.classList.add('active');
          settingsTabBtn.classList.add('active');
          settingsTabBtn.setAttribute('aria-selected', 'true');
          // 请求同步设置
          vscode.postMessage({ type: 'requestSettings' });
        }
      }

      chatTabBtn.addEventListener('click', () => switchTab('chat'));
      rulesTabBtn.addEventListener('click', () => switchTab('rules'));
      settingsTabBtn.addEventListener('click', () => switchTab('settings'));

      // 保存规则
      saveRulesBtn.addEventListener('click', () => {
        const workspaceRules = workspaceRulesInput.value;
        setSaveBtnLoading(saveRulesBtn);
        vscode.postMessage({
          type: 'saveRules',
          workspaceRules: workspaceRules,
        });
      });

      // 保存设置
      saveSettingsBtn.addEventListener('click', () => {
        setSaveBtnLoading(saveSettingsBtn);
        vscode.postMessage({
          type: 'saveSettings',
          notifyOnToolCall: settingNotifyOnToolCall.checked,
          soundOnToolCall: settingSoundOnToolCall.checked,
          showPluginNotifications: settingShowPluginNotifications.checked,
        });
      });

      /** C6: 保存按钮加载态 — 点击后禁用并显示加载，完成后短暂显示成功 */
      function setSaveBtnLoading(btn) {
        btn.classList.add('loading');
        btn.disabled = true;
      }

      /** C6: 保存按钮成功态 */      
      function setSaveBtnSuccess(btn) {
        btn.classList.remove('loading');
        btn.classList.add('success');
        setTimeout(function() {
          btn.classList.remove('success');
          btn.disabled = false;
        }, 1500);
      }

      // 显示状态消息（支持不同目标元素）
      function showStatusMessage(message, targetEl) {
        const el = targetEl || rulesSavedMsg;
        el.textContent = message;
        el.classList.add('show');
        setTimeout(() => {
          el.classList.remove('show');
        }, 2000);
      }

      /** 全局复用的 AudioContext 实例（延迟初始化） */
      let sharedAudioCtx = null;

      /** 播放提示音效（使用 Web Audio API，复用 AudioContext 实例） */
      function playNotificationSound() {
        try {
          if (!sharedAudioCtx) {
            sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
          }
          const oscillator = sharedAudioCtx.createOscillator();
          const gainNode = sharedAudioCtx.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(sharedAudioCtx.destination);
          oscillator.frequency.value = 800;
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.3, sharedAudioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, sharedAudioCtx.currentTime + 0.3);
          oscillator.start(sharedAudioCtx.currentTime);
          oscillator.stop(sharedAudioCtx.currentTime + 0.3);
        } catch (e) {
          // 静默失败，重置 AudioContext 以便下次重试
          sharedAudioCtx = null;
        }
      }

      /** 更新队列数量角标 */
      function updateQueueBadge() {
        if (queueCount > 0) {
          queueBadge.textContent = '队列: ' + queueCount;
          queueBadge.classList.add('show');
        } else {
          queueBadge.classList.remove('show');
        }
      }

      // ====== 自定义右键菜单逻辑 ======
      /** 禁用默认右键菜单，显示自定义菜单 */
      document.addEventListener('contextmenu', function(e) {
        e.preventDefault();

        // 打开菜单时立即保存选中文本（点击菜单项后选区会丢失）
        savedSelectedText = window.getSelection().toString();

        // 如果没有选中文本，检测是否右键点击了消息气泡，自动提取整条消息的完整文本
        if (!savedSelectedText) {
          const targetMessage = e.target.closest('.message');
          if (targetMessage) {
            const titleEl = targetMessage.querySelector('.message-title');
            const contentEl = targetMessage.querySelector('.message-content');
            const parts = [];
            // 提取标题文本（去掉 emoji 图标前缀也无妨，textContent 会包含）
            if (titleEl) { parts.push(titleEl.textContent.trim()); }
            if (contentEl) { parts.push(contentEl.textContent.trim()); }
            savedSelectedText = parts.join('\\\\n').trim();
            // 更新复制菜单文字，提示用户将要复制整条消息
            ctxCopy.querySelector('span:last-child').textContent = '复制整条消息';
          } else {
            ctxCopy.querySelector('span:last-child').textContent = '复制';
          }
        } else {
          // 有选中文字时还原菜单文字
          ctxCopy.querySelector('span:last-child').textContent = '复制';
        }

        if (savedSelectedText) {
          ctxCopy.classList.remove('disabled');
        } else {
          ctxCopy.classList.add('disabled');
        }

        if (queueCount > 0) {
          ctxRecallQueued.classList.remove('disabled');
          ctxRecallQueued.querySelector('span:last-child').textContent = '撤回排队消息 (' + queueCount + ')';
        } else {
          ctxRecallQueued.classList.add('disabled');
          ctxRecallQueued.querySelector('span:last-child').textContent = '撤回排队消息';
        }

        // 计算菜单位置，确保不溢出视口
        const menuWidth = 160;
        const menuHeight = 80;
        let x = e.clientX;
        let y = e.clientY;
        if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 4;
        if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 4;

        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        contextMenu.classList.add('show');
      });

      /** 点击其他区域关闭菜单 */
      document.addEventListener('click', function() {
        contextMenu.classList.remove('show');
      });

      // A6: 键盘导航右键菜单 — 支持上下箭头、Escape、Enter
      document.addEventListener('keydown', function(e) {
        if (!contextMenu.classList.contains('show')) return;

        const items = contextMenu.querySelectorAll('[role="menuitem"]');
        const currentIndex = Array.from(items).indexOf(document.activeElement);

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            items[currentIndex < items.length - 1 ? currentIndex + 1 : 0].focus();
            break;
          case 'ArrowUp':
            e.preventDefault();
            items[currentIndex > 0 ? currentIndex - 1 : items.length - 1].focus();
            break;
          case 'Enter':
          case ' ':
            e.preventDefault();
            if (document.activeElement && document.activeElement.click) {
              document.activeElement.click();
            }
            break;
          case 'Escape':
            e.preventDefault();
            contextMenu.classList.remove('show');
            break;
        }
      });

      /** 复制功能 - 使用菜单打开时保存的文本，通过扩展API写入剪贴板 */
      ctxCopy.addEventListener('click', function() {
        if (savedSelectedText) {
          vscode.postMessage({ type: 'copyText', text: savedSelectedText });
        }
        contextMenu.classList.remove('show');
      });

      /** 撤回队列中最后一条消息 */
      ctxRecallQueued.addEventListener('click', function() {
        if (queueCount > 0) {
          vscode.postMessage({ type: 'recallLastQueued' });
        }
        contextMenu.classList.remove('show');
      });

      inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          // Ctrl+Enter: 直接发送，跳过5秒等待
          // Enter: 普通发送，进入5秒倒计时
          sendMessage(e.ctrlKey || e.metaKey);
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
        // C3: 字符计数
        updateCharCount();
      });

      /** C3: 更新字符计数显示 */
      function updateCharCount() {
        const len = inputField.value.length;
        if (len > 0) {
          charCount.textContent = len + '/' + MAX_INPUT_LENGTH;
          charCount.classList.toggle('warning', len > MAX_INPUT_LENGTH * 0.9);
        } else {
          charCount.textContent = '';
          charCount.classList.remove('warning');
        }
      }

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

        // 超长文本保护：跳过 Markdown 渲染，仅做 HTML 转义和换行处理
        if (text.length > MD_MAX_RENDER_LENGTH) {
          return escapeHtml(text).replace(RE_NEWLINE, '<br>');
        }
        
        // 第一步：处理各种编码和转义序列（使用预编译正则）
        text = text.replace(RE_ESCAPE, decodeEscape);
        text = text.replace(RE_ESCAPE, decodeEscape);
        
        // 处理 URL 编码的连续字节 (%XX%XX... → 实际字符)
        text = text.replace(RE_URL_ENCODE, function(match) {
          try { return decodeURIComponent(match); }
          catch(e) { return match; }
        });
        
        // 处理 HTML 数字实体 (&#xXXXX; 或 &#NNNN;)
        text = text.replace(RE_HTML_HEX_ENTITY, function(match, code) {
          try { return String.fromCodePoint(parseInt(code, 16)); }
          catch(e) { return match; }
        });
        text = text.replace(RE_HTML_DEC_ENTITY, function(match, code) {
          try { return String.fromCodePoint(parseInt(code, 10)); }
          catch(e) { return match; }
        });
        
        // 第二步：对 HTML 转义（防止 XSS）
        let html = escapeHtml(text);
        
        // 第三步：处理 Markdown 语法（使用预编译正则）
        html = html.replace(RE_CODE_BLOCK, 
          '<pre style="background:var(--vscode-textCodeBlock-background);padding:8px;border-radius:4px;overflow-x:auto;margin:4px 0;"><code>$1</code></pre>');
        
        html = html.replace(RE_INLINE_CODE,
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
        html = html.replace(RE_NEWLINE, '<br>');
        
        return html;
      }

      // ====== 规则库管理 ======
      function renderTemplateList() {
        templateList.innerHTML = '';
        currentTemplates.forEach(function(tpl) {
          const item = document.createElement('div');
          item.className = 'template-item';
          item.draggable = true;
          item.setAttribute('data-template-id', tpl.id);

          // 拖拽手柄
          const dragHandle = document.createElement('span');
          dragHandle.className = 'template-item-drag-handle';
          dragHandle.textContent = '⠿';

          const info = document.createElement('div');
          info.className = 'template-item-info';
          info.innerHTML = '<div class="template-item-name">' + escapeHtml(tpl.name) + '</div>' +
            '<div class="template-item-preview">' + escapeHtml(tpl.content.substring(0, 50)) + '</div>';

          const actions = document.createElement('div');
          actions.className = 'template-item-actions';

          const editBtn = document.createElement('button');
          editBtn.textContent = '✏️';
          editBtn.title = '编辑';
          editBtn.addEventListener('click', function() {
            openTemplateDialog(tpl);
          });

          const delBtn = document.createElement('button');
          delBtn.textContent = '🗑️';
          delBtn.title = '删除';
          delBtn.addEventListener('click', function() {
            // 同时从工作区模版中移除
            workspaceTemplateIds = workspaceTemplateIds.filter(function(id) { return id !== tpl.id; });
            saveWorkspaceTemplate();
            vscode.postMessage({ type: 'deleteTemplate', id: tpl.id });
          });

          actions.appendChild(editBtn);
          actions.appendChild(delBtn);

          item.appendChild(dragHandle);
          item.appendChild(info);
          item.appendChild(actions);

          // 拖拽事件：从规则库拖到规则模版
          item.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', tpl.id);
            e.dataTransfer.setData('application/x-source', 'library');
            item.classList.add('dragging');
          });
          item.addEventListener('dragend', function() {
            item.classList.remove('dragging');
          });

          templateList.appendChild(item);
        });
      }

      // ====== 规则模版（工作区拖拽区域）管理 ======
      function renderWorkspaceTemplate() {
        // 清空现有内容
        workspaceTemplateList.innerHTML = '';
        // 过滤出有效的规则ID
        const validIds = workspaceTemplateIds.filter(function(id) {
          return currentTemplates.some(function(t) { return t.id === id; });
        });
        // 如果有效ID和原始列表不同，更新
        if (validIds.length !== workspaceTemplateIds.length) {
          workspaceTemplateIds = validIds;
          saveWorkspaceTemplate();
        }

        if (validIds.length === 0) {
          const placeholder = document.createElement('div');
          placeholder.className = 'template-drop-placeholder';
          placeholder.id = 'templateDropPlaceholder';
          placeholder.textContent = '将规则从下方拖到此处';
          workspaceTemplateList.appendChild(placeholder);
        } else {
          validIds.forEach(function(id, index) {
            const tpl = currentTemplates.find(function(t) { return t.id === id; });
            if (!tpl) return;

            const item = document.createElement('div');
            item.className = 'workspace-template-item';
            item.draggable = true;
            item.setAttribute('data-template-id', id);
            item.setAttribute('data-index', String(index));

            const dragHandle = document.createElement('span');
            dragHandle.className = 'wt-drag-handle';
            dragHandle.textContent = '⠿';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'wt-name';
            nameSpan.textContent = tpl.name;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'wt-remove';
            removeBtn.textContent = '✕';
            removeBtn.title = '移除';
            removeBtn.addEventListener('click', function() {
              workspaceTemplateIds = workspaceTemplateIds.filter(function(wid) { return wid !== id; });
              saveWorkspaceTemplate();
              renderWorkspaceTemplate();
            });

            item.appendChild(dragHandle);
            item.appendChild(nameSpan);
            item.appendChild(removeBtn);

            // 拖拽排序事件
            item.addEventListener('dragstart', function(e) {
              e.dataTransfer.setData('text/plain', id);
              e.dataTransfer.setData('application/x-source', 'template');
              e.dataTransfer.setData('application/x-fromindex', String(index));
              item.classList.add('dragging');
            });
            item.addEventListener('dragend', function() {
              item.classList.remove('dragging');
            });

            workspaceTemplateList.appendChild(item);
          });
        }
      }

      function saveWorkspaceTemplate() {
        vscode.postMessage({ type: 'saveWorkspaceTemplate', templateIds: workspaceTemplateIds });
      }

      // ====== 拖拽放置逻辑 ======
      workspaceTemplateList.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        workspaceTemplateList.classList.add('drag-over');

        // 计算插入位置指示
        const afterElement = getDragAfterElement(workspaceTemplateList, e.clientY);
        const draggingEl = workspaceTemplateList.querySelector('.dragging');
        if (draggingEl) {
          if (afterElement) {
            workspaceTemplateList.insertBefore(draggingEl, afterElement);
          } else {
            workspaceTemplateList.appendChild(draggingEl);
          }
        }
      });

      workspaceTemplateList.addEventListener('dragleave', function(e) {
        // 仅当真正离开容器时移除样式
        if (!workspaceTemplateList.contains(e.relatedTarget)) {
          workspaceTemplateList.classList.remove('drag-over');
        }
      });

      workspaceTemplateList.addEventListener('drop', function(e) {
        e.preventDefault();
        workspaceTemplateList.classList.remove('drag-over');
        const droppedId = e.dataTransfer.getData('text/plain');
        const source = e.dataTransfer.getData('application/x-source');

        if (!droppedId) return;

        if (source === 'library') {
          // 从规则库拖入：检查是否已存在
          if (workspaceTemplateIds.indexOf(droppedId) >= 0) return;
          // 计算插入位置
          const afterEl = getDragAfterElement(workspaceTemplateList, e.clientY);
          if (afterEl) {
            const afterIndex = parseInt(afterEl.getAttribute('data-index') || '0');
            workspaceTemplateIds.splice(afterIndex, 0, droppedId);
          } else {
            workspaceTemplateIds.push(droppedId);
          }
        } else if (source === 'template') {
          // 模版内部排序：读取当前DOM顺序
          const items = workspaceTemplateList.querySelectorAll('.workspace-template-item');
          const newOrder = [];
          items.forEach(function(el) {
            const tid = el.getAttribute('data-template-id');
            if (tid) newOrder.push(tid);
          });
          workspaceTemplateIds = newOrder;
        }

        saveWorkspaceTemplate();
        renderWorkspaceTemplate();
      });

      /** 获取拖拽时应该插入到哪个元素之前 */
      function getDragAfterElement(container, y) {
        const elements = Array.from(container.querySelectorAll('.workspace-template-item:not(.dragging)'));
        let closest = null;
        let closestOffset = Number.NEGATIVE_INFINITY;
        elements.forEach(function(child) {
          const box = child.getBoundingClientRect();
          const offset = y - box.top - box.height / 2;
          if (offset < 0 && offset > closestOffset) {
            closestOffset = offset;
            closest = child;
          }
        });
        return closest;
      }

      function openTemplateDialog(tpl) {
        if (tpl) {
          editingTemplateId = tpl.id;
          templateDialogTitle.textContent = '编辑规则';
          templateNameInput.value = tpl.name;
          templateContentInput.value = tpl.content;
        } else {
          editingTemplateId = null;
          templateDialogTitle.textContent = '添加规则';
          templateNameInput.value = '';
          templateContentInput.value = '';
        }
        templateDialogOverlay.classList.add('show');
        // A5: 打开弹窗时聚焦第一个输入框
        setTimeout(function() { templateNameInput.focus(); }, 50);
      }

      function closeTemplateDialog() {
        templateDialogOverlay.classList.remove('show');
        editingTemplateId = null;
        // A5: 关闭弹窗后将焦点返回触发元素
        addTemplateBtn.focus();
      }

      // A5: 对话框焦点陷阱 — Tab 键在弹窗内循环
      templateDialogOverlay.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          closeTemplateDialog();
          return;
        }
        if (e.key !== 'Tab') return;

        const focusable = templateDialogOverlay.querySelectorAll('input, textarea, button');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      });

      addTemplateBtn.addEventListener('click', function() {
        openTemplateDialog(null);
      });

      dialogCancelBtn.addEventListener('click', closeTemplateDialog);

      templateDialogOverlay.addEventListener('click', function(e) {
        if (e.target === templateDialogOverlay) closeTemplateDialog();
      });

      dialogSaveBtn.addEventListener('click', function() {
        const name = templateNameInput.value.trim();
        const content = templateContentInput.value.trim();
        if (!name || !content) return;

        const template = {
          id: editingTemplateId || ('custom-' + Date.now()),
          name: name,
          content: content,
          enabled: false
        };
        vscode.postMessage({ type: 'saveTemplate', template: template });
        closeTemplateDialog();
      });

      // 通知 extension 就绪
      vscode.postMessage({ type: 'ready' });
    })();
  `;
}
