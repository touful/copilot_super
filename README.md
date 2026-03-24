# Copilot Super - 无限对话模式

> 通过 MCP 协议扩展 GitHub Copilot 的对话能力，在单次计费周期内完成复杂多轮任务。

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/touful/copilot_super)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.99.0-007ACC.svg)](https://code.visualstudio.com/)

---

## ✨ 功能特性

- **无限对话模式** — 突破 Copilot 单轮对话限制，通过 MCP 工具调用实现持续多轮交互
- **智能规则系统** — 支持全局规则、工作区规则和可复用的规则模板库，支持锁定机制
- **工作流引擎** — 预设多步骤提示词流程，一键执行复杂任务链
- **消息队列与撤回** — 预先排队消息，5 秒内可撤回误发内容
- **多编辑器支持** — 支持 VS Code、Cursor、Windsurf、Lingma、Trae 等主流编辑器
- **自动配置** — 自动创建配置文件，零手动配置即可使用
- **提示音通知** — MCP 调用时可选提示音和通知，不错过任何 AI 请求
- **状态栏监控** — 实时显示 MCP 服务器运行状态
- **调试模式** — 可选开启详细日志输出，便于问题排查

---

## 🖥️ 支持的编辑器

| 编辑器 | 支持状态 | 配置目录 |
|--------|----------|----------|
| VS Code | ✅ 完全支持 | `.vscode/` |
| Cursor | ✅ 完全支持 | `.cursor/` |
| Windsurf | ✅ 完全支持 | `.windsurf/` (全局 MCP 配置) |
| Lingma (通义灵码) | ✅ 完全支持 | `.lingma/` |
| Trae | ✅ 完全支持 | `.trae/` |

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
npx @vscode/vsce package
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
| `copilot-super.debug` | boolean | false | 调试模式：启用详细日志输出 |

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

### v2.0.0

**架构优化**
- 新增统一日志管理系统，调试模式与生产模式完全分离
- 修复 MCP Server 竞态条件，增强多会话并发稳定性
- 优化 SharedStorage 迁移锁机制，使用指数退避替代忙等待
- 增强 CORS 安全配置，移除通配符源

**代码质量**
- 提取通用错误处理工具 `formatError`、`isErrorCode`
- 提取 `buildUserResponseText` 方法消除重复代码
- 添加 `isValidToolCallParams` 运行时参数校验
- 优化定时器资源管理，封装 `TimerManager` 类

**功能增强**
- 新增调试模式配置项，可按需开启详细日志
- 支持规则模板锁定机制，锁定规则在所有工作区可见
- 新增 Windsurf 编辑器全局 MCP 配置支持
- 工作流支持步骤拖拽排序

### v1.5.0
- 新增规则模板锁定机制，锁定的规则在所有工作区可见
- 新增工作流步骤拖拽排序功能
- 优化提示词结构和工作流模板读取

### v1.4.0
- 优化 `prompts/prefix.txt` 与 `prompts/copilot-template.md` 的提示词结构
- 工作流默认示例改为从 `prompts/workflow-templates.json` 读取
- 规则默认模板改为从 `prompts/rule-templates.json` 读取
- 新增工作流预览后确认执行的交互流程

### v1.3.0
- 优化前端面板信息层级与可读性（消息区、输入区、状态展示）
- 新增队列提示联动与头部状态胶囊
- 规则页新增步骤化引导（步骤 1/2/3）
- 增强规则模板拖拽反馈与待发送进度可视化

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
