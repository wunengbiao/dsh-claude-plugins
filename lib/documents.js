import { readFileSync } from 'node:fs'
import { basename, relative } from 'node:path'
import { parseFrontmatter, readBoolean, readString } from './frontmatter.js'
import { messageOf } from './json.js'

/** First readable sentence used when a document omits its description. */
export function fallbackDescription(body, path) {
  for (const line of String(body ?? '').split('\n')) {
    const text = line.trim()
    if (text === '' || text.startsWith('#') || text.startsWith('---')) continue
    const sentence = text.replace(/^[-*+]\s+/, '').trim()
    if (sentence !== '') return sentence.length > 240 ? sentence.slice(0, 240) + '…' : sentence
  }
  return 'Claude plugin document at ' + path
}

/** Normalize a Claude component name into a display name; DSH naming happens later. */
export function componentName(raw, fallback) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value === '' ? fallback : value
}

function readDocument(path) {
  try {
    return { ok: true, raw: readFileSync(path, 'utf8') }
  } catch (error) {
    return { ok: false, reason: messageOf(error) }
  }
}

/** Parse one SKILL.md into the discovery model. */
export function parseSkillDocument(path, fallbackName) {
  const read = readDocument(path)
  if (!read.ok) return { ok: false, reason: read.reason }
  const parsed = parseFrontmatter(read.raw)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }
  const name = componentName(readString(parsed.data, 'name'), fallbackName)
  const description = readString(parsed.data, 'description') ?? fallbackDescription(parsed.body, path)
  const whenToUse = readString(parsed.data, 'when-to-use', 'when_to_use')
  return {
    ok: true,
    document: {
      name,
      description,
      ...(whenToUse === undefined ? {} : { whenToUse }),
      path,
      modelInvocable: !readBoolean(parsed.data, 'disable-model-invocation', false),
      userInvocable: readBoolean(parsed.data, 'user-invocable', true),
      metadata: parsed.data,
      body: parsed.body.trim(),
    },
  }
}

/** Parse one command Markdown file; inline manifest commands carry their body instead. */
export function parseCommandDocument(path, fallbackName, inline = undefined) {
  const read = inline === undefined ? readDocument(path) : { ok: true, raw: inline.content }
  if (!read.ok) return { ok: false, reason: read.reason }
  const parsed = parseFrontmatter(read.raw)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }
  const name = replaceLastSegment(fallbackName, readString(parsed.data, 'name'))
  const description = readString(parsed.data, 'description')
    ?? (typeof inline?.description === 'string' && inline.description.trim() !== '' ? inline.description.trim() : undefined)
    ?? fallbackDescription(parsed.body, path)
  const argumentHint = readString(parsed.data, 'argument-hint')
  const allowedTools = readAllowedTools(parsed.data)
  const model = readString(parsed.data, 'model')
  return {
    ok: true,
    document: {
      name,
      description,
      ...(argumentHint === undefined ? {} : { argumentHint }),
      ...(allowedTools === undefined ? {} : { allowedTools }),
      ...(model === undefined ? {} : { model }),
      path: inline === undefined ? path : undefined,
      ...(inline === undefined ? {} : { content: inline.content }),
      body: parsed.body.trim(),
      metadata: parsed.data,
    },
  }
}

function replaceLastSegment(fallback, declared) {
  if (declared === undefined || declared.trim() === '') return fallback
  const segments = fallback.split(':')
  if (segments.length === 0) return declared
  segments[segments.length - 1] = declared.trim()
  return segments.join(':')
}

function readAllowedTools(data) {
  const value = data['allowed-tools']
  if (Array.isArray(value)) {
    const items = value.filter((entry) => typeof entry === 'string' && entry.trim() !== '')
    return items.length === 0 ? undefined : items
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean)
  }
  return undefined
}

/** Parse one agent Markdown file. Agents are displayed but not loaded by DSH. */
export function parseAgentDocument(path, fallbackName) {
  const read = readDocument(path)
  if (!read.ok) return { ok: false, reason: read.reason }
  const parsed = parseFrontmatter(read.raw)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }
  const name = replaceLastSegment(fallbackName, readString(parsed.data, 'name'))
  const description = readString(parsed.data, 'description') ?? fallbackDescription(parsed.body, path)
  const model = readString(parsed.data, 'model')
  const tools = readAllowedTools(parsed.data)
  return {
    ok: true,
    document: {
      name,
      description,
      ...(model === undefined ? {} : { model }),
      ...(tools === undefined ? {} : { tools }),
      path,
    },
  }
}

/** Relative component path below commands/ or agents/, used as a fallback name. */
export function componentFallback(root, path, kind, separator = ':') {
  const rel = relative(root, path).replace(/\\/g, '/').replace(/\.md$/i, '')
  const segments = rel.split('/').filter(Boolean)
  const index = segments.indexOf(kind)
  const tail = index >= 0 ? segments.slice(index + 1) : segments
  return tail.length === 0 ? basename(path, '.md') : tail.join(separator)
}