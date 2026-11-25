import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Claude Code's configuration directory, overridable for tests and relocated installs. */
export function defaultClaudeConfigDir(env = process.env) {
  const configured = typeof env.CLAUDE_CONFIG_DIR === 'string' ? env.CLAUDE_CONFIG_DIR.trim() : ''
  return configured === '' ? join(homedir(), '.claude') : configured
}

/** Claude Code's plugin state directory. */
export function claudePluginsDir(claudeConfigDir) {
  return join(claudeConfigDir, 'plugins')
}

/** This plugin's settings document inside the harness home. */
export function defaultSettingsPath(env = process.env) {
  const configured = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  const home = configured === '' ? join(homedir(), '.dsh') : configured
  return join(home, 'claude-plugins', 'settings.json')
}

/** Stable ASCII name accepted by DSH skill and command grammars. */
export function slug(value) {
  const text = String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return text === '' ? 'plugin' : text
}

/** Deterministic suffix for a name that had to be shortened. */
export function shortHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 6)
}

/** Shorten a name to a maximum length while keeping it unique per source. */
export function boundedName(value, maxLength, hashSource = value) {
  if (value.length <= maxLength) return value
  const digest = shortHash(hashSource)
  const keep = Math.max(1, maxLength - digest.length - 1)
  return value.slice(0, keep).replace(/-+$/g, '') + '-' + digest
}

/** Allocate a name inside one plugin, suffixing later collisions deterministically. */
export function allocateName(base, used) {
  let candidate = base
  let index = 2
  while (used.has(candidate)) {
    candidate = base + '-' + String(index)
    index += 1
  }
  used.add(candidate)
  return candidate
}
