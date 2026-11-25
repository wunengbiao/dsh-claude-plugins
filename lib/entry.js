import { normalizeConfig } from './config.js'
import { createRuntime } from './runtime.js'
import { clearSharedRuntime, setSharedRuntime } from './shared.js'

/** Cordis plugin name. */
export const name = 'claude-plugins'

/** Host half: discovery, skill/command/MCP loading. The UI row exposes Settings. */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const runtime = createRuntime({ ctx, config })
  try {
    runtime.start()
  } catch (error) {
    runtime.dispose()
    throw error
  }
  setSharedRuntime(runtime)
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => {
      clearSharedRuntime(runtime)
      runtime.dispose()
    }, 'dsh-claude-plugins: lifecycle')
  }
  ctx.logger?.info('[dsh-claude-plugins] discovered Claude plugins from ' + config.claudeConfigDir)
  return { runtime }
}
