# Copilot Super - 无限对话模式

> 通过 MCP 协议扩展 GitHub Copilot 的对话能力，在单次计费周期内完成复杂多轮任务。

[![Version](https://img.shields.io/badge/version-2.1.2-blue.svg)](https://github.com/touful/copilot_super)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.99.0-007ACC.svg)](https://code.visualstudio.com/)

---

## ✨ 功能特性

- **无限对话模式** — 突破 Copilot 单轮限制，通过 MCP 工具调用实现持续多轮交互
- **4 层规则系统** — 全局规则 / 工作区规则 / 规则模板库 / 锁定规则，灵活组合
- **工作流引擎** — 预设多步骤提示词流程，一键执行复杂任务链
- **消息队列与撤回** — 最多 50 条预排队消息，5 秒倒计时内可撤回
- **多编辑器支持** — VS Code / Cursor / Windsurf / Lingma / Trae 统一支持
- **自动配置** — 零手动配置，自动创建 rules.md 和 MCP 注册文件
- **状态栏监控** — 实时显示 MCP 服务器连接状态（心跳检测）
- **智能通知** — 工具调用通知 + 可选提示音，不错过任何 AI 请求

---

## 🖥️ 支持的编辑器

| 编辑器 | 配置目录 | MCP 配置方式 |
|--------|----------|-------------|
| VS Code | `.vscode/` | 工作区 `mcp.json` |
| Cursor | `.cursor/` | 工作区 `mcp.json` |
| Windsurf | `.windsurf/` | 全局 MCP 配置 |
| Lingma（通义灵码） | `.lingma/` | 工作区 `mcp.json` |
| Trae | `.trae/` | 工作区 `mcp.json` |

> 编辑器类型通过环境变量自动检测，无需手动选择。

---

## 📥 安装

### 方式一：VSIX 安装（推荐）
1. 下载最新的 `.vsix` 文件
2. 打开 VS Code 扩展面板，将 `.vsix` 文件拖入面板即可自动安装

### 方式二：从源码构建
```bash
git clone https://github.com/touful/copilot_super.git
cd copilot_super
npm install
npm run build
npx @vscode/vsce package
```

---

## 🚀 使用指南

### 1. 首次对话：建立 MCP 连接

1. 在侧边栏面板中点击 **「激活前缀」** 按钮，复制前置提示词
2. 打开 GitHub Copilot 原生聊天窗口（Chat）
3. 粘贴内容发送（模型越高级效果越好）

> 发送成功后，Copilot 将通过 MCP 建立与本插件的通信通道。

### 2. 后续对话：无限模式

连接建立后，在侧边栏中直接交互：

- **Enter** 发送（带 5 秒倒计时，期间可撤回）
- **Ctrl+Enter** 直发（跳过倒计时）
- **Shift+Enter** 换行
- 消息自动注入前缀和规则，无需手动拼接

### 3. 消息队列与撤回

- 发送的消息进入排队区，等待 Copilot 通过 MCP 消费
- **倒计时期间**点击「撤回」可取消当前 pending 消息
- **右键上下文菜单** → 撤回队列消息，可回退已入队的消息
- 队列上限 50 条，头部徽章实时显示排队数

### 4. 规则管理（📏 规则标签页）

采用 **步骤化引导**，分 3 步配置：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 编辑全局规则 | 所有工作区通用，写入 `.github/copilot.md` |
| 2 | 编排规则模板 | 从规则库拖入模板，支持拖拽排序，每个工作区独立 |
| 3 | 管理规则库 | 新增/编辑/删除/锁定规则模板 |

**规则模板锁定**：锁定后的规则在所有工作区自动生效，无需单独添加。

### 5. 工作流引擎（🧭 工作流标签页）

将固定流程拆成多条提示词，一键按顺序入队：

1. 选择已有工作流或新建
2. 为每个步骤编写提示词，支持拖拽重排
3. 点击运行后弹出预览确认，确认后自动入队
4. 仅第一步带完整前缀+规则，后续步骤仅带工具回调后缀

---

## ⚙️ 配置项

在 VS Code `设置 → copilot-super` 中可配置：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `port` | number | 55433 | MCP 服务器起始端口（自动递增尝试 10 个端口） |
| `autoStart` | boolean | true | 启动时自动开启 MCP 服务器 |
| `notifyOnToolCall` | boolean | true | 工具调用时显示右下角通知 |
| `soundOnToolCall` | boolean | false | 工具调用时播放提示音 |
| `showPluginNotifications` | boolean | true | 允许插件发送 VS Code 通知 |
| `debug` | boolean | false | 调试模式：启用详细日志输出 |

---

## 🔧 命令列表

| 命令 | 说明 |
|------|------|
| `Copilot Super: 打开面板` | 打开侧边栏对话面板 |
| `Copilot Super: 快速发送消息` | 弹出输入框直接发送 |
| `Copilot Super: 重启 MCP 服务器` | 重启服务器（连接中断时使用） |
| `Copilot Super: 清空对话历史` | 清空历史记录和消息队列 |
| `Copilot Super: 复制前置提示词` | 复制激活用的前置提示词 |
| `Copilot Super: 复制规则` | 复制当前生效的完整规则 |

---

## 🏗️ 技术架构

```
GitHub Copilot 聊天窗口
       ↓ 发送前置提示词激活
┌──────────────────────────┐
│  MCP Streamable HTTP     │  ← 2025-03-26 协议规范
│  SSE 心跳(15s) + 保活    │  ← 防止 undici 超时
│  copilot_super_N         │  ← 动态端口+工具名
└──────────┬───────────────┘
           │ JSON-RPC
┌──────────▼───────────────────────────┐
│   Sidebar Webview 侧边栏             │
├──────────────────────────────────────┤
│ 💬 对话  │  📏 规则  │  🧭 工作流   │
│ · 消息区 │  · 全局   │  · 步骤编辑  │
│ · 队列   │  · 模板库 │  · 预览确认  │
│ · 撤回   │  · 锁定   │  · 拖拽排序  │
└──────────────────────────────────────┘
```

### 提示词构建流程

```
[前置提示词 prefix.txt]
    ↓
[全局规则]
    ↓
[锁定规则（所有工作区生效）]
    ↓
[工作区规则模板（当前工作区）]
    ↓
[新任务] 用户输入
    ↓
[工具回调后缀]
```

### 自动配置文件

插件启动时自动在工作区中生成以下文件：
- `{config_dir}/rules.md` — 规则文件（含完整模板）
- `{config_dir}/mcp.json` — MCP 工具注册配置

---

## ❓ 常见问题

**Q: MCP 服务器启动失败？**
A: 插件会自动尝试 10 个连续端口（从 55433 起），也可在设置中修改起始端口。

**Q: Copilot 没有调用 MCP 工具？**
A: 确保已发送前置提示词激活。检查 `{config_dir}/mcp.json` 是否存在且端口正确。

**Q: 对话中断了怎么办？**
A: 使用命令 `Copilot Super: 重启 MCP 服务器`，然后重新发送前置提示词。

**Q: 如何查看调试日志？**
A: 启用 `copilot-super.debug` 配置项，然后在输出面板选择 `Copilot Super` 频道。

**Q: 规则没有生效？**
A: 检查规则页中是否已将模板添加到当前工作区，锁定的规则会在所有工作区自动生效。

---

## 📝 更新日志

### v2.1.2
- 移除对话消息标题，AI 内容紧靠左边，视觉区分更清晰
- 修复撤回后对话框文本未消失的问题
- 修复撤回 pending 消息时误删已入队消息的问题

### v2.1.1
- 修复工作流发送 bug

### v2.1.0
- 深度代码审查与架构优化
- 新增统一日志管理系统（调试/生产模式分离）
- 增强 MCP Server 并发稳定性
- 优化 SharedStorage 迁移锁（指数退避）
- 规则模板锁定机制
- 工作流步骤拖拽排序
- Windsurf 全局 MCP 配置支持

### v2.0.x
- 架构重构，提取通用工具函数
- 添加运行时参数校验
- 封装 `TimerManager` 类优化定时器资源管理
- 增强 CORS 安全配置

---

## 📄 许可证

[MIT License](LICENSE)
