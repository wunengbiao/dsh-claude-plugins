import { getSharedRuntime } from './shared.js'

/** Cordis plugin name for the optional MCP registration row. */
export const name = 'claude-plugins-mcp'
/** The MCP manager must exist before plugin-owned servers can be registered. */
export const inject = ['mcpManager']

/** Register plugin-owned MCP servers after the manager becomes available. */
export function apply(ctx) {
  const runtime = getSharedRuntime()
  if (runtime === undefined) {
    throw new Error('[dsh-claude-plugins] the MCP row requires the core claude-plugins row')
  }
  runtime.reloadMcp()
  ctx.logger?.info('[dsh-claude-plugins] MCP registration row is active')
}
