// Package version, read from package.json at runtime. This module sits one level
// below the package root both as src/version.ts and once bundled into dist/cli.js,
// so "../package.json" resolves to the package root either way.

import { createRequire } from "node:module";

export const VERSION = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
