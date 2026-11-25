import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function fakeDocument(lang) {
  const style = { dataset: {}, textContent: '', remove() {} }
  return {
    documentElement: { getAttribute() { return lang } },
    querySelector() { return null },
    createElement() { return style },
    head: { appendChild() {} },
    style,
  }
}

function stubReact() {
  return {
    createElement() { return { type: 'element' } },
    Fragment: {},
    useState() { return [undefined, () => {}] },
    useEffect() {},
    useCallback(fn) { return fn },
    useMemo(fn) { return fn() },
    useRef() { return { current: null } },
  }
}

function loadClient(t, lang = 'zh-CN') {
  const code = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  let captured
  const document = fakeDocument(lang)
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  globalThis.window = { __ModuleLoader__: { load(definition) { captured = definition } } }
  globalThis.document = document
  t.after(() => {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  })
  new Function('window', code)(globalThis.window)
  assert.equal(captured.id, 'dsh-claude-plugins')
  const module = captured.factory((id) => {
    if (id === 'react') return stubReact()
    throw new Error('unexpected bundle dependency: ' + id)
  })
  return { module, document }
}

function mount(module, registrations) {
  const ctx = {
    effect(fn) {
      const cleanup = fn()
      return () => cleanup?.()
    },
    slots: {
      inject(_name, callback) { callback() },
      register(definition) { registrations.push(definition); return () => {} },
    },
  }
  module.apply(ctx)
}

test('registers the Claude plugins settings section and its icon', (t) => {
  const { module } = loadClient(t)
  const registrations = []
  mount(module, registrations)
  assert.deepEqual(registrations.map((entry) => entry.name + ':' + entry.id + ':' + entry.order), [
    'settings.section:claude-plugins:92',
    'settings.section.icon:claude-plugins:92',
  ])
  assert.equal(registrations[0].label(), 'Claude 插件')
  assert.equal(module.inject[0], 'slots')
})

test('uses the English label when the document language is English', (t) => {
  const { module } = loadClient(t, 'en-US')
  const registrations = []
  mount(module, registrations)
  assert.equal(registrations[0].label(), 'Claude plugins')
})

test('searches components and labels MCP state honestly', (t) => {
  const { module } = loadClient(t)
  const helpers = module.apply.__test
  const plugin = {
    id: 'alpha@market',
    name: 'alpha',
    displayName: 'Alpha',
    description: 'Alpha plugin',
    marketplace: 'market',
    components: {
      skills: [{ name: 'hello', dshName: 'alpha-hello', description: 'Say hello.' }],
      commands: [{ name: 'greet', dshName: 'alpha-greet', description: 'Greet people.' }],
      agents: [],
      mcpServers: [],
    },
  }
  assert.match(helpers.haystack(plugin), /alpha-hello/)
  assert.match(helpers.haystack(plugin), /greet people/)

  const settingsOff = { loadMcp: false }
  assert.equal(helpers.mcpState({ transport: 'stdio' }, settingsOff, helpers.STRINGS.zh).label, '未载入')
  assert.equal(helpers.mcpState({ transport: 'unsupported', unsupportedReason: 'SSE' }, { loadMcp: true }, helpers.STRINGS.zh).tone, 'bad')
  assert.equal(helpers.mcpState({ transport: 'stdio', live: { state: 'connected' } }, { loadMcp: true }, helpers.STRINGS.zh).label, '已连接')
})

test('directory picking prefers the desktop bridge', async (t) => {
  const { module } = loadClient(t)
  const previous = globalThis.__DSH_DIRECTORY_PICKER__
  globalThis.__DSH_DIRECTORY_PICKER__ = { async pick() { return '/tmp/picked' } }
  t.after(() => { globalThis.__DSH_DIRECTORY_PICKER__ = previous })
  assert.equal(await module.apply.__test.pickDirectory(), '/tmp/picked')
})