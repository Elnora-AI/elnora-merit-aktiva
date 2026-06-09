import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { readJsonBody, resolveBody } from "../utils/index.js";

export function setupCostCentersCommand(program: Command): void {
	const grp = program.command("cost-centers").description("Cost centers (cost objects / dimensions) (Merit Aktiva)");

	// QUERY endpoint with no documented request fields: the payload is an empty object { }.
	// No filters are available, so the call returns all cost centers. Raw --data/--file still
	// works as an escape hatch.
	grp
		.command("list")
		.description(
			"List all cost centers. Endpoint: POST /api/v1/getcostcenters. Empty query payload ({ }) — no filters; returns every cost center. Each item: { Code: Str 20, Name: Str 64, EndDate: Date (null if active) }.",
		)
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getcostcenters", { version: "v1", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);
}
