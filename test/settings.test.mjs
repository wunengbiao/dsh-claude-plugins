import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { createSettingsStore, DEFAULT_SETTINGS, normalizeSettings, withPluginEnabled } from '../lib/settings.js'
import { fixture } from './helpers.mjs'

test('normalizes missing and invalid values to the documented defaults', () => {
  const settings = normalizeSettings({
    enabledPlugins: ['a@m', 'a@m', '', 3],
    disabledPlugins: 'nope',
    extraRoots: ['./one', './one'],
    loadSkills: 'yes',
    loadCommands: false,
    loadMcp: true,
    modelDiscovery: 1,
  })
  assert.deepEqual(settings.enabledPlugins, ['a@m'])
  assert.deepEqual(settings.disabledPlugins, [])
  assert.equal(settings.extraRoots.length, 1)
  assert.equal(settings.loadSkills, true)
  assert.equal(settings.loadCommands, false)
  assert.equal(settings.loadMcp, true)
  assert.equal(settings.modelDiscovery, false)
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS)
})

test('toggling a plugin keeps enabled and disabled disjoint', () => {
  const enabled = withPluginEnabled({ disabledPlugins: ['a@m'], enabledPlugins: [] }, 'a@m', true)
  assert.deepEqual(enabled.enabledPlugins, ['a@m'])
  assert.deepEqual(enabled.disabledPlugins, [])
  const disabled = withPluginEnabled({ disabledPlugins: [], enabledPlugins: ['a@m'] }, 'a@m', false)
  assert.deepEqual(disabled.enabledPlugins, [])
  assert.deepEqual(disabled.disabledPlugins, ['a@m'])
})

test('writes settings atomically and reads them back', (t) => {
  const root = fixture(t)
  const path = join(root, 'nested', 'settings.json')
  const store = createSettingsStore(path)
  assert.deepEqual(store.read(), DEFAULT_SETTINGS)
  const written = store.write({ enabledPlugins: ['plugin@market'], loadMcp: true })
  assert.deepEqual(store.read(), written)
  const onDisk = JSON.parse(readFileSync(path, 'utf8'))
  assert.deepEqual(onDisk, written)
  assert.equal(store.lastError(), undefined)
})

test('a corrupt settings file reads as defaults and reports the error', (t) => {
  const root = fixture(t)
  const path = join(root, 'settings.json')
  const store = createSettingsStore(path)
  store.write({ modelDiscovery: true })
  // Overwrite with invalid JSON behind the store's cache.
  writeFileSync(path, '{')
  const read = store.read()
  assert.deepEqual(read, DEFAULT_SETTINGS)
  assert.equal(typeof store.lastError(), 'string')
})