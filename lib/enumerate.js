import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { componentFallback, parseAgentDocument, parseCommandDocument, parseSkillDocument } from './documents.js'
import { readJsonFile } from './json.js'
import { readMcpServers } from './mcp.js'

const SKIP_DIRS = new Set(['node_modules', '.git', '.in_use', '.claude-plugin', '.idea', '.vscode'])
const MAX_FILES = 5000
const MAX_DEPTH = 6

/** Enumerate every component a Claude plugin exposes. */
export function enumerateComponents(root, manifest, issues) {
  const skills = enumerateSkills(root, manifest, issues)
  const commands = enumerateCommands(root, manifest, issues)
  const agents = enumerateAgents(root, manifest, issues)
  const hooks = enumerateHooks(root, manifest, issues)
  const mcpServers = readMcpServers(root, manifest.mcpServers, issues)
  return {
    skills,
    commands,
    agents,
    hooks,
    mcpServers,
    outputStyles: enumerateOutputStyles(root, manifest),
    lspServers: enumerateLspServers(root, manifest, issues),
    hasDshAdapter: existsSync(join(root, 'dsh', 'index.js')) || existsSync(join(root, 'dsh', 'cordis.patch.yml')),
  }
}

function enumerateSkills(root, manifest, issues) {
  const paths = new Set()
  const defaultDir = join(root, 'skills')
  if (isDirectory(defaultDir)) for (const path of skillFiles(defaultDir)) paths.add(path)
  const declared = pathList(manifest.skills)
  for (const value of declared) {
    const target = absolute(root, value)
    if (isFile(target)) paths.add(target)
    else if (isDirectory(target)) for (const path of skillFiles(target)) paths.add(path)
    else issues.push(issue('skill-invalid', 'skill path does not exist: ' + value, target))
  }
  if (declared.length === 0 && !isDirectory(defaultDir)) {
    const rootSkill = join(root, 'SKILL.md')
    if (isFile(rootSkill)) paths.add(rootSkill)
  }
  const out = []
  for (const path of [...paths].sort()) {
    const fallback = basename(dirname(path)) === basename(root) ? basename(root) : basename(dirname(path))
    const parsed = parseSkillDocument(path, fallback)
    if (!parsed.ok) {
      issues.push(issue('skill-invalid', parsed.reason, path))
      continue
    }
    out.push({ ...parsed.document, relativePath: relative(root, path).split('\\').join('/') })
  }
  return out
}

function enumerateCommands(root, manifest, issues) {
  const out = []
  const seen = new Set()
  const addFile = (path, fallback, parsedOverride) => {
    if (seen.has(path)) return
    seen.add(path)
    const parsed = parsedOverride === undefined ? parseCommandDocument(path, fallback) : { ok: true, document: parsedOverride }
    if (!parsed.ok) {
      issues.push(issue('command-invalid', parsed.reason, path))
      return
    }
    out.push({ ...parsed.document, relativePath: relative(root, path).split('\\').join('/') })
  }
  if (manifest.commands !== undefined) {
    consumeCommandSpec(manifest.commands, root, addFile, issues)
    return out
  }
  const dir = join(root, 'commands')
  if (isDirectory(dir)) {
    for (const path of walkFiles(dir, (entry) => entry.endsWith('.md'))) {
      addFile(path, componentFallback(root, path, 'commands'))
    }
  }
  return out
}

function consumeCommandSpec(value, root, addFile, issues) {
  if (typeof value === 'string') {
    addPath(value, root, (path) => addFile(path, componentFallback(root, path, 'commands')), issues, 'command')
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) consumeCommandSpec(entry, root, addFile, issues)
    return
  }
  if (typeof value === 'object' && value !== null) {
    for (const [name, spec] of Object.entries(value)) {
      if (typeof spec === 'string') {
        addPath(spec, root, (path) => addFile(path, name), issues, 'command')
        continue
      }
      if (typeof spec === 'object' && spec !== null) {
        if (typeof spec.source === 'string') {
          addPath(spec.source, root, (path) => addFile(path, name), issues, 'command')
          continue
        }
        if (typeof spec.content === 'string') {
          const synthetic = join(root, 'commands', name + '.md')
          const parsed = parseCommandDocument(synthetic, name, {
            content: spec.content,
            description: typeof spec.description === 'string' ? spec.description : undefined,
          })
          if (!parsed.ok) issues.push(issue('command-invalid', parsed.reason, synthetic))
          else addFile(synthetic, name, parsed.document)
          continue
        }
        issues.push(issue('command-invalid', 'command "' + name + '" needs source or content', root))
        continue
      }
      issues.push(issue('command-invalid', 'command "' + name + '" must be a path or object', root))
    }
    return
  }
  issues.push(issue('command-invalid', 'commands must be a path, list, or object', root))
}

function addPath(value, root, consume, issues, kind) {
  const target = absolute(root, value)
  if (isFile(target)) {
    consume(target)
    return
  }
  if (isDirectory(target)) {
    const filter = (entry) => entry.endsWith('.md')
    for (const path of walkFiles(target, filter)) consume(path)
    return
  }
  issues.push(issue(kind + '-invalid', kind + ' path does not exist: ' + value, target))
}

function enumerateAgents(root, manifest, issues) {
  const out = []
  const seen = new Set()
  const add = (path) => {
    if (seen.has(path)) return
    seen.add(path)
    const parsed = parseAgentDocument(path, componentFallback(root, path, 'agents'))
    if (!parsed.ok) {
      issues.push(issue('agent-invalid', parsed.reason, path))
      return
    }
    out.push({ ...parsed.document, relativePath: relative(root, path).split('\\').join('/') })
  }
  if (manifest.agents !== undefined) {
    for (const value of pathList(manifest.agents)) {
      const target = absolute(root, value)
      if (isFile(target)) add(target)
      else if (isDirectory(target)) for (const path of walkFiles(target, (entry) => entry.endsWith('.md'))) add(path)
      else issues.push(issue('agent-invalid', 'agent path does not exist: ' + value, target))
    }
    return out
  }
  const dir = join(root, 'agents')
  if (isDirectory(dir)) {
    for (const path of walkFiles(dir, (entry) => entry.endsWith('.md'))) add(path)
  }
  return out
}

function enumerateHooks(root, manifest, issues) {
  const out = []
  const sources = []
  const defaultFile = join(root, 'hooks', 'hooks.json')
  if (isFile(defaultFile)) sources.push({ value: readJsonFile(defaultFile), path: defaultFile })
  for (const value of hookSources(root, manifest.hooks)) sources.push(value)
  for (const source of sources) {
    if (!source.value.ok) {
      issues.push(issue('hooks-invalid', source.value.message, source.path))
      continue
    }
    const config = source.value.value
    const events = typeof config === 'object' && config !== null && typeof config.hooks === 'object' && config.hooks !== null
      ? config.hooks
      : config
    if (typeof events !== 'object' || events === null || Array.isArray(events)) {
      issues.push(issue('hooks-invalid', 'hook config must be an object', source.path))
      continue
    }
    for (const [event, groups] of Object.entries(events)) {
      if (!Array.isArray(groups)) continue
      let count = 0
      for (const group of groups) {
        if (typeof group !== 'object' || group === null) continue
        count += Array.isArray(group.hooks) ? group.hooks.length : (typeof group.command === 'string' ? 1 : 0)
      }
      if (count > 0) out.push({ event, count, path: source.path })
    }
  }
  return out
}

function hookSources(root, raw) {
  const out = []
  const add = (value) => {
    if (value === undefined) return
    if (typeof value === 'string') {
      const path = absolute(root, value)
      out.push({ value: readJsonFile(path), path })
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) add(entry)
      return
    }
    if (typeof value === 'object' && value !== null) {
      out.push({ value: { ok: true, value }, path: '<inline>' })
    }
  }
  add(raw)
  return out
}

function enumerateOutputStyles(root, manifest) {
  const paths = new Set()
  const dir = join(root, 'output-styles')
  if (isDirectory(dir)) for (const path of walkFiles(dir, (entry) => entry.endsWith('.md'))) paths.add(path)
  for (const value of pathList(manifest.outputStyles)) {
    const target = absolute(root, value)
    if (isFile(target)) paths.add(target)
    else if (isDirectory(target)) for (const path of walkFiles(target, (entry) => entry.endsWith('.md'))) paths.add(path)
  }
  return paths.size
}

function enumerateLspServers(root, manifest, issues) {
  let count = 0
  const defaultFile = join(root, '.lsp.json')
  if (isFile(defaultFile)) {
    const read = readJsonFile(defaultFile)
    if (read.ok && typeof read.value === 'object' && read.value !== null) {
      count += Object.keys(read.value.lspServers ?? read.value).length
    } else if (!read.ok && read.code !== 'missing') {
      issues.push(issue('lsp-invalid', read.message, defaultFile))
    }
  }
  const add = (value) => {
    if (typeof value === 'string') {
      const target = absolute(root, value)
      const read = readJsonFile(target)
      if (read.ok && typeof read.value === 'object' && read.value !== null) count += Object.keys(read.value).length
      else if (!read.ok) issues.push(issue('lsp-invalid', read.message, target))
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) add(entry)
      return
    }
    if (typeof value === 'object' && value !== null) count += Object.keys(value).length
  }
  add(manifest.lspServers)
  return count
}

function skillFiles(dir) {
  const direct = join(dir, 'SKILL.md')
  if (isFile(direct)) return [direct]
  const out = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name, 'SKILL.md')
    if (isFile(path)) out.push(path)
  }
  return out
}

function walkFiles(dir, filter) {
  const out = []
  const visit = (current, depth) => {
    if (out.length >= MAX_FILES || depth > MAX_DEPTH) return
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) visit(path, depth + 1)
      else if (entry.isFile() && filter(entry.name)) out.push(path)
      else if (entry.isSymbolicLink()) {
        try {
          const info = statSync(path)
          if (info.isDirectory()) visit(path, depth + 1)
          else if (info.isFile() && filter(entry.name)) out.push(path)
        } catch {
          // A dangling symlink is not a component.
        }
      }
    }
  }
  visit(dir, 0)
  return out.sort()
}

function pathList(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === 'string')
  return []
}

function absolute(root, value) {
  return isAbsolute(value) ? value : resolve(root, value)
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function issue(code, message, path) {
  return { code, message, ...(typeof path === 'string' ? { path } : {}) }
}