import test from 'node:test'
import assert from 'node:assert/strict'
import { assignComponentNames, assignPluginPrefixes, isValidSkillName } from '../lib/names.js'

test('generated names satisfy the DSH skill grammar', () => {
  const plugin = {
    id: 'alpha@market',
    name: 'alpha',
    components: {
      skills: [{ name: 'hello' }, { name: 'hello' }],
      commands: [{ name: 'hello' }],
    },
  }
  assignComponentNames([plugin], assignPluginPrefixes([plugin]))
  const skillNames = plugin.components.skills.map((skill) => skill.dshName)
  assert.deepEqual(skillNames, ['alpha-hello', 'alpha-hello-2'])
  assert.equal(skillNames.every(isValidSkillName), true)
  assert.equal(isValidSkillName('alpha-hello'), true)
  assert.equal(isValidSkillName('alpha--hello'), false)
  assert.equal(isValidSkillName('Alpha'), false)
  assert.equal(plugin.components.commands[0].dshName, 'alpha-hello-3')
})

test('plugin prefixes stay unique when two plugins normalize to one name', () => {
  const plugins = [
    { id: 'a@one', name: 'same-name', components: { skills: [], commands: [] } },
    { id: 'b@two', name: 'Same Name', components: { skills: [], commands: [] } },
  ]
  const prefixes = assignPluginPrefixes(plugins)
  assert.deepEqual([...prefixes.values()].sort(), ['same-name', 'same-name-2'])
})
