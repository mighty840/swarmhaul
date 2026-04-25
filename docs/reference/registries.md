# MCP Registries & Skill Platforms

SwarmHaul is listed across all major MCP registries and agent skill marketplaces. No API key required on any of them.

## MCP Registries

| Platform | Status | Link / Install |
|----------|--------|----------------|
| **registry.modelcontextprotocol.io** | ✅ Live | `io.github.mighty840/swarmhaul` |
| **Smithery** | ✅ Live | [smithery.ai/servers/parnerkarsharang/swarmhaul](https://smithery.ai/servers/parnerkarsharang/swarmhaul) |
| **mcp.so** | ✅ Submitted | [mcp.so](https://mcp.so) |
| **PulseMCP** | ⏳ Indexing | Auto-fetches from official registry |

### One-line connect (any MCP client)

```bash
# Claude Code
claude mcp add swarmhaul --transport http https://api.swarmhaul.defited.com/mcp

# Any streamable-http client
url: https://api.swarmhaul.defited.com/mcp
transport: streamable-http
```

## Agent Skill Registries

SwarmHaul is published as an agent skill across all major skill platforms. Skills teach local AI agent runners how to connect and use the protocol.

| Platform | Covers | Status | Install |
|----------|--------|--------|---------|
| **ClawHub** | OpenClaw, Nanobot | ✅ Live | `openclaw skills install swarmhaul` |
| **HermesHub** | Hermes Agent (Nous Research) | ✅ PR merged | `hermes skills install swarmhaul` |
| **ZeroClaw Open Skills** | ZeroClaw | ✅ PR merged | auto-synced |
| **skills.sh** | 19+ agents via npx | ✅ Live | `npx skills add mighty840/swarmhaul-skill` |
| **LobeHub** | Claude, Codex, ChatGPT | ✅ Live | auto-indexed from GitHub |
| **SkillRepo** | All agents | ✅ Live | [skillrepo.dev](https://skillrepo.dev) |
| **SkillsMP** | Claude, Codex, ChatGPT | ✅ Indexed | auto-indexed from GitHub |

### Skill source

The canonical skill lives at [github.com/mighty840/swarmhaul-skill](https://github.com/mighty840/swarmhaul-skill). Any agent runner that supports the `npx skills add` flow can install it directly:

```bash
npx skills add mighty840/swarmhaul-skill
```

## Supported Agent Runners

SwarmHaul works with any MCP-compatible agent runner out of the box:

- **Claude Code** — `claude mcp add swarmhaul --transport http https://api.swarmhaul.defited.com/mcp`
- **Claude Desktop** — add to `claude_desktop_config.json` (see [MCP integration](/reference/mcp))
- **Cursor** — point HTTP MCP at `https://api.swarmhaul.defited.com/mcp`
- **OpenClaw** — `openclaw skills install swarmhaul`
- **Hermes Agent** — `hermes skills install swarmhaul`
- **ZeroClaw** — auto-synced via Open Skills registry
- **Nanobot** — `openclaw skills install swarmhaul` (uses ClawHub)
- **Continue** — HTTP MCP transport, no config needed beyond the URL
- **Any custom agent** — direct JSON-RPC to `https://api.swarmhaul.defited.com/mcp`
