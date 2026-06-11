import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { parseNonNegativeInt, readJsonBody, resolveBody } from "../utils/index.js";

export function setupAccountsCommand(program: Command): void {
	const grp = program.command("accounts").description("Chart of accounts (general ledger) lookup (Merit Aktiva)");

	// QUERY endpoint: returns the company's chart of accounts as a bare JSON array of Account objects.
	grp
		.command("list")
		.description(
			"List chart-of-accounts entries. Endpoint: POST /api/v1/getaccounts. Optional --usage-filter: 0/missing=all, 1=cost accounts, 2=cost contra-accounts, 3=purchase VAT accounts; minimal body {} returns all. Response is a bare array of Account objects { AccountID: Guid, NonActive: Str, Code: Str, Name: Str, TaxName: Str, LinkedVendorName: Str|null, IsParent: Str }; NonActive/IsParent are localized strings (not bools), Code is a string. Poland (360 Ksiegowosc) uses base host program.360ksiegowosc.pl with the same v1 path/payload.",
		)
		.option("--usage-filter <int>", "0/missing=all, 1=cost, 2=cost contra, 3=purchase VAT")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { usageFilter?: string; data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(
					readJsonBody(opts),
					{
						UsageFilter: parseNonNegativeInt(opts.usageFilter, "--usage-filter"),
					},
					{ required: false },
				);
				const result = await client.call("getaccounts", { version: "v1", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);
}
