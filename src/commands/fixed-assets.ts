import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { readJsonBody, resolveBody } from "../utils/index.js";

export function setupFixedAssetsCommand(program: Command): void {
	const grp = program.command("fixed-assets").description("Fixed assets resource group (Merit Aktiva)");

	// QUERY endpoint: no documented filter fields; payload is an empty JSON object {}.
	grp
		.command("list-locations")
		.description(
			"List fixed asset locations. Endpoint: POST /api/v2/getfalocations. Query payload is an empty JSON object {}; no filters documented. Returns a list of { Id: Guid, Name: Str }.",
		)
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getfalocations", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// QUERY endpoint: no documented filter fields; payload is an empty JSON object {}.
	grp
		.command("list-responsible-persons")
		.description(
			"List responsible employees. Endpoint: POST /api/v2/getfaresppersons. Query payload is an empty JSON object {}; no filters documented. Returns a list of { Id: Guid, Name: Str }.",
		)
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getfaresppersons", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// BODY-DRIVEN endpoint: wraps a FixedAssets array of Fixedassets objects.
	grp
		.command("send")
		.description(
			"Create fixed assets. Endpoint: POST /api/v2/sendfixedassets. JSON body (--data/--file): { FixedAssets: [{ InventaryNo: Str, Name: Str, FAFroupName: Str, DeprCalcMethod: Int (1=Linear, 3=Residual amount, 4=One copy/Poland only), DeprPct: Decimal, DepartName: Str, RespPersonName: Str, Loc2name: Str, Comment: Str, Dimensions: [{ DimId: Int, DimValueId: Guid, DimCode: Str }], SubsidAmount: Decimal, GTUCode: Str, GTUCodes: Str }] }. Note Merit house spellings: InventaryNo, FAFroupName, Loc2name, DeprPct, SubsidAmount.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendfixedassets", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// QUERY endpoint: no documented filter fields; payload is an empty JSON object {}.
	grp
		.command("list")
		.description(
			"List fixed assets. Endpoint: POST /api/v2/getfixassets (NOTE: getfixassets, distinct from the send path sendfixedassets). Query payload is an empty JSON object {}; no filters documented. Each item carries a DimAllocation array of FACostallocation objects. Note get-vs-send spelling differences: DepPct (get) vs DeprPct (send), SubsidyAmount (get) vs SubsidAmount (send).",
		)
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getfixassets", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);
}
