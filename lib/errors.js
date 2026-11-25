/** Typed errors that name the offending configuration field. */

/** Invalid plugin configuration supplied through the bundle row. */
export class ConfigError extends Error {
  /** @param {string} field @param {string} reason */
  constructor(field, reason) {
    super('[dsh-claude-plugins] invalid configuration: ' + field + ' ' + reason)
    this.name = 'ConfigError'
    this.field = field
  }
}

/** A settings document or patch that cannot be normalized. */
export class SettingsError extends Error {
  /** @param {string} field @param {string} reason */
  constructor(field, reason) {
    super('[dsh-claude-plugins] invalid settings: ' + field + ' ' + reason)
    this.name = 'SettingsError'
    this.field = field
  }
}
