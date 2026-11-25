# Changelog

## 0.1.0

- Discover installed Claude Code plugins from installed_plugins.json, marketplace entries, the plugin cache fallback, and extra roots.
- Load plugin skills as namespaced DSH skills with manual invocation by default.
- Load plugin commands as namespaced DSH slash commands with $ARGUMENTS, positional arguments, and CLAUDE_PLUGIN_ROOT expansion.
- List subagents, hooks, output styles, LSP servers, and MCP servers without executing unsupported component types.
- Optional MCP loading for stdio and Streamable HTTP servers.
- Settings section with search, per-plugin toggles, component details, model discovery, MCP loading, rescan, and extra scan roots.
- JSON settings API with validation and atomic persistence.
