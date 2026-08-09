import { chmod } from "node:fs/promises";

await Promise.all([
  chmod(new URL("../dist/src/cli.js", import.meta.url), 0o755),
  chmod(new URL("../dist/src/mcp.js", import.meta.url), 0o755),
]);
