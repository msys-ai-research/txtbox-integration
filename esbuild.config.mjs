import { build } from "esbuild";

await build({
  entryPoints: ["src/http/index.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // express + the MCP SDK do dynamic requires that don't survive bundling.
  // Keep them as runtime deps and let `node_modules` resolve them.
  external: ["express", "@modelcontextprotocol/sdk"],
  minify: false,
  sourcemap: "linked",
  logLevel: "info",
  banner: {
    // ESM bundles can't `require` directly, but our externals (express) use
    // CommonJS. Inject a minimal shim so esbuild's emitted code can interop.
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
});
