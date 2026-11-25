import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, resolve, sep } from 'node:path'
import { loadPluginAt } from './plugin.js'
import { assignComponentNames, assignPluginPrefixes } from './names.js'
import { findMarketplaceEntry, looksLikePlugin, readClaudeEnabled, readInstalledRegistry, readKnownMarketplaces, readMarketplaceEntries, scanPluginCache } from './marketplaces.js'
import { shortHash } from './paths.js'

/** Discover every installed and explicitly added Claude plugin for one workspace. */
export function discoverPlugins(options) {
  const claudeConfigDir = options.claudeConfigDir
  const pluginsDir = join(claudeConfigDir, 'plugins')
  const settings = options.settings
  const issues = []
  const roots = []
  const known = readKnownMarketplaces(pluginsDir, issues)
  let installed = readInstalledRegistry(pluginsDir, issues)
  if (installed.length === 0) installed = scanPluginCache(pluginsDir, issues)
  roots.push({
    path: pluginsDir,
    kind: 'claude',
    exists: isDirectory(pluginsDir),
    pluginCount: 0,
  })
  const plugins = []
  const byId = new Map()
  const paths = new Set()
  for (const item of installed) {
    const record = selectRecord(item.records, options.cwd)
    if (record === undefined) {
      issues.push(issue('install-missing', 'no usable install record for ' + item.id))
      continue
    }
    const installPath = typeof record.installPath === 'string' ? resolve(record.installPath) : undefined
    if (installPath === undefined || !isDirectory(installPath)) {
      issues.push(issue('install-missing', 'install path is missing for ' + item.id, installPath))
      continue
    }
    const real = realPath(installPath)
    if (paths.has(real)) continue
    paths.add(real)
    const found = findMarketplaceEntry(known, item.marketplace, item.name)
    const result = loadPluginAt(installPath, {
      entry: found?.entry,
      marketplace: item.marketplace,
      record,
      source: 'installed',
    })
    issues.push(...result.issues)
    if (byId.has(result.plugin.id)) {
      issues.push(issue('duplicate-plugin', 'duplicate plugin id ' + result.plugin.id, installPath))
      continue
    }
    byId.set(result.plugin.id, result.plugin)
    plugins.push(result.plugin)
    roots[0].pluginCount += 1
  }
  for (const configured of settings.extraRoots) {
    const root = typeof configured === 'string' ? configured : ''
    if (root === '' || !isDirectory(root)) {
      issues.push(issue('extra-root-missing', 'extra plugin root does not exist: ' + root, root))
      roots.push({ path: root, kind: 'extra', exists: false, pluginCount: 0, error: 'missing' })
      continue
    }
    const candidates = expandExtraRoot(root, issues)
    let count = 0
    for (const candidate of candidates) {
      const real = realPath(candidate.path)
      if (paths.has(real)) continue
      paths.add(real)
      const result = loadPluginAt(candidate.path, {
        entry: candidate.entry,
        marketplace: candidate.marketplace,
        record: {},
        source: 'extra',
      })
      issues.push(...result.issues)
      if (byId.has(result.plugin.id)) {
        result.plugin.id = result.plugin.id + ':extra:' + shortHash(real)
      }
      byId.set(result.plugin.id, result.plugin)
      plugins.push(result.plugin)
      count += 1
    }
    roots.push({ path: root, kind: 'extra', exists: true, pluginCount: count })
    if (count === 0) issues.push(issue('extra-root-empty', 'no Claude plugins found under ' + root, root))
  }
  const claude = readClaudeEnabled(claudeConfigDir)
  for (const plugin of plugins) applyEnablement(plugin, settings, claude.enabled)
  assignComponentNames(plugins, assignPluginPrefixes(plugins))
  return {
    plugins,
    roots,
    issues,
    claudeSettings: { path: claude.path, error: claude.error },
  }
}

function selectRecord(records, cwd) {
  if (records.length === 0) return undefined
  const user = records.filter((record) => record.scope === 'user')
  if (cwd === undefined) return latest(user) ?? latest(records)
  const matchingProject = records.filter((record) => record.scope === 'project' && typeof record.projectPath === 'string' && isWithin(cwd, record.projectPath))
  return latest(matchingProject) ?? latest(user)
}

function latest(records) {
  if (records.length === 0) return undefined
  return [...records].sort((left, right) => timestamp(right) - timestamp(left))[0]
}

function timestamp(record) {
  for (const key of ['lastUpdated', 'installedAt']) {
    const value = Date.parse(record[key])
    if (Number.isFinite(value)) return value
  }
  return 0
}

function isWithin(cwd, projectPath) {
  const target = resolve(projectPath)
  const current = resolve(cwd)
  return current === target || current.startsWith(target + sep)
}

function expandExtraRoot(root, issues) {
  if (looksLikePlugin(root)) return [{ path: root, marketplace: 'local', entry: undefined }]
  if (existsSync(join(root, '.claude-plugin', 'marketplace.json'))) {
    const record = readMarketplaceEntries(root, issues)
    const out = []
    const base = record.pluginRoot === undefined ? root : resolve(root, record.pluginRoot)
    for (const [name, entry] of record.entries) {
      const path = resolveEntrySource(entry, base, root, name, issues)
      if (path !== undefined) out.push({ path, marketplace: basename(root), entry })
    }
    return out
  }
  const out = []
  for (const child of safeReadDir(root)) {
    if (child.startsWith('.')) continue
    const path = join(root, child)
    if (!isDirectory(path)) continue
    if (looksLikePlugin(path)) {
      out.push({ path, marketplace: basename(root), entry: undefined })
      continue
    }
    const versions = safeReadDir(path)
      .map((version) => join(path, version))
      .filter((candidate) => isDirectory(candidate) && looksLikePlugin(candidate))
      .sort((left, right) => mtime(right) - mtime(left))
    if (versions[0] !== undefined) out.push({ path: versions[0], marketplace: basename(root), entry: undefined })
  }
  return out
}

function resolveEntrySource(entry, base, root, name, issues) {
  const source = entry.source
  if (typeof source === 'string') {
    const path = isAbsolute(source) ? source : resolve(base, source)
    if (isDirectory(path)) return path
    issues.push(issue('marketplace-source-missing', 'marketplace entry "' + name + '" points at a missing path', path))
    return undefined
  }
  if (typeof source === 'object' && source !== null && source.source === 'directory' && typeof source.path === 'string') {
    const path = isAbsolute(source.path) ? source.path : resolve(root, source.path)
    if (isDirectory(path)) return path
    issues.push(issue('marketplace-source-missing', 'marketplace entry "' + name + '" points at a missing directory', path))
    return undefined
  }
  issues.push(issue('marketplace-remote', 'marketplace entry "' + name + '" is remote; install it through Claude Code first', root))
  return undefined
}

function applyEnablement(plugin, settings, claudeEnabled) {
  const override = settings.enabledPlugins.includes(plugin.id)
    ? true
    : settings.disabledPlugins.includes(plugin.id)
      ? false
      : undefined
  const fromClaude = claudeEnabled.get(plugin.id)
  plugin.claudeEnabled = fromClaude
  plugin.enabled = override ?? fromClaude ?? plugin.defaultEnabled
  plugin.enablementSource = override !== undefined ? 'settings' : fromClaude !== undefined ? 'claude' : 'default'
}

function realPath(path) {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function safeReadDir(path) {
  try {
    return readdirSync(path).sort()
  } catch {
    return []
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function mtime(path) {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}

function issue(code, message, path) {
  return { code, message, ...(typeof path === 'string' ? { path } : {}) }
}