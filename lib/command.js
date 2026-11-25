import { randomUUID } from 'node:crypto'

/** Split command arguments with shell-like quoting, without expanding anything. */
export function splitArguments(raw) {
  const text = String(raw ?? '')
  const out = []
  let current = ''
  let started = false
  let quote = ''
  let escaped = false
  for (const character of text) {
    if (escaped) {
      current += character
      started = true
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (quote !== '') {
      if (character === quote) quote = ''
      else current += character
      started = true
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      started = true
      continue
    }
    if (/\s/.test(character)) {
      if (started) {
        out.push(current)
        current = ''
        started = false
      }
      continue
    }
    current += character
    started = true
  }
  if (started) out.push(current)
  return out
}

/** Expand one command body exactly as the command surface documents it. */
export function expandCommandBody(body, rawInput, pluginRoot) {
  const input = String(rawInput ?? '')
  const trimmed = input.trim()
  const args = splitArguments(trimmed)
  let text = String(body ?? '').split('${CLAUDE_PLUGIN_ROOT}').join(pluginRoot)
  text = text.replace(/\$ARGUMENTS\b/g, trimmed)
  text = text.replace(/\$([1-9])\b/g, (_match, index) => args[Number(index) - 1] ?? '')
  return text
}

/** Whether a command contains Claude's dynamic shell context blocks. */
export function hasDynamicContext(body) {
  return /!\x60[^\x60]*\x60/.test(String(body ?? ''))
}

/**
 * Build a DSH command handler that injects the expanded Claude command prompt
 * as the next user turn.
 */
export function createCommandHandler(options) {
  const { plugin, command, readBody } = options
  return (invocation) => {
    let body
    try {
      body = readBody()
    } catch (error) {
      return { kind: 'error', text: 'cannot read Claude command "' + command.name + '": ' + messageOf(error) }
    }
    if (typeof body !== 'string' || body.trim() === '') {
      return { kind: 'error', text: 'Claude command "' + command.name + '" is empty.' }
    }
    const text = expandCommandBody(body, invocation.rawInput, plugin.path)
    try {
      invocation.agent.followup({
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text }],
        source: {
          kind: 'claude-command',
          plugin: plugin.id,
          command: command.name,
          form: 'instructions',
        },
      })
    } catch (error) {
      return { kind: 'error', text: 'cannot start Claude command "' + command.name + '": ' + messageOf(error) }
    }
    return { kind: 'success' }
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
