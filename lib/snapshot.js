import { describeMcpServer, mcpServerName } from './mcp.js'

/** Project the internal discovery model into the JSON the settings surface consumes. */
export function buildSnapshot(options) {
  const settings = options.settings
  const live = options.mcpLive ?? new Map()
  const plugins = options.discovery.plugins
    .map((plugin) => publicPlugin(plugin, settings, live))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
  const issues = [...options.discovery.issues, ...(options.extraIssues ?? [])]
  const summary = summarize(plugins, settings, issues)
  return {
    generatedAt: new Date().toISOString(),
    cwd: options.cwd ?? null,
    settings,
    settingsPath: options.settingsPath,
    claudeConfigDir: options.claudeConfigDir,
    claudeSettings: options.discovery.claudeSettings,
    roots: options.discovery.roots,
    capabilities: options.capabilities,
    summary,
    issues,
    plugins,
  }
}

function publicPlugin(plugin, settings, live) {
  return {
    id: plugin.id,
    name: plugin.name,
    displayName: plugin.displayName,
    version: plugin.version,
    description: plugin.description,
    author: plugin.author,
    homepage: plugin.homepage,
    repository: plugin.repository,
    license: plugin.license,
    keywords: plugin.keywords,
    marketplace: plugin.marketplace,
    scope: plugin.scope,
    projectPath: plugin.projectPath,
    path: plugin.path,
    manifestFound: plugin.manifestFound,
    source: plugin.source,
    defaultEnabled: plugin.defaultEnabled,
    enabled: plugin.enabled,
    enablementSource: plugin.enablementSource,
    claudeEnabled: plugin.claudeEnabled,
    prefix: plugin.prefix,
    components: {
      skills: plugin.components.skills.map((skill) => ({
        name: skill.name,
        dshName: skill.dshName,
        description: skill.description,
        whenToUse: skill.whenToUse,
        path: skill.path,
        relativePath: skill.relativePath,
        modelInvocable: skill.modelInvocable && settings.modelDiscovery,
        userInvocable: skill.userInvocable,
      })),
      commands: plugin.components.commands.map((command) => ({
        name: command.name,
        dshName: command.dshName,
        description: command.description,
        argumentHint: command.argumentHint,
        allowedTools: command.allowedTools,
        model: command.model,
        path: command.path,
        relativePath: command.relativePath,
      })),
      agents: plugin.components.agents.map((agent) => ({
        name: agent.name,
        description: agent.description,
        model: agent.model,
        tools: agent.tools,
        path: agent.path,
        relativePath: agent.relativePath,
      })),
      hooks: plugin.components.hooks.map((hook) => ({ event: hook.event, count: hook.count, path: hook.path })),
      mcpServers: plugin.components.mcpServers.map((server) => ({
        name: server.name,
        dshName: mcpServerName(plugin.prefix, server.name),
        transport: server.transport,
        description: describeMcpServer(server),
        unsupportedReason: server.unsupportedReason,
        requiresUserConfig: server.requiresUserConfig,
        sourcePath: server.sourcePath,
        live: live.get(mcpServerName(plugin.prefix, server.name)),
      })),
      outputStyles: plugin.components.outputStyles,
      lspServers: plugin.components.lspServers,
      hasDshAdapter: plugin.components.hasDshAdapter,
    },
    issues: plugin.issues,
  }
}

function summarize(plugins, settings, globalIssues) {
  const enabled = plugins.filter((plugin) => plugin.enabled)
  const count = (key) => enabled.reduce((total, plugin) => total + plugin.components[key].length, 0)
  const skills = count('skills')
  const commands = settings.loadCommands ? count('commands') : 0
  const mcpServers = count('mcpServers')
  const supportedMcp = enabled.reduce((total, plugin) => total + plugin.components.mcpServers.filter((server) => server.transport !== 'unsupported').length, 0)
  return {
    detected: plugins.length,
    enabled: enabled.length,
    loaded: enabled.filter((plugin) => (
      (settings.loadSkills && plugin.components.skills.length > 0)
      || (settings.loadCommands && plugin.components.commands.length > 0)
      || (settings.loadMcp && plugin.components.mcpServers.some((server) => server.transport !== 'unsupported'))
    )).length,
    skills: settings.loadSkills ? skills : 0,
    commands,
    agents: count('agents'),
    hooks: count('hooks'),
    mcpServers: settings.loadMcp ? supportedMcp : 0,
    recognizedMcpServers: mcpServers,
    modelSkills: settings.loadSkills && settings.modelDiscovery
      ? enabled.reduce((total, plugin) => total + plugin.components.skills.filter((skill) => skill.modelInvocable).length, 0)
      : 0,
    issues: globalIssues.length + plugins.reduce((total, plugin) => total + plugin.issues.length, 0),
  }
}