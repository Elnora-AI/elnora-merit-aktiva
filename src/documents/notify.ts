// Report the run: format a digest and deliver it.
//
// Delivery is generic — no Slack SDK. A webhook URL receives a Slack-compatible
// `{ "text": "…" }` JSON POST (Slack, Mattermost, and Discord-with-/slack all
// accept this), or a `notifyCommand` receives the text on stdin. If neither is
// configured, the digest is returned to the caller to print. The webhook URL is a
// secret and comes from config/env, never from source.

import { execFile } from "node:child_process";
import type { DocsyncConfig, MatchResult } from "./types.js";

export interface RunSummary {
	period: { from: string; to: string };
	missingCount: number;
	attached: Array<{ billNo: string | null; party: string | null; via: "staged" | "rebooked"; file: string }>;
	review: MatchResult[];
	unresolved: MatchResult[];
}

/** Build a plain-text digest of the run. */
export function formatDigest(summary: RunSummary): string {
	const lines: string[] = [];
	lines.push(`*Merit document sync* — ${summary.period.from} → ${summary.period.to}`);
	lines.push(
		`${summary.missingCount} missing • ${summary.attached.length} resolved • ${summary.review.length} to review • ${summary.unresolved.length} not found`,
	);
	if (summary.attached.length) {
		lines.push("", "Resolved:");
		for (const a of summary.attached) lines.push(`  • ${a.party ?? "?"} — ${a.billNo ?? "?"} (${a.via})`);
	}
	if (summary.review.length) {
		lines.push("", "Needs review (a likely file was found, confirm before attaching):");
		for (const r of summary.review) {
			const b = r.best ?? r.alternatives[0];
			lines.push(
				`  • ${r.missing.partyName ?? "?"} — ${r.missing.billNo ?? "?"} ${r.missing.grossTotal.toFixed(2)} → ${b?.candidate.fileName ?? "?"}`,
			);
		}
	}
	if (summary.unresolved.length) {
		lines.push("", "Missing a document, nothing found — please locate and upload:");
		for (const u of summary.unresolved) {
			lines.push(
				`  • ${u.missing.partyName ?? "?"} — ${u.missing.billNo ?? "?"} ${u.missing.grossTotal.toFixed(2)} ${u.missing.currency} (${u.missing.docDate ?? "?"})`,
			);
		}
	}
	return lines.join("\n");
}

/** Deliver the digest via webhook or notifyCommand. Returns how it was delivered. */
export async function deliverDigest(text: string, config: DocsyncConfig): Promise<"webhook" | "command" | "none"> {
	if (config.webhookUrl) {
		const res = await fetch(config.webhookUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text }),
		});
		if (!res.ok) {
			throw new Error(`docsync webhook POST failed: ${res.status} ${res.statusText}`);
		}
		return "webhook";
	}
	if (config.notifyCommand) {
		await new Promise<void>((resolve, reject) => {
			const child = execFile("/bin/sh", ["-c", config.notifyCommand as string], (err) =>
				err ? reject(err) : resolve(),
			);
			child.stdin?.end(text);
		});
		return "command";
	}
	return "none";
}
