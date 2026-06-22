// Bundle the TS sources to a zero-runtime-dependency Node-18 ESM artifact in dist/.
// The unbundled .ts runs directly on Node >=22.6 (type stripping); this build is for the
// Node-18 path and for shipping a single auditable file per entry. Requires `npm install`.
import { cpSync } from "node:fs";
import { build } from "esbuild";

await build({
  entryPoints: [
    { in: "src/cli.ts", out: "cli" },
    { in: "hooks/stop-gate.ts", out: "hooks/stop-gate" },
    { in: "hooks/note-blind-edit.ts", out: "hooks/note-blind-edit" },
  ],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outExtension: { ".js": ".mjs" },
  // node: built-ins only — there are no third-party runtime deps to externalize.
});
// The pinned price snapshot is DATA, not code — esbuild doesn't bundle it. Copy it next to the
// built entries so cost.ts loadPrices() resolves it in the dist layout (../pricing, ./pricing).
cpSync("pricing", "dist/pricing", { recursive: true });
console.log("built dist/ (node18 ESM, zero runtime dependencies) + pricing snapshot");
