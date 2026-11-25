import { allocateName, slug } from './paths.js'

/** DSH skill-name grammar; a provider candidate outside it would fail every catalog read. */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Whether a generated skill name can enter the DSH registry. */
export function isValidSkillName(name) {
  return typeof name === "string" && SKILL_NAME.test(name)
}

/** Deterministic, collision-free plugin prefixes for one snapshot. */
export function assignPluginPrefixes(plugins) {
  const used = new Set()
  const map = new Map()
  for (const plugin of [...plugins].sort((left, right) => left.id.localeCompare(right.id))) {
    const prefix = allocateName(slug(plugin.name), used)
    plugin.prefix = prefix
    map.set(plugin.id, prefix)
  }
  return map
}

/** Name every skill and command under its plugin prefix. */
export function assignComponentNames(plugins, prefixes) {
  for (const plugin of plugins) {
    const prefix = prefixes.get(plugin.id) ?? slug(plugin.name)
    const used = new Set()
    for (const skill of plugin.components.skills) {
      skill.dshName = allocateName(prefix + '-' + slug(skill.name), used)
    }
    for (const command of plugin.components.commands) {
      command.dshName = allocateName(prefix + '-' + slug(command.name), used)
    }
  }
}
