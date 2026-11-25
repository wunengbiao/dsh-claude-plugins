import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { fixture } from './helpers.mjs'
import { registerRoutes, rescan, settings, snapshot, SETTINGS_ROUTE, SNAPSHOT_ROUTE, RESCAN_ROUTE } from '../lib/routes.js'

function makeRequest(options) {
  const request = Readable.from(options.body === undefined ? [] : [options.body])
  request.method = options.method ?? 'GET'
  request.url = options.url ?? '/'
  return request
}

function makeResponse() {
  return {
    status: undefined,
    headers: undefined,
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(chunk) {
      this.body += chunk === undefined ? '' : String(chunk)
    },
  }
}

function makeRuntime() {
  const calls = []
  return {
    calls,
    runtime: {
      snapshot(cwd) { calls.push(['snapshot', cwd]); return { ok: true, cwd: cwd ?? null } },
      updateSettings(patch, cwd) { calls.push(['update', patch, cwd]); return { ok: true, patch } },
      rescan(cwd) { calls.push(['rescan', cwd]); return { ok: true } },
    },
  }
}

async function json(response) {
  return JSON.parse(response.body)
}

test('GET snapshot returns JSON and forwards an absolute cwd', () => {
  const { runtime, calls } = makeRuntime()
  const response = makeResponse()
  snapshot(makeRequest({ url: '/x?cwd=' + encodeURIComponent('/tmp/workspace') }), response, runtime)
  assert.equal(response.status, 200)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(response.body), { ok: true, cwd: '/tmp/workspace' })
  assert.deepEqual(calls, [['snapshot', '/tmp/workspace']])
})

test('POST settings validates and forwards a patch', async () => {
  const { runtime, calls } = makeRuntime()
  const response = makeResponse()
  await settings(makeRequest({ method: 'POST', url: SETTINGS_ROUTE, body: JSON.stringify({ modelDiscovery: true }) }), response, runtime)
  assert.equal(response.status, 200)
  assert.deepEqual(calls, [['update', { modelDiscovery: true }, undefined]])
})

test('POST settings rejects unknown keys, wrong types, and missing directories', async (t) => {
  const root = fixture(t)
  const missing = join(root, 'missing')
  const cases = [
    [{ unknown: true }, 'unknown setting: unknown'],
    [{ loadSkills: 'yes' }, 'loadSkills must be a boolean'],
    [{ extraRoots: [missing] }, 'extra root is not an absolute directory: ' + missing],
  ]
  for (const [body, message] of cases) {
    const { runtime, calls } = makeRuntime()
    const response = makeResponse()
    await settings(makeRequest({ method: 'POST', url: SETTINGS_ROUTE, body: JSON.stringify(body) }), response, runtime)
    assert.equal(response.status, 400)
    assert.deepEqual(await json(response), { error: message })
    assert.deepEqual(calls, [])
  }
})

test('POST settings rejects invalid JSON and non-POST methods', async () => {
  const { runtime } = makeRuntime()
  const invalid = makeResponse()
  await settings(makeRequest({ method: 'POST', url: SETTINGS_ROUTE, body: '{' }), invalid, runtime)
  assert.equal(invalid.status, 400)

  const wrong = makeResponse()
  await settings(makeRequest({ method: 'DELETE', url: SETTINGS_ROUTE }), wrong, runtime)
  assert.equal(wrong.status, 405)
  assert.equal(wrong.headers.allow, 'GET, POST')
})

test('POST rescan returns a fresh snapshot and GET does not', () => {
  const { runtime, calls } = makeRuntime()
  const ok = makeResponse()
  rescan(makeRequest({ method: 'POST', url: RESCAN_ROUTE }), ok, runtime)
  assert.equal(ok.status, 200)
  assert.deepEqual(calls, [['rescan', undefined]])

  const wrong = makeResponse()
  rescan(makeRequest({ method: 'GET', url: RESCAN_ROUTE }), wrong, runtime)
  assert.equal(wrong.status, 405)
  assert.equal(wrong.headers.allow, 'POST')
})

test('registerRoutes registers all three exact paths through effects', () => {
  const registered = []
  const cleanups = []
  const ctx = {
    get(name) {
      if (name !== 'webServer') return undefined
      return { register(route) { registered.push(route); return () => {} } }
    },
    effect(fn) {
      const cleanup = fn()
      cleanups.push(cleanup)
      return () => cleanup?.()
    },
  }
  registerRoutes(ctx, {})
  assert.deepEqual(registered.map((route) => route.path), [SNAPSHOT_ROUTE, SETTINGS_ROUTE, RESCAN_ROUTE])
  assert.equal(cleanups.length, 3)
})
