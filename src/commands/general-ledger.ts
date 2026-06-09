import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import {
	parseBool,
	parseDateYmd,
	parseNonNegativeInt,
	parsePositiveInt,
	readJsonBody,
	resolveBody,
} from "../utils/index.js";

export function setupGeneralLedgerCommand(program: Command): void {
	const grp = program
		.command("gl")
		.description(
			"General ledger (GL batch) transactions (Merit Aktiva). Cannot delete records or create invoices; use the sales-invoice / purchase-invoice groups for invoices.",
		);

	// CREATE: complex nested body (EntryRow array + Attachment object). --data/--file primary.
	grp
		.command("create")
		.description(
			"Create a GL transaction (batch). Endpoint: POST /api/v1/sendglbatch. JSON body (--data/--file): { DocNo: Str35, BatchDate: Date, CurrencyCode: Str, CurrencyRate: Decimal (omit and EU central bank rate for the date is used), EntryRow: [{ AccountCode: Str8, DepartmentCode: Str16, Debit: Decimal, Credit: Decimal, ProjectCode: Str20, CostCenterCode: Str20, Memo: Str150, TaxId: Guid, VatAmount: Decimal (required if TaxId set) }], Attachment: { FileName: Str, FileContent: Str (PDF in Base64) } }. Do not use this to create invoices.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendglbatch", { version: "v1", body });
				outputSuccess(result);
			}),
		);

	// QUERY: list of GL batches over a period (max 3 months).
	grp
		.command("list")
		.description(
			"List GL transactions over a period. Endpoint: POST /api/v1/getglbatches. Period span max 3 months. DateType: 0 = document date, 1 = changed date.",
		)
		.option("--period-start <date>", "Period start (YYYY-MM-DD or YYYYMMDD)")
		.option("--period-end <date>", "Period end (YYYY-MM-DD or YYYYMMDD); span max 3 months")
		.option("--date-type <n>", "0 = document date, 1 = changed date")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: { periodStart?: string; periodEnd?: string; dateType?: string; data?: string; file?: string }) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							PeriodStart: parseDateYmd(opts.periodStart, "--period-start"),
							PeriodEnd: parseDateYmd(opts.periodEnd, "--period-end"),
							DateType: parseNonNegativeInt(opts.dateType, "--date-type"),
						},
						{ required: false },
					);
					const result = await client.call("getglbatches", { version: "v1", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// QUERY: details of a single GL batch by id (positional).
	grp
		.command("get <id>")
		.description(
			"Get details of a single GL transaction by id. Endpoint: POST /api/v1/getglbatch. Returns Header (GLBHeaderObject) + Lines (GLEntryObject array). --add-attachment includes the attachment file in the header.",
		)
		.option("--add-attachment", "Include the attachment file (FileName/FileContent) in the header")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (id: string, opts: { addAttachment?: boolean; data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(
					readJsonBody(opts),
					{
						Id: id,
						AddAttachment: parseBool(opts.addAttachment, "--add-attachment"),
					},
					{ required: true },
				);
				const result = await client.call("getglbatch", { version: "v1", body });
				outputSuccess(result);
			}),
		);

	// QUERY: list with full details (entry lines + cost allocations). Period max 31 days.
	grp
		.command("list-full")
		.description(
			"List GL transactions with full details (entry lines + cost allocations). Endpoint: POST /api/v1/GetGLBatchesFull. Period span max 31 days (shorter than `list`'s 3 months). WithLines=1 includes entry lines; WithCostAlloc=1 includes cost allocations. DateType: 0 = document date, 1 = changed date.",
		)
		.option("--period-start <date>", "Period start (YYYY-MM-DD or YYYYMMDD)")
		.option("--period-end <date>", "Period end (YYYY-MM-DD or YYYYMMDD); span max 31 days")
		.option("--with-lines <n>", "1 to include entry lines")
		.option("--with-cost-alloc <n>", "1 to include cost allocations")
		.option("--date-type <n>", "0 = document date, 1 = changed date")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: {
					periodStart?: string;
					periodEnd?: string;
					withLines?: string;
					withCostAlloc?: string;
					dateType?: string;
					data?: string;
					file?: string;
				}) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							PeriodStart: parseDateYmd(opts.periodStart, "--period-start"),
							PeriodEnd: parseDateYmd(opts.periodEnd, "--period-end"),
							WithLines: parsePositiveInt(opts.withLines, "--with-lines"),
							WithCostAlloc: parsePositiveInt(opts.withCostAlloc, "--with-cost-alloc"),
							DateType: parseNonNegativeInt(opts.dateType, "--date-type"),
						},
						{ required: false },
					);
					const result = await client.call("GetGLBatchesFull", { version: "v1", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);
}
