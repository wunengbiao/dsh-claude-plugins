import { statSync } from 'node:fs'
import { isAbsolute } from 'node:path'

/** Public API prefix used by the settings client. */
export const API_PREFIX = '/dsh-claude-plugins'
export const SNAPSHOT_ROUTE = API_PREFIX + '/snapshot'
export const SETTINGS_ROUTE = API_PREFIX + '/settings'
export const RESCAN_ROUTE = API_PREFIX + '/rescan'

const MAX_BODY_BYTES = 256 * 1024
const PATCH_KEYS = new Set([
  'enabledPlugins',
  'disabledPlugins',
  'extraRoots',
  'loadSkills',
  'loadCommands',
  'loadMcp',
  'modelDiscovery',
])

/** Register the three exact JSON endpoints when the web server is composed. */
export function registerRoutes(ctx, runtime) {
  const webServer = ctx.get?.('webServer')
  if (webServer === undefined) return
  const routes = [
    { path: SNAPSHOT_ROUTE, handler: (request, response) => snapshot(request, response, runtime) },
    { path: SETTINGS_ROUTE, handler: (request, response) => settings(request, response, runtime) },
    { path: RESCAN_ROUTE, handler: (request, response) => rescan(request, response, runtime) },
  ]
  for (const route of routes) {
    const register = () => webServer.register({ kind: 'exact', path: route.path, handler: route.handler })
    if (typeof ctx.effect === 'function') ctx.effect(register, 'dsh-claude-plugins: ' + route.path)
    else register()
  }
}

/** GET snapshot; the settings client asks for one workspace at a time. */
export function snapshot(request, response, runtime) {
  if (request.method !== 'GET') return methodNotAllowed(response, 'GET')
  try {
    sendJson(response, 200, runtime.snapshot(cwdOf(request)))
  } catch (error) {
    sendJson(response, 500, { error: messageOf(error) })
  }
}

/** GET the current settings, POST one validated partial update. */
export async function settings(request, response, runtime) {
  const method = request.method ?? 'GET'
  if (method === 'GET') return snapshot(request, response, runtime)
  if (method !== 'POST') return methodNotAllowed(response, 'GET, POST')
  try {
    const raw = await readBody(request)
    const patch = parsePatch(raw === '' ? '{}' : raw)
    const next = runtime.updateSettings(patch, cwdOf(request))
    sendJson(response, 200, next)
  } catch (error) {
    sendJson(response, error instanceof HttpError ? error.status : 400, { error: messageOf(error) })
  }
}

/** POST rescan, clearing discovery caches and re-registering loaded surfaces. */
export function rescan(request, response, runtime) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST')
  try {
    sendJson(response, 200, runtime.rescan(cwdOf(request)))
  } catch (error) {
    sendJson(response, 500, { error: messageOf(error) })
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

function parsePatch(raw) {
  let value
  try {
    value = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'request body must be JSON')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'request body must be an object')
  }
  const patch = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!PATCH_KEYS.has(key)) throw new HttpError(400, 'unknown setting: ' + key)
    if (key === 'loadSkills' || key === 'loadCommands' || key === 'loadMcp' || key === 'modelDiscovery') {
      if (typeof entry !== 'boolean') throw new HttpError(400, key + ' must be a boolean')
      patch[key] = entry
      continue
    }
    if (!Array.isArray(entry) || entry.some((item) => typeof item !== 'string' || item.trim() === '')) {
      throw new HttpError(400, key + ' must be an array of non-empty strings')
    }
    if (key === 'extraRoots') {
      for (const root of entry) {
        if (!isAbsolute(root) || !isDirectory(root)) {
          throw new HttpError(400, 'extra root is not an absolute directory: ' + root)
        }
      }
    }
    patch[key] = entry
  }
  return patch
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function cwdOf(request) {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const cwd = url.searchParams.get('cwd')
    return cwd !== null && isAbsolute(cwd) ? cwd : undefined
  } catch {
    return undefined
  }
}

function methodNotAllowed(response, allow) {
  response.writeHead(405, {
    allow,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify({ error: 'method not allowed' }))
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(payload))
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      size += Buffer.byteLength(text)
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'request body is too large'))
        return
      }
      chunks.push(text)
    })
    request.on('end', () => resolve(chunks.join('')))
    request.on('error', (error) => reject(error))
  })
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
