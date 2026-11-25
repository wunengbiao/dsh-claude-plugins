import { unwatchFile, watchFile } from 'node:fs'
import { dirname, join } from 'node:path'
import { createCommandHandler } from './command.js'
import { parseCommandDocument, parseSkillDocument } from './documents.js'
import { discoverPlugins } from './discovery.js'
import { mcpServerName, toMcpRegistration } from './mcp.js'
import { isValidSkillName } from './names.js'
import { createSettingsStore, normalizeSettings } from './settings.js'
import { buildSnapshot } from './snapshot.js'

const CACHE_TTL_MS = 1500
const WATCH_INTERVAL_MS = 1500
const DEBOUNCE_MS = 250

/** Own the discovery cache, skill provider, command registrations, and opt-in MCP servers. */
export function createRuntime(options) {
  const ctx = options.ctx
  const config = options.config
  const store = createSettingsStore(config.settingsPath)
  const logger = ctx.logger
  const skills = ctx.get?.('skills')
  const commands = ctx.get?.('commands')
  const mcpManager = () => ctx.get?.('mcpManager')
  const commandIssues = []
  const mcpIssues = []
  const skillIssues = []
  let revision = 0
  let cache = { key: '', at: 0, settings: undefined, discovery: undefined }
  let providerControl
  let providerDispose
  let commandDisposers = []
  let mcpDisposers = []
  let watchers = []
  let debounceTimer
  let disposed = false

  const mcpLive = () => {
    const map = new Map()
    const manager = mcpManager()
    if (manager === undefined) return map
    try {
      for (const item of manager.list()) map.set(item.name, item.status)
    } catch (error) {
      logger?.warn('[dsh-claude-plugins] cannot read MCP status: ' + messageOf(error))
    }
    return map
  }

  const collect = (cwd) => {
    const settings = store.read()
    const key = revision + '|' + String(cwd ?? '') + '|' + JSON.stringify(settings) + '|'
      + commandIssues.length + '|' + mcpIssues.length + '|' + skillIssues.length
    if (cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) return cache
    const discovery = discoverPlugins({
      claudeConfigDir: config.claudeConfigDir,
      cwd,
      settings,
    })
    cache = { key, at: Date.now(), settings, discovery }
    return cache
  }

  const snapshot = (cwd) => {
    const collected = collect(cwd)
    return buildSnapshot({
      settings: collected.settings,
      discovery: collected.discovery,
      extraIssues: [...commandIssues, ...mcpIssues, ...skillIssues],
      settingsPath: store.path(),
      claudeConfigDir: config.claudeConfigDir,
      cwd,
      mcpLive: mcpLive(),
      capabilities: {
        skills: skills !== undefined,
        commands: commands !== undefined,
        mcp: mcpManager() !== undefined,
      },
    })
  }

  const provider = {
    name: config.providerName,
    async list(lookup) {
      const collected = collect(lookup.cwd)
      const settings = collected.settings
      if (!settings.loadSkills) return { candidates: [], complete: true }
      const candidates = []
      let complete = true
      for (const plugin of collected.discovery.plugins) {
        if (!plugin.enabled) continue
        for (const skill of plugin.components.skills) {
          if (!isValidSkillName(skill.dshName)) {
            if (!skillIssues.some((issue) => issue.path === skill.path)) {
              skillIssues.push({ code: 'skill-name-invalid', message: 'invalid DSH skill name "' + skill.dshName + '"; skipped', path: skill.path })
            }
            continue
          }
          const modelInvocable = settings.modelDiscovery && skill.modelInvocable
          const userInvocable = skill.userInvocable
          if (!modelInvocable && !userInvocable) continue
          candidates.push({
            name: skill.dshName,
            description: skill.description,
            ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
            invocation: { modelInvocable, userInvocable },
            provider: config.providerName,
            source: 'claude-plugins',
            rank: config.rank,
            locator: { pluginId: plugin.id, path: skill.path, name: skill.name },
            resourceBase: { kind: 'directory', path: dirname(skill.path) },
            path: skill.path,
          })
        }
      }
      for (const issue of collected.discovery.issues) if (issue.code === 'skill-invalid') complete = false
      return { candidates, complete }
    },
    async get(candidate, lookup) {
      const collected = collect(lookup.cwd)
      const settings = collected.settings
      if (!settings.loadSkills) return undefined
      const plugin = collected.discovery.plugins.find((entry) => entry.id === candidate.locator.pluginId)
      if (plugin === undefined || !plugin.enabled) return undefined
      const skill = plugin.components.skills.find((entry) => entry.dshName === candidate.name && entry.path === candidate.locator.path)
      if (skill === undefined) return undefined
      const modelInvocable = settings.modelDiscovery && skill.modelInvocable
      if (!modelInvocable && !skill.userInvocable) return undefined
      const parsed = parseSkillDocument(skill.path, skill.name)
      if (!parsed.ok) return undefined
      return {
        name: candidate.name,
        description: parsed.document.description,
        ...(parsed.document.whenToUse === undefined ? {} : { whenToUse: parsed.document.whenToUse }),
        invocation: { modelInvocable, userInvocable: skill.userInvocable },
        source: 'claude-plugins',
        provider: config.providerName,
        resourceBase: { kind: 'directory', path: dirname(skill.path) },
        path: skill.path,
        content: parsed.document.body,
      }
    },
  }

  const disposeCommands = () => {
    for (const dispose of commandDisposers) dispose()
    commandDisposers = []
  }

  const reloadCommands = () => {
    commandIssues.length = 0
    disposeCommands()
    if (disposed || commands === undefined) return
    const collected = collect(undefined)
    if (!collected.settings.loadCommands) return
    for (const plugin of collected.discovery.plugins) {
      if (!plugin.enabled) continue
      for (const command of plugin.components.commands) {
        const handler = createCommandHandler({
          plugin: { id: plugin.id, path: plugin.path },
          command,
          readBody: command.content === undefined
            ? () => readCommandBody(command.path, command.name)
            : () => command.content,
        })
        try {
          const dispose = commands.register({
            name: command.dshName,
            description: command.description,
            ...(command.argumentHint === undefined ? {} : { input: { hint: command.argumentHint } }),
            handler,
          })
          commandDisposers.push(dispose)
        } catch (error) {
          commandIssues.push({
            code: 'command-register',
            message: 'cannot register /' + command.dshName + ': ' + messageOf(error),
            path: command.path,
          })
        }
      }
    }
  }

  const disposeMcp = () => {
    for (const dispose of mcpDisposers) dispose()
    mcpDisposers = []
  }

  const reloadMcp = () => {
    mcpIssues.length = 0
    disposeMcp()
    if (disposed) return
    const manager = mcpManager()
    if (manager === undefined) return
    const collected = collect(undefined)
    if (!collected.settings.loadMcp) return
    for (const plugin of collected.discovery.plugins) {
      if (!plugin.enabled) continue
      for (const server of plugin.components.mcpServers) {
        if (server.transport === 'unsupported') continue
        const registration = toMcpRegistration(server, plugin.path)
        if (!registration.ok) {
          mcpIssues.push({ code: 'mcp-register', message: 'cannot load MCP server "' + server.name + '": ' + registration.reason, path: server.sourcePath })
          continue
        }
        const name = mcpServerName(plugin.prefix, server.name)
        try {
          mcpDisposers.push(manager.register(name, registration.entry))
        } catch (error) {
          mcpIssues.push({ code: 'mcp-register', message: 'cannot register MCP server "' + server.name + '": ' + messageOf(error), path: server.sourcePath })
        }
      }
    }
  }

  const invalidate = () => {
    revision += 1
    cache = { key: '', at: 0, settings: undefined, discovery: undefined }
    providerControl?.invalidate()
  }

  const reloadAll = () => {
    skillIssues.length = 0
    invalidate()
    reloadCommands()
    reloadMcp()
  }

  const updateSettings = (patch, cwd) => {
    const current = store.read()
    const next = normalizeSettings({ ...current, ...patch })
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      store.write(next)
      reloadAll()
    }
    return snapshot(cwd)
  }

  const rescan = (cwd) => {
    reloadAll()
    return snapshot(cwd)
  }

  const onFileChange = () => {
    if (disposed) return
    if (debounceTimer !== undefined) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      if (!disposed) reloadAll()
    }, DEBOUNCE_MS)
  }

  const startWatchers = () => {
    const paths = [
      store.path(),
      join(config.claudeConfigDir, 'plugins', 'installed_plugins.json'),
      join(config.claudeConfigDir, 'settings.json'),
    ]
    for (const path of paths) {
      try {
        watchFile(path, { persistent: false, interval: WATCH_INTERVAL_MS }, onFileChange)
        watchers.push(path)
      } catch (error) {
        logger?.warn('[dsh-claude-plugins] cannot watch ' + path + ': ' + messageOf(error))
      }
    }
  }

  const start = () => {
    if (skills !== undefined) {
      providerDispose = skills.registerProvider((control) => {
        providerControl = control
        return provider
      })
    } else {
      logger?.warn('[dsh-claude-plugins] the skills service is absent; only settings are available')
    }
    reloadAll()
    startWatchers()
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (debounceTimer !== undefined) clearTimeout(debounceTimer)
    debounceTimer = undefined
    for (const path of watchers) unwatchFile(path, onFileChange)
    watchers = []
    disposeCommands()
    disposeMcp()
    providerDispose?.()
    providerDispose = undefined
    cache = { key: '', at: 0, settings: undefined, discovery: undefined }
  }

  return {
    provider,
    snapshot,
    updateSettings,
    rescan,
    reloadMcp,
    settings: () => store.read(),
    path: () => store.path(),
    start,
    dispose,
    statistics: () => ({ commands: commandDisposers.length, mcp: mcpDisposers.length }),
  }
}

function readCommandBody(path, name) {
  const parsed = parseCommandDocument(path, name)
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.document.body
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}