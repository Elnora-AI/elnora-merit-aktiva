import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { parseBool, readJsonBody, resolveBody } from "../utils/index.js";

export function setupDimensionsCommand(program: Command): void {
	const grp = program
		.command("dimensions")
		.description("Dimensions — cost/analytic accounting tags (Merit Aktiva, v2 only)");

	// QUERY endpoint: single scalar flag (AllValues). Response is an array of DimensionListItem
	// rows, each pairing a parent dimension (DimId/DimName) with one of its values.
	grp
		.command("list")
		.description(
			"List dimensions and their values. Endpoint: POST /api/v2/getdimensions. Each row pairs parent dimension (DimId/DimName) with a value (Id/Code/Name/EndDate/NonActive/DebitPositive). --all-values=false (default) hides expired/inactive values.",
		)
		.option("--all-values <bool>", "Include expired/inactive values (true/false, default false)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { allValues?: string; data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(
					readJsonBody(opts),
					{
						AllValues: parseBool(opts.allValues, "--all-values"),
					},
					{ required: false },
				);
				const result = await client.call("getdimensions", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// BODY-DRIVEN endpoint: array of dimension definitions (the dimension headers, not their values).
	grp
		.command("create")
		.description(
			"Create or edit dimension definitions (the dimension headers). Endpoint: POST /api/v2/senddimensions. JSON body (--data/--file): { Dimensions: [{ Id: Int, Name: Str (max 50), Type: Int (1=detail, 2=summary), GenId: Int (general dimension Id, used only if not 0), PosNeg: Bool (true = amount positive in debit) }] }. No response schema documented.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("senddimensions", { version: "v2", body });
				outputSuccess(result ?? { ok: true });
			}),
		);

	// BODY-DRIVEN endpoint: array of dimension values under existing dimensions. DimValueId is the
	// upsert key. Note: the doc labels the nested array "Dimensions" even though it holds values.
	grp
		.command("create-values")
		.description(
			"Create or update individual dimension values under existing dimensions. Endpoint: POST /api/v2/senddimvalues. JSON body (--data/--file): { Dimensions: [{ DimId: Int (parent dimension), DimValueId: Guid (upsert key — absent/unknown creates a new value, existing updates only that value's EndDate), DimValueCode: Str, DimValueName: Str, EndDate: Date (YYYYMMDD) }] }. Note: the nested array is named Dimensions even though it holds values. No response schema documented.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("senddimvalues", { version: "v2", body });
				outputSuccess(result ?? { ok: true });
			}),
		);
}
