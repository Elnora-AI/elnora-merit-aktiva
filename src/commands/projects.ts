import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { readJsonBody, resolveBody } from "../utils/index.js";

export function setupProjectsCommand(program: Command): void {
	const grp = program.command("projects").description("Project list resource group (Merit Aktiva)");

	// QUERY endpoint: empty JSON body { } per Merit convention; returns an array of
	// project objects { Code: Str 20, Name: Str 64, EndDate: Date }. No request fields,
	// so --data/--file are the only inputs (raw-body escape hatch).
	grp
		.command("list")
		.description(
			"List projects (dimensions). Endpoint: POST /api/v1/getprojects. Empty JSON body { }; returns array of { Code (Str 20), Name (Str 64), EndDate (Date) }.",
		)
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getprojects", { version: "v1", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);
}
