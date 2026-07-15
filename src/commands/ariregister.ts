import type { Command } from "commander";
import { checkEInvoice, lookupRequisites } from "../client/arireg-xml-client.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";

// Estonian Business Register (äriregister) live XML lookups — the two FREE services.
// Distinct from `reconcile`, which uses the bulk open-data CSV. These hit the live
// SOAP endpoint for fresh, single-company answers at invoice time.
export function setupAriregisterCommand(program: Command): void {
	const grp = program
		.command("ariregister")
		.description(
			"Estonian Business Register live lookups (free XML services): company requisites and e-invoice capability. " +
				"Requisites need ARIREG_XML_USER/ARIREG_XML_PASSWORD (contract user); e-invoice-check needs no credentials.",
		);

	grp
		.command("requisites")
		.description(
			"Live invoicing requisites for a company by registry code (free service ettevotjaRekvisiidid_v1): " +
				"legal name, VAT number, status, and address. Needs äriregister XML credentials.",
		)
		.argument("<regCode>", "8-digit Estonian registry code (registrikood)")
		.option("--include-deleted", "Also match deleted (kustutatud) companies")
		.option("--lang <lang>", "Status-text language: est (default) or eng", "est")
		.action(
			handleAsyncCommand(async (regCode: string, opts: { includeDeleted?: boolean; lang?: string }) => {
				const result = await lookupRequisites(regCode, {
					includeDeleted: opts.includeDeleted,
					language: opts.lang === "eng" ? "eng" : "est",
				});
				outputSuccess(result ?? { found: false, regCode });
			}),
		);

	grp
		.command("e-invoice-check")
		.description(
			"Check whether one or more companies can receive e-invoices (free service earveRegistriParing_v1). " +
				"No credentials required. Returns one row per code; status OK = active e-invoice relationship, MR = none/invalid.",
		)
		.argument("<regCodes...>", "One or more 8-digit registry codes")
		.action(
			handleAsyncCommand(async (regCodes: string[]) => {
				const rows = await checkEInvoice(regCodes);
				outputSuccess({ items: rows, count: rows.length });
			}),
		);
}
