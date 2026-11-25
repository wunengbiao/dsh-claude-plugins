# dsh-claude-plugins

[![CI](https://github.com/wunengbiao/dsh-claude-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/wunengbiao/dsh-claude-plugins/actions/workflows/ci.yml)

在 DeepSeek Harness（dsh）里读取、管理并使用本机已安装的 **Claude Code 插件**。

插件会从 Claude 的安装目录发现插件，把其中的 **技能（SKILL.md）** 与 **命令（commands/*.md）** 载入 DSH；子代理、钩子与 MCP 服务也会在设置页中完整展示。MCP 服务可选择性地注册到 DSH。

设置路径：**Settings → Claude 插件**。

## 功能

| Claude 插件组件 | DSH 中的行为 |
| --- | --- |
| <code>skills/&lt;name&gt;/SKILL.md</code> | 注册为 DSH 技能，名称形如 <code>plugin-skill</code>，可用 <code>/plugin-skill</code> 手动调用 |
| <code>commands/**/*.md</code> | 注册为 DSH 斜杠命令，名称形如 <code>plugin-command</code> |
| <code>agents/**/*.md</code> | 在设置中列出名称、描述、model 与 tools；DSH 目前不创建对应 subagent |
| <code>hooks/hooks.json</code> | 在设置中列出事件与数量；DSH 不执行 Claude 钩子 |
| <code>.mcp.json</code> / manifest <code>mcpServers</code> | 在设置中列出；开启「载入 MCP 服务」后注册支持的 stdio / Streamable HTTP 服务 |
| <code>output-styles/</code>、<code>.lsp.json</code> | 展示数量，暂不载入 |
| <code>dsh/</code> 适配目录 | 标记「含 DSH 适配」，供你识别原生适配的插件 |

设置页还提供：

- 每个插件的启用 / 停用开关；
- 技能、命令、子代理、钩子、MCP 的组件计数与展开详情；
- 搜索（插件名、marketplace、技能名、命令名）；
- 「允许模型自动发现插件技能」全局开关（默认关闭，避免大量技能摘要进入会话上下文）；
- 「载入 MCP 服务」全局开关（默认关闭）；
- 重新扫描、额外扫描目录（插件目录或 marketplace 目录）。

## 安装

插件是普通 DSH bundle 包。安装到 profile 后对该 profile 的所有会话生效。

从 GitHub 安装（推荐）：

~~~sh
dsh plugin --profile desktop add github:wunengbiao/dsh-claude-plugins#v0.1.0
~~~

本地开发目录：

~~~sh
dsh plugin --profile desktop add link:/Users/orion/Coding/research/dsh-claude-plugins
~~~

发布到 npm 后：

~~~sh
dsh plugin --profile desktop add dsh-claude-plugins
~~~

启用 HMR 的宿主会热加载；如果运行时缓存了被移动的链接目标，重启一次桌面应用或 <code>dsh web</code>。

## 使用

### 设置页

1. 打开 **Settings → Claude 插件**。
2. 页面读取 <code>~/.claude/plugins/installed_plugins.json</code>，列出已安装插件。
3. 插件默认启用状态跟随 Claude 的 <code>enabledPlugins</code>；在本页切换会写入 dsh 自己的覆盖设置。
4. 展开插件可查看技能、命令、子代理、钩子与 MCP 的详细信息。
5. 点击「重新扫描」可读取刚安装或更新过的插件。

### 手动调用技能

Claude 插件技能默认只允许手动调用（除非打开模型自动发现）：

~~~text
/plugin-name-skill-name
~~~

例如 superpowers 插件的 <code>brainstorming</code> 技能：

~~~text
/superpowers-brainstorming
~~~

### 使用命令

Claude 命令注册为 DSH 斜杠命令：

~~~text
/feature-dev-feature-dev 增加一个登录页
~~~

命令正文按 Claude 的规则展开：

- <code>$ARGUMENTS</code> → 完整参数；
- <code>$1</code> … <code>$9</code> → 按 shell 风格拆分的位置参数；
- <code>${CLAUDE_PLUGIN_ROOT}</code> → 插件根目录。

展开后的正文作为一条 user 消息注入会话，随后模型按命令正文工作。

DSH 不支持在斜杠命令执行前施加 Claude 的 <code>allowed-tools</code> 限制，也不会执行命令正文里的动态 shell 上下文；这些内容会原样保留，模型可以自行读取文件或使用工具。

### 模型自动发现

默认关闭。关闭时：

- 技能仍可通过 <code>/plugin-skill</code> 手动调用；
- DSH 的技能目录保持为空，不增加每轮 token。

打开后，所有满足 <code>disable-model-invocation: false</code> 的插件技能都会进入会话技能目录，模型可以像普通 DSH 技能一样自动发现并加载。插件很多时请谨慎开启（本机示例：开启后有 70 个技能进入目录）。

### MCP 服务

默认关闭。打开「载入 MCP 服务」后：

- 支持的 <code>stdio</code> 与 Streamable HTTP 服务会注册到 DSH MCP 管理器；
- 工具名形如 <code>mcp__cp-&lt;plugin&gt;-&lt;server&gt;__&lt;tool&gt;</code>；
- 从 <code>${CLAUDE_PLUGIN_ROOT}</code> 展开的路径会指向插件安装目录；
- 不支持 SSE、<code>.mcpb</code> / <code>.dxt</code> bundle，以及需要 <code>${user_config.*}</code> 的服务；设置页会显示原因。

## 发现规则

默认 Claude 配置目录是 <code>~/.claude</code>，可用环境变量 <code>CLAUDE_CONFIG_DIR</code> 覆盖。

1. 读取 <code>~/.claude/plugins/installed_plugins.json</code>（v2 及旧版形状）。
2. 对每个插件读取 <code>.claude-plugin/plugin.json</code>；没有 manifest 时回退到 <code>known_marketplaces.json</code> 指向的 marketplace 条目。
3. 读取 <code>~/.claude/settings.json</code> 的 <code>enabledPlugins</code> 作为默认启用状态。
4. 若 registry 缺失，扫描 <code>~/.claude/plugins/cache/&lt;marketplace&gt;/&lt;plugin&gt;/&lt;version&gt;/</code>。
5. 额外扫描目录支持：
   - 单个插件目录（含 <code>.claude-plugin/plugin.json</code>、<code>skills/</code>、<code>commands/</code> 等）；
   - marketplace 根目录（含 <code>.claude-plugin/marketplace.json</code>，其相对 <code>source</code> 指向本地插件）；
   - cache 风格目录（<code>&lt;marketplace&gt;/&lt;plugin&gt;/&lt;version&gt;</code>）。

项目作用域的安装记录只在当前工作目录匹配 <code>projectPath</code> 时参与选择。

## 命名

DSH 的技能与命令名只允许 kebab-case，不能使用 Claude 的 <code>:</code> 命名空间，因此统一使用单个 <code>-</code>：

| Claude | DSH |
| --- | --- |
| <code>superpowers:brainstorming</code> | <code>superpowers-brainstorming</code> |
| <code>feature-dev:feature-dev</code> | <code>feature-dev-feature-dev</code> |
| <code>plugin:commands:review</code> | <code>plugin-review</code> |

插件前缀冲突时会追加 <code>-2</code> 等后缀；技能与命令共用一个命名空间，避免同一个 <code>/name</code> 指向两个不同的东西。

## 设置文件

默认：<code>$DSH_HOME/claude-plugins/settings.json</code>（未设置 <code>DSH_HOME</code> 时为 <code>~/.dsh/claude-plugins/settings.json</code>）。

~~~json
{
  "version": 1,
  "enabledPlugins": [],
  "disabledPlugins": [],
  "extraRoots": [],
  "loadSkills": true,
  "loadCommands": true,
  "loadMcp": false,
  "modelDiscovery": false
}
~~~

- <code>enabledPlugins</code>：显式启用的插件 id，优先于 Claude 的 <code>enabledPlugins</code>；
- <code>disabledPlugins</code>：显式停用的插件 id；
- <code>extraRoots</code>：额外扫描目录（绝对路径）；
- <code>loadSkills</code> / <code>loadCommands</code>：是否载入技能 / 命令；
- <code>loadMcp</code>：是否注册 MCP 服务；
- <code>modelDiscovery</code>：是否允许模型自动发现插件技能。

写在 profile 的 <code>cordis.patch.yml</code> 可覆盖构建期默认值：

~~~yaml
- id: claude-plugins
  config:
    claudeConfigDir: /Users/me/.claude
    providerName: claude-plugins
    rank: 600
~~~

支持的行配置键：<code>claudeConfigDir</code>、<code>settingsPath</code>、<code>providerName</code>、<code>rank</code>。未知键会在激活时直接报错。

## HTTP API

设置页使用三个同源端点：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | <code>/dsh-claude-plugins/snapshot</code> | 返回插件、组件、设置、来源与统计快照 |
| POST | <code>/dsh-claude-plugins/settings</code> | 校验并保存部分设置，返回新快照 |
| POST | <code>/dsh-claude-plugins/rescan</code> | 清除缓存、重新扫描并重载命令 / MCP |

~~~sh
curl http://127.0.0.1:<port>/dsh-claude-plugins/snapshot
~~~

请求体上限 256 KB；未知设置键、错误类型、非绝对目录会返回 400。

## 安全与限制

- 插件内容来自本机已安装的 Claude 插件，视同本地可信内容；命令正文会作为提示词注入，不执行 shell。
- 不执行 Claude 钩子；不创建 Claude 子代理；不执行命令里的动态 shell 上下文。
- 不安装 / 卸载 / 更新 Claude 插件；请继续使用 Claude Code 的插件命令。
- MCP 服务默认不启动；打开开关会执行插件声明的命令（stdio）或连接其 URL（HTTP）。
- 模型自动发现默认关闭，避免数百个技能摘要挤占上下文。
- 未实现 <code>user_config</code> 交互，相关 MCP 服务会标记为不支持。

## 开发

~~~sh
cd dsh-claude-plugins
npm test        # node --test：解析、发现、命令展开、设置、路由、运行时、客户端注册
npm run check   # 全部运行时模块语法检查
~~~

目录：

~~~text
index.js              host 入口（core row）
client.js             设置页客户端 bundle
cordis.patch.yml      core / settings API / MCP 三行
lib/entry.js          core 插件入口
lib/runtime.js        发现缓存、技能 provider、命令与 MCP 重载、监视
lib/discovery.js      installed_plugins / marketplace / extra roots 编排
lib/marketplaces.js   registry、marketplace、Claude enabledPlugins 读取
lib/plugin.js         单插件 manifest + marketplace 条目合并
lib/enumerate.js      技能 / 命令 / 子代理 / 钩子 / MCP 枚举
lib/documents.js      SKILL.md、命令、agent frontmatter 解析
lib/frontmatter.js    小型 YAML frontmatter 读取器
lib/mcp.js            MCP 配置归一化与注册转换
lib/command.js        参数拆分、命令展开、命令 handler
lib/snapshot.js       设置 API 的公开快照投影
lib/routes.js         /dsh-claude-plugins/* 路由
lib/ui.js             settings API row
lib/mcp-row.js        MCP manager row
lib/settings.js       设置存储
lib/shared.js         core 与 UI row 共享 runtime
test/                 Node 测试
~~~

## English

A DeepSeek Harness plugin that discovers installed Claude Code plugins (<code>~/.claude/plugins</code>), loads their skills and commands as namespaced DSH surfaces, lists subagents and hooks read-only, and optionally registers supported MCP servers. Open **Settings → Claude plugins** to enable plugins, search components, turn on model discovery, or opt into MCP loading. Skills are manual-only by default to keep the session catalog small. No hooks run, no subagents are created, and no Claude plugin is installed or removed by this package.

MIT License.