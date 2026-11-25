import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonFile } from './json.js'

/** Read Claude's installed plugin registry (v1 and v2 shapes). */
export function readInstalledRegistry(claudePluginsDir, issues) {
  const path = join(claudePluginsDir, 'installed_plugins.json')
  const read = readJsonFile(path)
  if (!read.ok) {
    if (read.code !== 'missing') issues.push(issue('registry-invalid', 'cannot read installed_plugins.json: ' + read.message, path))
    return []
  }
  const plugins = isObject(read.value) && isObject(read.value.plugins) ? read.value.plugins : undefined
  if (plugins === undefined) {
    issues.push(issue('registry-invalid', 'installed_plugins.json has no plugins object', path))
    return []
  }
  const out = []
  for (const [id, rawRecords] of Object.entries(plugins)) {
    const parsed = splitId(id)
    const records = normalizeRecords(rawRecords)
    if (records.length === 0) {
      issues.push(issue('registry-invalid', 'plugin "' + id + '" has no install records', path))
      continue
    }
    out.push({ id, name: parsed.name, marketplace: parsed.marketplace, records })
  }
  return out
}

function normalizeRecords(value) {
  if (Array.isArray(value)) return value.filter(isObject)
  if (isObject(value)) return [value]
  return []
}

/** Split a Claude plugin id at its last @, so a scoped name keeps its own @. */
export function splitId(id) {
  const index = id.lastIndexOf('@')
  if (index <= 0 || index === id.length - 1) return { name: id, marketplace: '' }
  return { name: id.slice(0, index), marketplace: id.slice(index + 1) }
}

/** Read every registered marketplace and cache its plugin entries by name. */
export function readKnownMarketplaces(claudePluginsDir, issues) {
  const path = join(claudePluginsDir, 'known_marketplaces.json')
  const read = readJsonFile(path)
  const out = new Map()
  if (read.ok && isObject(read.value)) {
    for (const [name, raw] of Object.entries(read.value)) {
      if (!isObject(raw)) continue
      const installLocation = typeof raw.installLocation === 'string' ? raw.installLocation : undefined
      if (installLocation === undefined) continue
      out.set(name, readMarketplaceEntries(installLocation, issues))
    }
  } else if (!read.ok && read.code !== 'missing') {
    issues.push(issue('marketplace-invalid', 'cannot read known_marketplaces.json: ' + read.message, path))
  }
  return out
}

/** Read one marketplace file, falling back to the conventional directory name. */
export function readMarketplaceEntries(root, issues) {
  const path = join(root, '.claude-plugin', 'marketplace.json')
  const read = readJsonFile(path)
  if (!read.ok) {
    if (read.code !== 'missing') issues.push(issue('marketplace-invalid', 'cannot read marketplace.json: ' + read.message, path))
    return { root, path, entries: new Map(), error: read.code === 'missing' ? undefined : read.message }
  }
  if (!isObject(read.value) || !Array.isArray(read.value.plugins)) {
    issues.push(issue('marketplace-invalid', 'marketplace.json has no plugins array', path))
    return { root, path, entries: new Map(), error: 'marketplace.json has no plugins array' }
  }
  const entries = new Map()
  for (const entry of read.value.plugins) {
    if (!isObject(entry) || typeof entry.name !== 'string' || entry.name === '') continue
    entries.set(entry.name, entry)
  }
  return { root, path, entries, pluginRoot: isObject(read.value.metadata) && typeof read.value.metadata.pluginRoot === 'string' ? read.value.metadata.pluginRoot : undefined }
}

/** Resolve one marketplace entry, or an empty stand-in when it is unavailable. */
export function findMarketplaceEntry(known, marketplace, pluginName) {
  if (marketplace === '' || !known.has(marketplace)) return undefined
  const record = known.get(marketplace)
  const entry = record.entries.get(pluginName)
  return entry === undefined ? undefined : { entry, marketplaceRoot: record.root, pluginRoot: record.pluginRoot }
}

/** Read Claude's enabledPlugins map; an absent map is not the same as all-disabled. */
export function readClaudeEnabled(claudeConfigDir) {
  const path = join(claudeConfigDir, 'settings.json')
  const read = readJsonFile(path)
  if (!read.ok || !isObject(read.value) || !isObject(read.value.enabledPlugins)) {
    return { enabled: new Map(), error: read.ok ? undefined : read.message, path }
  }
  const enabled = new Map()
  for (const [id, value] of Object.entries(read.value.enabledPlugins)) {
    if (typeof value === 'boolean') enabled.set(id, value)
  }
  return { enabled, path }
}

/** Fall back to the cache layout when installed_plugins.json is unavailable. */
export function scanPluginCache(claudePluginsDir, issues) {
  const cacheRoot = join(claudePluginsDir, 'cache')
  if (!isDirectory(cacheRoot)) return []
  const out = []
  for (const marketplace of safeReadDir(cacheRoot)) {
    const marketplaceDir = join(cacheRoot, marketplace)
    if (!isDirectory(marketplaceDir) || marketplace.startsWith('.')) continue
    for (const plugin of safeReadDir(marketplaceDir)) {
      if (plugin.startsWith('.')) continue
      const pluginDir = join(marketplaceDir, plugin)
      if (!isDirectory(pluginDir)) continue
      const candidates = looksLikePlugin(pluginDir)
        ? [pluginDir]
        : safeReadDir(pluginDir)
          .map((version) => join(pluginDir, version))
          .filter((path) => isDirectory(path) && looksLikePlugin(path))
          .sort((left, right) => mtime(right) - mtime(left))
      const installPath = candidates[0]
      if (installPath === undefined) continue
      out.push({
        id: plugin + '@' + marketplace,
        name: plugin,
        marketplace,
        records: [{ scope: 'user', installPath, version: installPath.split('/').at(-1) ?? '' }],
      })
      issues.push(issue('registry-fallback', 'recovered "' + plugin + '@' + marketplace + '" from the plugin cache', installPath))
    }
  }
  return out
}

export function looksLikePlugin(dir) {
  return existsSync(join(dir, '.claude-plugin', 'plugin.json'))
    || existsSync(join(dir, 'SKILL.md'))
    || isDirectory(join(dir, 'skills'))
    || isDirectory(join(dir, 'commands'))
    || isDirectory(join(dir, 'agents'))
    || existsSync(join(dir, '.mcp.json'))
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function safeReadDir(path) {
  try {
    return readdirSync(path).sort()
  } catch {
    return []
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