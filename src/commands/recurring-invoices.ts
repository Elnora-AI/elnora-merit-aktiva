import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { parseDateYmd, parseNonNegativeInt, readJsonBody, resolveBody } from "../utils/index.js";

export function setupRecurringInvoicesCommand(program: Command): void {
	const grp = program
		.command("recurring-invoices")
		.description(
			"Recurring Invoices resource group (Merit Aktiva): periodic invoice contracts that auto-generate sales invoices on a cycle",
		);

	// BODY-DRIVEN endpoint (v2): create a recurring (periodic) invoice contract.
	// Complex nested payload (Customer/Payer objects + InvoiceRow array + TaxAmount array),
	// so --data/--file is the primary input.
	grp
		.command("create")
		.description(
			'Create a recurring invoice contract. Endpoint: POST /api/v2/sendperinvoice. JSON body (--data/--file): { Customer: { Id: Guid, Name: Str150 (required when added), RegNo: Str30, NotTDCustomer: Bool (required when added; lowercase "true"/"false"), CountryCode: Str2 (required when added), ... }, Payer: { ...PayerObject same shape... }, Code: Str, DepartmentCode: Str20, InvoiceNo: Str35, StartDate: Date, EndDate: Date, NextDate: Date, Cycle: Int (1-month, 2-quarter, 3-year, 4-week), Period: Int (2-current, 3-next, 4-for next, 5-previous, 6-current less cycles), PaymentDay: Int, PaymentMonth: Int, CurrencyId: Int, CurrencyCode: Str4, CurrencyRate: Dec18.7, ReferenceNo: Str, PriceInclVat: Bool, RoundingPrec: Int, RoundingAmount: Dec18.2, TotalAmount: Dec18.2, TotalSum: Dec18.2, PerLen: Int, HComment: Str4K, FComment: Str4K, Dimensions: [{ DimId, DimValueId, DimCode }], TaxAmount: [{ TaxId: Guid (from gettaxes), Amount: Dec18.2 }], InvoiceRow: [{ Item: { Code: Str20 (required), Description: Str150 (required), Type: Int (required; 1-stock, 2-service, 3-item) }, Quantity: Dec18.3, Price: Dec18.7, DiscountPct: Dec18.2, DiscountAmount: Dec18.2, TaxId: Guid (required), LocationCode: Str20, DepartmentCode: Str20, GLAccountCode: Str10, Dimensions: [...], ItemCostAmount: Dec18.2, VatDate: YYYYMMDD }] }. GTUCode in Item is Poland-only (1..13).',
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendperinvoice", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// BODY-DRIVEN endpoint (v1, the only v1 path in this group): send meter/indication
	// readings to recurring invoice lines, which recalculates quantities and amounts.
	// The verbatim doc payload uses key "Values" as an array of objects.
	grp
		.command("send-indication-values")
		.description(
			'Send indication (meter) values to recurring invoice lines, recalculating quantities and amounts. Endpoint: POST /api/v1/sendindvalues (the only v1 path in this group). JSON body (--data/--file): { ArtCode: Str100 (article code), Values: [{ EndValue: Decimal, Address: Str, CustomerId: Guid, Quantity: Decimal (if set, EndValue is ignored) }] }. Example: { ArtCode: "", Values: [ { EndValue: 100.00, Address: "Sipelga 14-3\\nLohkva" } ] }. Success message is returned in Estonian.',
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendindvalues", { version: "v1", body });
				outputSuccess(result);
			}),
		);

	// QUERY endpoint (v2): empty JSON body returns all NOT-ended recurring invoices' addresses.
	grp
		.command("list-client-addresses")
		.description(
			"List recurring invoices clients address list. Endpoint: POST /api/v2/getpershaddress. Query payload is an empty JSON object { }. Returns the not-ended recurring invoices: Id, InvoiceNo (contract number), Address.",
		)
		.option("--data <json>", "Raw JSON request body (overrides the default empty payload)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: false });
				const result = await client.call("getpershaddress", { version: "v2", body });
				outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
			}),
		);

	// QUERY endpoint (v2): scalar filters become typed flags. Period range up to 180 days.
	grp
		.command("list")
		.description(
			"List recurring invoices by date range. Endpoint: POST /api/v2/getperinvoices. Period = date for the next invoice; PeriodStart..PeriodEnd range can be up to 180 days. DateType: 0-Next Invoice Date, 1-Changeddate. Returns header rows (SIHId, InvoiceNo, dates, CustomerId/Name, Cycle, Period, totals, ContrEnded, up to 7 Dimension codes).",
		)
		.option("--period-start <date>", "Period start (YYYY-MM-DD or YYYYMMDD); range up to 180 days")
		.option("--period-end <date>", "Period end (YYYY-MM-DD or YYYYMMDD); range up to 180 days")
		.option("--date-type <int>", "Date type (0-Next Invoice Date, 1-Changeddate)")
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
					const result = await client.call("getperinvoices", { version: "v2", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// QUERY endpoint (v2): single recurring invoice's full details by id (positional).
	grp
		.command("get <id>")
		.description(
			"Get a single recurring invoice's full details by id. Endpoint: POST /api/v2/getperinvoice (singular). Returns header fields (Customer/Payer names, dates, Cycle, Period, totals, header Dimensions of DimensionsObject) plus a Lines array (InvoiceRowObjectResponse: SILID, ItemCode, Quantity, Price, amounts, StartIndVal/EndIndVal, per-line Dimensions of LineDimensionsObject).",
		)
		.option("--data <json>", "Raw JSON request body (merged with the <id> positional; an Id in the body wins)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (id: string, opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), { Id: id }, { required: true, mergeFlags: true });
				const result = await client.call("getperinvoice", { version: "v2", body });
				outputSuccess(result);
			}),
		);
}
