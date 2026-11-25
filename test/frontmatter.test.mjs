import test from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontmatter, readBoolean, readString } from '../lib/frontmatter.js'

test('parses quoted, folded, list, and nested frontmatter values', () => {
  const raw = [
    '---',
    'name: sample',
    'description: "A quoted: description"',
    'when-to-use: >-',
    '  Use this when',
    '  the fixture matters.',
    'allowed-tools: [Read, Bash]',
    'metadata:',
    '  author: Fixture',
    '  keywords:',
    '  - one',
    '  - two',
    '---',
    '',
    'Body line one.',
    'Body line two.',
  ].join('\n')
  const parsed = parseFrontmatter(raw)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.data.name, 'sample')
  assert.equal(parsed.data.description, 'A quoted: description')
  assert.equal(parsed.data['when-to-use'], 'Use this when the fixture matters.')
  assert.deepEqual(parsed.data['allowed-tools'], ['Read', 'Bash'])
  assert.equal(parsed.data.metadata.author, 'Fixture')
  assert.deepEqual(parsed.data.metadata.keywords, ['one', 'two'])
  assert.equal(parsed.body, 'Body line one.\nBody line two.')
})

test('folds indented continuation lines into a plain scalar', () => {
  const raw = [
    '---',
    'description: First line',
    '  continues here.',
    '---',
    'Body.',
  ].join('\n')
  const parsed = parseFrontmatter(raw)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.data.description, 'First line continues here.')
})

test('reports missing and unterminated frontmatter', () => {
  assert.deepEqual(parseFrontmatter('Body only'), { ok: false, reason: 'missing YAML frontmatter' })
  assert.deepEqual(parseFrontmatter('---\nname: x\nBody'), { ok: false, reason: 'unterminated YAML frontmatter' })
})

test('reads booleans and strings without inventing values', () => {
  assert.equal(readBoolean({ flag: 'yes' }, 'flag', false), true)
  assert.equal(readBoolean({ flag: 'off' }, 'flag', true), false)
  assert.equal(readBoolean({}, 'flag', true), true)
  assert.equal(readBoolean({ flag: 'maybe' }, 'flag', true), true)
  assert.equal(readString({ 'when-to-use': 'now' }, 'when_to_use', 'when-to-use'), 'now')
  assert.equal(readString({ 'when-to-use': '  ' }, 'when-to-use'), undefined)
})
