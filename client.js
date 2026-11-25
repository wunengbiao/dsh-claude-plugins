/**
 * Client half of dsh-claude-plugins: the Claude plugins settings section.
 *
 * Registers one first-level Settings section and its navigation icon. The
 * companion host plugin owns discovery and persistence; this file only reads
 * the snapshot API and writes validated setting patches.
 */
window.__ModuleLoader__.load({
  id: 'dsh-claude-plugins',
  factory(require) {
    'use strict'
    const React = require('react')
    const h = React.createElement

    const API = '/dsh-claude-plugins'
    const SNAPSHOT_ROUTE = API + '/snapshot'
    const SETTINGS_ROUTE = API + '/settings'
    const RESCAN_ROUTE = API + '/rescan'
    const ROWS_INITIAL = 40
    let hostContext

    const STRINGS = {
      zh: {
        title: 'Claude 插件',
        subtitle: '读取本机已安装的 Claude Code 插件，把技能与命令载入当前 DSH；子代理、钩子与 MCP 服务一并展示。',
        refresh: '重新扫描',
        scanning: '扫描中…',
        search: '搜索插件、技能或命令',
        clearSearch: '清除搜索',
        detected: '已检测',
        enabledCount: '已启用',
        loaded: '已载入',
        skills: '技能',
        commands: '命令',
        agents: '子代理',
        hooks: '钩子',
        mcp: 'MCP',
        modelDiscovery: '允许模型自动发现插件技能',
        modelDiscoveryHint: '关闭时技能仍可用 /名称 手动调用；开启后会把技能摘要加入会话上下文，插件较多时会明显增加 tokens。',
        modelDiscoveryOn: '已开启模型自动发现：',
        modelDiscoveryCount: ' 个技能会出现在模型目录中。',
        loadMcp: '载入 MCP 服务',
        loadMcpHint: '关闭时只展示插件声明的 MCP 服务；开启后会把支持的 stdio / HTTP 服务注册到 DSH。',
        mcpUnavailable: '当前部署没有 MCP 管理器，无法载入 MCP 服务。',
        emptyTitle: '未发现 Claude 插件',
        emptyBody: '先在本机安装 Claude Code 插件，或添加一个插件目录 / marketplace 目录。默认读取 ~/.claude/plugins。',
        emptyAction: '重新扫描',
        noMatch: '没有匹配的插件',
        noMatchBody: '试试插件名、marketplace、技能名或命令名。',
        loadError: '无法读取 Claude 插件列表',
        retry: '重试',
        roots: '扫描来源',
        claudeRoot: 'Claude 安装目录',
        extraRoot: '额外目录',
        rootPlugins: ' 个插件',
        rootMissing: '目录不存在',
        addRoot: '添加目录',
        rootPlaceholder: '/path/to/plugin-or-marketplace',
        browse: '浏览…',
        remove: '移除',
        removeRoot: '移除这个扫描目录',
        settingsPath: '设置文件',
        claudeSettings: 'Claude 设置',
        enabled: '已启用',
        disabled: '已停用',
        enablePlugin: '启用插件',
        expand: '展开详情',
        collapse: '收起详情',
        version: '版本',
        userScope: '用户',
        projectScope: '项目',
        extraSource: '额外目录',
        dshAdapter: '含 DSH 适配',
        claudeDisabled: 'Claude 中已停用',
        noComponents: '没有可载入的组件',
        issues: '问题',
        path: '路径',
        manifestMissing: '没有 plugin.json，元数据来自 marketplace 条目',
        skillsSection: '技能',
        commandsSection: '命令',
        agentsSection: '子代理',
        hooksSection: '钩子',
        mcpSection: 'MCP 服务',
        outputStyles: '输出样式',
        lspServers: 'LSP 服务',
        modelBadge: '模型可发现',
        userOnlyBadge: '手动调用',
        showAll: '显示全部',
        showLess: '收起',
        argumentHint: '参数：',
        allowedTools: '工具：',
        agentNote: 'DSH 目前只展示 Claude 子代理定义，不会创建对应 subagent。',
        hooksNote: 'DSH 不执行 Claude 钩子；这里仅展示插件声明的钩子。',
        mcpOffNote: 'MCP 载入已关闭。打开上方开关后，支持的 MCP 服务会注册到 DSH。',
        commandsOffNote: '命令载入已关闭。',
        skillsOffNote: '技能载入已关闭。',
        unsupported: '不支持',
        notLoaded: '未载入',
        connected: '已连接',
        connecting: '连接中…',
        failed: '连接失败',
        loading: '正在读取 Claude 插件…',
        saving: '正在保存…',
        pickerUnavailable: '没有可用的目录选择器，请直接粘贴路径。',
        settingsError: '设置保存失败',
        requestError: '操作失败',
        rootAdded: '目录已添加',
        clear: '清除',
      },
      en: {
        title: 'Claude plugins',
        subtitle: 'Read installed Claude Code plugins and load their skills and commands into DSH. Subagents, hooks, and MCP servers are listed alongside.',
        refresh: 'Rescan',
        scanning: 'Scanning…',
        search: 'Search plugins, skills, or commands',
        clearSearch: 'Clear search',
        detected: 'Detected',
        enabledCount: 'Enabled',
        loaded: 'Loaded',
        skills: 'Skills',
        commands: 'Commands',
        agents: 'Subagents',
        hooks: 'Hooks',
        mcp: 'MCP',
        modelDiscovery: 'Let the model discover plugin skills',
        modelDiscoveryHint: 'Off keeps skills available through /name only. On adds every skill summary to the session catalog, which costs tokens when many plugins are loaded.',
        modelDiscoveryOn: 'Model discovery is on: ',
        modelDiscoveryCount: ' skills enter the model catalog.',
        loadMcp: 'Load MCP servers',
        loadMcpHint: 'Off only lists the MCP servers a plugin declares. On registers supported stdio and HTTP servers with DSH.',
        mcpUnavailable: 'This deployment has no MCP manager, so MCP servers cannot be loaded.',
        emptyTitle: 'No Claude plugins found',
        emptyBody: 'Install a Claude Code plugin first, or add a plugin or marketplace directory. The default root is ~/.claude/plugins.',
        emptyAction: 'Rescan',
        noMatch: 'No matching plugins',
        noMatchBody: 'Try a plugin name, marketplace, skill, or command.',
        loadError: 'Could not read the Claude plugin list',
        retry: 'Retry',
        roots: 'Scan roots',
        claudeRoot: 'Claude installation',
        extraRoot: 'Extra directory',
        rootPlugins: ' plugins',
        rootMissing: 'Directory missing',
        addRoot: 'Add directory',
        rootPlaceholder: '/path/to/plugin-or-marketplace',
        browse: 'Browse…',
        remove: 'Remove',
        removeRoot: 'Remove this scan directory',
        settingsPath: 'Settings file',
        claudeSettings: 'Claude settings',
        enabled: 'Enabled',
        disabled: 'Disabled',
        enablePlugin: 'Enable plugin',
        expand: 'Expand details',
        collapse: 'Collapse details',
        version: 'Version',
        userScope: 'User',
        projectScope: 'Project',
        extraSource: 'Extra directory',
        dshAdapter: 'Has DSH adapter',
        claudeDisabled: 'Disabled in Claude',
        noComponents: 'No loadable components',
        issues: 'Issues',
        path: 'Path',
        manifestMissing: 'No plugin.json; metadata comes from the marketplace entry',
        skillsSection: 'Skills',
        commandsSection: 'Commands',
        agentsSection: 'Subagents',
        hooksSection: 'Hooks',
        mcpSection: 'MCP servers',
        outputStyles: 'Output styles',
        lspServers: 'LSP servers',
        modelBadge: 'Model-visible',
        userOnlyBadge: 'Manual only',
        showAll: 'Show all',
        showLess: 'Show less',
        argumentHint: 'Arguments: ',
        allowedTools: 'Tools: ',
        agentNote: 'DSH currently lists Claude subagent definitions but does not create matching subagents.',
        hooksNote: 'DSH does not run Claude hooks; this only lists the hooks a plugin declares.',
        mcpOffNote: 'MCP loading is off. Turn it on above to register supported MCP servers with DSH.',
        commandsOffNote: 'Command loading is off.',
        skillsOffNote: 'Skill loading is off.',
        unsupported: 'Unsupported',
        notLoaded: 'Not loaded',
        connected: 'Connected',
        connecting: 'Connecting…',
        failed: 'Connection failed',
        loading: 'Reading Claude plugins…',
        saving: 'Saving…',
        pickerUnavailable: 'No directory picker is available; paste a path instead.',
        settingsError: 'Could not save settings',
        requestError: 'Request failed',
        rootAdded: 'Directory added',
        clear: 'Clear',
      },
    }

    const CSS = [
      '.dcp-page{display:flex;flex-direction:column;gap:16px;width:100%;max-width:860px;margin:0 auto;padding:4px 2px 28px;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}',
      '.dcp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}',
      '.dcp-head-main{min-width:0;flex:1 1 320px}',
      '.dcp-title{margin:0;font-size:18px;line-height:26px;font-weight:600}',
      '.dcp-sub{margin:4px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);max-width:62ch}',
      '.dcp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}',
      '.dcp-btn:disabled{opacity:.55;cursor:default}',
      '.dcp-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}',
      '.dcp-stats{display:flex;flex-wrap:wrap;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
      '.dcp-stat{flex:1 1 88px;box-sizing:border-box;display:flex;flex-direction:column;gap:2px;padding:10px 12px;background:var(--dsw-alias-bg-layer-1);min-width:0;border-right:0.5px solid var(--dsw-alias-border-l3);border-bottom:0.5px solid var(--dsw-alias-border-l3);margin-bottom:-0.5px}',
      '.dcp-stat-value{font-size:18px;line-height:24px;font-weight:600;font-variant-numeric:tabular-nums}',
      '.dcp-stat-label{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dcp-banner{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-radius:var(--dsw-radius-md);font-size:12px;line-height:18px}',
      '.dcp-banner-error{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}',
      '.dcp-banner-warn{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-state-warn-tertiary)}',
      '.dcp-banner svg{flex:none;margin-top:2px}',
      '.dcp-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.dcp-search{position:relative;flex:1 1 240px;min-width:180px}',
      '.dcp-search svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--dsw-alias-label-tertiary);pointer-events:none}',
      '.dcp-search input{width:100%;height:32px;box-sizing:border-box;padding:0 30px 0 30px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);outline:none;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}',
      '.dcp-search input:focus{border-color:var(--dsw-alias-state-business-primary);box-shadow:inset 0 0 0 0.5px var(--dsw-alias-state-business-primary)}',
      '.dcp-search-clear{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0}',
      '.dcp-model{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 12px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}',
      '.dcp-model-main{min-width:0;flex:1}',
      '.dcp-model-title{font-size:12.5px;line-height:18px;font-weight:500}',
      '.dcp-model-hint{margin-top:2px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);max-width:78ch}',
      '.dcp-switch{position:relative;display:inline-flex;flex:none;align-items:center;width:34px;height:20px}',
      '.dcp-switch input{position:absolute;width:1px;height:1px;opacity:0;margin:0;pointer-events:none}',
      '.dcp-track{display:block;width:34px;height:20px;border-radius:999px;background:var(--dsw-alias-border-l3);transition:background 140ms ease;position:relative}',
      '.dcp-thumb{position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:999px;background:var(--dsw-alias-bg-base);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform 140ms ease}',
      '.dcp-switch input:checked + .dcp-track{background:var(--dsw-alias-state-business-primary)}',
      '.dcp-switch input:checked + .dcp-track .dcp-thumb{transform:translateX(14px)}',
      '.dcp-switch input:focus-visible + .dcp-track{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.dcp-switch input:disabled + .dcp-track{opacity:.55}',
      '.dcp-list{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}',
      '.dcp-card{border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
      '.dcp-card-head{display:flex;align-items:flex-start;gap:12px;padding:12px 14px}',
      '.dcp-avatar{display:inline-flex;flex:none;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1;font-weight:600}',
      '.dcp-card-main{flex:1;min-width:0}',
      '.dcp-title-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-width:0}',
      '.dcp-name{font-size:14px;line-height:20px;font-weight:600;overflow:hidden;text-overflow:ellipsis;max-width:100%}',
      '.dcp-chips{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:5px}',
      '.dcp-chip{display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px;white-space:nowrap}',
      '.dcp-chip-bad{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,transparent)}',
      '.dcp-chip-ok{color:var(--dsw-alias-state-business-primary)}',
      '.dcp-subline{margin-top:3px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption);overflow-wrap:anywhere}',
      '.dcp-desc{margin:6px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}',
      '.dcp-card-end{display:flex;flex:none;align-items:center;gap:6px;padding-top:1px}',
      '.dcp-expand{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-caption);cursor:pointer}',
      '.dcp-expand:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}',
      '.dcp-expand[aria-expanded="true"] svg{transform:rotate(180deg)}',
      '.dcp-expand svg{transition:transform 140ms ease}',
      '.dcp-spinner{width:13px;height:13px;border:1.5px solid var(--dsw-alias-border-l3);border-top-color:var(--dsw-alias-state-business-primary);border-radius:999px;animation:dcp-spin .8s linear infinite}',
      '.dcp-detail{border-top:0.5px solid var(--dsw-alias-border-l3);padding:12px 14px 14px;display:flex;flex-direction:column;gap:14px}',
      '.dcp-detail-section{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dcp-detail-head{display:flex;align-items:baseline;gap:8px}',
      '.dcp-detail-title{font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.dcp-detail-count{font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}',
      '.dcp-note{margin:0;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}',
      '.dcp-rows{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.dcp-row{display:flex;align-items:flex-start;gap:10px;padding:5px 0;min-width:0;border-radius:var(--dsw-radius-sm)}',
      '.dcp-row + .dcp-row{border-top:0.5px solid color-mix(in srgb,var(--dsw-alias-border-l3) 55%,transparent)}',
      '.dcp-row-name{flex:none;max-width:46%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:18px;color:var(--dsw-alias-label-primary)}',
      '.dcp-row-main{flex:1;min-width:0}',
      '.dcp-row-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}',
      '.dcp-row-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:2px}',
      '.dcp-row-path{font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-caption);overflow-wrap:anywhere}',
      '.dcp-more{align-self:flex-start;margin-top:2px;padding:0;border:0;background:transparent;font:inherit;font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dcp-more:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px;border-radius:3px}',
      '.dcp-issues{display:flex;flex-direction:column;gap:3px;padding:8px 10px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 7%,transparent)}',
      '.dcp-issue{font-size:11px;line-height:17px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}',
      '.dcp-foot{display:flex;flex-direction:column;gap:2px;padding-top:2px;font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-caption);overflow-wrap:anywhere}',
      '.dcp-empty{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:22px 18px;border:0.5px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg)}',
      '.dcp-empty-title{font-size:13px;line-height:20px;font-weight:600}',
      '.dcp-empty-body{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);max-width:66ch}',
      '.dcp-empty-actions{display:flex;gap:8px;margin-top:4px}',
      '.dcp-skeleton{display:flex;flex-direction:column;gap:8px}',
      '.dcp-skeleton-card{display:flex;align-items:center;gap:12px;padding:12px 14px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}',
      '.dcp-skel{background:var(--dsw-alias-bg-skeleton);border-radius:var(--dsw-radius-xs);animation:dcp-pulse 1.8s ease-in-out infinite}',
      '.dcp-skel-avatar{width:38px;height:38px;border-radius:10px;flex:none}',
      '.dcp-skel-lines{flex:1;display:flex;flex-direction:column;gap:6px}',
      '.dcp-skel-title{width:34%;height:12px}',
      '.dcp-skel-line{width:78%;height:10px}',
      '.dcp-roots{border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);padding:0 12px}',
      '.dcp-roots summary{cursor:pointer;padding:10px 0;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.dcp-roots summary:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px;border-radius:4px}',
      '.dcp-roots-body{display:flex;flex-direction:column;gap:8px;padding-bottom:12px}',
      '.dcp-root{display:flex;align-items:flex-start;gap:8px;min-width:0}',
      '.dcp-root-kind{flex:none;font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary);min-width:76px}',
      '.dcp-root-path{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:18px;overflow-wrap:anywhere}',
      '.dcp-root-state{flex:none;font-size:11px;line-height:18px;color:var(--dsw-alias-label-caption);white-space:nowrap}',
      '.dcp-root-remove{flex:none;width:24px;height:24px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-caption);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}',
      '.dcp-root-add{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px}',
      '.dcp-root-input{flex:1 1 240px;min-width:0;height:30px;padding:0 9px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:transparent;color:inherit;font:inherit;font-size:12px;outline:none}',
      '.dcp-root-input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.dcp-meta{display:flex;flex-direction:column;gap:2px;padding-top:8px;border-top:0.5px solid var(--dsw-alias-border-l3);font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-caption);overflow-wrap:anywhere}',
      '@keyframes dcp-spin{to{transform:rotate(360deg)}}',
      '@keyframes dcp-pulse{0%,100%{opacity:1}50%{opacity:.55}}',
      '@media (hover:hover){.dcp-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.dcp-expand:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.dcp-root-remove:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-error-primary)}.dcp-more:hover{color:var(--dsw-alias-label-primary)}.dcp-search-clear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}}',
      '@media (max-width:640px){.dcp-head{flex-direction:column;align-items:stretch;justify-content:flex-start}.dcp-head-main{flex:0 1 auto}.dcp-head .dcp-btn{align-self:flex-start;margin-top:4px}.dcp-card-head{flex-wrap:wrap}.dcp-card-end{margin-left:auto}.dcp-row{flex-direction:column;gap:1px}.dcp-row-name{max-width:100%;white-space:normal}.dcp-root{flex-wrap:wrap}.dcp-root-kind{min-width:0}}',
      '@media (pointer:coarse){.dcp-search input,.dcp-root-input{font-size:16px}.dcp-btn{height:36px}.dcp-expand{width:34px;height:34px}}',
      '@media (prefers-reduced-motion:reduce){.dcp-spinner,.dcp-skel{animation:none}.dcp-track,.dcp-thumb,.dcp-expand svg{transition:none}}',
    ].join('\n')

    function mountStyles() {
      if (typeof document === 'undefined') return () => undefined
      const existing = document.querySelector('style[data-plugin-css="dsh-claude-plugins"]')
      if (existing !== null) return () => undefined
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-claude-plugins'
      tag.dataset.pluginCss = 'dsh-claude-plugins'
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => { tag.remove() }
    }

    function isZh() {
      let lang = 'en'
      try {
        lang = document.documentElement.getAttribute('lang') || navigator.language || 'en'
      } catch {
        lang = 'en'
      }
      return String(lang).toLowerCase().startsWith('zh')
    }

    function messageOf(error) {
      if (error instanceof Error && error.message !== '') return error.message
      return String(error)
    }

    async function jsonFetch(url, init) {
      const response = await fetch(url, { credentials: 'same-origin', ...init })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'HTTP ' + response.status)
      return payload
    }

    async function pickDirectory() {
      const desktop = globalThis.__DSH_DIRECTORY_PICKER__
      if (desktop !== undefined && typeof desktop.pick === 'function') {
        const result = await desktop.pick()
        return typeof result === 'string' && result !== '' ? result : undefined
      }
      const workspace = hostContext?.uiWorkspace ?? (typeof hostContext?.get === 'function' ? hostContext.get('uiWorkspace') : undefined)
      if (workspace !== undefined && typeof workspace.pickDirectory === 'function') {
        const result = await workspace.pickDirectory()
        return typeof result === 'string' && result !== '' ? result : undefined
      }
      throw new Error('picker unavailable')
    }

    function icon(paths, size, width) {
      const list = Array.isArray(paths) ? paths : [paths]
      return h('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, 'aria-hidden': 'true', fill: 'none' },
        list.map((d, index) => h('path', {
          key: index,
          d,
          stroke: 'currentColor',
          strokeWidth: width || 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        })))
    }

    const GLYPH = {
      search: 'M3 6.2a3.2 3.2 0 1 1 6.4 0 3.2 3.2 0 0 1-6.4 0Zm5.6 2.3L11 11',
      refresh: ['M10.6 4.4A4.6 4.6 0 1 0 11 9', 'M10.9 1.8v2.9H8'],
      chevron: 'M3.2 5.1 6 7.9l2.8-2.8',
      close: 'M3.6 3.6l4.8 4.8m0-4.8L3.6 8.4',
      plus: 'M6 2.6v6.8M2.6 6h6.8',
      trash: ['M2.6 3.6h6.8', 'M4.2 3.6V2.4h3.6v1.2', 'M3.4 3.6l.4 6.1h4.4l.4-6.1'],
      alert: ['M6 2.2 11 10.8H1L6 2.2Z', 'M6 5.1v2.4', 'M6 9.1v.2'],
      plugin: ['M4.1 2.6h2.2V1.9a1.2 1.2 0 0 1 2.4 0v.7h2.2a.9.9 0 0 1 .9.9v2.1h.7a1.2 1.2 0 0 1 0 2.4h-.7v2.1a.9.9 0 0 1-.9.9H8.7v-.7a1.2 1.2 0 0 0-2.4 0v.7H4.1a.9.9 0 0 1-.9-.9V6h-.7a1.2 1.2 0 0 1 0-2.4h.7V3.5a.9.9 0 0 1 .9-.9Z'],
      folder: ['M2 3.4h3.1l1 1.2H10a.8.8 0 0 1 .8.8v4.2a.8.8 0 0 1-.8.8H2.8a.8.8 0 0 1-.8-.8V3.4Z'],
    }

    function useSnapshot() {
      const [snapshot, setSnapshot] = React.useState(null)
      const [status, setStatus] = React.useState('loading')
      const [error, setError] = React.useState('')
      const [pending, setPending] = React.useState('')

      const load = React.useCallback(async () => {
        setStatus('loading')
        setError('')
        try {
          const next = await jsonFetch(SNAPSHOT_ROUTE)
          setSnapshot(next)
          setStatus('ready')
        } catch (failure) {
          setStatus('error')
          setError(messageOf(failure))
        }
      }, [])

      React.useEffect(() => { void load() }, [load])

      const save = React.useCallback(async (patch, key) => {
        setPending(key)
        setError('')
        try {
          const next = await jsonFetch(SETTINGS_ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          })
          setSnapshot(next)
          setStatus('ready')
          return true
        } catch (failure) {
          setError(messageOf(failure))
          return false
        } finally {
          setPending('')
        }
      }, [])

      const rescan = React.useCallback(async () => {
        setPending('scan')
        setError('')
        try {
          const next = await jsonFetch(RESCAN_ROUTE, { method: 'POST' })
          setSnapshot(next)
          setStatus('ready')
        } catch (failure) {
          setError(messageOf(failure))
        } finally {
          setPending('')
        }
      }, [])

      return { snapshot, status, error, pending, load, save, rescan }
    }

    function Spinner() {
      return h('span', { className: 'dcp-spinner', 'aria-hidden': 'true' })
    }

    function Stat(props) {
      return h('div', { className: 'dcp-stat' },
        h('div', { className: 'dcp-stat-value' }, String(props.value)),
        h('div', { className: 'dcp-stat-label' }, props.label))
    }

    function LimitedList(props) {
      const [all, setAll] = React.useState(false)
      const items = all ? props.items : props.items.slice(0, ROWS_INITIAL)
      return h(React.Fragment, null,
        h('div', { className: 'dcp-rows' }, items.map(props.render)),
        props.items.length > ROWS_INITIAL
          ? h('button', { type: 'button', className: 'dcp-more', onClick: () => setAll((value) => !value) },
            all ? props.t.showLess : props.t.showAll + ' (' + props.items.length + ')')
          : null)
    }

    function DetailSection(props) {
      if (props.items.length === 0) return null
      return h('section', { className: 'dcp-detail-section' },
        h('div', { className: 'dcp-detail-head' },
          h('h4', { className: 'dcp-detail-title' }, props.title),
          h('span', { className: 'dcp-detail-count' }, String(props.items.length))),
        props.note === undefined ? null : h('p', { className: 'dcp-note' }, props.note),
        h(LimitedList, { items: props.items, t: props.t, render: props.render }))
    }

    function SkillRow(props) {
      const skill = props.skill
      return h('div', { className: 'dcp-row' },
        h('code', { className: 'dcp-row-name', title: skill.path }, '/' + skill.dshName),
        h('div', { className: 'dcp-row-main' },
          h('div', { className: 'dcp-row-desc' }, skill.description),
          h('div', { className: 'dcp-row-meta' },
            skill.modelInvocable ? h('span', { className: 'dcp-chip dcp-chip-ok' }, props.t.modelBadge) : null,
            skill.userInvocable ? h('span', { className: 'dcp-chip' }, props.t.userOnlyBadge) : null)))
    }

    function CommandRow(props) {
      const command = props.command
      return h('div', { className: 'dcp-row' },
        h('code', { className: 'dcp-row-name', title: command.path }, '/' + command.dshName),
        h('div', { className: 'dcp-row-main' },
          h('div', { className: 'dcp-row-desc' }, command.description),
          h('div', { className: 'dcp-row-meta' },
            command.argumentHint === undefined ? null : h('span', { className: 'dcp-chip' }, props.t.argumentHint + command.argumentHint),
            command.allowedTools === undefined ? null : h('span', { className: 'dcp-chip' }, props.t.allowedTools + command.allowedTools.join(', ')))))
    }

    function AgentRow(props) {
      const agent = props.agent
      return h('div', { className: 'dcp-row' },
        h('code', { className: 'dcp-row-name', title: agent.path }, props.pluginName + ':' + agent.name),
        h('div', { className: 'dcp-row-main' },
          h('div', { className: 'dcp-row-desc' }, agent.description),
          h('div', { className: 'dcp-row-meta' },
            agent.model === undefined ? null : h('span', { className: 'dcp-chip' }, agent.model),
            agent.tools === undefined ? null : h('span', { className: 'dcp-chip' }, agent.tools.join(', ')))))
    }

    function HookRow(props) {
      return h('div', { className: 'dcp-row' },
        h('code', { className: 'dcp-row-name' }, props.hook.event),
        h('div', { className: 'dcp-row-main' },
          h('div', { className: 'dcp-row-meta' },
            h('span', { className: 'dcp-chip' }, props.hook.count + ' hook' + (props.hook.count === 1 ? '' : 's'))),
          h('div', { className: 'dcp-row-path', title: props.hook.path }, props.hook.path)))
    }

    function mcpState(server, settings, t) {
      if (server.transport === 'unsupported') return { label: server.unsupportedReason || t.unsupported, tone: 'bad' }
      if (!settings.loadMcp) return { label: t.notLoaded, tone: 'muted' }
      if (server.live === undefined) return { label: t.connecting, tone: 'muted' }
      if (server.live.state === 'failed') return { label: t.failed, tone: 'bad' }
      if (server.live.state === 'connected' || server.live.state === 'ready') return { label: t.connected, tone: 'ok' }
      return { label: server.live.state || t.connecting, tone: 'muted' }
    }

    function McpRow(props) {
      const state = mcpState(props.server, props.settings, props.t)
      return h('div', { className: 'dcp-row' },
        h('code', { className: 'dcp-row-name', title: props.server.sourcePath }, props.server.dshName),
        h('div', { className: 'dcp-row-main' },
          h('div', { className: 'dcp-row-desc' }, props.server.description),
          h('div', { className: 'dcp-row-meta' },
            h('span', { className: 'dcp-chip' }, props.server.transport),
            h('span', { className: 'dcp-chip' + (state.tone === 'bad' ? ' dcp-chip-bad' : state.tone === 'ok' ? ' dcp-chip-ok' : '') }, state.label))))
    }

    function PluginDetail(props) {
      const { plugin, settings, t } = props
      const skills = plugin.components.skills
      const commands = plugin.components.commands
      const agents = plugin.components.agents
      const hooks = plugin.components.hooks
      const mcp = plugin.components.mcpServers
      return h('div', { className: 'dcp-detail' },
        plugin.issues.length === 0 ? null : h('div', { className: 'dcp-issues' },
          plugin.issues.map((issue, index) => h('div', { className: 'dcp-issue', key: index }, issue.code + ': ' + issue.message + (issue.path === undefined ? '' : ' — ' + issue.path)))),
        h(DetailSection, {
          title: t.skillsSection,
          items: settings.loadSkills ? skills : [],
          note: settings.loadSkills ? undefined : t.skillsOffNote,
          t,
          render: (skill) => h(SkillRow, { key: skill.dshName, skill, t }),
        }),
        h(DetailSection, {
          title: t.commandsSection,
          items: settings.loadCommands ? commands : [],
          note: settings.loadCommands ? undefined : t.commandsOffNote,
          t,
          render: (command) => h(CommandRow, { key: command.dshName, command, t }),
        }),
        h(DetailSection, {
          title: t.agentsSection,
          items: agents,
          note: t.agentNote,
          t,
          render: (agent) => h(AgentRow, { key: agent.name, agent, t, pluginName: plugin.name }),
        }),
        h(DetailSection, {
          title: t.hooksSection,
          items: hooks,
          note: t.hooksNote,
          t,
          render: (hook) => h(HookRow, { key: hook.event + hook.path, hook, t }),
        }),
        h(DetailSection, {
          title: t.mcpSection,
          items: mcp,
          note: settings.loadMcp ? undefined : t.mcpOffNote,
          t,
          render: (server) => h(McpRow, { key: server.name, server, settings, t }),
        }),
        h('div', { className: 'dcp-foot' },
          h('div', null, t.path + ': ' + plugin.path),
          plugin.manifestFound ? null : h('div', null, t.manifestMissing),
          h('div', null, t.outputStyles + ': ' + plugin.components.outputStyles + ' · ' + t.lspServers + ': ' + plugin.components.lspServers))
      )
    }

    function PluginCard(props) {
      const { plugin, t, settings, pending, expanded, onToggle, onExpand } = props
      const busy = pending === plugin.id
      const chips = []
      if (plugin.version !== undefined) chips.push(t.version + ' ' + plugin.version)
      if (plugin.scope === 'project') chips.push(t.projectScope)
      if (plugin.source === 'extra') chips.push(t.extraSource)
      if (plugin.components.hasDshAdapter) chips.push(t.dshAdapter)
      if (plugin.enablementSource === 'settings' && plugin.claudeEnabled === false) chips.push(t.claudeDisabled)
      const counts = [
        [t.skills, plugin.components.skills.length],
        [t.commands, plugin.components.commands.length],
        [t.agents, plugin.components.agents.length],
        [t.hooks, plugin.components.hooks.length],
        [t.mcp, plugin.components.mcpServers.length],
      ].filter(([, count]) => count > 0)
      return h('li', { className: 'dcp-card' },
        h('div', { className: 'dcp-card-head' },
          h('div', { className: 'dcp-avatar', 'aria-hidden': 'true' }, (plugin.displayName || plugin.name).slice(0, 1).toUpperCase()),
          h('div', { className: 'dcp-card-main' },
            h('div', { className: 'dcp-title-row' },
              h('span', { className: 'dcp-name', title: plugin.id }, plugin.displayName || plugin.name),
              plugin.issues.length === 0 ? null : h('span', { className: 'dcp-chip dcp-chip-bad' }, t.issues + ' ' + plugin.issues.length)),
            h('div', { className: 'dcp-subline' }, plugin.id),
            plugin.description === '' ? null : h('p', { className: 'dcp-desc' }, plugin.description),
            h('div', { className: 'dcp-chips' },
              chips.map((chip, index) => h('span', { className: 'dcp-chip', key: index }, chip)),
              counts.length === 0
                ? h('span', { className: 'dcp-chip' }, t.noComponents)
                : counts.map(([label, count]) => h('span', { className: 'dcp-chip', key: label }, label + ' ' + count)))),
          h('div', { className: 'dcp-card-end' },
            busy ? h(Spinner) : null,
            h('label', { className: 'dcp-switch', title: plugin.enabled ? t.enabled : t.disabled },
              h('input', {
                type: 'checkbox',
                checked: plugin.enabled,
                disabled: pending !== '',
                'aria-label': t.enablePlugin + ' ' + (plugin.displayName || plugin.name),
                onChange: () => onToggle(plugin),
              }),
              h('span', { className: 'dcp-track', 'aria-hidden': 'true' }, h('span', { className: 'dcp-thumb' })))),
          h('button', {
            type: 'button',
            className: 'dcp-expand',
            'aria-expanded': expanded,
            'aria-label': expanded ? t.collapse : t.expand,
            title: expanded ? t.collapse : t.expand,
            onClick: () => onExpand(plugin.id),
          }, expanded ? icon('M3 7.9 6 5l3 2.9', 12) : icon(GLYPH.chevron, 12))),
        expanded ? h(PluginDetail, { plugin, settings, t }) : null)
    }

    function Skeleton() {
      return h('div', { className: 'dcp-skeleton' }, [0, 1, 2].map((index) =>
        h('div', { className: 'dcp-skeleton-card', key: index },
          h('div', { className: 'dcp-skel dcp-skel-avatar' }),
          h('div', { className: 'dcp-skel-lines' },
            h('div', { className: 'dcp-skel dcp-skel-title' }),
            h('div', { className: 'dcp-skel dcp-skel-line' })))))
    }

    function EmptyState(props) {
      return h('div', { className: 'dcp-empty' },
        h('div', { className: 'dcp-empty-title' }, props.title),
        h('div', { className: 'dcp-empty-body' }, props.body),
        props.action === undefined ? null : h('div', { className: 'dcp-empty-actions' },
          h('button', { type: 'button', className: 'dcp-btn', onClick: props.action }, props.actionLabel)))
    }

    function ClaudePluginsSettings() {
      const zh = isZh()
      const t = STRINGS[zh ? 'zh' : 'en']
      const { snapshot, status, error, pending, load, save, rescan } = useSnapshot()
      const [query, setQuery] = React.useState('')
      const [expandedId, setExpandedId] = React.useState('')
      const [rootInput, setRootInput] = React.useState('')
      const [pickerError, setPickerError] = React.useState('')

      const settings = snapshot?.settings
      const plugins = snapshot?.plugins ?? []
      const normalizedQuery = query.trim().toLowerCase()
      const filtered = React.useMemo(() => {
        if (normalizedQuery === '') return plugins
        return plugins.filter((plugin) => haystack(plugin).includes(normalizedQuery))
      }, [plugins, normalizedQuery])

      const togglePlugin = (plugin) => {
        if (pending !== '') return
        const enabled = !plugin.enabled
        const enabledPlugins = enabled
          ? [plugin.id, ...settings.enabledPlugins.filter((entry) => entry !== plugin.id)]
          : settings.enabledPlugins.filter((entry) => entry !== plugin.id)
        const disabledPlugins = enabled
          ? settings.disabledPlugins.filter((entry) => entry !== plugin.id)
          : [plugin.id, ...settings.disabledPlugins.filter((entry) => entry !== plugin.id)]
        void save({ enabledPlugins, disabledPlugins }, plugin.id)
      }

      const toggleModel = () => {
        if (pending !== '') return
        void save({ modelDiscovery: !settings.modelDiscovery }, 'model')
      }

      const toggleMcp = () => {
        if (pending !== '' || snapshot?.capabilities.mcp !== true) return
        void save({ loadMcp: !settings.loadMcp }, 'mcp')
      }

      const addRoot = async (value, key) => {
        const path = value.trim()
        if (path === '') return false
        const ok = await save({ extraRoots: [...settings.extraRoots, path] }, key)
        if (ok) setRootInput('')
        return ok
      }

      const browse = async () => {
        setPickerError('')
        try {
          const picked = await pickDirectory()
          if (picked !== undefined) await addRoot(picked, 'root')
        } catch (failure) {
          setPickerError(failure instanceof Error && failure.message === 'picker unavailable' ? t.pickerUnavailable : messageOf(failure))
        }
      }

      const removeRoot = (path) => {
        if (pending !== '') return
        void save({ extraRoots: settings.extraRoots.filter((entry) => entry !== path) }, 'root')
      }

      const stats = snapshot?.summary
      return h('section', { className: 'dcp-page' },
        h('header', { className: 'dcp-head' },
          h('div', { className: 'dcp-head-main' },
            h('h2', { className: 'dcp-title' }, t.title),
            h('p', { className: 'dcp-sub' }, t.subtitle)),
          h('button', { type: 'button', className: 'dcp-btn', onClick: () => void rescan(), disabled: pending !== '', 'aria-busy': pending === 'scan' },
            pending === 'scan' ? h(Spinner) : icon(GLYPH.refresh, 13),
            pending === 'scan' ? t.scanning : t.refresh)),

        stats === undefined ? null : h('div', { className: 'dcp-stats' },
          h(Stat, { label: t.detected, value: stats.detected }),
          h(Stat, { label: t.enabledCount, value: stats.enabled }),
          h(Stat, { label: t.skills, value: stats.skills }),
          h(Stat, { label: t.commands, value: stats.commands }),
          stats.agents > 0 ? h(Stat, { label: t.agents, value: stats.agents }) : null,
          stats.recognizedMcpServers > 0 ? h(Stat, { label: t.mcp, value: stats.mcpServers + '/' + stats.recognizedMcpServers }) : null),

        error === '' ? null : h('div', { className: 'dcp-banner dcp-banner-error', role: 'alert' },
          icon(GLYPH.alert, 14),
          h('div', null, h('div', null, t.requestError), h('div', null, error))),

        h('div', { className: 'dcp-toolbar' },
          h('div', { className: 'dcp-search' },
            icon(GLYPH.search, 13),
            h('input', {
              type: 'search',
              value: query,
              placeholder: t.search,
              'aria-label': t.search,
              onChange: (event) => setQuery(event.target.value),
            }),
            query === '' ? null : h('button', { type: 'button', className: 'dcp-search-clear', 'aria-label': t.clearSearch, title: t.clearSearch, onClick: () => setQuery('') }, icon(GLYPH.close, 11)))),

        settings === undefined ? null : h('div', { className: 'dcp-model' },
          h('div', { className: 'dcp-model-main' },
            h('div', { className: 'dcp-model-title' }, t.modelDiscovery),
            h('div', { className: 'dcp-model-hint' }, t.modelDiscoveryHint)),
          h('label', { className: 'dcp-switch', title: t.modelDiscovery },
            h('input', {
              type: 'checkbox',
              checked: settings.modelDiscovery,
              disabled: pending !== '',
              'aria-label': t.modelDiscovery,
              onChange: toggleModel,
            }),
            h('span', { className: 'dcp-track', 'aria-hidden': 'true' }, h('span', { className: 'dcp-thumb' })))),

        settings === undefined ? null : h('div', { className: 'dcp-model' },
          h('div', { className: 'dcp-model-main' },
            h('div', { className: 'dcp-model-title' }, t.loadMcp),
            h('div', { className: 'dcp-model-hint' }, snapshot.capabilities.mcp ? t.loadMcpHint : t.mcpUnavailable)),
          h('label', { className: 'dcp-switch', title: t.loadMcp },
            h('input', {
              type: 'checkbox',
              checked: settings.loadMcp,
              disabled: pending !== '' || snapshot.capabilities.mcp !== true,
              'aria-label': t.loadMcp,
              onChange: toggleMcp,
            }),
            h('span', { className: 'dcp-track', 'aria-hidden': 'true' }, h('span', { className: 'dcp-thumb' })))),
        settings !== undefined && settings.modelDiscovery && stats !== undefined && stats.modelSkills > 0
          ? h('div', { className: 'dcp-banner dcp-banner-warn' },
            icon(GLYPH.alert, 14),
            h('div', null, t.modelDiscoveryOn + stats.modelSkills + t.modelDiscoveryCount))
          : null,

        status === 'loading' && snapshot === null ? h(Skeleton) : null,
        status === 'error' && snapshot === null
          ? h(EmptyState, { title: t.loadError, body: error, action: () => void load(), actionLabel: t.retry })
          : null,
        snapshot !== null && plugins.length === 0
          ? h(EmptyState, { title: t.emptyTitle, body: t.emptyBody, action: () => void rescan(), actionLabel: t.emptyAction })
          : null,
        snapshot !== null && plugins.length > 0 && filtered.length === 0
          ? h(EmptyState, { title: t.noMatch, body: t.noMatchBody, action: () => setQuery(''), actionLabel: t.clear })
          : null,

        filtered.length === 0 ? null : h('ul', { className: 'dcp-list' }, filtered.map((plugin) =>
          h(PluginCard, {
            key: plugin.id,
            plugin,
            t,
            settings,
            pending,
            expanded: expandedId === plugin.id,
            onToggle: togglePlugin,
            onExpand: (id) => setExpandedId((current) => (current === id ? '' : id)),
          }))),

        snapshot === null ? null : h('details', { className: 'dcp-roots' },
          h('summary', null, t.roots + ' (' + snapshot.roots.length + ')'),
          h('div', { className: 'dcp-roots-body' },
            snapshot.roots.map((root) => h('div', { className: 'dcp-root', key: root.path + root.kind },
              h('span', { className: 'dcp-root-kind' }, root.kind === 'claude' ? t.claudeRoot : t.extraRoot),
              h('span', { className: 'dcp-root-path', title: root.path }, root.path),
              h('span', { className: 'dcp-root-state' }, root.exists ? root.pluginCount + t.rootPlugins : t.rootMissing),
              root.kind === 'extra'
                ? h('button', { type: 'button', className: 'dcp-root-remove', 'aria-label': t.removeRoot, title: t.removeRoot, disabled: pending !== '', onClick: () => removeRoot(root.path) }, icon(GLYPH.trash, 12))
                : null)),
            pickerError === '' ? null : h('div', { className: 'dcp-issue' }, pickerError),
            h('div', { className: 'dcp-root-add' },
              h('input', {
                className: 'dcp-root-input',
                type: 'text',
                value: rootInput,
                placeholder: t.rootPlaceholder,
                'aria-label': t.addRoot,
                onChange: (event) => setRootInput(event.target.value),
              }),
              h('button', { type: 'button', className: 'dcp-btn', disabled: pending !== '', onClick: () => void browse() }, icon(GLYPH.folder, 13), t.browse),
              h('button', { type: 'button', className: 'dcp-btn', disabled: pending !== '' || rootInput.trim() === '', onClick: () => void addRoot(rootInput, 'root') }, icon(GLYPH.plus, 13), t.addRoot)),
            h('div', { className: 'dcp-meta' },
              h('div', null, t.settingsPath + ': ' + snapshot.settingsPath),
              h('div', null, t.claudeSettings + ': ' + snapshot.claudeSettings.path + (snapshot.claudeSettings.error === undefined ? '' : ' (' + snapshot.claudeSettings.error + ')')))))
      )
    }

    function haystack(plugin) {
      const parts = [plugin.id, plugin.name, plugin.displayName, plugin.description, plugin.marketplace]
      for (const key of ['skills', 'commands', 'agents']) {
        for (const item of plugin.components[key]) parts.push(item.name, item.dshName, item.description)
      }
      for (const server of plugin.components.mcpServers) parts.push(server.name, server.description)
      return parts.filter((part) => typeof part === 'string').join('\n').toLowerCase()
    }

    function sectionLabel() {
      return isZh() ? 'Claude 插件' : 'Claude plugins'
    }

    function ClaudePluginsIcon() {
      return icon(GLYPH.plugin, 16, 1.4)
    }

    function apply(ctx) {
      hostContext = ctx
      ctx.effect(() => mountStyles(), 'dsh-claude-plugins: styles')
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          { name: 'settings.section', id: 'claude-plugins', order: 92, label: sectionLabel },
          ClaudePluginsSettings))
      ctx.slots.inject('settings.section.icon', () =>
        ctx.slots.register({ name: 'settings.section.icon', id: 'claude-plugins', order: 92 }, ClaudePluginsIcon))
    }

    apply.__test = {
      STRINGS,
      CSS,
      API,
      SNAPSHOT_ROUTE,
      SETTINGS_ROUTE,
      RESCAN_ROUTE,
      haystack,
      mcpState,
      sectionLabel,
      pickDirectory,
    }

    return { name: 'dsh-claude-plugins', inject: ['slots'], apply }
  },
})