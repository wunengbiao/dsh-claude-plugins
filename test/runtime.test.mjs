import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { apply } from '../index.js'
import { fixture, makePlugin, write, writeJson } from './helpers.mjs'

function build(t) {
  const root = fixture(t)
  const claude = join(root, 'claude')
  const plugin = join(claude, 'plugins', 'cache', 'market', 'alpha', '1.0.0')
  makePlugin(plugin, { name: 'alpha', description: 'Alpha plugin' })
  write(plugin, 'skills/hello/SKILL.md', '---\ndescription: Say hello.\n---\n\nHello body.\n')
  write(plugin, 'commands/greet.md', '---\ndescription: Greet\nargument-hint: <name>\n---\n\nHello $ARGUMENTS from ${CLAUDE_PLUGIN_ROOT}.\n')
  writeJson(plugin, '.mcp.json', { mcpServers: { demo: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server.js'] } } })
  writeJson(claude, 'plugins/installed_plugins.json', {
    version: 2,
    plugins: { 'alpha@market': [{ scope: 'user', installPath: plugin, version: '1.0.0' }] },
  })
  return { root, claude, plugin, settingsPath: join(root, 'settings.json') }
}

function makeContext() {
  const state = {
    provider: undefined,
    invalidations: 0,
    commands: [],
    mcp: [],
    mcpList: [],
  }
  const ctx = {
    logger: { info() {}, warn() {} },
    get(name) {
      if (name === 'skills') {
        return {
          registerProvider(create) {
            state.provider = create({ invalidate() { state.invalidations += 1 } })
            return () => {}
          },
        }
      }
      if (name === 'commands') {
        return {
          register(definition) {
            state.commands.push(definition)
            return () => {
              const index = state.commands.indexOf(definition)
              if (index >= 0) state.commands.splice(index, 1)
            }
          },
        }
      }
      if (name === 'mcpManager') {
        return {
          register(name, entry) {
            const record = { name, entry }
            state.mcp.push(record)
            return () => {
              const index = state.mcp.indexOf(record)
              if (index >= 0) state.mcp.splice(index, 1)
            }
          },
          list() {
            return state.mcp.map((record) => ({ name: record.name, configured: false, status: { state: 'connected' } }))
          },
        }
      }
      return undefined
    },
    effect(fn) {
      const cleanup = fn()
      return () => cleanup?.()
    },
  }
  return { ctx, state }
}

test('loads skills and commands, expands a command, and reloads on settings changes', async (t) => {
  const built = build(t)
  const { ctx, state } = makeContext()
  const handle = apply(ctx, { claudeConfigDir: built.claude, settingsPath: built.settingsPath })
  const runtime = handle.runtime

  const snapshot = runtime.snapshot()
  assert.equal(snapshot.summary.detected, 1)
  assert.equal(snapshot.summary.skills, 1)
  assert.equal(snapshot.summary.commands, 1)
  assert.equal(snapshot.summary.modelSkills, 0)
  assert.equal(snapshot.plugins[0].components.skills[0].dshName, 'alpha-hello')
  assert.equal(snapshot.plugins[0].components.commands[0].dshName, 'alpha-greet')

  const listing = await state.provider.list({ cwd: built.root })
  assert.equal(listing.candidates.length, 1)
  assert.equal(listing.candidates[0].name, 'alpha-hello')
  assert.deepEqual(listing.candidates[0].invocation, { modelInvocable: false, userInvocable: true })
  const loaded = await state.provider.get(listing.candidates[0], { cwd: built.root })
  assert.equal(loaded.content, 'Hello body.')

  const command = state.commands.find((entry) => entry.name === 'alpha-greet')
  assert.equal(command.description, 'Greet')
  let sent
  command.handler({ rawInput: 'Ada', agent: { followup(message) { sent = message } } })
  assert.equal(sent.content[0].text, 'Hello Ada from ' + built.plugin + '.')

  const withModel = runtime.updateSettings({ modelDiscovery: true })
  assert.equal(withModel.settings.modelDiscovery, true)
  assert.equal(withModel.summary.modelSkills, 1)
  assert.equal(state.invalidations, 2)
  const modelListing = await state.provider.list({ cwd: built.root })
  assert.equal(modelListing.candidates[0].invocation.modelInvocable, true)

  const withoutCommands = runtime.updateSettings({ loadCommands: false })
  assert.equal(withoutCommands.summary.commands, 0)
  assert.equal(state.commands.length, 0)

  const withMcp = runtime.updateSettings({ loadMcp: true })
  assert.equal(withMcp.summary.mcpServers, 1)
  assert.equal(state.mcp.length, 1)
  assert.equal(state.mcp[0].name, 'cp-alpha-demo')
  assert.deepEqual(state.mcp[0].entry.args, [join(built.plugin, 'server.js')])
  assert.equal(withMcp.plugins[0].components.mcpServers[0].live.state, 'connected')

  const withoutMcp = runtime.updateSettings({ loadMcp: false })
  assert.equal(withoutMcp.summary.mcpServers, 0)
  assert.equal(state.mcp.length, 0)

  runtime.dispose()
})

test('a saved settings document is reused by the next runtime instance', (t) => {
  const built = build(t)
  const first = makeContext()
  const one = apply(first.ctx, { claudeConfigDir: built.claude, settingsPath: built.settingsPath })
  one.runtime.updateSettings({ modelDiscovery: true })
  one.runtime.dispose()

  const second = makeContext()
  const two = apply(second.ctx, { claudeConfigDir: built.claude, settingsPath: built.settingsPath })
  assert.equal(two.runtime.settings().modelDiscovery, true)
  assert.equal(two.runtime.snapshot().summary.modelSkills, 1)
  two.runtime.dispose()
})