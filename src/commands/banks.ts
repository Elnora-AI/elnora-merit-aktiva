import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { readJsonBody, resolveBody } from "../utils/index.js";

export function setupBanksCommand(program: Command): void {
	const grp = program.command("banks").description("Banks resource group (Merit Aktiva)");

	// QUERY endpoint: no documented request fields. Body is an empty JSON object ('{ }').
	// Response is an array of bank account objects { Name, IBANCode, Description, BankId, CurrencyCode, AccountCode }.
	grp
		.command("list")
		.description(
			"List bank accounts. Endpoint: POST /api/v1/getbanks. Empty JSON body. Returns an array of bank accounts: { Name, IBANCode, Description, BankId (Guid), CurrencyCode, AccountCode }.",
		)
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getbanks", { version: "v1", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);
}
