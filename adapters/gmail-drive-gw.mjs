#!/usr/bin/env node
// Document-sync source adapter: Gmail + Google Drive, via the elnora-google-workspace `gw` CLI.
//
// Use it as a `command` source in docsync.json:
//   { "type": "command", "label": "gmail-drive", "command": "node /path/to/adapters/gmail-drive-gw.mjs" }
//
// It searches your Gmail for receipt/invoice attachments and (optionally) a Drive
// folder for receipt PDFs, downloads them to a temp dir, and prints one JSON
// candidate per line (the format `documents run` consumes). It holds NO
// credentials of its own — all auth belongs to the `gw` CLI you configure once
// (`gw auth`). Requires the public elnora-google-workspace plugin on PATH.
//
// Configure via env (all optional):
//   GW_BIN         path to the gw binary                     (default: "gw")
//   GW_ACCOUNT     gw account name                           (default: gw's own default)
//   DOCSYNC_GMAIL_QUERY   Gmail search query                 (default: receipts w/ PDF, last 120d)
//   DOCSYNC_GMAIL_LIMIT   max messages to scan               (default: 100)
//   DOCSYNC_DRIVE_FOLDER  Drive folder id to scan for PDFs   (default: none — Gmail only)
//   DOCSYNC_DRIVE_LIMIT   max Drive files                    (default: 100)
//   DOCSYNC_WORKDIR       where to materialise files         (default: a fresh temp dir)

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

const GW = process.env.GW_BIN || "gw";
const ACCOUNT = process.env.GW_ACCOUNT;
const GMAIL_QUERY =
	process.env.DOCSYNC_GMAIL_QUERY ||
	"has:attachment filename:pdf (receipt OR invoice OR arve OR kviitung OR quittung) newer_than:120d";
const GMAIL_LIMIT = process.env.DOCSYNC_GMAIL_LIMIT || "100";
const DRIVE_FOLDER = process.env.DOCSYNC_DRIVE_FOLDER;
const DRIVE_LIMIT = process.env.DOCSYNC_DRIVE_LIMIT || "100";
const WORKDIR = process.env.DOCSYNC_WORKDIR || mkdtempSync(join(tmpdir(), "docsync-"));

/** Run the gw CLI and parse its JSON stdout; [] on any failure (never throws). */
function gw(args) {
	const full = ACCOUNT ? [...args, "--account", ACCOUNT, "--compact"] : [...args, "--compact"];
	try {
		const out = execFileSync(GW, full, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
		return JSON.parse(out);
	} catch (err) {
		process.stderr.write(`gmail-drive-gw: \`${GW} ${args.join(" ")}\` failed: ${err.message}\n`);
		return null;
	}
}

/** Emit one candidate line. */
function emit(path, fileName, text) {
	process.stdout.write(`${JSON.stringify({ path, fileName, contentType: "application/pdf", text })}\n`);
}

/** PDFs in a directory (non-recursive). */
function pdfsIn(dir) {
	try {
		return readdirSync(dir).filter((n) => extname(n).toLowerCase() === ".pdf");
	} catch {
		return [];
	}
}

// --- Gmail -----------------------------------------------------------------
const gmail = gw(["gmail", "list", "-q", GMAIL_QUERY, "-l", String(GMAIL_LIMIT)]);
for (const msg of gmail?.messages ?? []) {
	if (!msg?.id) continue;
	const dest = join(WORKDIR, "gmail", msg.id);
	mkdirSync(dest, { recursive: true });
	gw(["gmail", "download-attachments", msg.id, "--dest", dest, "--ext", "pdf"]);
	const text = [msg.subject, msg.from, msg.snippet].filter(Boolean).join(" ");
	for (const name of pdfsIn(dest)) emit(join(dest, name), name, text);
}

// --- Drive (optional) ------------------------------------------------------
if (DRIVE_FOLDER) {
	const drive = gw(["drive", "list", "--type", "pdf", "--folder", DRIVE_FOLDER, "--limit", String(DRIVE_LIMIT)]);
	const dest = join(WORKDIR, "drive");
	mkdirSync(dest, { recursive: true });
	for (const file of drive?.files ?? []) {
		if (!file?.id) continue;
		gw(["drive", "download", file.id, "--dest", dest, "--force"]);
		// The downloaded name follows Drive's file name; match it back by name.
		const want = file.name && extname(file.name).toLowerCase() === ".pdf" ? file.name : null;
		for (const name of pdfsIn(dest)) {
			if (want && name !== want) continue;
			emit(join(dest, name), name, file.name ?? name);
		}
	}
}
