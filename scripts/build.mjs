#!/usr/bin/env node
// Build: bundle the CLI and the packages it uses into the single file that
// package.json "bin" points at. The published package and the Claude Code plugin
// then list no runtime dependencies, so there is nothing left to install.
//
// Run locally:   pnpm build   (cleans dist/ first)

import { build } from "esbuild";

await build({
	entryPoints: ["src/cli.ts"],
	outfile: "dist/cli.js",
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node20",
	// ESM output has no require(); define one so a bundled CommonJS package can still load Node built-ins.
	banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
	logLevel: "warning",
});
