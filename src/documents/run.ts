// Orchestrate a document-sync run: audit → collect → match → resolve → report.
//
// Read-only by default (--apply performs the resolving step). "Resolve" means:
// stage the matched PDF for a UI upload, or — with rebook — delete+recreate the
// invoice with the file. Everything the run touched is returned as a RunSummary
// for the digest.

import type { MeritClient } from "../client/merit-client.js";
import { readPdfBase64, rebookPurchaseInvoiceWithAttachment, stageForUpload } from "./attach.js";
import { auditPurchaseInvoices, auditSalesInvoices } from "./audit.js";
import { matchAll } from "./match.js";
import type { RunSummary } from "./notify.js";
import { collectCandidates } from "./sources.js";
import type { DocsyncConfig, MissingDoc } from "./types.js";

export interface RunOptions {
	from: Date;
	to: Date;
	config: DocsyncConfig;
	/** Include sales invoices in the audit (default: purchases only). */
	includeSales?: boolean;
	/** Perform the resolving step (stage or rebook). Default false = report only. */
	apply?: boolean;
	/** Delete+recreate matched invoices with the file instead of staging. */
	rebook?: boolean;
	/** Allow rebook of paid invoices (drops payment link — caller re-books). */
	force?: boolean;
	/** Staging folder for matched PDFs (used when not rebooking). */
	stageDir: string;
}

export async function runDocSync(client: MeritClient, opts: RunOptions): Promise<RunSummary> {
	const missing: MissingDoc[] = await auditPurchaseInvoices(client, opts.from, opts.to);
	if (opts.includeSales) missing.push(...(await auditSalesInvoices(client, opts.from, opts.to)));

	const candidates = await collectCandidates(opts.config.sources);
	const matches = matchAll(missing, candidates, opts.config);

	const summary: RunSummary = {
		period: { from: opts.from.toISOString().slice(0, 10), to: opts.to.toISOString().slice(0, 10) },
		missingCount: missing.length,
		attached: [],
		review: [],
		unresolved: [],
	};

	for (const match of matches) {
		if (!match.best) {
			if (match.alternatives.length > 0) summary.review.push(match);
			else summary.unresolved.push(match);
			continue;
		}
		if (!opts.apply) {
			// Dry run: a confident match still counts as "to review" so the operator
			// sees what WOULD be resolved before committing.
			summary.review.push(match);
			continue;
		}
		if (opts.rebook && match.missing.kind === "purchase-invoice") {
			const pdf = readPdfBase64(match.best.candidate.path);
			const { newId } = await rebookPurchaseInvoiceWithAttachment(client, match.missing, pdf, { force: opts.force });
			summary.attached.push({
				billNo: match.missing.billNo,
				party: match.missing.partyName,
				via: "rebooked",
				file: newId,
			});
		} else {
			const staged = stageForUpload(match.missing, match.best.candidate.path, opts.stageDir);
			summary.attached.push({
				billNo: match.missing.billNo,
				party: match.missing.partyName,
				via: "staged",
				file: staged,
			});
		}
	}
	return summary;
}
