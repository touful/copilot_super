# Copilot Super - 无限对话模式

> 通过 MCP 协议扩展 GitHub Copilot 的对话能力，在单次计费周期内完成复杂多轮任务。

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](https://github.com/touful/copilot_super)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.99.0-007ACC.svg)](https://code.visualstudio.com/)

---

## ✨ 功能特性

- **无限对话模式** — 突破 Copilot 单轮对话限制，通过 MCP 工具调用实现持续多轮交互
- **智能规则系统** — 支持全局规则、工作区规则和可复用的规则模板库
- **消息队列与撤回** — 预先排队消息，5 秒内可撤回误发内容
- **自动配置** — 自动创建 `.github/copilot.md` 和 `.vscode/mcp.json`，零手动配置
- **提示音通知** — MCP 调用时可选提示音和通知，不错过任何 AI 请求
- **状态栏监控** — 实时显示 MCP 服务器运行状态

---

## 📥 安装

### 方式一：VSIX 安装
1. 下载最新的 `.vsix` 文件
2. 打开 VS Code 扩展面板，将 `.vsix` 文件拖入面板即可自动安装

### 方式二：从源码构建
```bash
git clone https://github.com/touful/copilot_super.git
cd copilot_super
npm install
npm run build
npx vsce package
```

---

## 🚀 使用指南

### 1. 首次对话：建立连接

1. 在 Copilot Super 侧边栏面板中，点击 **「📋 复制前置提示词 (激活)」** 按钮
2. 打开 GitHub Copilot 原生聊天窗口（Chat）
3. 粘贴内容作为第一条消息发送，选择任意模型（模型越高级效果越好）

> 💡 发送成功后，Copilot 将建立与本插件的 MCP 通信通道

### 2. 后续对话：无限模式

连接建立后，在 **Copilot Super 侧边栏** 中直接交互：

- 在输入框中发送指令，AI 将通过 MCP 持续响应
- 插件自动处理提示词前缀和规则注入
- 支持 Shift+Enter 换行，Enter 发送

### 3. 规则管理

切换到 **📏 规则** 标签页：

- **全局规则** — 在所有工作区生效的通用规则
- **工作区规则** — 仅在当前工作区生效的专属规则
- **规则模板库** — 预设和自定义模板，勾选即启用，自动拼接到提示词中

### 4. 设置

切换到 **⚙️ 设置** 标签页：

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| MCP 调用时提示信息 | 收到工具调用时显示右下角通知 | 开启 |
| MCP 调用时提示音 | 收到工具调用时播放提示音 | 关闭 |
| 插件通知消息 | 允许插件发送 VS Code 通知 | 开启 |

---

## ⚙️ VS Code 配置项

在 `设置 → copilot-super` 中可配置以下选项：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `copilot-super.port` | number | 55433 | MCP 服务器起始端口号 |
| `copilot-super.autoStart` | boolean | true | 启动时自动开启 MCP 服务器 |
| `copilot-super.notifyOnToolCall` | boolean | true | 工具调用时显示通知 |
| `copilot-super.soundOnToolCall` | boolean | false | 工具调用时播放提示音 |
| `copilot-super.showPluginNotifications` | boolean | true | 允许插件发送通知消息 |

---

## 🏗️ 技术架构

```
┌─────────────────────┐     MCP HTTP     ┌──────────────────┐
│   GitHub Copilot    │ ◄──────────────► │  MCP HTTP Server │
│   (AI 模型)         │   JSON-RPC/SSE   │  (内嵌服务器)     │
└─────────────────────┘                  └────────┬─────────┘
                                                  │
                                         ┌────────▼─────────┐
                                         │  Sidebar Webview  │
                                         │  (对话/规则/设置)  │
                                         └──────────────────┘
```

- **MCP Streamable HTTP** — 实现 MCP 2025-03-26 协议规范
- **SSE 长连接** — 心跳保活，支持用户长时间输入
- **动态端口分配** — 自动递增尝试，避免端口冲突
- **工具名动态生成** — 根据端口号生成 `copilot_super_N`

---

## ❓ 常见问题

**Q: MCP 服务器启动失败？**
A: 检查端口是否被占用。插件会自动尝试 10 个端口，也可在设置中修改端口号

**Q: Copilot 没有调用 MCP 工具？**
A: 确保已发送前置提示词激活，检查 `.vscode/mcp.json` 配置是否正确

**Q: 对话中断了怎么办？**
A: 点击状态栏或使用命令 `Copilot Super: 重启 MCP 服务器`，然后重新发送前置提示词

**Q: 如何查看日志？**
A: 打开 VS Code 输出面板（Output），选择 `Copilot Super` 频道

---

## 📝 更新日志

### v1.2.0
- 规则模板发送时自动添加数字序号
- 原设置页更名为规则页，新增独立设置页
- 新增 MCP 调用提示音设置
- 新增插件通知控制开关
- 优化 README 文档

### v1.1.0
- 初始发布
- MCP HTTP 服务器
- 侧边栏对话面板
- 规则系统（全局/工作区/模板库）
- 消息撤回功能

---

## 📄 许可证

[MIT License](LICENSE)
