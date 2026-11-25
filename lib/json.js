import { readFileSync } from 'node:fs'

/** Read one JSON file without throwing for the expected missing/invalid cases. */
export function readJsonFile(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    return { ok: false, code: isAbsent(error) ? 'missing' : 'unreadable', message: messageOf(error) }
  }
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch (error) {
    return { ok: false, code: 'invalid-json', message: messageOf(error) }
  }
}

/** Whether an error is a missing-path error rather than an access fault. */
export function isAbsent(error) {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

/** One-line diagnostic text for an unknown thrown value. */
export function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
