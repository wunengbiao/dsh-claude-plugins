import { resolve } from 'node:path'
import { ConfigError } from './errors.js'
import { defaultClaudeConfigDir, defaultSettingsPath } from './paths.js'

const KNOWN = new Set(['claudeConfigDir', 'settingsPath', 'providerName', 'rank'])
const PROVIDER_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Validate the bundle row once, so a typo fails loudly at activation. */
export function normalizeConfig(raw, env = process.env) {
  const input = raw ?? {}
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new ConfigError('config', 'must be a mapping')
  }
  for (const key of Object.keys(input)) {
    if (!KNOWN.has(key)) throw new ConfigError(key, 'is not a recognized key')
  }
  const claudeConfigDir = input.claudeConfigDir === undefined
    ? defaultClaudeConfigDir(env)
    : readPath(input.claudeConfigDir, 'claudeConfigDir')
  const settingsPath = input.settingsPath === undefined
    ? defaultSettingsPath(env)
    : readPath(input.settingsPath, 'settingsPath')
  const providerName = input.providerName === undefined ? 'claude-plugins' : input.providerName
  if (typeof providerName !== 'string' || !PROVIDER_NAME.test(providerName)) {
    throw new ConfigError('providerName', 'must be kebab-case')
  }
  if (providerName === 'runtime') throw new ConfigError('providerName', 'is reserved by the skill registry')
  const rank = input.rank === undefined ? 600 : input.rank
  if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 0) {
    throw new ConfigError('rank', 'must be a non-negative integer')
  }
  return { claudeConfigDir: resolve(claudeConfigDir), settingsPath: resolve(settingsPath), providerName, rank }
}

function readPath(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(field, 'must be a non-empty path')
  }
  return resolve(value.trim())
}
