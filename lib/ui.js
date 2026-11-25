import { getSharedRuntime } from './shared.js'
import { registerRoutes } from './routes.js'

/** Cordis plugin name for the settings API row. */
export const name = 'claude-plugins-ui'
/** The web server must exist before the routes can be registered. */
export const inject = ['webServer']

/** Settings API row: uses the runtime the core row already published. */
export function apply(ctx) {
  const runtime = getSharedRuntime()
  if (runtime === undefined) {
    throw new Error('[dsh-claude-plugins] the UI row requires the core claude-plugins row')
  }
  registerRoutes(ctx, runtime)
  ctx.logger?.info('[dsh-claude-plugins] settings API registered at /dsh-claude-plugins')
}
