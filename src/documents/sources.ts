// Candidate-document sources.
//
// Two source types, both generic — no provider SDKs, no baked-in credentials:
//
//   { type: "dir",     path }      Scan a local directory for receipts (built-in).
//   { type: "command", command }   Run a shell command that prints candidates.
//
// The `command` adapter is how you wire Gmail, Google Drive, a scanner inbox, or
// anything else WITHOUT this package depending on those services: your command
// does the provider-specific fetch (using your own credentials, outside this
// repo) and prints newline-delimited JSON — one object per candidate:
//   {"path":"/abs/file.pdf","fileName":"receipt.pdf","text":"Acme Taxi 42.50 2026-03-15","amounts":[42.50],"dates":["2026-03-15"]}
// It must materialise each file locally and print its absolute `path`.

import { execFile } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import type { Candidate, SourceConfig } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * File types a `dir` source treats as a candidate document. Receipts arrive as
 * PDFs and, just as often, as phone photos — scan both so a snapshot of a paper
 * receipt is not silently skipped. The filename still drives matching (amount /
 * date / party), so a descriptive name like `2026-07-09-khanittha-49.70-eur.jpg`
 * resolves the same way a PDF would.
 */
const DOC_CONTENT_TYPES: Record<string, string> = {
	".pdf": "application/pdf",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".heic": "image/heic",
	".heif": "image/heif",
	".webp": "image/webp",
	".gif": "image/gif",
	".tif": "image/tiff",
	".tiff": "image/tiff",
};

/** Expand a leading ~ to the home directory. */
function expandHome(p: string): string {
	return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

function scanDir(dir: string, recursive: boolean, out: Candidate[], depth = 0): void {
	if (depth > 6) return; // guard against symlink loops / pathological trees
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return; // unreadable dir → skip, never throw (one bad source must not kill the run)
	}
	for (const name of entries) {
		if (name.startsWith(".")) continue;
		const full = join(dir, name);
		let st: ReturnType<typeof statSync>;
		try {
			st = statSync(full);
		} catch {
			continue;
		}
		if (st.isDirectory()) {
			if (recursive) scanDir(full, recursive, out, depth + 1);
			continue;
		}
		const ext = extname(name).toLowerCase();
		const contentType = DOC_CONTENT_TYPES[ext];
		if (contentType) {
			out.push({
				path: full,
				fileName: name,
				contentType,
				source: `dir:${dir}`,
				hints: { text: basename(name, ext) },
			});
		}
	}
}

/** Collect candidates from one `dir` source. */
export function collectDir(path: string, recursive = false): Candidate[] {
	const out: Candidate[] = [];
	scanDir(expandHome(path), recursive, out, 0);
	return out;
}

/** Run one `command` source and parse its NDJSON candidate lines. */
export async function collectCommand(command: string, label?: string): Promise<Candidate[]> {
	const src = `command:${label ?? command.split(/\s+/)[0]}`;
	let stdout: string;
	try {
		const res = await execFileAsync("/bin/sh", ["-c", command], { maxBuffer: 64 * 1024 * 1024 });
		stdout = res.stdout;
	} catch (err) {
		// A failing source is reported, not fatal — the rest of the run continues.
		process.stderr.write(`docsync: source ${src} failed: ${(err as Error).message}\n`);
		return [];
	}
	const out: Candidate[] = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let obj: Record<string, unknown>;
		try {
			obj = JSON.parse(trimmed) as Record<string, unknown>;
		} catch {
			continue; // ignore non-JSON chatter the command may print
		}
		if (typeof obj.path !== "string") continue;
		out.push({
			path: obj.path,
			fileName: typeof obj.fileName === "string" ? obj.fileName : basename(obj.path),
			contentType: typeof obj.contentType === "string" ? obj.contentType : "application/pdf",
			source: src,
			hints: {
				amounts: Array.isArray(obj.amounts) ? (obj.amounts as number[]).filter((n) => Number.isFinite(n)) : undefined,
				dates: Array.isArray(obj.dates)
					? (obj.dates as string[]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
					: undefined,
				text: typeof obj.text === "string" ? obj.text : undefined,
			},
		});
	}
	return out;
}

/** Collect candidates from every configured source, de-duplicated by path. */
export async function collectCandidates(sources: SourceConfig[]): Promise<Candidate[]> {
	const byPath = new Map<string, Candidate>();
	for (const source of sources) {
		const found =
			source.type === "dir"
				? collectDir(source.path, source.recursive ?? false)
				: await collectCommand(source.command, source.label);
		for (const c of found) if (!byPath.has(c.path)) byPath.set(c.path, c);
	}
	return [...byPath.values()];
}
