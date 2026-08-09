# agent-shader

[![npm version](https://img.shields.io/npm/v/agent-shader.svg)](https://www.npmjs.com/package/agent-shader)
[![license](https://img.shields.io/npm/l/agent-shader.svg)](./LICENSE)

Build Panzoid Shader Object JSON, validate Panzoid fragment shaders, and render-test them in a real WebGL 1 context.

This repository contains three independently installable pieces:

- `agent-shader`: an npm CLI for validation, JSON generation, rendering, and tests
- `agent-shader` MCP server: the same capabilities exposed as local MCP tools
- `panzoid-shader`: a portable Agent Skill for generating shaders that follow the Panzoid conventions

The core model is intentionally static. Generated Panzoid parameters use `animated: false` and one value at frame zero; animation and keyframe inputs are not accepted. A build writes JSON only after validation, Chromium WebGL 1 compilation and rendering, and a visible-default check pass.

## Requirements

- Node.js 22 or later
- npm
- Chromium installed through the included Playwright command for rendering and render tests

## Quick start

Install the CLI globally and download its Chromium runtime once:

```sh
npm install --global agent-shader
agent-shader install-browser
```

Then install the skill for the coding agents detected on your machine:

```sh
npx skills add rbstxt/agent-shader --skill panzoid-shader -g
```

Finally, configure the MCP server in your agent. The standard stdio configuration is:

```json
{
  "mcpServers": {
    "agent-shader": {
      "command": "npx",
      "args": ["-y", "agent-shader@latest", "mcp"]
    }
  }
}
```

## CLI

### Global installation

```sh
npm install --global agent-shader
agent-shader install-browser
```

### Run without a global installation

```sh
npx -y agent-shader@latest install-browser
npx -y agent-shader@latest validate shader.glsl
```

### Commands

```sh
agent-shader validate fixtures/circle.glsl
agent-shader build fixtures/circle.glsl --out circle.json
agent-shader render fixtures/circle.glsl --out circle.png
agent-shader test fixtures/circle.glsl --out-dir circle-test
```

Every nonstandard numeric uniform requires an explicit default chosen to demonstrate its behavior clearly. Use `--config config.json` for those defaults or for explicit ranges:

```json
{
  "name": "Shader",
  "parameters": {
    "Radius": {
      "default": 0.25
    }
  }
}
```

Standard parameters are inferred without configuration:

| Uniform | Type | Default | Bounds |
| --- | --- | --- | --- |
| `Color` | `vec3` | `[1, 1, 1]` | omitted |
| `StartColor` | `vec3` | `[1, 1, 1]` | omitted |
| `EndColor` | `vec3` | `[1, 1, 1]` | omitted |
| `Opacity` | `float` | `1` | `0..1` |
| `Position` | `vec2` | `[0, 0]` | omitted |
| `Rotation` | `float` | `0` | omitted |
| `Scale` | `vec2` | `[1, 1]` | omitted |

The test command renders the default image and verifies that it differs visibly from the unmodified input. The agent must also inspect the output PNG before handing off the JSON.

`min` and `max` are authoring decisions, not automated render tests. Do not add them merely to describe an intended, conventional, or useful range. Set a bound only when changing the value farther beyond that point produces no additional visual change; otherwise omit it. `Opacity` uses `0..1` because generated shaders clamp it and values outside that range therefore cannot change the result.

### Image uniforms

Each additional `uniform sampler2D Name;` becomes this Panzoid custom property, with `properties.name` exactly matching the GLSL uniform:

```json
{
  "type": {
    "custom": true,
    "type": 8,
    "assetType": 0,
    "accept": "image/*",
    "value": null
  },
  "properties": { "name": "Name" },
  "value": null
}
```

Provide images for rendering as a JSON map:

```json
{
  "Landscape": "/absolute/path/to/landscape.jpg"
}
```

```sh
agent-shader test fixtures/texture-blend.glsl \
  --config fixtures/texture-blend.config.json \
  --textures textures.json \
  --out-dir texture-test
```

### Rendering

Rendering launches Chromium through Playwright and requests a WebGL 1 context with antialiasing disabled. It uses the Panzoid `common.glsl` contract, a 16:9 canvas by default, `uvScale = [1, 1]`, and a deterministic Python-generated X-Y grid as `tDiffuse`. Extra image samplers use the bundled CC0 landscape unless overridden with `--textures` or MCP `texturePaths`. See `samples/ATTRIBUTION.md` for provenance.

```sh
agent-shader render shader.glsl \
  --out render.png \
  --width 1920 \
  --height 1080 \
  --uv-scale 1,1 \
  --values values.json \
  --input source.png
```

### Install from source

```sh
git clone https://github.com/rbstxt/agent-shader.git
cd agent-shader
npm ci
npm run install-browser
npm run build
npm link
```

After `npm link`, the `agent-shader` and `agent-shader-mcp` executables are available locally.

Before the npm release, point an MCP client directly at the built server:

```json
{
  "mcpServers": {
    "agent-shader": {
      "command": "node",
      "args": ["/absolute/path/to/agent-shader/dist/src/mcp.js"]
    }
  }
}
```

## Agent Skill

The skill is stored at `.agents/skills/panzoid-shader`. The [`skills` CLI](https://github.com/vercel-labs/skills) discovers that standard directory directly from GitHub.

GitHub is sufficient for skill distribution. The skill itself does not need to be published to npm: `npx` downloads the npm-published `skills` installer, and that installer fetches `panzoid-shader` from this GitHub repository.

### Automatic installation

Let the installer detect your coding agents and prompt for the destinations:

```sh
npx skills add rbstxt/agent-shader --skill panzoid-shader -g
```

Install globally for every supported agent without prompts:

```sh
npx skills add rbstxt/agent-shader --skill panzoid-shader --agent '*' -g -y
```

Omit `-g` to install into the current project instead of the user-level skill directory.

### Install for a specific agent

#### Codex

```sh
npx skills add rbstxt/agent-shader --skill panzoid-shader -a codex -g -y
```

#### Claude Code

```sh
npx skills add rbstxt/agent-shader --skill panzoid-shader -a claude-code -g -y
```

#### OpenCode

```sh
npx skills add rbstxt/agent-shader --skill panzoid-shader -a opencode -g -y
```

#### Command Code

```sh
npx skills add rbstxt/agent-shader --skill panzoid-shader -a command-code -g -y
```

#### Other agents

The installer supports Cursor, Cline, Gemini CLI, GitHub Copilot, Kiro CLI, Qoder, Windsurf, Warp, and many more. Run the interactive command, or replace the value after `-a` with an agent identifier from the [`skills` supported-agent table](https://github.com/vercel-labs/skills#supported-agents).

```sh
npx skills add rbstxt/agent-shader --skill panzoid-shader
```

## MCP server

The MCP server exposes:

- `build_shader_object`
- `validate_shader`
- `render_shader`
- `test_shader`

`build_shader_object` returns JSON only after its complete verification pass and includes the default preview PNG so the agent can inspect the exact generated defaults.

Rendering tools require the one-time browser installation:

```sh
npx -y agent-shader@latest install-browser
```

Skill installation and MCP installation are separate. Install both when you want the agent to have the Panzoid conventions as well as deterministic build and render tools.

### MCP client configuration

The client examples below follow the layout and conventions used by [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp). If a client accepts the standard MCP JSON, use:

```json
{
  "mcpServers": {
    "agent-shader": {
      "command": "npx",
      "args": ["-y", "agent-shader@latest", "mcp"]
    }
  }
}
```

<details open>
<summary>Codex</summary>

Add the server with the [Codex MCP CLI](https://developers.openai.com/codex/mcp/#configure-with-the-cli):

```sh
codex mcp add agent-shader -- npx -y agent-shader@latest mcp
```

Equivalent `~/.codex/config.toml` configuration:

```toml
[mcp_servers.agent-shader]
command = "npx"
args = ["-y", "agent-shader@latest", "mcp"]
```

</details>

<details open>
<summary>Claude Code</summary>

Add the server at user scope with the [Claude Code MCP CLI](https://code.claude.com/docs/en/mcp):

```sh
claude mcp add agent-shader --scope user npx -y agent-shader@latest mcp
```

</details>

<details open>
<summary>OpenCode</summary>

Add this to `~/.config/opencode/opencode.json` as described in the [OpenCode MCP guide](https://opencode.ai/docs/mcp-servers):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "agent-shader": {
      "type": "local",
      "command": ["npx", "-y", "agent-shader@latest", "mcp"]
    }
  }
}
```

</details>

<details open>
<summary>Command Code</summary>

Add the server at user scope with the [Command Code MCP CLI](https://commandcode.ai/docs/mcp):

```sh
cmd mcp add agent-shader --scope user npx -y agent-shader@latest mcp
```

</details>

<details>
<summary>Amp</summary>

```sh
amp mcp add agent-shader -- npx -y agent-shader@latest mcp
```

</details>

<details>
<summary>Antigravity</summary>

Open the custom MCP server settings described in the [Antigravity MCP documentation](https://antigravity.google/docs/mcp) and use the standard JSON configuration above.

</details>

<details>
<summary>Cline</summary>

Follow the [Cline MCP configuration guide](https://docs.cline.bot/mcp/configuring-mcp-servers) and use the standard JSON configuration above.

</details>

<details>
<summary>Copilot CLI</summary>

Start `copilot`, run `/mcp add`, select a local server, and enter:

- Server name: `agent-shader`
- Command: `npx -y agent-shader@latest mcp`

</details>

<details>
<summary>GitHub Copilot in VS Code</summary>

Use the Command Palette command `MCP: Add Server`, or run this on macOS and Linux:

```sh
code --add-mcp '{"name":"io.github.rbstxt/agent-shader","command":"npx","args":["-y","agent-shader@latest","mcp"],"env":{}}'
```

For Windows PowerShell:

```powershell
code --add-mcp '{"""name""":"""io.github.rbstxt/agent-shader""","""command""":"""npx""","""args""":["""-y""","""agent-shader@latest""","""mcp"""]}'
```

</details>

<details>
<summary>Cursor</summary>

Open `Cursor Settings` → `MCP` → `New MCP Server`, then use the standard JSON configuration above.

</details>

<details>
<summary>Devin CLI</summary>

```sh
devin mcp add agent-shader -- npx -y agent-shader@latest mcp
```

</details>

<details>
<summary>Factory CLI / Droid</summary>

```sh
droid mcp add agent-shader "npx -y agent-shader@latest mcp"
```

</details>

<details>
<summary>Gemini CLI</summary>

Project scope:

```sh
gemini mcp add agent-shader npx -y agent-shader@latest mcp
```

User scope:

```sh
gemini mcp add -s user agent-shader npx -y agent-shader@latest mcp
```

</details>

<details>
<summary>Gemini Code Assist</summary>

Follow the [Gemini Code Assist MCP guide](https://cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer#configure-mcp-servers) and use the standard JSON configuration above.

</details>

<details>
<summary>Grok Build CLI</summary>

```sh
grok mcp add agent-shader npx -y agent-shader@latest mcp
```

</details>

<details>
<summary>JetBrains AI Assistant and Junie</summary>

For AI Assistant, open `Settings | Tools | AI Assistant | Model Context Protocol (MCP)` and add the standard configuration. For Junie, use `Settings | Tools | Junie | MCP Settings`.

</details>

<details>
<summary>Kiro</summary>

Open `Kiro Settings` → `Configure MCP` → `Open Workspace or User MCP Config`, then use the standard JSON configuration above.

</details>

<details>
<summary>Katalon StudioAssist</summary>

Install an MCP proxy, then expose the stdio server over Streamable HTTP:

```sh
mcp-proxy --transport streamablehttp --port 8080 -- npx -y agent-shader@latest mcp
```

Configure StudioAssist with `http://127.0.0.1:8080/mcp` and the HTTP transport. Choose another port if 8080 is already in use.

</details>

<details>
<summary>Mistral Vibe</summary>

Add this to `~/.vibe/config.toml`:

```toml
[[mcp_servers]]
name = "agent-shader"
transport = "stdio"
command = "npx"
args = ["-y", "agent-shader@latest", "mcp"]
```

</details>

<details>
<summary>Qoder</summary>

Open `Qoder Settings` → `MCP Server` → `+ Add`, then use the standard JSON configuration above.

</details>

<details>
<summary>Qoder CLI</summary>

Project scope:

```sh
qodercli mcp add agent-shader -- npx -y agent-shader@latest mcp
```

User scope:

```sh
qodercli mcp add -s user agent-shader -- npx -y agent-shader@latest mcp
```

</details>

<details>
<summary>Visual Studio</summary>

Open the MCP server configuration UI and use the standard JSON configuration above with `npx` as the command.

</details>

<details>
<summary>Warp</summary>

Open `Settings | AI | Manage MCP Servers` → `+ Add`, then use the standard JSON configuration above.

</details>

<details>
<summary>Windsurf</summary>

Follow the [Windsurf MCP configuration guide](https://docs.windsurf.com/windsurf/cascade/mcp#mcp-config-json) and use the standard JSON configuration above.

</details>

For any other MCP client, select a local or stdio server and use `npx` as the executable with these arguments:

```text
-y
agent-shader@latest
mcp
```

### Verify the MCP installation

Ask the agent:

```text
Use agent-shader to validate and render-test fixtures/circle.glsl, then show the render and summarize any diagnostics.
```

The agent should call `validate_shader` or `test_shader`; render tools should return a PNG in addition to their JSON report.

## Development

```sh
npm ci
npm run install-browser
npm run check
npm test
```

## License

MIT
