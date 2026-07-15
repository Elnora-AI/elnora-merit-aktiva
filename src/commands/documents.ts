// `documents` — keep every Merit transaction backed by its source document.
//
// Audits invoices for a missing attachment, searches configured sources for the
// file, stages or attaches what it finds, and reports what it cannot. Read-only
// until --apply. See docs/document-sync.md for the design and config.

import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { configPath } from "../config/config-dir.js";
import { auditPurchaseInvoices, auditSalesInvoices } from "../documents/audit.js";
import { loadDocsyncConfig } from "../documents/config.js";
import { deliverDigest, formatDigest } from "../documents/notify.js";
import { runDocSync } from "../documents/run.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { ValidationError } from "../utils/index.js";

const DEFAULT_LABEL = "com.merit-aktiva.docsync";
const DEFAULT_INTERVAL_HOURS = 6;

/** Parse a yyyy-mm-dd / yyyymmdd flag to a UTC Date, or a default. */
function parseDate(value: string | undefined, fallback: Date, flag: string): Date {
	if (!value) return fallback;
	const iso = /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
	const d = new Date(`${iso}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) throw new ValidationError(`Invalid ${flag}: "${value}". Use yyyy-mm-dd.`);
	return d;
}

function defaultRange(): { from: Date; to: Date } {
	const to = new Date();
	const from = new Date(Date.UTC(to.getUTCFullYear(), 0, 1)); // Jan 1 of the current year
	return { from, to };
}

export function setupDocumentsCommand(program: Command): void {
	const cmd = program
		.command("documents")
		.description(
			"Document-sync: find Merit transactions missing their source-document (receipt/invoice) attachment, locate the file in configured sources, stage or attach it, and report what's missing. See docs/document-sync.md.",
		);

	cmd
		.command("list-missing")
		.description(
			"List invoices with no attached source document (READ-ONLY). Purchases by default; add --sales to include sales invoices.",
		)
		.option("--from <date>", "Period start (yyyy-mm-dd); default Jan 1 of the current year")
		.option("--to <date>", "Period end (yyyy-mm-dd); default today")
		.option("--sales", "Also audit sales invoices", false)
		.action(
			handleAsyncCommand(async (opts: { from?: string; to?: string; sales?: boolean }) => {
				const def = defaultRange();
				const from = parseDate(opts.from, def.from, "--from");
				const to = parseDate(opts.to, def.to, "--to");
				const client = await getClient();
				const missing = await auditPurchaseInvoices(client, from, to);
				if (opts.sales) missing.push(...(await auditSalesInvoices(client, from, to)));
				outputSuccess({ count: missing.length, missing });
			}),
		);

	cmd
		.command("run")
		.description(
			"Audit → search sources → match → (with --apply) stage/attach → deliver the digest. READ-ONLY unless --apply.",
		)
		.option("--from <date>", "Period start (yyyy-mm-dd); default Jan 1 of the current year")
		.option("--to <date>", "Period end (yyyy-mm-dd); default today")
		.option("--sales", "Also audit sales invoices", false)
		.option("--apply", "Perform the resolving step (stage matched files, or --rebook to attach)", false)
		.option("--rebook", "Attach by delete+recreate instead of staging (advanced; changes the invoice id)", false)
		.option("--force", "Allow --rebook of paid invoices (drops the payment link — re-book it after)", false)
		.option(
			"--stage-dir <dir>",
			"Where to copy matched PDFs for a manual UI upload",
			join(homedir(), "merit-docsync-staging"),
		)
		.option("--config <path>", "docsync config file", undefined)
		.option("--quiet", "Do not deliver the digest to the configured webhook/command", false)
		.action(
			handleAsyncCommand(
				async (opts: {
					from?: string;
					to?: string;
					sales?: boolean;
					apply?: boolean;
					rebook?: boolean;
					force?: boolean;
					stageDir: string;
					config?: string;
					quiet?: boolean;
				}) => {
					const def = defaultRange();
					const from = parseDate(opts.from, def.from, "--from");
					const to = parseDate(opts.to, def.to, "--to");
					const config = loadDocsyncConfig(opts.config);
					const client = await getClient();
					const summary = await runDocSync(client, {
						from,
						to,
						config,
						includeSales: opts.sales,
						apply: opts.apply,
						rebook: opts.rebook,
						force: opts.force,
						stageDir: opts.stageDir,
					});
					const digest = formatDigest(summary);
					let delivered: string = "none";
					if (!opts.quiet) delivered = await deliverDigest(digest, config);
					outputSuccess({ ...summary, digest, delivered });
				},
			),
		);

	cmd
		.command("install-schedule")
		.description(
			"Install a background schedule that runs `documents run --apply` on an interval. macOS: a launchd agent (interval-based + at login, so it survives a closed laptop and follows the machine's timezone). Other OSes: prints a cron/Task-Scheduler snippet.",
		)
		.option(
			"--interval-hours <n>",
			`Hours between runs while the machine is awake (default ${DEFAULT_INTERVAL_HOURS})`,
			String(DEFAULT_INTERVAL_HOURS),
		)
		.option("--label <id>", "launchd label", DEFAULT_LABEL)
		.option("--rebook", "Schedule with --rebook (advanced)", false)
		.action(
			handleAsyncCommand(async (opts: { intervalHours: string; label: string; rebook?: boolean }) => {
				const hours = Number.parseInt(opts.intervalHours, 10);
				if (!Number.isFinite(hours) || hours < 1)
					throw new ValidationError("--interval-hours must be a positive integer.");
				const bin = process.argv[1] ?? "elnora-merit";
				const runArgs = ["documents", "run", "--apply", ...(opts.rebook ? ["--rebook"] : [])];
				if (platform() !== "darwin") {
					outputSuccess({
						platform: platform(),
						note: "launchd is macOS-only. Schedule this command yourself:",
						command: `${process.execPath} ${bin} ${runArgs.join(" ")}`,
						cron: `0 */${hours} * * *  ${process.execPath} ${bin} ${runArgs.join(" ")}`,
					});
					return;
				}
				const plistPath = join(homedir(), "Library", "LaunchAgents", `${opts.label}.plist`);
				const logDir = configPath("logs");
				mkdirSync(logDir, { recursive: true });
				const args = [process.execPath, bin, ...runArgs].map((a) => `\t\t<string>${a}</string>`).join("\n");
				const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key><string>${opts.label}</string>
\t<key>ProgramArguments</key>
\t<array>
${args}
\t</array>
\t<key>StartInterval</key><integer>${hours * 3600}</integer>
\t<key>RunAtLoad</key><true/>
\t<key>StandardOutPath</key><string>${join(logDir, "docsync.out.log")}</string>
\t<key>StandardErrorPath</key><string>${join(logDir, "docsync.err.log")}</string>
</dict>
</plist>
`;
				mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
				writeFileSync(plistPath, plist, { mode: 0o644 });
				chmodSync(plistPath, 0o644);
				outputSuccess({
					installed: plistPath,
					note: `Runs every ${hours}h while the Mac is awake and once at login (interval-based, so a closed-at-any-time laptop still catches up; follows the machine's local timezone). Load it with: launchctl load ${plistPath}`,
					logs: logDir,
				});
			}),
		);

	cmd
		.command("uninstall-schedule")
		.description("Remove the launchd schedule (macOS).")
		.option("--label <id>", "launchd label", DEFAULT_LABEL)
		.action(
			handleAsyncCommand(async (opts: { label: string }) => {
				const plistPath = join(homedir(), "Library", "LaunchAgents", `${opts.label}.plist`);
				if (existsSync(plistPath)) {
					unlinkSync(plistPath);
					outputSuccess({ removed: plistPath, note: `Unload it with: launchctl unload ${plistPath}` });
				} else {
					outputSuccess({ removed: null, note: `No schedule found at ${plistPath}` });
				}
			}),
		);
}
