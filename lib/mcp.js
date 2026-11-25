import { extname, isAbsolute, resolve } from 'node:path'
import { readJsonFile } from './json.js'
import { boundedName, slug } from './paths.js'

const USER_CONFIG = /\$\{user_config\./i
const TEMPLATE = /\$\{[^}]+\}/g

/** Read every MCP source a Claude plugin declares, later declarations winning by name. */
export function readMcpServers(root, manifestMcp, issues) {
  const byName = new Map()
  const sources = []
  const defaultFile = resolve(root, '.mcp.json')
  const defaultRead = readJsonFile(defaultFile)
  if (defaultRead.ok) {
    sources.push({ value: defaultRead.value, path: defaultFile })
  } else if (defaultRead.code !== 'missing') {
    issues.push(issue('mcp-invalid', 'cannot read .mcp.json: ' + defaultRead.message, defaultFile))
  }
  for (const source of manifestSources(root, manifestMcp, issues)) sources.push(source)
  for (const source of sources) {
    const entries = serverMap(source.value)
    if (entries === undefined) {
      issues.push(issue('mcp-invalid', 'MCP config must be an object of server entries', source.path))
      continue
    }
    for (const [name, raw] of Object.entries(entries)) {
      const server = normalizeServer(name, raw, source.path)
      if (server === undefined) {
        issues.push(issue('mcp-invalid', 'MCP server "' + name + '" must be an object', source.path))
        continue
      }
      byName.set(name, server)
    }
  }
  return [...byName.values()]
}

function manifestSources(root, manifestMcp, issues) {
  const out = []
  const add = (value) => {
    if (value === undefined) return
    if (typeof value === 'string') {
      const path = isAbsolute(value) ? value : resolve(root, value)
      const extension = extname(path).toLowerCase()
      if (extension === '.mcpb' || extension === '.dxt') {
        issues.push(issue('mcp-unsupported', 'MCP bundles are not supported by DSH', path))
        return
      }
      const read = readJsonFile(path)
      if (read.ok) out.push({ value: read.value, path })
      else issues.push(issue('mcp-invalid', 'cannot read MCP config: ' + read.message, path))
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) add(entry)
      return
    }
    if (typeof value === 'object' && value !== null) {
      out.push({ value, path: root })
      return
    }
    issues.push(issue('mcp-invalid', 'unsupported mcpServers value', root))
  }
  add(manifestMcp)
  return out
}

function serverMap(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  if (typeof value.mcpServers === 'object' && value.mcpServers !== null && !Array.isArray(value.mcpServers)) {
    return value.mcpServers
  }
  const entries = Object.entries(value)
  if (entries.length === 0) return {}
  const looksLikeServers = entries.every(([, entry]) => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
  return looksLikeServers ? value : undefined
}

function normalizeServer(name, raw, path) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const type = typeof raw.type === 'string' ? raw.type.toLowerCase() : ''
  const hasCommand = typeof raw.command === 'string' && raw.command.trim() !== ''
  const hasUrl = typeof raw.url === 'string' && raw.url.trim() !== ''
  let transport = 'unsupported'
  let unsupportedReason
  if (type === 'stdio' || (type === '' && hasCommand)) transport = 'stdio'
  else if (type === 'http' || type === 'streamable-http' || type === 'streamablehttp' || (type === '' && hasUrl)) transport = 'streamable-http'
  else if (type === 'sse') unsupportedReason = 'SSE transport is not supported by DSH'
  else if (type !== '' && type !== 'stdio' && type !== 'http' && type !== 'streamable-http' && type !== 'streamablehttp') unsupportedReason = 'unknown MCP transport "' + type + '"'
  else unsupportedReason = 'an MCP server needs a command or a url'
  if (transport === 'stdio' && !hasCommand) {
    transport = 'unsupported'
    unsupportedReason = 'stdio MCP server has no command'
  }
  if (transport === 'streamable-http' && !hasUrl) {
    transport = 'unsupported'
    unsupportedReason = 'HTTP MCP server has no url'
  }
  const requiresUserConfig = USER_CONFIG.test(JSON.stringify(raw))
  if (requiresUserConfig) {
    transport = 'unsupported'
    unsupportedReason = 'uses ${user_config.*}, which DSH does not prompt for'
  }
  const args = Array.isArray(raw.args) ? raw.args.filter((entry) => typeof entry === 'string') : []
  const env = stringMap(raw.env)
  const headers = stringMap(raw.headers)
  return {
    name,
    transport,
    ...(unsupportedReason === undefined ? {} : { unsupportedReason }),
    ...(hasCommand ? { command: raw.command } : {}),
    ...(args.length > 0 ? { args } : {}),
    ...(env === undefined ? {} : { env }),
    ...(typeof raw.cwd === 'string' && raw.cwd !== '' ? { cwd: raw.cwd } : {}),
    ...(hasUrl ? { url: raw.url } : {}),
    ...(headers === undefined ? {} : { headers }),
    sourcePath: path,
    requiresUserConfig,
  }
}

function stringMap(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const entries = Object.entries(value).filter(([, entry]) => typeof entry === 'string')
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

/** DSH server namespace for one Claude plugin server; the manager caps names at 32 bytes. */
export function mcpServerName(pluginName, serverName) {
  return boundedName('cp-' + slug(pluginName) + '-' + slug(serverName), 32, pluginName + '/' + serverName)
}

/** Expand Claude's plugin-root template into a DSH MCP registration. */
export function toMcpRegistration(server, pluginRoot) {
  const expand = (value) => String(value).split('${CLAUDE_PLUGIN_ROOT}').join(pluginRoot)
  const entry = server.transport === 'stdio'
    ? {
        transport: 'stdio',
        command: expand(server.command),
        args: (server.args ?? []).map(expand),
        env: expandMap(server.env, expand),
        ...(server.cwd === undefined ? {} : { cwd: expand(server.cwd) }),
        startupTimeoutMs: 30000,
      }
    : {
        transport: 'streamable-http',
        url: expand(server.url),
        headers: expandMap(server.headers, expand),
        startupTimeoutMs: 30000,
      }
  const unresolved = JSON.stringify(entry).match(TEMPLATE)
  if (unresolved !== null) {
    return { ok: false, reason: 'unresolved template ' + unresolved[0] }
  }
  return { ok: true, entry }
}

function expandMap(map, expand) {
  if (map === undefined) return {}
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, expand(value)]))
}

function issue(code, message, path) {
  return { code, message, ...(typeof path === 'string' ? { path } : {}) }
}

/** One-line MCP source description used by the settings surface. */
export function describeMcpServer(server) {
  if (server.transport === 'stdio') return [server.command, ...(server.args ?? [])].join(' ')
  if (server.transport === 'streamable-http') return server.url ?? ''
  return server.unsupportedReason ?? 'unsupported'
}
