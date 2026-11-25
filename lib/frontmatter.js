/**
 * A deliberately small YAML frontmatter reader for Claude plugin Markdown.
 *
 * Plugin metadata is JSON; only skill, command, and agent documents carry
 * YAML. Those documents use a flat key/value frontmatter with optional block
 * scalars (descriptions) and simple lists, so a general YAML parser would add
 * a dependency and a second set of edge cases for no benefit. Unsupported
 * lines fail with a reason instead of being silently dropped.
 */

const KEY_LINE = /^([A-Za-z0-9_.-]+):[ \t]*(.*)$/
const BLOCK_SCALAR = /^([|>])([+-]?)$/

/** Parse a document into frontmatter data and Markdown body. */
export function parseFrontmatter(raw) {
  const text = String(raw ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  if ((lines[0] ?? '').trim() !== '---') {
    return { ok: false, reason: 'missing YAML frontmatter' }
  }
  let closing = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (/^---[ \t]*$/.test(lines[index])) {
      closing = index
      break
    }
  }
  if (closing < 0) return { ok: false, reason: 'unterminated YAML frontmatter' }
  const parsed = parseEntries(lines.slice(1, closing))
  if (!parsed.ok) return parsed
  return {
    ok: true,
    data: parsed.data,
    body: lines.slice(closing + 1).join('\n').replace(/^\n+/, ''),
  }
}

function parseEntries(lines) {
  const data = {}
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) {
      index += 1
      continue
    }
    const match = KEY_LINE.exec(line)
    if (match === null) {
      return { ok: false, reason: 'unsupported frontmatter line: ' + trimmed }
    }
    const key = match[1]
    const rawValue = match[2]
    const block = BLOCK_SCALAR.exec(rawValue)
    if (block !== null) {
      const taken = takeIndented(lines, index + 1)
      data[key] = parseBlockScalar(block[1], block[2], taken.block)
      index = taken.next
      continue
    }
    if (rawValue.trim() !== '') {
      const taken = takeIndented(lines, index + 1)
      const continuation = taken.block.filter((entry) => entry.trim() !== '').map((entry) => entry.trim())
      const text = continuation.length === 0 ? rawValue : rawValue.trim() + ' ' + continuation.join(' ')
      data[key] = parseScalar(text)
      index = taken.next
      continue
    }
    const taken = takeIndented(lines, index + 1)
    if (taken.block.length === 0) {
      data[key] = ''
      index += 1
      continue
    }
    const list = parseList(taken.block)
    if (list !== undefined) {
      data[key] = list
      index = taken.next
      continue
    }
    const nested = parseNested(taken.block)
    if (nested === undefined) {
      return { ok: false, reason: 'unsupported nested block for ' + key }
    }
    data[key] = nested
    index = taken.next
  }
  return { ok: true, data }
}

function takeIndented(lines, start) {
  const block = []
  let index = start
  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '') {
      block.push('')
      index += 1
      continue
    }
    if (!/^\s/.test(line)) break
    block.push(line)
    index += 1
  }
  return { block, next: index }
}

function parseBlockScalar(style, chomp, block) {
  const withoutTrailingBlanks = [...block]
  while (withoutTrailingBlanks.length > 0 && withoutTrailingBlanks.at(-1) === '') {
    withoutTrailingBlanks.pop()
  }
  const indents = withoutTrailingBlanks
    .filter((line) => line.trim() !== '')
    .map((line) => /^\s*/.exec(line)[0].length)
  const indent = indents.length > 0 ? Math.min(...indents) : 0
  const stripped = withoutTrailingBlanks.map((line) => (line.trim() === '' ? '' : line.slice(indent)))
  const joined = style === '>'
    ? foldLines(stripped)
    : stripped.join('\n')
  if (chomp === '-') return joined.replace(/\n+$/g, '')
  if (chomp === '+') return joined
  return joined.replace(/\n+$/g, '')
}

function foldLines(lines) {
  const out = []
  let pendingBlank = 0
  for (const line of lines) {
    if (line === '') {
      pendingBlank += 1
      continue
    }
    if (out.length > 0) out.push(pendingBlank > 0 ? '\n'.repeat(pendingBlank + 1) : ' ')
    pendingBlank = 0
    out.push(line)
  }
  return out.join('')
}

function parseScalar(raw) {
  const value = raw.trim()
  if (value === '' || value === '~' || value.toLowerCase() === 'null') return ''
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return splitInlineList(value.slice(1, -1)).map(parseScalar)
  }
  if (value === '{}') return {}
  return value
}

function splitInlineList(value) {
  const parts = []
  let current = ''
  let quote = ''
  for (const character of value) {
    if (quote !== '') {
      current += character
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === ',') {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  if (current.trim() !== '') parts.push(current.trim())
  return parts
}

function parseList(block) {
  const items = []
  let sawList = false
  for (const line of block) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (!trimmed.startsWith('- ')) return undefined
    sawList = true
    items.push(parseScalar(trimmed.slice(2)))
  }
  return sawList ? items : undefined
}

function parseNested(block) {
  const nested = {}
  let index = 0
  let lastKey
  while (index < block.length) {
    const trimmed = block[index].trim()
    if (trimmed === '') {
      index += 1
      continue
    }
    if (trimmed.startsWith('- ')) {
      if (lastKey === undefined) return undefined
      const current = nested[lastKey]
      const list = Array.isArray(current) ? current : []
      list.push(parseScalar(trimmed.slice(2)))
      nested[lastKey] = list
      index += 1
      continue
    }
    const match = KEY_LINE.exec(trimmed)
    if (match === null) return undefined
    const key = match[1]
    const rawValue = match[2]
    lastKey = key
    if (rawValue.trim() === '') {
      const items = []
      let next = index + 1
      while (next < block.length && block[next].trim().startsWith('- ')) {
        items.push(parseScalar(block[next].trim().slice(2)))
        next += 1
      }
      nested[key] = items.length > 0 ? items : ''
      index = items.length > 0 ? next : index + 1
      continue
    }
    nested[key] = parseScalar(rawValue)
    index += 1
  }
  return nested
}

/** Read a string field under any of the accepted spellings. */
export function readString(data, ...keys) {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

/** Read a boolean field, accepting YAML's common boolean spellings. */
export function readBoolean(data, key, fallback) {
  if (!Object.hasOwn(data, key)) return fallback
  const value = data[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === '1') return true
    if (normalized === 'false' || normalized === 'no' || normalized === 'off' || normalized === '0') return false
  }
  return fallback
}