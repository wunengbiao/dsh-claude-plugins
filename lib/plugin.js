import { basename, join } from 'node:path'
import { enumerateComponents } from './enumerate.js'
import { readJsonFile } from './json.js'
import { shortHash, slug } from './paths.js'

/** Keys a marketplace entry may contribute to a plugin that also has plugin.json. */
const COMPONENT_KEYS = ['skills', 'commands', 'agents', 'hooks', 'outputStyles']

/** Load one Claude plugin directory into the discovery model. */
export function loadPluginAt(root, context) {
  const issues = []
  const manifestRead = readManifest(root, issues)
  const entry = isObject(context.entry) ? context.entry : {}
  const hasManifest = manifestRead.ok
  const manifest = hasManifest ? manifestRead.value : {}
  const strict = !hasManifest || entry.strict !== false
  const merged = mergeManifest(manifest, entry, strict, issues)
  const name = readName(merged, entry, root)
  const marketplace = typeof context.marketplace === 'string' && context.marketplace !== ''
    ? context.marketplace
    : 'local'
  const record = isObject(context.record) ? context.record : {}
  const id = marketplace === 'local'
    ? name + '@local:' + shortHash(root)
    : name + '@' + marketplace
  const components = enumerateComponents(root, merged, issues)
  return {
    plugin: {
      id,
      name,
      displayName: firstString(entry.displayName, merged.displayName, name),
      version: firstString(merged.version, entry.version, record.version),
      description: firstString(entry.description, merged.description) ?? '',
      author: authorName(firstValue(entry.author, merged.author)),
      homepage: firstString(entry.homepage, merged.homepage),
      repository: firstString(entry.repository, merged.repository),
      license: firstString(entry.license, merged.license),
      keywords: stringList(firstValue(entry.keywords, merged.keywords)),
      marketplace,
      scope: firstString(record.scope) ?? 'user',
      projectPath: firstString(record.projectPath),
      path: root,
      manifestPath: join(root, '.claude-plugin', 'plugin.json'),
      manifestFound: manifestRead.ok,
      defaultEnabled: readDefaultEnabled(entry, merged),
      source: context.source === 'extra' ? 'extra' : 'installed',
      components,
      issues,
      prefix: slug(name),
    },
    issues,
  }
}

function readManifest(root, issues) {
  const path = join(root, '.claude-plugin', 'plugin.json')
  const read = readJsonFile(path)
  if (read.ok && isObject(read.value)) return { ok: true, value: read.value }
  if (read.ok) {
    issues.push({ code: 'manifest-invalid', message: 'plugin.json must be an object', path })
    return { ok: false }
  }
  if (read.code !== 'missing') {
    issues.push({ code: 'manifest-invalid', message: read.message, path })
    return { ok: false }
  }
  return { ok: false }
}

function mergeManifest(manifest, entry, strict, issues) {
  const merged = { ...manifest }
  for (const key of COMPONENT_KEYS) {
    if (entry[key] === undefined) continue
    if (!strict) {
      issues.push({
        code: 'entry-conflict',
        message: 'marketplace entry declares "' + key + '" while plugin.json exists and strict is false',
      })
      continue
    }
    merged[key] = mergeComponent(key, manifest[key], entry[key])
  }
  if (!Object.hasOwn(manifest, 'mcpServers') && entry.mcpServers !== undefined) merged.mcpServers = entry.mcpServers
  if (!Object.hasOwn(manifest, 'lspServers') && entry.lspServers !== undefined) merged.lspServers = entry.lspServers
  return merged
}

function mergeComponent(key, left, right) {
  if (left === undefined) return right
  if (right === undefined) return left
  if (key === 'commands' && isObject(left) && isObject(right)) return { ...left, ...right }
  if (Array.isArray(left)) return [...left, ...(Array.isArray(right) ? right : [right])]
  return [left, right]
}

function readName(manifest, entry, root) {
  const candidate = firstString(manifest.name, entry.name)
  return candidate === undefined ? basename(root) : candidate
}

function readDefaultEnabled(entry, manifest) {
  for (const value of [entry.defaultEnabled, manifest.defaultEnabled]) {
    if (typeof value === 'boolean') return value
  }
  return true
}

function firstValue(...values) {
  for (const value of values) if (value !== undefined && value !== null) return value
  return undefined
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

function authorName(value) {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (isObject(value) && typeof value.name === 'string' && value.name.trim() !== '') return value.name.trim()
  return undefined
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string' && entry.trim() !== '') : []
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}