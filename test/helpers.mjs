import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

/** Create an isolated fixture directory removed when the test finishes. */
export function fixture(t, prefix = 'dsh-claude-plugins-') {
  const root = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

/** Write one UTF-8 file below a fixture root. */
export function write(root, relative, content) {
  const path = join(root, relative)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  return path
}

/** Write one JSON file below a fixture root. */
export function writeJson(root, relative, value) {
  return write(root, relative, JSON.stringify(value, null, 2) + '\n')
}

/** Build a minimal installed Claude plugin tree. */
export function makePlugin(root, options) {
  const { name, version = '1.0.0', description = name + ' plugin', manifest = true } = options
  if (manifest) {
    writeJson(root, '.claude-plugin/plugin.json', {
      name,
      version,
      description,
      author: { name: 'Fixture' },
    })
  }
  return root
}
