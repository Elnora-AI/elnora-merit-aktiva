import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { parseBool, parseDateYmd, parseNonNegativeInt, readJsonBody, resolveBody } from "../utils/index.js";

export function setupInventoryMovementsCommand(program: Command): void {
	const grp = program.command("inventory").description("Inventory movements and stock locations (Merit Aktiva)");

	// QUERY endpoint: list inventory movement documents over a period.
	grp
		.command("list")
		.description(
			"List inventory movements. Endpoint: POST /api/v2/getinvmovements. WithLines (lowercase true/false) includes the Rows array. Datetype: 0=document date, 1=changed date. Type per row: 1=in, 2=out, 3=between stocks.",
		)
		.option("--period-start <date>", "Period start (YYYY-MM-DD or YYYYMMDD)")
		.option("--period-end <date>", "Period end (YYYY-MM-DD or YYYYMMDD)")
		.option("--with-lines <bool>", "Include the Rows array (true/false)")
		.option("--datetype <int>", "0=document date, 1=changed date")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					periodStart?: string;
					periodEnd?: string;
					withLines?: string;
					datetype?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							PeriodStart: parseDateYmd(opts.periodStart, "--period-start"),
							PeriodEnd: parseDateYmd(opts.periodEnd, "--period-end"),
							WithLines: parseBool(opts.withLines, "--with-lines"),
							Datetype: parseNonNegativeInt(opts.datetype, "--datetype"),
						},
						{ required: false },
					);
					const result = await client.call("getinvmovements", { version: "v2", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// QUERY endpoint: list stock locations. Request payload is an empty JSON object.
	grp
		.command("list-locations")
		.description("List stock locations. Endpoint: POST /api/v2/getlocations. Request body is an empty JSON object.")
		.option("--data <json>", "Raw JSON request body (overrides the default empty object)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getlocations", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// BODY-DRIVEN endpoint (v2): create an inventory movement document with nested rows + dimensions.
	grp
		.command("send")
		.description(
			"Create an inventory movement (v2). Endpoint: POST /api/v2/SendInvMovement. JSON body (--data/--file): { DocDate: Str yyyymmdd, DocNo: Str 35, Location1Code: Str 20, Location2Code: Str 20 (destination stock for Type 3), DepartmentCode: Str 20, Type: Int (1=in, 2=out, 3=between stocks), Rows: [{ ArticleCode: Str 20 (required, must exist), UOMName: Str 64, ItemUnitCost: Decimal (required when Type=1), Quantity: Decimal, GLAccountCode: Str 10, Dimensions: [{ DimId: Int, DimValueId: Guid, DimCode: Str }] }], Dimensions: [{ DimId, DimValueId, DimCode }] (header-level) }. Use v2 when dimensions are used; otherwise see send-v1.",
		)
		.option("--data <json>", "JSON request body matching the documented v2 schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("SendInvMovement", { version: "v2", body });
				outputSuccess(result ?? { sent: true });
			}),
		);

	// BODY-DRIVEN endpoint (altPath v1): same path, v1 has no header Dimensions and simpler rows.
	grp
		.command("send-v1")
		.description(
			"Create an inventory movement (v1). Endpoint: POST /api/v1/SendInvMovement. Use when dimensions are NOT used. JSON body (--data/--file): { DocDate: Str yyyymmdd, DocNo: Str 35, Location1Code: Str 20, Location2Code: Str 20 (destination stock for Type 3), DepartmentCode: Str 20, Type: Int (1=in, 2=out, 3=between stocks), Rows: [{ ArticleCode: Str 20 (required, must exist), UOMName: Str 64, ItemUnitCost: Decimal (required when Type=1), Quantity: Decimal }] }. v1 has no header-level Dimensions and v1 rows have no GLAccountCode or row-level Dimensions.",
		)
		.option("--data <json>", "JSON request body matching the documented v1 schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("SendInvMovement", { version: "v1", body });
				outputSuccess(result ?? { sent: true });
			}),
		);
}
