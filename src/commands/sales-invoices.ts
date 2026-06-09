import type { Command } from "commander";
import { getClient } from "../client/index.js";
import { handleAsyncCommand, outputSuccess } from "../output/index.js";
import { parseBool, parseDateYmd, readJsonBody, requireYes, resolveBody } from "../utils/index.js";

export function setupSalesInvoicesCommand(program: Command): void {
	const grp = program
		.command("sales-invoices")
		.description(
			"Sales invoices (Merit Aktiva). All endpoints are POST with a JSON body. You CANNOT update an invoice — delete and re-create. There is no get-next-invoice-number endpoint; manage your own InvoiceNo and remember the last number.",
		);

	// QUERY: list invoices over a period (v1). Period span max 3 months.
	grp
		.command("list")
		.description(
			"List sales invoices over a period. Endpoint: POST /api/v1/getinvoices. PeriodStart/PeriodEnd span max 3 months; query dates are YYYYMMDD. v1 returns a flat header list (no Dimensions). Use `find` for the v2/getinvoices2 query-by-number/customer variant.",
		)
		.option("--period-start <date>", "Period start (YYYY-MM-DD or YYYYMMDD)")
		.option("--period-end <date>", "Period end (YYYY-MM-DD or YYYYMMDD); span max 3 months")
		.option("--unpaid", "Only unpaid invoices")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: { periodStart?: string; periodEnd?: string; unpaid?: boolean; data?: string; file?: string }) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							PeriodStart: parseDateYmd(opts.periodStart, "--period-start"),
							PeriodEnd: parseDateYmd(opts.periodEnd, "--period-end"),
							UnPaid: opts.unpaid ? true : undefined,
						},
						{ required: false },
					);
					const result = await client.call("getinvoices", { version: "v1", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// QUERY: alt path getinvoices2 (v2) — query by invoice number or customer instead of by period.
	grp
		.command("find")
		.description(
			"Find sales invoices by invoice number or customer (no period needed). Endpoint: POST /api/v2/getinvoices2. Filter with --inv-no, --cust-name, or --cust-id. Returns the richer v2 schema (Dimension1..7Code, AccountingDoc, ChangedDate). Use `list` for period-based queries.",
		)
		.option("--inv-no <number>", "Filter by invoice number")
		.option("--cust-name <name>", "Filter by customer name")
		.option("--cust-id <guid>", "Filter by customer id")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(
				async (opts: { invNo?: string; custName?: string; custId?: string; data?: string; file?: string }) => {
					const client = await getClient();
					const body = resolveBody(
						readJsonBody(opts),
						{
							InvNo: opts.invNo,
							CustName: opts.custName,
							CustId: opts.custId,
						},
						{ required: false },
					);
					const result = await client.call("getinvoices2", { version: "v2", body });
					outputSuccess({ items: result, count: Array.isArray(result) ? result.length : undefined });
				},
			),
		);

	// QUERY: details of a single invoice by id (positional). v2 by default.
	grp
		.command("get <id>")
		.description(
			"Get details of a single sales invoice by id (SIHId). Endpoint: POST /api/v2/getinvoice. Returns Header + Lines + Payments + Attachment (v2 adds Dimensions arrays, DimAllocation on rows, CustomerId/PaidAmount/EInvSent/Paid on header). --add-attachment includes the base64 attachment. Result is empty if not found.",
		)
		.option("--add-attachment", "Include the base64 attachment in the response")
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
					{ required: true, mergeFlags: true },
				);
				const result = await client.call("getinvoice", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// BODY-DRIVEN: create an invoice (v1). Complex nested payload → --data/--file primary.
	grp
		.command("create")
		.description(
			"Create a sales invoice. Endpoint: POST /api/v1/sendinvoice. JSON body (--data/--file): { Customer: { Id: Guid (existing) OR Name+CountryCode+NotTDCustomer for new — NotTDCustomer lowercase 'true'/'false'; or { CustomerId: Guid }; RegNo, VatRegNo, CurrencyCode, PaymentDeadLine: Int, Address, City, County, PostalCode, Email, ... }, InvoiceNo: Str35 (required), DocDate/DueDate/TransactionDate: Date (YYYYMMDDHHMMSS), RefNo: Str36 (auto if omitted), CurrencyCode, DepartmentCode, ProjectCode, InvoiceRow: [{ Item: { Code: Str20 (required), Description: Str150 (required), Type: Int (1 stock/2 service/3 item), UOMName }, Quantity: Decimal, Price: Decimal (from price table if omitted), DiscountPct, DiscountAmount, TaxId: Guid (required, from gettaxes), LocationCode, DepartmentCode, ItemCostAmount, GLAccountCode, ProjectCode, CostCenterCode, VatDate: YYYYMMDD }], TaxAmount: [{ TaxId: Guid, Amount: Decimal }] (required, grouped & summed by TaxId — API recalculates), TotalAmount: Decimal (without VAT), RoundingAmount: Decimal (rounds TotalSum, not TotalAmount), Payment: { PaymentMethod, PaidAmount (<= amount with VAT), PaymDate: YYYYmmddHHii }, Hcomment, Fcomment, ContractNo, PDF: Base64 }. Use `create-v2` for dimensions. Returns { CustomerId, InvoiceId, InvoiceNo, RefNo, NewCustomer }.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendinvoice", { version: "v1", body });
				outputSuccess(result);
			}),
		);

	// BODY-DRIVEN: create an invoice with multi-dimension support (alt version v2 of sendinvoice).
	grp
		.command("create-v2")
		.description(
			"Create a sales invoice with multi-dimension support. Endpoint: POST /api/v2/sendinvoice. Same payload as `create` plus v2-only fields: CurrencyRate: Decimal (EU central bank rate for the date if omitted), Dimensions: [{ DimId: Int, DimValueId: Guid, DimCode: Str }] (header + per-row), ReserveItems: Bool, FileName: Str, Payer: PayerObject, DeliveryType: Bool, KsefNumber (Poland). v2 rows drop v1-only LocationCode/ProjectCode/CostCenterCode. Use v2 whenever dimensions are used.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendinvoice", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// BODY-DRIVEN: credit invoice — same v1 sendinvoice endpoint, negative amounts.
	grp
		.command("create-credit")
		.description(
			"Create a credit invoice. Endpoint: POST /api/v1/sendinvoice (same endpoint/payload as `create`). Re-send the original invoice payload with NEGATIVE Quantity and, if discounted, NEGATIVE DiscountAmount and NEGATIVE TotalAmount; TaxAmount.Amount stays positive. ItemCostAmount is required when crediting stock items. Returns { CustomerId, InvoiceId, InvoiceNo, RefNo, NewCustomer }.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendinvoice", { version: "v1", body });
				outputSuccess(result);
			}),
		);

	// BODY-DRIVEN: create invoice with multiple payments (distinct endpoint sendinvoice2, v1).
	grp
		.command("create-multi-payment")
		.description(
			"Create a sales invoice with multiple payments. Endpoint: POST /api/v1/sendinvoice2 (distinct endpoint). Same shape as `create` v1 but the payment field is an ARRAY named Payments: [{ PaymentMethod: Str (must exist in DB), PaidAmount: Decimal (<= amount with VAT), PaymDate: YYYYmmddHHii }] instead of a single Payment. Rows support a Dimensions array; Item.Description is Str100 here. Returns { CustomerId, InvoiceId, InvoiceNo, RefNo, NewCustomer }.",
		)
		.option("--data <json>", "JSON request body matching the documented schema")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendinvoice2", { version: "v1", body });
				outputSuccess(result);
			}),
		);

	// BODY-DRIVEN: create from raw Estonian e-invoice XML (v2). Body is a raw XML string, not the JSON schema.
	grp
		.command("create-from-xml")
		.description(
			'Create a sales invoice from an Estonian e-invoice XML (standard 1.2). Endpoint: POST /api/v2/sendinvoicexml. The body is a RAW XML string (not the JSON invoice schema): pass it via --data "<xml ...>...</xml>" or --file invoice.xml. Each article requires EAN or SellerProductID. Returns { CustomerId, InvoiceId, InvoiceNo, RefNo, ErrMsg }.',
		)
		.option("--data <json>", "Raw XML request body")
		.option("--file <path>", "Path to a file with the raw XML request body")
		.action(
			handleAsyncCommand(async (opts: { data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(readJsonBody(opts), {}, { required: true });
				const result = await client.call("sendinvoicexml", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// QUERY: get invoice PDF (v2) by id (positional). DelivNote strips prices.
	grp
		.command("get-pdf <id>")
		.description(
			"Get a sales invoice PDF as base64. Endpoint: POST /api/v2/getsalesinvpdf. Returns { FileName, FileContent (base64) }. --deliv-note returns the invoice without prices (delivery note).",
		)
		.option("--deliv-note", "Return the invoice without prices (delivery note)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (id: string, opts: { delivNote?: boolean; data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(
					readJsonBody(opts),
					{
						Id: id,
						DelivNote: opts.delivNote ? "true" : undefined,
					},
					{ required: true },
				);
				const result = await client.call("getsalesinvpdf", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// ACTION: send invoice by e-mail (v2) to the customer's stored address.
	grp
		.command("send-email <id>")
		.description(
			"Send a sales invoice to the customer by e-mail. Endpoint: POST /api/v2/sendinvoicebyemail. Uses the customer's stored e-mail, one invoice per request. Returns 'OK' or a mail-server error message. --deliv-note sends the invoice without prices.",
		)
		.option("--deliv-note", "Send the invoice without prices (delivery note)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (id: string, opts: { delivNote?: boolean; data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(
					readJsonBody(opts),
					{
						Id: id,
						DelivNote: opts.delivNote ? "true" : undefined,
					},
					{ required: true },
				);
				const result = await client.call("sendinvoicebyemail", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// ACTION: send invoice as a structured e-invoice (v2).
	grp
		.command("send-einvoice <id>")
		.description(
			"Send a sales invoice as a structured e-invoice. Endpoint: POST /api/v2/sendinvoiceaseinv. One invoice per request. Returns 'OK', or 'api-noeinv' when the recipient cannot receive e-invoices. --deliv-note sends the invoice without prices.",
		)
		.option("--deliv-note", "Send the invoice without prices (delivery note)")
		.option("--data <json>", "Raw JSON request body (overrides flags)")
		.option("--file <path>", "Path to a JSON file with the request body")
		.action(
			handleAsyncCommand(async (id: string, opts: { delivNote?: boolean; data?: string; file?: string }) => {
				const client = await getClient();
				const body = resolveBody(
					readJsonBody(opts),
					{
						Id: id,
						DelivNote: opts.delivNote ? "true" : undefined,
					},
					{ required: true },
				);
				const result = await client.call("sendinvoiceaseinv", { version: "v2", body });
				outputSuccess(result);
			}),
		);

	// DESTRUCTIVE: delete an invoice (v1). No update endpoint exists — delete + re-create.
	grp
		.command("delete <id>")
		.description(
			"Delete a sales invoice by id (SIHId). Endpoint: POST /api/v1/deleteinvoice. There is no update endpoint — to change an invoice, delete it and create a new one.",
		)
		.option("--yes", "Confirm the deletion")
		.action(
			handleAsyncCommand(async (id: string, opts: { yes?: boolean }) => {
				requireYes(opts, `delete sales invoice ${id}`);
				const client = await getClient();
				const result = await client.call("deleteinvoice", { version: "v1", body: { Id: id } });
				outputSuccess(result ?? { deleted: id });
			}),
		);
}
