import test from 'node:test'
import assert from 'node:assert/strict'
import { createCommandHandler, expandCommandBody, hasDynamicContext, splitArguments } from '../lib/command.js'

test('splits arguments with quotes and backslash escapes', () => {
  assert.deepEqual(splitArguments('one "two three" four\\ five'), ['one', 'two three', 'four five'])
  assert.deepEqual(splitArguments('  '), [])
  assert.deepEqual(splitArguments('""'), [''])
})

test('expands arguments and the plugin root without executing anything', () => {
  const body = 'First: $1\nSecond: $2\nAll: $ARGUMENTS\nRoot: ${CLAUDE_PLUGIN_ROOT}\nDynamic: !' + '`' + 'echo hi' + '`'
  const expanded = expandCommandBody(body, 'alpha beta', '/plugins/sample')
  assert.match(expanded, /First: alpha/)
  assert.match(expanded, /Second: beta/)
  assert.match(expanded, /All: alpha beta/)
  assert.match(expanded, /Root: \/plugins\/sample/)
  assert.match(expanded, /Dynamic: !`echo hi`/)
  assert.equal(hasDynamicContext(body), true)
  assert.equal(hasDynamicContext('no dynamic block'), false)
})

test('the command handler injects one identified user message', () => {
  let sent
  const handler = createCommandHandler({
    plugin: { id: 'sample@local', path: '/plugins/sample' },
    command: { name: 'greet' },
    readBody: () => 'Hello $ARGUMENTS',
  })
  const result = handler({
    rawInput: 'world',
    agent: { followup(message) { sent = message } },
  })
  assert.deepEqual(result, { kind: 'success' })
  assert.equal(sent.role, 'user')
  assert.equal(sent.content[0].text, 'Hello world')
  assert.deepEqual(sent.source, {
    kind: 'claude-command',
    plugin: 'sample@local',
    command: 'greet',
    form: 'instructions',
  })
  assert.equal(typeof sent.id, 'string')
})
