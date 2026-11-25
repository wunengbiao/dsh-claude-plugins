import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defaultSettingsPath } from './paths.js'

/** Documents written before a field existed normalize to these defaults. */
export const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  enabledPlugins: Object.freeze([]),
  disabledPlugins: Object.freeze([]),
  extraRoots: Object.freeze([]),
  loadSkills: true,
  loadCommands: true,
  loadMcp: false,
  modelDiscovery: false,
})

/** Parse a settings document or patch into the complete, typed settings value. */
export function normalizeSettings(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ...DEFAULT_SETTINGS }
  const record = value
  return {
    version: 1,
    enabledPlugins: stringList(record.enabledPlugins),
    disabledPlugins: stringList(record.disabledPlugins),
    extraRoots: stringList(record.extraRoots).map((entry) => resolve(entry)),
    loadSkills: typeof record.loadSkills === 'boolean' ? record.loadSkills : DEFAULT_SETTINGS.loadSkills,
    loadCommands: typeof record.loadCommands === 'boolean' ? record.loadCommands : DEFAULT_SETTINGS.loadCommands,
    loadMcp: typeof record.loadMcp === 'boolean' ? record.loadMcp : DEFAULT_SETTINGS.loadMcp,
    modelDiscovery: typeof record.modelDiscovery === 'boolean' ? record.modelDiscovery : DEFAULT_SETTINGS.modelDiscovery,
  }
}

/** Keep the effective state consistent when the settings surface toggles one plugin. */
export function withPluginEnabled(settings, id, enabled) {
  const current = normalizeSettings(settings)
  return normalizeSettings({
    ...current,
    enabledPlugins: enabled
      ? [id, ...current.enabledPlugins.filter((entry) => entry !== id)]
      : current.enabledPlugins.filter((entry) => entry !== id),
    disabledPlugins: enabled
      ? current.disabledPlugins.filter((entry) => entry !== id)
      : [id, ...current.disabledPlugins.filter((entry) => entry !== id)],
  })
}

function stringList(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const out = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const text = entry.trim()
    if (text === '' || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

/** Small mtime-cached JSON store with an atomic replacement write. */
export function createSettingsStore(filePath = defaultSettingsPath()) {
  let cached = { ...DEFAULT_SETTINGS }
  let cachedMtime = -1
  let readError
  const read = () => {
    if (!existsSync(filePath)) {
      cached = { ...DEFAULT_SETTINGS }
      cachedMtime = -1
      readError = undefined
      return cached
    }
    const mtime = statSync(filePath).mtimeMs
    if (mtime === cachedMtime) return cached
    try {
      cached = normalizeSettings(JSON.parse(readFileSync(filePath, 'utf8')))
      readError = undefined
    } catch (error) {
      cached = { ...DEFAULT_SETTINGS }
      readError = error instanceof Error ? error.message : String(error)
    }
    cachedMtime = mtime
    return cached
  }
  const write = (next) => {
    const normalized = normalizeSettings(next)
    mkdirSync(dirname(filePath), { recursive: true })
    const temporary = filePath + '.tmp'
    writeFileSync(temporary, JSON.stringify(normalized, null, 2) + '\n')
    renameSync(temporary, filePath)
    cached = normalized
    cachedMtime = statSync(filePath).mtimeMs
    readError = undefined
    return normalized
  }
  return {
    read,
    write,
    patch: (patch) => write({ ...read(), ...patch }),
    path: () => filePath,
    lastError: () => readError,
  }
}
