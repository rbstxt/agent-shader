# agent-shader

[English](README.md) | [日本語](README.ja.md)

[![npm version](https://img.shields.io/npm/v/agent-shader.svg)](https://www.npmjs.com/package/agent-shader)
[![license](https://img.shields.io/npm/l/agent-shader.svg)](./LICENSE)

Panzoid Shader Object JSONの生成、Panzoid向けフラグメントシェーダーの検証、実際のWebGL 1環境でのレンダリングテストを行うツールです。

このリポジトリには、個別に導入できる3つの要素が含まれます。

- `agent-shader`: 検証、JSON生成、レンダリング、テストを行うnpm CLI
- `agent-shader` MCPサーバー: 同じ機能をローカルMCPツールとして提供
- `panzoid-shader`: Panzoid規約に沿ったシェーダーを生成するポータブルなAgent Skill

生成するPanzoidパラメーターは静的で、`animated: false`とフレーム0の単一値を使用します。アニメーションやキーフレームの入力は扱いません。buildは、静的検証、Chromium WebGL 1でのコンパイルとレンダリング、4種類の背景に対するpremultiplied-alpha検査、RGB-only診断がすべて成功した場合にのみJSONを書き出します。デフォルト表示が入力と同一でも警告になるだけで、妥当なbuildを妨げません。

## 必要環境

- Node.js 22以降
- npm
- 同梱のPlaywrightコマンドでインストールしたChromium

## クイックスタート

CLIをグローバルインストールし、Chromiumランタイムを一度だけダウンロードします。

```sh
npm install --global agent-shader
agent-shader install-browser
```

マシン上で検出されたコーディングエージェントへSKILLを追加します。

```sh
npx skills add rbstxt/agent-shader --skill panzoid-shader -g
```

最後に、エージェントへMCPサーバーを設定します。標準的なstdio設定は次のとおりです。

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

### グローバルインストール

```sh
npm install --global agent-shader
agent-shader install-browser
```

### グローバルインストールせずに実行

```sh
npx -y agent-shader@latest install-browser
npx -y agent-shader@latest validate shader.glsl
```

### コマンド

```sh
agent-shader validate fixtures/circle.glsl
agent-shader build fixtures/circle.glsl --out circle.json
agent-shader render fixtures/circle.glsl --out circle.png
agent-shader test fixtures/circle.glsl --out-dir circle-test
```

標準外の数値uniformには、意図して選んだ明示的なデフォルト値が必要です。通常は挙動が分かりやすい値を選びますが、変化しない値が意図的で妥当なら使用できます。デフォルト値や明示的な範囲は`--config config.json`で指定します。

```json
{
  "name": "Soft Circle",
  "parameters": {
    "Radius": {
      "default": 0.25
    }
  }
}
```

標準パラメーターはすべて任意で、対応するuniformを宣言した場合だけ設定なしで推論されます。シェーダーに意味のある操作を提供しないパラメーターは省略し、必要な一部だけ、または一つも使用しない構成にできます。

| Uniform | 型 | デフォルト | 範囲 |
| --- | --- | --- | --- |
| `Color` | `vec3` | `[1, 1, 1]` | 省略 |
| `StartColor` | `vec3` | `[1, 1, 1]` | 省略 |
| `EndColor` | `vec3` | `[1, 1, 1]` | 省略 |
| `Opacity` | `float` | `1` | `0..1` |
| `Position` | `vec2` | `[0, 0]` | 省略 |
| `Rotation` | `float` | `0` | 省略 |
| `Scale` | `vec2` | `[1, 1]` | 省略 |

必須のシェーダー入力は`tDiffuse`と`vUvScaled`だけです。`Color`、`StartColor`、`EndColor`、`Opacity`、`Position`、`Rotation`、`Scale`はそれぞれ独立して省略できます。生成される`customProperties`には、シェーダーが実際に宣言したuniformだけが含まれます。

testは、デフォルトのX-Yグリッド、不透明黒、完全透明黒、半透明色でレンダリングします。各入力について、通常PNGとAlphaを無視してRGBを表示する診断PNGを生成します。premultiplied-alphaの数値条件と、デフォルト表示が入力から目に見えて変化しているかも検査します。変化がない場合は`default-no-visible-change`警告を出しますが、テスト自体は成功できます。エージェントが、その無変化のデフォルトが意図的で妥当かを判断します。`Progress`が宣言されている場合は、`0.00`、`0.10`、`0.35`、`0.65`、`0.90`、`1.00`もレンダリングします。JSONを渡す前に、エージェントが該当するすべての通常画像とRGB-only画像を目視確認します。

`min`と`max`は自動レンダリングテストではなく、作成時の判断で設定します。想定範囲、慣習、安全性、便利さだけを理由に追加しません。通常は、その値をさらに変えても表示が一切変わらなくなる境界だけを設定し、それ以外は省略します。`Opacity`はシェーダー内でclampされ、範囲外で結果が変わらないため`0..1`を設定します。

例外として、大きさだけを表すパラメーターで、負の値が同じ大きさの挙動を反転または鏡映するだけで意味の異なる操作にならない場合は、`min`を`0`にします。標準の`Position`、`Rotation`、`Scale`、色には範囲を設定しません。

Shader Objectには短く効果内容が分かる名前を付けます。configの`name`を省略すると、CLIとMCPがシェーダーファイル名から推論します。たとえば`glowing-ring.glsl`は`Glowing Ring`になります。明示的なconfig名が常に優先され、汎用的すぎるファイル名は`Shader`ではなく`Effect`へフォールバックします。

### 画像uniform

追加の`uniform sampler2D Name;`は、GLSLのuniform名と`properties.name`が完全に一致するPanzoidカスタムプロパティになります。

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

レンダリングに使用する画像はJSONマップで指定します。

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

### レンダリング

レンダリングはPlaywrightでChromiumを起動し、アンチエイリアスを無効にしたWebGL 1コンテキストを使用します。Panzoidの`common.glsl`契約、デフォルト16:9、`uvScale = [1, 1]`を使用し、`tDiffuse`にはPythonで決定的に生成したX-Yグリッドを使用します。追加の画像samplerには、`--textures`またはMCPの`texturePaths`で上書きしない限り、同梱のCC0風景画像を使用します。出典は`samples/ATTRIBUTION.md`を参照してください。

出力はpremultiplied-alphaのsource-overです。合成後のAlphaでRGBを除算しません。

```glsl
float sourceAlpha = mask * clamp(Opacity, 0.0, 1.0);
vec4 texel = texture2D(tDiffuse, vUvScaled);
float backgroundAlpha = clamp(texel.a, 0.0, 1.0);
float remainingBackground = backgroundAlpha * (1.0 - sourceAlpha);
float outputAlpha = sourceAlpha + remainingBackground;
vec3 outputColor = sourceColor * sourceAlpha + texel.rgb * remainingBackground;
gl_FragColor = vec4(outputColor, outputAlpha);
```

この例の`Opacity`と`sourceColor`操作は任意です。不要ならsource alphaや色をシェーダー内部で決定し、対応するuniformを省略してください。例に合わせるためだけに操作項目を追加しません。

入力が`vec4(0.0)`なら、結果は`vec4(sourceColor * sourceAlpha, sourceAlpha)`になります。validatorは`outputAlpha`による除算と、直接の`vec4(sourceColor, sourceAlpha)`出力を拒否します。テストでは、Alphaが0の場所にhidden RGBがないこと、Alphaと同時にRGBも減衰すること、`Opacity = 0`で入力と完全一致すること、色が`0..1`なら原則として`R <= A`、`G <= A`、`B <= A`になることを確認します。

### GLSL ES 1.00互換性

Panzoid Shader ObjectはWebGL 1 / GLSL ES 1.00として動作します。validatorは`#define`、関数形式マクロ、`#if`、`#ifdef`、`#ifndef`、`#elif`、`#else`、`#endif`を許可します。条件コンパイルでは`GL_ES`、`GL_FRAGMENT_PRECISION_HIGH`、`__VERSION__ == 100`を使用できます。

使用できる任意拡張は次の1つだけです。

```glsl
#extension GL_OES_standard_derivatives : require
precision highp float;
precision highp int;
```

`dFdx`、`dFdy`、`fwidth`を使用する場合は、両方のprecision宣言より前に拡張宣言を置きます。validatorは、その他の`#extension`、`#version`、`#include`、glslify pragma、`discard`、`texture2DLodEXT`、`texture2DGradEXT`、`gl_FragDepthEXT`、`gl_FragData`を拒否します。

ユーザーが明示的に求めない限りAAは追加しません。これは静的validatorではなくエージェントの作成規約です。微分関数は模様、法線推定、変化量の取得、解析的エフェクトに使用できます。

コメントとresolution系の識別子はエラーではなく警告です。通常は省略しますが、ユーザーが明示的に求めた場合や効果に本当に必要な場合は使用できます。validatorは特定の`clamp(Opacity, 0.0, 1.0)`記法を必須にしません。Opacityの扱いはシェーダー作成とレンダリング検証で判断します。

```sh
agent-shader render shader.glsl \
  --out render.png \
  --width 1920 \
  --height 1080 \
  --uv-scale 1,1 \
  --values values.json \
  --input source.png
```

### ソースからインストール

```sh
git clone https://github.com/rbstxt/agent-shader.git
cd agent-shader
npm ci
npm run install-browser
npm run build
npm link
```

`npm link`後は、`agent-shader`と`agent-shader-mcp`をローカルで実行できます。npm公開前のコードをMCPクライアントから使う場合は、ビルド済みサーバーを直接指定します。

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

SKILLは`.agents/skills/panzoid-shader`にあります。[`skills` CLI](https://github.com/vercel-labs/skills)はGitHub上のこの標準ディレクトリを直接検出します。

SKILLの配布にはGitHubだけで十分で、SKILL自体をnpmへ公開する必要はありません。`npx`がnpm公開済みの`skills`インストーラーを実行し、そのインストーラーがGitHubから`panzoid-shader`を取得します。

### 自動インストール

検出されたコーディングエージェントから導入先を選択します。

```sh
npx skills add rbstxt/agent-shader --skill panzoid-shader -g
```

対応するすべてのエージェントへ、確認なしでユーザースコープにインストールします。

```sh
npx skills add rbstxt/agent-shader --skill panzoid-shader --agent '*' -g -y
```

`-g`を省略すると、ユーザースコープではなく現在のプロジェクトへインストールします。

### エージェントを指定してインストール

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

#### その他のエージェント

Cursor、Cline、Gemini CLI、GitHub Copilot、Kiro CLI、Qoder、Windsurf、Warpなどにも対応しています。対話形式のコマンドを使うか、[`skills`の対応エージェント一覧](https://github.com/vercel-labs/skills#supported-agents)にある識別子を`-a`の後へ指定します。

```sh
npx skills add rbstxt/agent-shader --skill panzoid-shader
```

## MCPサーバー

MCPサーバーは次のツールを公開します。

- `build_shader_object`
- `validate_shader`
- `render_shader`
- `test_shader`

`build_shader_object`は自動検証が完了した場合にのみJSONを返し、4種類の入力と該当するすべての`Progress`時点について、通常画像とRGB-only画像を返します。

レンダリングツールを使用する前に、ブラウザーを一度だけインストールします。

```sh
npx -y agent-shader@latest install-browser
```

SKILLとMCPは別々にインストールします。Panzoid規約と、決定的なbuild・レンダリングツールの両方をエージェントへ持たせる場合は、両方を導入してください。

### MCPクライアント設定

以下は[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)の構成に合わせています。標準MCP JSONを受け付けるクライアントでは、次の設定を使用します。

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

[Codex MCP CLI](https://developers.openai.com/codex/mcp/#configure-with-the-cli)で追加します。

```sh
codex mcp add agent-shader -- npx -y agent-shader@latest mcp
```

同等の`~/.codex/config.toml`設定です。

```toml
[mcp_servers.agent-shader]
command = "npx"
args = ["-y", "agent-shader@latest", "mcp"]
```

</details>

<details open>
<summary>Claude Code</summary>

[Claude Code MCP CLI](https://code.claude.com/docs/en/mcp)でユーザースコープへ追加します。

```sh
claude mcp add agent-shader --scope user npx -y agent-shader@latest mcp
```

</details>

<details open>
<summary>OpenCode</summary>

[OpenCode MCPガイド](https://opencode.ai/docs/mcp-servers)に従い、`~/.config/opencode/opencode.json`へ追加します。

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

[Command Code MCP CLI](https://commandcode.ai/docs/mcp)でユーザースコープへ追加します。

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

[Antigravity MCPドキュメント](https://antigravity.google/docs/mcp)にあるカスタムMCPサーバー設定を開き、上記の標準JSON設定を使用します。

</details>

<details>
<summary>Cline</summary>

[Cline MCP設定ガイド](https://docs.cline.bot/mcp/configuring-mcp-servers)に従い、上記の標準JSON設定を使用します。

</details>

<details>
<summary>Copilot CLI</summary>

`copilot`を起動して`/mcp add`を実行し、ローカルサーバーを選択して次を入力します。

- Server name: `agent-shader`
- Command: `npx -y agent-shader@latest mcp`

</details>

<details>
<summary>GitHub Copilot in VS Code</summary>

コマンドパレットから`MCP: Add Server`を実行するか、macOSとLinuxでは次を実行します。

```sh
code --add-mcp '{"name":"io.github.rbstxt/agent-shader","command":"npx","args":["-y","agent-shader@latest","mcp"],"env":{}}'
```

Windows PowerShellでは次を実行します。

```powershell
code --add-mcp '{"""name""":"""io.github.rbstxt/agent-shader""","""command""":"""npx""","""args""":["""-y""","""agent-shader@latest""","""mcp"""]}'
```

</details>

<details>
<summary>Cursor</summary>

`Cursor Settings` → `MCP` → `New MCP Server`を開き、上記の標準JSON設定を使用します。

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

プロジェクトスコープ:

```sh
gemini mcp add agent-shader npx -y agent-shader@latest mcp
```

ユーザースコープ:

```sh
gemini mcp add -s user agent-shader npx -y agent-shader@latest mcp
```

</details>

<details>
<summary>Gemini Code Assist</summary>

[Gemini Code Assist MCPガイド](https://cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer#configure-mcp-servers)に従い、上記の標準JSON設定を使用します。

</details>

<details>
<summary>Grok Build CLI</summary>

```sh
grok mcp add agent-shader npx -y agent-shader@latest mcp
```

</details>

<details>
<summary>JetBrains AI Assistant / Junie</summary>

AI Assistantでは`Settings | Tools | AI Assistant | Model Context Protocol (MCP)`を開き、標準設定を追加します。Junieでは`Settings | Tools | Junie | MCP Settings`を使用します。

</details>

<details>
<summary>Kiro</summary>

`Kiro Settings` → `Configure MCP` → `Open Workspace or User MCP Config`を開き、上記の標準JSON設定を使用します。

</details>

<details>
<summary>Katalon StudioAssist</summary>

MCP proxyを導入し、stdioサーバーをStreamable HTTPとして公開します。

```sh
mcp-proxy --transport streamablehttp --port 8080 -- npx -y agent-shader@latest mcp
```

StudioAssistへ`http://127.0.0.1:8080/mcp`とHTTP transportを設定します。8080が使用中なら別のポートを選択してください。

</details>

<details>
<summary>Mistral Vibe</summary>

`~/.vibe/config.toml`へ追加します。

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

`Qoder Settings` → `MCP Server` → `+ Add`を開き、上記の標準JSON設定を使用します。

</details>

<details>
<summary>Qoder CLI</summary>

プロジェクトスコープ:

```sh
qodercli mcp add agent-shader -- npx -y agent-shader@latest mcp
```

ユーザースコープ:

```sh
qodercli mcp add -s user agent-shader -- npx -y agent-shader@latest mcp
```

</details>

<details>
<summary>Visual Studio</summary>

MCPサーバー設定画面を開き、実行コマンドを`npx`として上記の標準設定を追加します。

</details>

<details>
<summary>Warp</summary>

`Settings | AI | Manage MCP Servers` → `+ Add`を開き、上記の標準JSON設定を使用します。

</details>

<details>
<summary>Windsurf</summary>

[Windsurf MCP設定ガイド](https://docs.windsurf.com/windsurf/cascade/mcp#mcp-config-json)に従い、上記の標準JSON設定を使用します。

</details>

その他のMCPクライアントでは、localまたはstdioサーバーを選択し、実行ファイルを`npx`、引数を次のように設定します。

```text
-y
agent-shader@latest
mcp
```

### MCP導入の確認

エージェントへ次のように依頼します。

```text
agent-shaderを使ってfixtures/circle.glslを検証・レンダリングテストし、画像を表示して診断結果を要約してください。
```

エージェントは`test_shader`を呼び出し、JSONレポートに加えて、すべての通常PNGとRGB-only PNGを返します。

## 開発

```sh
npm ci
npm run install-browser
npm run check
npm test
```

## ライセンス

MIT
