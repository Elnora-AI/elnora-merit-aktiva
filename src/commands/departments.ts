import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { readJsonBody, resolveBody } from "../utils/index.js";

export function setupDepartmentsCommand(program: Command): void {
	const grp = program.command("departments").description("Departments resource group (Merit Aktiva)");

	// QUERY endpoint: no documented request fields. Empty JSON object {} is the documented payload.
	// Estonia and Poland share the same path/version/contract; only the host/base URL differs (handled by client config).
	grp
		.command("list")
		.description(
			"List departments. Endpoint: POST /api/v1/getdepartments. Empty JSON payload; returns an array of departments ({ Code: Str 20, Name: Str 64, NonActive: Bool true/false }).",
		)
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getdepartments", { version: "v1", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);
}
