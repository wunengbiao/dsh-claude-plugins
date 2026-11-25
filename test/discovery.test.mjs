import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { discoverPlugins } from '../lib/discovery.js'
import { normalizeSettings } from '../lib/settings.js'
import { fixture, makePlugin, write, writeJson } from './helpers.mjs'

function build(t) {
  const root = fixture(t)
  const claude = join(root, 'claude')
  const workspace = join(root, 'workspace')
  mkdirSync(workspace, { recursive: true })
  const alpha = join(claude, 'plugins', 'cache', 'market-a', 'alpha', '1.0.0')
  makePlugin(alpha, { name: 'alpha', version: '1.0.0', description: 'Alpha plugin' })
  write(alpha, 'skills/hello/SKILL.md', '---\nname: hello\ndescription: Say hello.\n---\n\nHello body.\n')
  write(alpha, 'commands/greet.md', '---\ndescription: Greet somebody\nargument-hint: <name>\n---\n\nHello $ARGUMENTS from ${CLAUDE_PLUGIN_ROOT}.\n')
  write(alpha, 'agents/review/security.md', '---\nname: security\ndescription: Review security.\nmodel: sonnet\n---\n\nBe careful.\n')
  writeJson(alpha, 'hooks/hooks.json', {
    hooks: {
      PostToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'format' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'one' }, { type: 'command', command: 'two' }] }],
    },
  })
  writeJson(alpha, '.mcp.json', {
    mcpServers: { demo: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server.js'], env: { A: '1' } } },
  })
  const beta = join(claude, 'plugins', 'cache', 'market-b', 'beta', '0.2.0')
  write(beta, 'skills/beta-skill/SKILL.md', '---\ndescription: Beta skill.\ndisable-model-invocation: true\n---\n\nBeta body.\n')
  const project = join(claude, 'plugins', 'cache', 'market-a', 'proj', '1.0.0')
  makePlugin(project, { name: 'proj', description: 'Project plugin' })
  write(project, 'skills/project-skill/SKILL.md', '---\ndescription: Project skill.\n---\n\nProject body.\n')
  const extra = join(root, 'extra-plugin')
  makePlugin(extra, { name: 'extra-plugin', description: 'Extra plugin' })
  write(extra, 'skills/extra-skill/SKILL.md', '---\ndescription: Extra skill.\n---\n\nExtra body.\n')
  writeJson(claude, 'settings.json', { enabledPlugins: { 'beta@market-b': false } })
  writeJson(claude, 'plugins/installed_plugins.json', {
    version: 2,
    plugins: {
      'alpha@market-a': [{ scope: 'user', installPath: alpha, version: '1.0.0' }],
      'beta@market-b': [{ scope: 'user', installPath: beta, version: '0.2.0' }],
      'proj@market-a': [{ scope: 'project', projectPath: workspace, installPath: project, version: '1.0.0' }],
    },
  })
  writeJson(claude, 'plugins/known_marketplaces.json', {
    'market-b': { installLocation: join(claude, 'plugins', 'marketplaces', 'market-b') },
  })
  writeJson(claude, 'plugins/marketplaces/market-b/.claude-plugin/marketplace.json', {
    name: 'market-b',
    plugins: [{ name: 'beta', description: 'Beta from marketplace', version: '0.2.0', source: './plugins/beta' }],
  })
  return { root, claude, workspace, alpha, beta, project, extra }
}

test('discovers installed, project, marketplace-fallback, and extra plugins', (t) => {
  const built = build(t)
  const settings = normalizeSettings({ extraRoots: [built.extra] })
  const result = discoverPlugins({ claudeConfigDir: built.claude, cwd: built.workspace, settings })
  assert.equal(result.plugins.length, 4)
  assert.equal(result.issues.length, 0)

  const alpha = result.plugins.find((plugin) => plugin.id === 'alpha@market-a')
  assert.equal(alpha.name, 'alpha')
  assert.equal(alpha.enabled, true)
  assert.equal(alpha.manifestFound, true)
  assert.equal(alpha.components.skills[0].dshName, 'alpha-hello')
  assert.equal(alpha.components.commands[0].dshName, 'alpha-greet')
  assert.equal(alpha.components.commands[0].name, 'greet')
  assert.equal(alpha.components.agents[0].name, 'review:security')
  assert.deepEqual(alpha.components.agents[0].relativePath, 'agents/review/security.md')
  assert.deepEqual(alpha.components.hooks.map((hook) => [hook.event, hook.count]), [['PostToolUse', 1], ['Stop', 2]])
  assert.equal(alpha.components.mcpServers[0].name, 'demo')
  assert.equal(alpha.components.mcpServers[0].transport, 'stdio')

  const beta = result.plugins.find((plugin) => plugin.id === 'beta@market-b')
  assert.equal(beta.manifestFound, false)
  assert.equal(beta.description, 'Beta from marketplace')
  assert.equal(beta.enabled, false)
  assert.equal(beta.enablementSource, 'claude')
  assert.equal(beta.components.skills[0].modelInvocable, false)

  const project = result.plugins.find((plugin) => plugin.id === 'proj@market-a')
  assert.equal(project.scope, 'project')
  assert.equal(project.projectPath, built.workspace)
  assert.equal(project.enabled, true)

  const extra = result.plugins.find((plugin) => plugin.name === 'extra-plugin')
  assert.equal(extra.source, 'extra')
  assert.match(extra.id, /^extra-plugin@local:/)
  assert.equal(extra.components.skills[0].dshName, 'extra-plugin-extra-skill')

  const claudeRoot = result.roots.find((root) => root.kind === 'claude')
  assert.equal(claudeRoot.pluginCount, 3)
  const extraRoot = result.roots.find((root) => root.kind === 'extra')
  assert.equal(extraRoot.pluginCount, 1)
})

test('a settings override wins over Claude enabledPlugins', (t) => {
  const built = build(t)
  const result = discoverPlugins({
    claudeConfigDir: built.claude,
    cwd: built.workspace,
    settings: normalizeSettings({ enabledPlugins: ['beta@market-b'], extraRoots: [built.extra] }),
  })
  const beta = result.plugins.find((plugin) => plugin.id === 'beta@market-b')
  assert.equal(beta.enabled, true)
  assert.equal(beta.enablementSource, 'settings')
})

test('project-scoped installs do not load outside their project', (t) => {
  const built = build(t)
  const result = discoverPlugins({
    claudeConfigDir: built.claude,
    cwd: join(built.root, 'elsewhere'),
    settings: normalizeSettings({ extraRoots: [built.extra] }),
  })
  assert.equal(result.plugins.some((plugin) => plugin.id === 'proj@market-a'), false)
  assert.equal(result.plugins.length, 3)
})

test('reports missing extra roots without discarding installed plugins', (t) => {
  const built = build(t)
  const settings = normalizeSettings({ extraRoots: [join(built.root, 'missing')] })
  const result = discoverPlugins({ claudeConfigDir: built.claude, cwd: built.workspace, settings })
  assert.equal(result.plugins.length, 3)
  assert.equal(result.issues.some((issue) => issue.code === 'extra-root-missing'), true)
})